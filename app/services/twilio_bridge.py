import asyncio
import json
import os
from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState
from app.services.openai_voice_service import OpenAIVoiceService
from app.services.audio_convert import TwilioAudioBridge
from app.services import call_store


def load_prompt(lang: str) -> str:
    filename = "system_prompt_tr.txt" if lang == "tr" else "system_prompt.txt"
    path = os.path.join("config", filename)
    if os.path.exists(path):
        return open(path, "r", encoding="utf-8").read().strip()
    return ""


class TwilioSession:
    def __init__(self, ws: WebSocket, lang: str = "de"):
        self.ws = ws
        self.lang = lang
        self.ai = OpenAIVoiceService(system_prompt=load_prompt(lang))
        self.audio = TwilioAudioBridge()
        self.alive = False
        self.task = None
        self.stream_sid = None
        self.last_item_id = None
        self.call_id = None
        self.agent_buf = ""

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

    async def run(self):
        await self.ws.accept()
        self.alive = True
        print("[Twilio] stream connected")
        try:
            await self.ai.connect()
            print("[Twilio] OpenAI connected")
        except Exception as e:
            print(f"[Twilio] OpenAI connect error: {e}")
            self.alive = False
            await self.ws.close()
            return

        self.task = asyncio.create_task(self._ai_loop())
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
                    await self.ai.trigger_greeting()
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
            if self.task:
                self.task.cancel()
            await self.ai.close()
            print("[Twilio] closed")

    async def _ai_loop(self):
        async for ev in self.ai.events():
            if not self.alive:
                break
            t = ev.get("type", "")
            if "audio" in t and "delta" in t and "transcript" not in t:
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
            elif t == "conversation.item.input_audio_transcription.completed":
                call_store.add_turn(self.call_id, "user", ev.get("transcript") or "")
            elif t == "input_audio_buffer.speech_started":
                print("[Twilio] barge-in")
                self._flush_agent()
                await self.clear_playback()
                await self.ai.cancel()
            elif t == "error":
                err = ev.get("error", {})
                print(f"[Twilio] AI ERROR: {err.get('code')}: {err.get('message')}")
