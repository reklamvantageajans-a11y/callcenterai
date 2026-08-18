import os
import re
import json
import asyncio
import html
from datetime import datetime, timezone
from dotenv import load_dotenv
from typing import Optional
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, Response, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.websockets import WebSocketState
from app.services.openai_voice_service import OpenAIVoiceService
from app.services.twilio_bridge import TwilioSession, load_prompt
from app.services import call_store, ops_store, dialer, drive_service, fish_tts, elevenlabs_tts

load_dotenv()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def index():
    return FileResponse("static/index.html")

@app.get("/admin")
async def admin():
    return FileResponse("static/admin.html")

@app.get("/panel")
async def panel_page():
    return FileResponse("static/admin.html")

_HEADER_WORDS = {
    "phone", "telefon", "nummer", "numara", "name", "ad", "soyad",
    "kontakt", "contact", "tel", "handy", "mobile", "cep", "vorname",
    "nachname", "isim",
}


def _default_cc(lang: str) -> str:
    return "+90" if lang == "tr" else "+49"


def normalize_phone(raw: str, default_cc: Optional[str] = None) -> str:
    to = "".join(ch for ch in str(raw or "") if ch.isdigit() or ch == "+")
    if to.startswith("00"):
        to = "+" + to[2:]
    if not to:
        return ""
    if to.startswith("+"):
        return to
    cc = default_cc or "+49"
    if to.startswith("90") and len(to) >= 12:
        return "+" + to
    if to.startswith("49") and len(to) >= 11:
        return "+" + to
    if to.startswith("0"):
        rest = to[1:]
        if rest.startswith("5") and len(rest) >= 10:
            return "+90" + rest
        if rest[:2] in ("15", "16", "17") and len(rest) >= 10:
            return "+49" + rest
        return cc + rest
    if len(to) >= 8:
        return cc + to
    return to


def parse_leads(raw, lang="de"):
    """Parse pasted Excel/CSV/text into unique {phone, name} rows. Returns (rows, invalid)."""
    cc = _default_cc(lang)
    if isinstance(raw, list):
        lines = [str(x) for x in raw]
    else:
        text = str(raw or "").replace("\r\n", "\n").replace("\r", "\n")
        lines = text.split("\n")
    seen = set()
    rows = []
    invalid = 0
    for line in lines:
        s = line.strip().strip('"').strip("'")
        if not s:
            continue
        compact = re.sub(r"[^a-z]+", "", s.lower())
        if compact in _HEADER_WORDS or not any(ch.isdigit() for ch in s):
            continue
        parts = re.split(r"[\t;]+", s)
        if len(parts) == 1 and "," in s and not s.lstrip().startswith("+"):
            parts = [p.strip() for p in s.split(",")]
        phone = ""
        names = []
        found = None
        for match in re.finditer(r"(?:\+|00)?\d[\d\s()./-]{6,24}\d", s):
            p = normalize_phone(match.group(0), cc)
            if p.startswith("+") and len(p) >= 10:
                phone = p
                found = match
                break
        if found:
            leftover = (s[: found.start()] + " " + s[found.end() :]).strip(" ,;\t-")
            if leftover:
                names.append(leftover)
        else:
            for part in parts:
                p = normalize_phone(part, cc)
                if p.startswith("+") and len(p) >= 10 and not phone:
                    phone = p
                else:
                    bit = part.strip().strip('"')
                    if bit and re.sub(r"[^a-z]+", "", bit.lower()) not in _HEADER_WORDS:
                        names.append(bit)
        if not phone:
            phone = normalize_phone(s, cc)
            names = []
        if phone.startswith("+") and len(phone) >= 10:
            if phone not in seen:
                seen.add(phone)
                rows.append({"phone": phone, "name": " ".join(names).strip()})
        else:
            invalid += 1
    return rows, invalid


def place_outbound_call(to: str, lang: str = "de") -> dict:
    sid = os.getenv("TWILIO_ACCOUNT_SID", "")
    token = os.getenv("TWILIO_AUTH_TOKEN", "")
    frm = os.getenv("TWILIO_PHONE_NUMBER", "")
    if not (sid and token and frm):
        raise RuntimeError("twilio env missing")
    lang = lang if lang in ("tr", "de") else "de"
    to = normalize_phone(to, _default_cc(lang))
    if not to.startswith("+") or len(to) < 10:
        raise RuntimeError("to must be E.164 like +49...")
    if to in set(ops_store.list_dnc()):
        raise RuntimeError("DNC")
    from twilio.rest import Client
    from twilio.base.exceptions import TwilioRestException
    base = (os.getenv("PUBLIC_URL") or os.getenv("RENDER_EXTERNAL_URL") or "https://callcenterai-yxqp.onrender.com").rstrip("/")
    voice_url = f"{base}/twilio/voice?lang={lang}"
    rec_cb = f"{base}/twilio/recording"
    try:
        call = Client(sid, token).calls.create(
            to=to, from_=frm, url=voice_url, record=True,
            recording_status_callback=rec_cb,
            recording_status_callback_event=["completed"],
        )
    except TwilioRestException as e:
        raise RuntimeError(str(e.msg or e))
    call_store.upsert(call.sid, phoneNumber=to, contactName=to, direction="outbound", lang=lang)
    return {"sid": call.sid, "status": call.status}


@app.on_event("startup")
async def _boot():
    asyncio.create_task(dialer.worker_loop(place_outbound_call))
    ops_store.add_log("info", "system", "Kontrollpanel hazır")


def public_base(request: Request) -> str:
    env = (os.getenv("PUBLIC_URL") or os.getenv("RENDER_EXTERNAL_URL") or "https://callcenterai-yxqp.onrender.com").rstrip("/")
    if env:
        return env
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    return f"{proto}://{host}"

@app.api_route("/twilio/voice", methods=["GET", "POST"])
async def twilio_voice(request: Request, lang: str = "de"):
    lang = lang if lang in ("tr", "de") else "de"
    form = {}
    if request.method == "POST":
        try:
            form = dict(await request.form())
        except Exception:
            await request.body()
    call_sid = str(form.get("CallSid") or "")
    frm = str(form.get("From") or "")
    to = str(form.get("To") or "")
    direction = "outbound" if str(form.get("Direction") or "").startswith("outbound") else "inbound"
    phone = frm if direction == "inbound" else to
    base_url = public_base(request)
    proto = "wss" if base_url.startswith("https") else "ws"
    host = base_url.split("://", 1)[-1]
    stream_url = f"{proto}://{host}/twilio/media?lang={lang}"
    rec_cb = f"{base_url}/twilio/recording"

    def p(name, value):
        return f'<Parameter name="{html.escape(name, quote=True)}" value="{html.escape(str(value), quote=True)}" />'

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        "<Response>"
        f'<Start><Recording recordingStatusCallback="{html.escape(rec_cb, quote=True)}" '
        'recordingStatusCallbackMethod="POST" /></Start>'
        "<Connect>"
        f'<Stream url="{html.escape(stream_url, quote=True)}">'
        f'{p("lang", lang)}{p("callSid", call_sid)}{p("from", phone)}{p("to", to)}{p("direction", direction)}'
        "</Stream></Connect></Response>"
    )
    if call_sid:
        call_store.upsert(call_sid, phoneNumber=phone, contactName=phone, direction=direction, lang=lang)
    print(f"[Twilio] TwiML stream={stream_url} call={call_sid}")
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
    lang = body.get("lang", "de")
    lang = lang if lang in ("tr", "de") else "de"
    to = normalize_phone(body.get("to"), _default_cc(lang))
    if not to.startswith("+") or len(to) < 10:
        return JSONResponse({"error": "to must be E.164 like +49..."}, status_code=400)
    try:
        result = place_outbound_call(to, lang)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    return result


def _require_secret(request: Request) -> bool:
    secret = os.getenv("CALL_SECRET", "")
    got = request.headers.get("x-call-secret") or request.query_params.get("secret") or ""
    return bool(secret) and got == secret


@app.api_route("/twilio/recording", methods=["GET", "POST"])
async def twilio_recording(request: Request):
    form = {}
    try:
        form = dict(await request.form())
    except Exception:
        await request.body()
    call_sid = str(form.get("CallSid") or "")
    rec_url = str(form.get("RecordingUrl") or "")
    if call_sid and rec_url:
        call_store.set_recording(call_sid, rec_url)
        print(f"[Twilio] recording saved for {call_sid}")
        asyncio.create_task(_drive_upload(call_sid, rec_url))
    return Response(content="ok", media_type="text/plain")


async def _drive_upload(call_sid: str, rec_url: str):
    if not drive_service.configured():
        return
    try:
        import httpx
        sid = os.getenv("TWILIO_ACCOUNT_SID", "")
        token = os.getenv("TWILIO_AUTH_TOKEN", "")
        audio_url = rec_url if rec_url.endswith(".mp3") else rec_url + ".mp3"
        async with httpx.AsyncClient(auth=(sid, token), timeout=90, follow_redirects=True) as client:
            r = await client.get(audio_url)
        if r.status_code >= 400:
            ops_store.add_log("warn", "drive", f"Twilio kayıt indirilemedi {call_sid}")
            return
        row = call_store.get_call(call_sid) or {}
        name = drive_service.filename_for(row.get("phoneNumber") or "", call_sid)
        link = await asyncio.to_thread(drive_service.upload_mp3, name, r.content)
        if link:
            call_store.set_drive_url(call_sid, link)
            ops_store.add_log("success", "drive", f"Drive'a yüklendi {name}")
    except Exception as e:
        ops_store.add_log("error", "drive", str(e)[:200])


@app.get("/api/calls")
async def api_calls(request: Request):
    if not _require_secret(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    q = (request.query_params.get("q") or "").lower()
    items = call_store.list_calls()
    if q:
        items = [c for c in items if q in (c.get("phoneNumber") or "").lower() or q in (c.get("transcriptPreview") or "").lower()]
    return {"count": len(items), "calls": items}


@app.get("/api/calls/{call_id}")
async def api_call_one(call_id: str, request: Request):
    if not _require_secret(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    row = call_store.get_call(call_id)
    if not row:
        return JSONResponse({"error": "not found"}, status_code=404)
    return row


@app.get("/api/recordings")
async def api_recordings(request: Request):
    if not _require_secret(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    recs = []
    for c in call_store.list_calls():
        if not c.get("twilioRecordingUrl") and not c.get("recordingUrl"):
            continue
        recs.append({
            "id": c["id"],
            "callId": c["id"],
            "phoneNumber": c.get("phoneNumber") or "",
            "contactName": c.get("contactName") or c.get("phoneNumber") or "",
            "createdAt": c.get("startedAt"),
            "durationSec": c.get("durationSec") or 0,
            "url": f"/api/calls/{c['id']}/recording",
            "sizeKb": 0,
        })
    return {"count": len(recs), "recordings": recs}


@app.get("/api/calls/{call_id}/recording")
async def api_call_recording(call_id: str, request: Request):
    if not _require_secret(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    row = call_store.get_call(call_id)
    url = (row or {}).get("twilioRecordingUrl")
    if not url:
        return JSONResponse({"error": "no recording"}, status_code=404)
    import httpx
    sid = os.getenv("TWILIO_ACCOUNT_SID", "")
    token = os.getenv("TWILIO_AUTH_TOKEN", "")
    audio_url = url if url.endswith(".mp3") else url + ".mp3"
    async with httpx.AsyncClient(auth=(sid, token), timeout=60, follow_redirects=True) as client:
        r = await client.get(audio_url)
    if r.status_code >= 400:
        return JSONResponse({"error": "twilio recording fetch failed"}, status_code=502)
    return Response(content=r.content, media_type="audio/mpeg")


@app.get("/api/stats")
async def api_stats(request: Request):
    if not _require_secret(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    items = call_store.list_calls()
    answered = [c for c in items if c.get("status") == "answered"]
    active = [c for c in items if c.get("status") == "in_progress"]
    durations = [c.get("durationSec") or 0 for c in items]
    conversions = len([c for c in items if c.get("outcome") == "converted"])
    snap = dialer.snapshot()
    hourly = [{"hour": f"{h:02d}", "calls": 0, "conversions": 0} for h in range(24)]
    tzname = ops_store.get_settings().get("timezone") or "Europe/Istanbul"
    try:
        from zoneinfo import ZoneInfo
        z = ZoneInfo(tzname)
    except Exception:
        z = timezone.utc
    for c in items:
        raw = c.get("startedAt") or ""
        try:
            dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            h = dt.astimezone(z).hour
            hourly[h]["calls"] += 1
            if c.get("outcome") == "converted":
                hourly[h]["conversions"] += 1
        except Exception:
            pass
    n = len(items)
    return {
        "totalToday": n,
        "activeNow": snap.get("active") or len(active),
        "answered": len(answered),
        "missed": len([c for c in items if c.get("status") in ("no_answer", "busy", "missed")]),
        "callbacksPending": len(ops_store.list_callbacks()),
        "conversions": conversions,
        "conversionRate": round(100.0 * conversions / n, 1) if n else 0,
        "avgDurationSec": int(sum(durations) / len(durations)) if durations else 0,
        "totalTalkTimeSec": sum(durations),
        "hourly": hourly,
        "dialer": snap,
        "drive": drive_service.status(),
    }


@app.get("/api/logs")
async def api_logs(request: Request):
    if not _require_secret(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    return {"logs": ops_store.list_logs()}


@app.get("/api/campaigns")
async def api_campaigns(request: Request):
    if not _require_secret(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    return {"campaigns": ops_store.list_campaigns()}


@app.post("/api/campaigns")
async def api_campaigns_create(request: Request):
    if not _require_secret(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    body = await request.json()
    lang = body.get("lang") or "de"
    leads, _inv = parse_leads(body.get("numbers") or body.get("text") or "", lang)
    numbers = [x["phone"] for x in leads]
    if not numbers:
        return JSONResponse({"error": "numara yok"}, status_code=400)
    row = ops_store.new_campaign(
        body.get("name") or "Kampagne",
        body.get("lang") or "de",
        numbers,
        body.get("concurrency") or 2,
    )
    await dialer.enqueue_campaign(row["id"])
    return row


@app.get("/api/callbacks")
async def api_callbacks_get(request: Request):
    if not _require_secret(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    return {"callbacks": ops_store.list_callbacks()}


@app.post("/api/callbacks")
async def api_callbacks_post(request: Request):
    if not _require_secret(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    body = await request.json()
    row = ops_store.add_callback(
        normalize_phone(body.get("phone") or body.get("phoneNumber") or ""),
        body.get("reason") or "",
        body.get("scheduledAt") or ops_store.now_iso(),
        body.get("priority") or "medium",
    )
    return row


@app.get("/api/dnc")
async def api_dnc_get(request: Request):
    if not _require_secret(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    return {"numbers": ops_store.list_dnc()}


@app.post("/api/dnc")
async def api_dnc_post(request: Request):
    if not _require_secret(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    body = await request.json()
    p = normalize_phone(body.get("phone") or "")
    return {"numbers": ops_store.add_dnc(p)}


@app.get("/api/drive")
async def api_drive(request: Request):
    if not _require_secret(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    return drive_service.status()


VOICES = [
    {"id": "marin", "gender": "female", "label": "Marin"},
    {"id": "coral", "gender": "female", "label": "Coral"},
    {"id": "sage", "gender": "female", "label": "Sage"},
    {"id": "verse", "gender": "female", "label": "Verse"},
    {"id": "shimmer", "gender": "female", "label": "Shimmer"},
    {"id": "ballad", "gender": "female", "label": "Ballad"},
    {"id": "alloy", "gender": "neutral", "label": "Alloy"},
    {"id": "ash", "gender": "male", "label": "Ash"},
    {"id": "echo", "gender": "male", "label": "Echo"},
    {"id": "cedar", "gender": "male", "label": "Cedar"},
]
_OPENAI_VOICE_IDS = {v["id"] for v in VOICES}


@app.get("/api/voices")
async def api_voices(request: Request):
    if not _require_secret(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    settings = ops_store.get_settings()
    fish_voices = await fish_tts.list_voices() if fish_tts.configured() else []
    fish_voice = fish_tts.default_voice_id(settings.get("fishVoice") or "")
    if not fish_voice and fish_voices:
        fish_voice = fish_voices[0]["id"]
    eleven_voices = await elevenlabs_tts.list_voices() if elevenlabs_tts.configured() else []
    eleven_voice = elevenlabs_tts.default_voice_id(settings.get("elevenVoice") or "")
    if not eleven_voice and eleven_voices:
        eleven_voice = eleven_voices[0]["id"]
    provider = settings.get("ttsProvider") or "fish"
    if provider not in ("fish", "openai", "elevenlabs"):
        provider = "fish"
    if provider == "elevenlabs" and not elevenlabs_tts.configured():
        provider = "fish" if fish_tts.configured() else "openai"
    if provider == "fish" and not fish_tts.configured():
        provider = "openai"
    return {
        "voices": VOICES,
        "selected": settings.get("voice"),
        "ttsProvider": provider,
        "fishConfigured": fish_tts.configured(),
        "fishVoices": fish_voices,
        "fishVoice": fish_voice,
        "fishModel": fish_tts.default_model() if fish_tts.configured() else "",
        "elevenConfigured": elevenlabs_tts.configured(),
        "elevenVoices": eleven_voices,
        "elevenVoice": eleven_voice,
        "elevenModel": elevenlabs_tts.default_model() if elevenlabs_tts.configured() else "",
    }


@app.post("/api/voices/preview")
async def api_voice_preview(request: Request):
    if not _require_secret(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    body = await request.json()
    settings = ops_store.get_settings()
    voice = (body.get("voice") or "").strip()
    lang = body.get("lang") or "de"
    text = (body.get("text") or "").strip()
    if not text:
        text = (
            "Guten Tag, mein Name ist Kalmaz. Wie kann ich Ihnen helfen?"
            if lang != "tr"
            else "Merhaba, ben Kalmaz. Size nasıl yardımcı olabilirim?"
        )
    try:
        speed = float(str(body.get("speed") or "1").replace("x", "").strip())
    except Exception:
        speed = 1.0
    provider = (body.get("provider") or "").strip().lower()
    if provider not in ("fish", "openai", "elevenlabs"):
        if voice in _OPENAI_VOICE_IDS:
            provider = "openai"
        elif elevenlabs_tts.configured() and (settings.get("ttsProvider") or "") == "elevenlabs":
            provider = "elevenlabs"
        elif fish_tts.configured() and (settings.get("ttsProvider") or "fish") == "fish":
            provider = "fish"
        else:
            provider = "openai"
    if provider == "elevenlabs" and elevenlabs_tts.configured():
        eid = voice if voice and voice not in _OPENAI_VOICE_IDS else elevenlabs_tts.default_voice_id(
            settings.get("elevenVoice") or ""
        )
        audio, err = await elevenlabs_tts.synthesize(text, eid, speed)
        if err:
            return JSONResponse({"error": err}, status_code=502)
        return Response(content=audio, media_type="audio/mpeg")
    if provider == "fish" and fish_tts.configured():
        fid = voice if voice and voice not in _OPENAI_VOICE_IDS else fish_tts.default_voice_id(
            settings.get("fishVoice") or ""
        )
        audio, err = await fish_tts.synthesize(text, fid, speed)
        if err:
            return JSONResponse({"error": err}, status_code=502)
        return Response(content=audio, media_type="audio/mpeg")
    ov = voice if voice in _OPENAI_VOICE_IDS else (settings.get("voice") or "marin")
    openai_speed = min(1.4, max(0.75, speed))
    audio, err = await _tts(text, ov, openai_speed)
    if err:
        return JSONResponse({"error": err}, status_code=502)
    return Response(content=audio, media_type="audio/mpeg")


async def _tts(text: str, voice: str, speed: float = 1.0):
    import httpx
    key = os.getenv("OPENAI_API_KEY", "")
    payload = {"model": "gpt-4o-mini-tts", "voice": voice, "input": text, "format": "mp3", "speed": speed}
    async with httpx.AsyncClient(timeout=45) as client:
        r = await client.post(
            "https://api.openai.com/v1/audio/speech",
            headers={"Authorization": f"Bearer {key}"},
            json=payload,
        )
        if r.status_code >= 400:
            r = await client.post(
                "https://api.openai.com/v1/audio/speech",
                headers={"Authorization": f"Bearer {key}"},
                json={
                    "model": "tts-1-hd",
                    "voice": "alloy" if voice not in ("alloy", "echo", "fable", "onyx", "nova", "shimmer") else voice,
                    "input": text,
                    "speed": speed,
                },
            )
    if r.status_code >= 400:
        return None, "preview failed"
    return r.content, None


def _parse_speed(raw) -> str:
    try:
        v = float(str(raw or "1").replace("x", "").strip())
    except Exception:
        v = 1.0
    v = min(1.2, max(0.85, v))
    return f"{v:.2f}".rstrip("0").rstrip(".") + "x"


@app.post("/api/dialog/test")
async def api_dialog_test(request: Request):
    if not _require_secret(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    body = await request.json()
    lang = "tr" if body.get("lang") == "tr" else "de"
    start = bool(body.get("start"))
    user_text = (body.get("text") or "").strip()
    history = body.get("history") or []
    if not start and not user_text:
        return JSONResponse({"error": "empty"}, status_code=400)
    from app.services.twilio_bridge import load_prompt
    settings = ops_store.get_settings()
    greeting = (settings.get("greetingTr") if lang == "tr" else settings.get("greetingDe") or "").strip()
    if lang == "tr":
        fmt = (
            "TEST ÇIKTISI: Telefon hattında etiket okuma. Yalnızca JSON döndür, markdown yok.\n"
            '{"speed":"0.95x","tone":"Sıcak","emphasis":"ücretsiz","speech":"..."}\n'
            "speed 0.85x–1.15x. tone: Sıcak | Meraklı | Düşünceli | Enerjik | Sakin.\n"
            "emphasis: cümledeki tek odak kelime. speech: kulağa gidecek doğal konuşma, tırnak yok.\n"
            "Aynı açılışı ve aynı kalıpları tekrarlama."
        )
        if start:
            user_text = "Görüşme yeni başladı. Adım 1 açılışını doğal söyle, ezbere okuma."
            if greeting:
                user_text += " Şu açılışı temel al, kelimesi kelimesine okuma: " + greeting
    else:
        fmt = (
            "TEST-AUSGABE: Am Telefon keine Labels vorlesen. Nur JSON, kein Markdown.\n"
            '{"speed":"0.95x","tone":"Warm","emphasis":"kostenlos","speech":"..."}\n'
            "speed 0.85x–1.15x. tone: Warm | Neugierig | Nachdenklich | Energetisch | Ruhig.\n"
            "emphasis: ein Fokuswort. speech: gesprochener Text, ohne Anführungszeichen.\n"
            "Keine Standardfloskeln wiederholen."
        )
        if start:
            user_text = "Das Gespräch beginnt. Sprich Schritt 1 natürlich, nicht abgelesen."
            if greeting:
                user_text += " Nutze diese Begrüßung als Grundlage, nicht wortwörtlich: " + greeting
    messages = [{"role": "system", "content": load_prompt(lang) + "\n\n" + fmt}]
    for turn in history[-16:]:
        role = "assistant" if turn.get("role") == "agent" else "user"
        content = (turn.get("text") or "").strip()
        if content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": user_text})
    import httpx
    key = os.getenv("OPENAI_API_KEY", "")
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json={"model": os.getenv("OPENAI_TEXT_MODEL", "gpt-4o-mini"), "temperature": 0.85, "messages": messages},
        )
    if r.status_code >= 400:
        return JSONResponse({"error": "model failed"}, status_code=502)
    raw = (((r.json() or {}).get("choices") or [{}])[0].get("message") or {}).get("content") or ""
    data = _parse_dialog_json(raw, lang)
    data["speed"] = _parse_speed(data.get("speed"))
    return data


def _parse_dialog_json(raw: str, lang: str) -> dict:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].strip()
    try:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            obj = json.loads(text[start : end + 1])
            speech = (obj.get("speech") or obj.get("text") or "").strip()
            if speech:
                return {
                    "speed": obj.get("speed") or "1.0x",
                    "tone": obj.get("tone") or ("Sıcak" if lang == "tr" else "Warm"),
                    "emphasis": obj.get("emphasis") or "",
                    "speech": speech,
                }
    except Exception:
        pass
    return {
        "speed": "1.0x",
        "tone": "Sıcak" if lang == "tr" else "Warm",
        "emphasis": "",
        "speech": text.strip('"'),
    }


@app.get("/api/settings")
async def api_settings_get(request: Request):
    if not _require_secret(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    data = ops_store.get_settings()
    data["fishConfigured"] = fish_tts.configured()
    data["elevenConfigured"] = elevenlabs_tts.configured()
    return data


@app.post("/api/settings")
async def api_settings_post(request: Request):
    if not _require_secret(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    body = await request.json()
    return ops_store.save_settings(body)


@app.get("/api/contacts")
async def api_contacts_get(request: Request):
    if not _require_secret(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    return {"contacts": ops_store.list_contacts()}


@app.post("/api/contacts")
async def api_contacts_post(request: Request):
    if not _require_secret(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    body = await request.json()
    lang = body.get("lang") or "de"
    leads, invalid = parse_leads(body.get("numbers") or body.get("text") or "", lang)
    if not leads:
        return JSONResponse({"error": "empty", "invalid": invalid}, status_code=400)
    result = ops_store.add_contacts(leads, lang)
    result["invalid"] = invalid
    return result


@app.delete("/api/contacts")
async def api_contacts_clear(request: Request):
    if not _require_secret(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    return {"contacts": ops_store.clear_contacts()}


@app.delete("/api/contacts/{cid}")
async def api_contacts_del(cid: str, request: Request):
    if not _require_secret(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    return {"contacts": ops_store.delete_contact(cid)}


@app.post("/api/calls/{call_id}/outcome")
async def api_outcome(call_id: str, request: Request):
    if not _require_secret(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    body = await request.json()
    call_store.upsert(call_id, outcome=body.get("outcome") or "in_progress")
    return {"ok": True}

class Session:
    def __init__(self, ws: WebSocket, lang: str = "de"):
        self.ws = ws
        self.lang = lang
        self.ai = OpenAIVoiceService(
            system_prompt=load_prompt(lang),
            voice=ops_store.get_settings().get("voice"),
        )
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
            await self.ai.trigger_greeting(self.lang)
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
