import asyncio
import base64
import json
import os
import re
from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState
from app.services.openai_voice_service import OpenAIVoiceService
from app.services.audio_convert import TwilioAudioBridge
from app.services import call_store, ops_store, elevenlabs_tts

_SENTENCE = re.compile(r"(.+?[\.!\?…]+)(\s+|$)")


def load_prompt(lang: str) -> str:
    filename = "system_prompt_tr.txt" if lang == "tr" else "system_prompt.txt"
    path = os.path.join("config", filename)
    if os.path.exists(path):
        return open(path, "r", encoding="utf-8").read().strip()
    return ""


def _text_delta(ev: dict) -> str:
    t = ev.get("type") or ""
    if "input_audio" in t:
        return ""
    if t.endswith("output_text.delta") or t.endswith(".text.delta") or t == "response.text.delta":
        return ev.get("delta") or ev.get("text") or ""
    if t == "response.content_part.delta":
        part = ev.get("delta") or {}
        if isinstance(part, dict):
            return part.get("text") or ""
        return str(part or "")
    return ""


class TwilioSession:
    def __init__(self, ws: WebSocket, lang: str = "de"):
        self.ws = ws
        self.lang = lang
        settings = ops_store.get_settings()
        self.use_eleven = elevenlabs_tts.configured() and settings.get("ttsProvider") == "elevenlabs"
        self.eleven_voice = elevenlabs_tts.default_voice_id(settings.get("elevenVoice") or "")
        self.ai = OpenAIVoiceService(
            system_prompt=load_prompt(lang),
            phone_mode=True,
            voice=settings.get("voice"),
            external_tts=self.use_eleven,
        )
        self.audio = TwilioAudioBridge()
        self.alive = False
        self.task = None
        self.stream_sid = None
        self.last_item_id = None
        self.call_id = None
        self.agent_buf = ""
        self._eleven_buf = ""
        self._eleven_gen = 0
        self._speak_q = asyncio.Queue()
        self._speak_task = None

    def _flush_agent(self):
        if self.agent_buf.strip():
            call_store.add_turn(self.call_id, "agent", self.agent_buf)
        self.agent_buf = ""

    async def send_twilio(self, data: dict):
        try:
            if self.ws.client_state == WebSocketState.CONNECTED:
                await self.ws.send_json(data)
        except Exception:
            pass

    async def clear_playback(self):
        if self.stream_sid:
            await self.send_twilio({"event": "clear", "streamSid": self.stream_sid})

    def _stop_eleven(self):
        self._eleven_gen += 1
        self._eleven_buf = ""
        while True:
            try:
                self._speak_q.get_nowait()
            except asyncio.QueueEmpty:
                break

    def _pop_sentence(self):
        buf = self._eleven_buf
        if not buf.strip():
            return ""
        m = _SENTENCE.search(buf)
        if m:
            sent = (m.group(1) or "").strip()
            self._eleven_buf = buf[m.end():]
            return sent
        if len(buf) > 140:
            cut = buf.rfind(" ", 0, 140)
            if cut > 20:
                sent, self._eleven_buf = buf[:cut].strip(), buf[cut + 1 :]
                return sent
        return ""

    async def _speak_worker(self):
        while self.alive:
            text = await self._speak_q.get()
            if text is None:
                break
            await self._speak_eleven(text)

    async def _speak_eleven(self, text: str):
        text = (text or "").strip()
        if not text or not self.stream_sid:
            return
        gen = self._eleven_gen
        print(f"[ElevenLabs] speak {text[:48]!r}")
        async for chunk in elevenlabs_tts.stream_ulaw(text, self.eleven_voice):
            if not self.alive or gen != self._eleven_gen:
                return
            await self.send_twilio({
                "event": "media",
                "streamSid": self.stream_sid,
                "media": {"payload": base64.b64encode(chunk).decode("ascii")},
            })

    async def _feed_eleven(self, delta: str):
        if not delta:
            return
        self.agent_buf += delta
        self._eleven_buf += delta
        while True:
            sent = self._pop_sentence()
            if not sent:
                break
            await self._speak_q.put(sent)

    async def _flush_eleven(self):
        leftover = self._eleven_buf.strip()
        self._eleven_buf = ""
        if leftover:
            await self._speak_q.put(leftover)

    async def run(self):
        await self.ws.accept()
        self.alive = True
        print(f"[Twilio] stream connected eleven={self.use_eleven}")
        try:
            await self.ai.connect()
            print("[Twilio] OpenAI connected")
        except Exception as e:
            print(f"[Twilio] OpenAI connect error: {e}")
            self.alive = False
            await self.ws.close()
            return

        self.task = asyncio.create_task(self._ai_loop())
        if self.use_eleven:
            self._speak_task = asyncio.create_task(self._speak_worker())
        try:
            while self.alive:
                raw = await self.ws.receive()
                if raw.get("type") == "websocket.disconnect":
                    break
                text = raw.get("text")
                if not text:
                    continue
                try:
                    msg = json.loads(text)
                except Exception:
                    continue
                ev = msg.get("event")
                if ev == "start":
                    start = msg.get("start") or {}
                    self.stream_sid = start.get("streamSid") or msg.get("streamSid")
                    params = start.get("customParameters") or {}
                    if params.get("lang") in ("tr", "de"):
                        self.lang = params["lang"]
                    await self.ai.update_instructions(load_prompt(self.lang))
                    self.call_id = params.get("callSid") or start.get("callSid")
                    phone = params.get("from") or params.get("to") or ""
                    direction = params.get("direction") or "inbound"
                    call_store.upsert(
                        self.call_id,
                        phoneNumber=phone,
                        contactName=phone,
                        direction=direction,
                        lang=self.lang,
                        status="in_progress",
                        outcome="in_progress",
                    )
                    print(f"[Twilio] start stream={self.stream_sid} call={self.call_id} lang={self.lang}")
                    await self.ai.trigger_greeting(self.lang)
                elif ev == "media":
                    payload = (msg.get("media") or {}).get("payload")
                    if payload:
                        pcm = self.audio.twilio_to_openai(payload)
                        if pcm:
                            await self.ai.send_audio(pcm)
                elif ev in ("stop", "closed"):
                    break
        except (WebSocketDisconnect, RuntimeError):
            pass
        except Exception as e:
            print(f"[Twilio] loop error: {e}")
        finally:
            self._flush_agent()
            call_store.finish(self.call_id)
            self.alive = False
            self._stop_eleven()
            if self._speak_task:
                await self._speak_q.put(None)
                self._speak_task.cancel()
            if self.task:
                self.task.cancel()
            await self.ai.close()
            print("[Twilio] closed")

    async def _ai_loop(self):
        async for ev in self.ai.events():
            if not self.alive:
                break
            t = ev.get("type", "")
            if self.use_eleven:
                delta = _text_delta(ev)
                if delta:
                    await self._feed_eleven(delta)
                elif t in ("response.done", "response.completed", "response.output_text.done"):
                    await self._flush_eleven()
                    self._flush_agent()
            elif "audio" in t and "delta" in t and "transcript" not in t:
                d = ev.get("delta", "")
                item_id = ev.get("item_id")
                if item_id:
                    self.last_item_id = item_id
                if d and self.stream_sid:
                    payload = self.audio.openai_to_twilio(d)
                    await self.send_twilio({
                        "event": "media",
                        "streamSid": self.stream_sid,
                        "media": {"payload": payload},
                    })
            elif "transcript" in t and "delta" in t and "input_audio" not in t:
                self.agent_buf += ev.get("delta") or ""
            elif t in ("response.done", "response.completed", "response.output_audio_transcript.done"):
                self._flush_agent()
            if t == "conversation.item.input_audio_transcription.completed":
                call_store.add_turn(self.call_id, "user", ev.get("transcript") or "")
            elif t == "input_audio_buffer.speech_started":
                print("[Twilio] barge-in")
                self._flush_agent()
                self._stop_eleven()
                await self.clear_playback()
                await self.ai.cancel()
            elif t == "error":
                err = ev.get("error", {})
                print(f"[Twilio] AI ERROR: {err.get('code')}: {err.get('message')}")
