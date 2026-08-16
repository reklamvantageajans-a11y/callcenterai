import os
import json
import base64
import websockets
from dotenv import load_dotenv

load_dotenv()

class OpenAIVoiceService:
    def __init__(self, api_key: str = None, voice: str = None, system_prompt: str = "", phone_mode: bool = False):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY", "")
        self.voice = voice or os.getenv("OPENAI_VOICE", "marin")
        self.model = os.getenv("OPENAI_REALTIME_MODEL", "gpt-realtime")
        self.system_prompt = system_prompt
        self.phone_mode = phone_mode
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
                ping_timeout=20,
                proxy=None,
            )
        except TypeError:
            self.ws = await websockets.connect(
                self.url,
                extra_headers=headers,
                proxy=None,
            )
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
                            "threshold": 0.62 if self.phone_mode else 0.5,
                            "prefix_padding_ms": 400 if self.phone_mode else 300,
                            "silence_duration_ms": 750 if self.phone_mode else 400,
                            "create_response": True,
                            # Phone lines + Render latency trigger false barge-in;
                            # don't cut the agent mid-sentence on PSTN.
                            "interrupt_response": not self.phone_mode
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

    async def update_instructions(self, prompt: str):
        if not self.is_connected or not self.ws:
            return
        self.system_prompt = prompt or self.system_prompt
        await self.ws.send(json.dumps({
            "type": "session.update",
            "session": {
                "type": "realtime",
                "instructions": self.system_prompt,
            }
        }))

    async def trigger_greeting(self, lang: str = "de"):
        if not self.is_connected or not self.ws:
            return
        from app.services import ops_store
        s = ops_store.get_settings()
        opening = (s.get("greetingTr") if lang == "tr" else s.get("greetingDe") or "").strip()
        if lang == "tr":
            line = "Sadece Türkçe konuş. Almanca kullanma. "
            if opening:
                line += "Şimdi tam olarak şu açılışı doğal söyle, ezbere okuma: " + opening
            else:
                line += "Şimdi Adım 1 açılışını sıcak ve akıcı söyle."
        else:
            line = "Sprich ausschließlich Deutsch. Kein Türkisch. "
            if opening:
                line += "Sprich jetzt genau diese Begrüßung, natürlich, nicht abgelesen: " + opening
            else:
                line += "Beginne jetzt mit Schritt 1 — warm und fließend."
        await self.ws.send(json.dumps({
            "type": "response.create",
            "response": {"instructions": line}
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
