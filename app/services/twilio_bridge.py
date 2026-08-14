import asyncio
import json
import os
from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState
from app.services.openai_voice_service import OpenAIVoiceService
from app.services.audio_convert import TwilioAudioBridge


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
                    print(f"[Twilio] start stream={self.stream_sid} lang={self.lang}")
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
            elif t == "input_audio_buffer.speech_started":
                print("[Twilio] barge-in")
                await self.clear_playback()
                await self.ai.cancel()
            elif t == "error":
                err = ev.get("error", {})
                print(f"[Twilio] AI ERROR: {err.get('code')}: {err.get('message')}")
