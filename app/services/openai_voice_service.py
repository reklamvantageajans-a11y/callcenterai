import os
import json
import base64
import asyncio
import websockets
from dotenv import load_dotenv

load_dotenv()

class OpenAIVoiceService:
    def __init__(self, api_key: str = None, voice: str = None, system_prompt: str = ""):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY", "")
        self.voice = voice or os.getenv("OPENAI_VOICE", "coral")
        self.model = os.getenv("OPENAI_REALTIME_MODEL", "gpt-realtime-mini")
        self.system_prompt = system_prompt
        self.ws = None
        self.is_connected = False
        self.url = f"wss://api.openai.com/v1/realtime?model={self.model}"

    async def connect(self):
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY tanimlanmamis.")
        headers = {"Authorization": f"Bearer {self.api_key.strip()}"}
        try:
            self.ws = await websockets.connect(
                self.url,
                additional_headers=headers,
                max_size=2**24,
                ping_interval=20,
                ping_timeout=20
            )
        except TypeError:
            self.ws = await websockets.connect(self.url, extra_headers=headers)
        self.is_connected = True
        await self._init_session()

    async def _init_session(self):
        await self.ws.send(json.dumps({
            "type": "session.update",
            "session": {
                "type": "realtime",
                "instructions": self.system_prompt
            }
        }))

    async def trigger_greeting(self):
        if not self.is_connected or not self.ws:
            return
        await self.ws.send(json.dumps({
            "type": "response.create",
            "response": {
                "instructions": "Beginne das Gespräch sofort auf Deutsch mit der Einleitung aus Schritt 1 deines Leitfadens. Sag genau: 'Einen wunderschönen guten Tag, mein Name ist Kalmaz vom Verbund der Privat Krankenversicherten...'"
            }
        }))

    async def send_audio(self, pcm_bytes: bytes):
        if not self.is_connected or not self.ws:
            return
        await self.ws.send(json.dumps({
            "type": "input_audio_buffer.append",
            "audio": base64.b64encode(pcm_bytes).decode("ascii")
        }))

    async def cancel(self):
        if not self.is_connected or not self.ws:
            return
        try:
            await self.ws.send(json.dumps({"type": "response.cancel"}))
        except Exception:
            pass

    async def update_voice(self, voice: str):
        if not self.is_connected or not self.ws:
            return
        self.voice = voice
        await self.ws.send(json.dumps({
            "type": "session.update",
            "session": {
                "type": "realtime",
                "voice": voice
            }
        }))

    async def events(self):
        if not self.ws:
            return
        try:
            async for msg in self.ws:
                data = json.loads(msg)
                yield data
        except websockets.exceptions.ConnectionClosed:
            self.is_connected = False

    async def close(self):
        self.is_connected = False
        if self.ws:
            try:
                await self.ws.close()
            except Exception:
                pass
