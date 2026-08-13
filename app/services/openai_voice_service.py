import os
import json
import base64
import websockets
from dotenv import load_dotenv

load_dotenv()

class OpenAIVoiceService:
    def __init__(self, api_key: str = None, voice: str = None, system_prompt: str = ""):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY", "")
        self.voice = voice or os.getenv("OPENAI_VOICE", "marin")
        self.model = os.getenv("OPENAI_REALTIME_MODEL", "gpt-realtime")
        self.system_prompt = system_prompt
        self.ws = None
        self.is_connected = False
        self.url = f"wss://api.openai.com/v1/realtime?model={self.model}"

    async def connect(self):
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY tanimlanmamis.")
        # GA interface: no "OpenAI-Beta: realtime=v1" header.
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
        # GA session schema: audio config nested under session.audio.input/output.
        await self.ws.send(json.dumps({
            "type": "session.update",
            "session": {
                "type": "realtime",
                "output_modalities": ["audio"],
                "instructions": self.system_prompt,
                "audio": {
                    "input": {
                        "format": {"type": "audio/pcm", "rate": 24000},
                        # server_vad restored: steadier turn-taking, fewer false
                        # interruptions / awkward silences than semantic_vad here.
                        "turn_detection": {
                            "type": "server_vad",
                            "threshold": 0.5,
                            "prefix_padding_ms": 300,
                            "silence_duration_ms": 400,
                            "create_response": True,
                            "interrupt_response": True
                        }
                    },
                    "output": {
                        "format": {"type": "audio/pcm", "rate": 24000},
                        "voice": self.voice
                    }
                }
            }
        }))
        # Input transcription is sent as a separate update so that, if the field
        # is unsupported on the account, it cannot reject the core config above.
        try:
            await self.ws.send(json.dumps({
                "type": "session.update",
                "session": {
                    "type": "realtime",
                    "audio": {
                        "input": {
                            "transcription": {"model": "gpt-4o-mini-transcribe"}
                        }
                    }
                }
            }))
        except Exception:
            pass

    async def trigger_greeting(self):
        if not self.is_connected or not self.ws:
            return
        await self.ws.send(json.dumps({
            "type": "response.create",
            "response": {
                "instructions": (
                    "Start the conversation now by delivering your Step 1 / Adım 1 opening "
                    "greeting exactly as defined in your system prompt. Speak warmly and "
                    "naturally — not like you are reading from a script. Use the language "
                    "of your system prompt."
                )
            }
        }))

    async def send_audio(self, pcm_bytes: bytes):
        if not self.is_connected or not self.ws:
            return
        await self.ws.send(json.dumps({
            "type": "input_audio_buffer.append",
            "audio": base64.b64encode(pcm_bytes).decode("ascii")
        }))

    async def truncate(self, item_id: str, audio_end_ms: int):
        """Remove the unplayed part of the last assistant turn after a barge-in,
        so the model knows exactly how far it actually got."""
        if not self.is_connected or not self.ws or not item_id:
            return
        try:
            await self.ws.send(json.dumps({
                "type": "conversation.item.truncate",
                "item_id": item_id,
                "content_index": 0,
                "audio_end_ms": max(0, int(audio_end_ms))
            }))
        except Exception:
            pass

    async def cancel(self):
        if not self.is_connected or not self.ws:
            return
        try:
            await self.ws.send(json.dumps({"type": "response.cancel"}))
        except Exception:
            pass

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
