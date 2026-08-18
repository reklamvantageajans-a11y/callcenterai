import os
import time
from typing import Optional

import httpx

VOICES_URL = "https://api.elevenlabs.io/v1/voices"
TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
STREAM_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream"

_FALLBACK = [
    {"id": "21m00Tcm4TlvDq8ikWAM", "label": "Rachel", "gender": "female"},
    {"id": "EXAVITQu4vr4xnSDxMaL", "label": "Sarah", "gender": "female"},
    {"id": "9BWtsMINqrJLrRacOk9x", "label": "Aria", "gender": "female"},
    {"id": "XB0fDUnXU5powFXDhCwa", "label": "Charlotte", "gender": "female"},
]

_cache = {"at": 0.0, "voices": []}


def api_key() -> str:
    return (os.getenv("ELEVENLABS_API_KEY") or os.getenv("ELEVEN_API_KEY") or "").strip()


def configured() -> bool:
    return bool(api_key())


def default_model() -> str:
    return (os.getenv("ELEVENLABS_TTS_MODEL") or "eleven_flash_v2_5").strip() or "eleven_flash_v2_5"


def default_voice_id(settings_voice: str = "") -> str:
    return (settings_voice or os.getenv("ELEVENLABS_VOICE_ID") or "").strip()


def clamp_speed(speed: float) -> float:
    try:
        v = float(speed)
    except Exception:
        v = 1.0
    return min(1.2, max(0.7, v))


def _gender(item: dict) -> str:
    labels = item.get("labels") or {}
    if isinstance(labels, dict):
        g = str(labels.get("gender") or labels.get("sex") or "").lower()
    else:
        g = ""
    blob = " ".join([g, str(item.get("name") or "").lower()])
    if any(w in blob for w in ("female", "woman", "kadın", "kadin", "weiblich")):
        return "female"
    if any(w in blob for w in ("male", "man", "erkek", "männlich")):
        return "male"
    return "neutral"


def _norm(item: dict) -> Optional[dict]:
    vid = str(item.get("voice_id") or item.get("id") or "").strip()
    if not vid:
        return None
    return {
        "id": vid,
        "label": (item.get("name") or vid)[:48],
        "gender": _gender(item),
    }


def _headers() -> dict:
    return {"xi-api-key": api_key(), "Content-Type": "application/json"}


async def list_voices() -> list:
    if not configured():
        return []
    now = time.monotonic()
    if _cache["voices"] and now - _cache["at"] < 120:
        return _cache["voices"]
    voices = []
    seen = set()

    def add(rows):
        for row in rows:
            if not row or row["id"] in seen:
                continue
            seen.add(row["id"])
            voices.append(row)

    try:
        async with httpx.AsyncClient(timeout=12) as client:
            r = await client.get(VOICES_URL, headers={"xi-api-key": api_key()})
            if r.status_code < 400:
                data = r.json() if r.content else {}
                for it in data.get("voices") or []:
                    row = _norm(it) if isinstance(it, dict) else None
                    if row:
                        add([row])
    except Exception:
        pass
    add(_FALLBACK)
    voices = voices[:24]
    _cache["at"] = now
    _cache["voices"] = voices
    return voices


def _payload(text: str, speed: float) -> dict:
    return {
        "text": (text or "").strip()[:2500],
        "model_id": default_model(),
        "voice_settings": {
            "stability": 0.45,
            "similarity_boost": 0.8,
            "speed": clamp_speed(speed),
        },
    }


def _resolve_voice(reference_id: str = "") -> str:
    return (reference_id or default_voice_id() or _FALLBACK[0]["id"]).strip()


async def synthesize(text: str, reference_id: str = "", speed: float = 1.0):
    key = api_key()
    if not key:
        return None, "eleven_not_configured"
    text = (text or "").strip()
    if not text:
        return None, "empty"
    vid = _resolve_voice(reference_id)
    url = TTS_URL.format(voice_id=vid)
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(
                url,
                headers=_headers(),
                params={"output_format": "mp3_44100_128"},
                json=_payload(text, speed),
            )
        if r.status_code >= 400:
            return None, f"eleven_tts_failed:{r.status_code}"
        if not r.content or "json" in (r.headers.get("content-type") or ""):
            return None, "eleven_tts_failed:empty"
        return r.content, None
    except Exception:
        return None, "eleven_tts_failed"


async def stream_ulaw(text: str, reference_id: str = "", speed: float = 1.0):
    """Yield μ-law 8 kHz chunks for Twilio."""
    key = api_key()
    text = (text or "").strip()
    if not key or not text:
        return
    vid = _resolve_voice(reference_id)
    url = STREAM_URL.format(voice_id=vid)
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            async with client.stream(
                "POST",
                url,
                headers={**_headers(), "Accept": "application/octet-stream"},
                params={"output_format": "ulaw_8000"},
                json=_payload(text, speed),
            ) as r:
                if r.status_code >= 400:
                    print(f"[ElevenLabs] stream {r.status_code}")
                    return
                async for chunk in r.aiter_bytes(chunk_size=320):
                    if chunk:
                        yield chunk
    except Exception as e:
        print(f"[ElevenLabs] stream error: {e}")
