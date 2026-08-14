import os
import json
import asyncio
from dotenv import load_dotenv
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, Response, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.websockets import WebSocketState
from app.services.openai_voice_service import OpenAIVoiceService
from app.services.twilio_bridge import TwilioSession, load_prompt

load_dotenv()

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def index():
    return FileResponse("static/index.html")

@app.get("/admin")
async def admin():
    return FileResponse("static/admin.html")

def public_base(request: Request) -> str:
    env = (os.getenv("PUBLIC_URL") or os.getenv("RENDER_EXTERNAL_URL") or "https://callcenterai-yxqp.onrender.com").rstrip("/")
    if env:
        return env
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    return f"{proto}://{host}"

@app.api_route("/twilio/voice", methods=["GET", "POST"])
async def twilio_voice(request: Request, lang: str = "de"):
    await request.body()
    lang = lang if lang in ("tr", "de") else "de"
    base_url = public_base(request)
    proto = "wss" if base_url.startswith("https") else "ws"
    host = base_url.split("://", 1)[-1]
    stream_url = f"{proto}://{host}/twilio/media?lang={lang}"
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        "<Response><Connect>"
        f'<Stream url="{stream_url}">'
        f'<Parameter name="lang" value="{lang}" />'
        "</Stream></Connect></Response>"
    )
    print(f"[Twilio] TwiML stream={stream_url}")
    return Response(content=xml, media_type="text/xml")

@app.websocket("/twilio/media")
async def twilio_media(websocket: WebSocket):
    lang = websocket.query_params.get("lang", "de")
    try:
        await TwilioSession(websocket, lang=lang).run()
    except Exception as exc:
        import traceback
        print(f"[twilio/media] HATA lang={lang}: {exc}")
        traceback.print_exc()

@app.post("/twilio/call")
async def twilio_call(request: Request):
    secret = os.getenv("CALL_SECRET", "")
    if not secret or request.headers.get("x-call-secret") != secret:
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    sid = os.getenv("TWILIO_ACCOUNT_SID", "")
    token = os.getenv("TWILIO_AUTH_TOKEN", "")
    frm = os.getenv("TWILIO_PHONE_NUMBER", "")
    if not (sid and token and frm):
        return JSONResponse({"error": "twilio env missing"}, status_code=500)
    body = await request.json()
    to = body.get("to")
    lang = body.get("lang", "de")
    to = "".join(ch for ch in str(to) if ch.isdigit() or ch == "+")
    if to.startswith("00"):
        to = "+" + to[2:]
    if not to.startswith("+"):
        return JSONResponse({"error": "to must be E.164 like +49..."}, status_code=400)
    lang = lang if lang in ("tr", "de") else "de"
    from twilio.rest import Client
    voice_url = f"{public_base(request)}/twilio/voice?lang={lang}"
    call = Client(sid, token).calls.create(to=to, from_=frm, url=voice_url)
    return {"sid": call.sid, "status": call.status}

class Session:
    def __init__(self, ws: WebSocket, lang: str = "de"):
        self.ws = ws
        self.lang = lang
        self.ai = OpenAIVoiceService(system_prompt=load_prompt(lang))
        self.alive = False
        self.task = None
        self.last_item_id = None

    async def send(self, data):
        try:
            if self.ws.client_state == WebSocketState.CONNECTED:
                await self.ws.send_json(data)
        except Exception:
            pass

    async def run(self):
        await self.ws.accept()
        self.alive = True
        print("[Session] WebSocket accepted")
        try:
            await self.ai.connect()
            print("[Session] OpenAI connected")
            await self.ai.trigger_greeting()
            print("[Session] Greeting triggered")
        except Exception as e:
            print(f"[Session] OpenAI connect error: {e}")
            await self.send({"event": "error", "message": str(e)})
            self.alive = False
            await self.ws.close()
            return

        self.task = asyncio.create_task(self._ai_loop())

        try:
            while self.alive:
                raw = await self.ws.receive()
                t = raw.get("type", "")
                if t == "websocket.disconnect":
                    break
                if "bytes" in raw and raw["bytes"]:
                    await self.ai.send_audio(raw["bytes"])
                elif "text" in raw and raw["text"]:
                    try:
                        msg = json.loads(raw["text"])
                    except Exception:
                        continue
                    ev = msg.get("event")
                    if ev == "ping":
                        await self.send({"event": "pong", "ts": msg.get("ts")})
                    elif ev == "interrupt":
                        ms = msg.get("ms", 0)
                        await self.ai.truncate(self.last_item_id, ms)
        except (WebSocketDisconnect, RuntimeError):
            pass
        except Exception as e:
            print(f"[Session] loop error: {e}")
        finally:
            self.alive = False
            if self.task:
                self.task.cancel()
            await self.ai.close()
            print("[Session] closed")

    async def _ai_loop(self):
        audio_chunks = 0
        async for ev in self.ai.events():
            if not self.alive:
                break
            t = ev.get("type", "")

            # Audio delta
            if "audio" in t and "delta" in t and "transcript" not in t:
                d = ev.get("delta", "")
                item_id = ev.get("item_id")
                if item_id:
                    self.last_item_id = item_id
                if d:
                    audio_chunks += 1
                    if audio_chunks <= 3:
                        print(f"[AI] audio chunk #{audio_chunks}, len={len(d)}")
                    await self.send({"event": "audio", "data": d})

            # Transcript delta
            elif "transcript" in t and "delta" in t:
                d = ev.get("delta", "")
                if d:
                    await self.send({"event": "text", "delta": d})

            elif t in ("response.done", "response.completed"):
                print(f"[AI] response done, sent {audio_chunks} audio chunks")
                audio_chunks = 0
                await self.send({"event": "done"})

            elif t == "input_audio_buffer.speech_started":
                print("[AI] speech_started")
                await self.send({"event": "speech_start"})

            elif t == "input_audio_buffer.speech_stopped":
                print("[AI] speech_stopped")
                await self.send({"event": "speech_stop"})

            elif t == "response.interrupted":
                print("[AI] interrupted")
                await self.send({"event": "interrupted"})

            elif t == "session.created":
                print(f"[AI] session created")

            elif t == "session.updated":
                print(f"[AI] session updated")

            elif t == "error":
                err = ev.get("error", {})
                print(f"[AI] ERROR: {err.get('code')}: {err.get('message')}")

            elif t not in ("response.created", "response.output_item.added",
                           "response.content_part.added", "response.content_part.done",
                           "response.output_item.done", "rate_limits.updated",
                           "input_audio_buffer.committed", "input_audio_buffer.cleared",
                           "conversation.item.created", "conversation.item.added",
                           "conversation.item.done", "conversation.item.truncated",
                           "response.cancelled",
                           "conversation.item.input_audio_transcription.delta",
                           "conversation.item.input_audio_transcription.completed",
                           "response.output_audio.done",
                           "response.output_audio_transcript.done"):
                print(f"[AI] unhandled: {t}")

@app.websocket("/ws/voice")
async def ws_voice(websocket: WebSocket):
    lang = websocket.query_params.get("lang", "de")
    try:
        s = Session(websocket, lang=lang)
        await s.run()
    except Exception as exc:
        import traceback
        print(f"[ws_voice] HATA lang={lang}: {exc}")
        traceback.print_exc()
