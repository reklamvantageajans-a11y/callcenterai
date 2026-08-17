import asyncio
import os
import time
from typing import Optional

import httpx

TTS_URL = "https://api.fish.audio/v1/tts"
MODELS_URL = "https://api.fish.audio/model"

# Public library ids from Fish docs — used if the catalog call fails.
_FALLBACK = [
    {"id": "933563129e564b19a115bedd57b7406a", "label": "Fish · Warm", "gender": "female"},
    {"id": "9a9cf47702da476aa4629e2506d4a857", "label": "Fish · Clear", "gender": "female"},
]

_cache = {"at": 0.0, "voices": []}


def api_key() -> str:
    return (os.getenv("FISH_API_KEY") or "").strip()


def configured() -> bool:
    return bool(api_key())


def default_model() -> str:
    return (os.getenv("FISH_TTS_MODEL") or "s2.1-pro").strip() or "s2.1-pro"


def default_voice_id(settings_voice: str = "") -> str:
    return (settings_voice or os.getenv("FISH_VOICE_ID") or "").strip()


def _vid(item: dict) -> str:
    return str(item.get("id") or item.get("_id") or "").strip()


def _gender(item: dict) -> str:
    tags = item.get("tags") or []
    if isinstance(tags, str):
        tags = [tags]
    blob = " ".join(
        str(x).lower()
        for x in tags
        + [item.get("gender") or "", item.get("title") or "", item.get("description") or ""]
    )
    if any(w in blob for w in ("female", "woman", "kadın", "kadin", "weiblich", "girl")):
        return "female"
    if any(w in blob for w in ("male", "man", "erkek", "männlich", "mannlich", "boy")):
        return "male"
    return "neutral"


def _norm(item: dict) -> Optional[dict]:
    vid = _vid(item)
    if not vid:
        return None
    title = (item.get("title") or item.get("name") or vid)[:48]
    return {"id": vid, "label": title, "gender": _gender(item)}


async def _fetch_page(client: httpx.AsyncClient, params: dict) -> list:
    key = api_key()
    if not key:
        return []
    r = await client.get(
        MODELS_URL,
        headers={"Authorization": f"Bearer {key}"},
        params=params,
        timeout=8,
    )
    if r.status_code >= 400:
        return []
    data = r.json() if r.content else {}
    items = data.get("items") or data.get("models") or []
    out = []
    for it in items:
        row = _norm(it) if isinstance(it, dict) else None
        if row:
            out.append(row)
    return out


async def list_voices() -> list:
    if not configured():
        return []
    now = time.monotonic()
    if _cache["voices"] and now - _cache["at"] < 120:
        return _cache["voices"]
    seen = set()
    voices = []

    def add(rows):
        for row in rows:
            if row["id"] in seen:
                continue
            seen.add(row["id"])
            voices.append(row)

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            pages = await asyncio.gather(
                _fetch_page(client, {"self": "true", "page_size": 20, "page_number": 1}),
                _fetch_page(
                    client,
                    {"language": "de", "page_size": 8, "page_number": 1, "sort_by": "task_count"},
                ),
                _fetch_page(
                    client,
                    {"language": "tr", "page_size": 8, "page_number": 1, "sort_by": "task_count"},
                ),
                return_exceptions=True,
            )
            for rows in pages:
                if isinstance(rows, list):
                    add(rows)
    except Exception:
        pass
    add(_FALLBACK)
    voices = voices[:20]
    _cache["at"] = now
    _cache["voices"] = voices
    return voices


def clamp_speed(speed: float) -> float:
    try:
        v = float(speed)
    except Exception:
        v = 1.0
    return min(2.0, max(0.5, v))


async def synthesize(text: str, reference_id: str = "", speed: float = 1.0):
    key = api_key()
    if not key:
        return None, "fish_not_configured"
    text = (text or "").strip()
    if not text:
        return None, "empty"
    payload = {
        "text": text[:4000],
        "format": "mp3",
        "mp3_bitrate": 128,
        "latency": "balanced",
        "normalize": True,
        "prosody": {"speed": clamp_speed(speed)},
    }
    rid = (reference_id or default_voice_id()).strip()
    if rid:
        payload["reference_id"] = rid
    models = [default_model()]
    if "s2.1-pro-free" not in models:
        models.append("s2.1-pro-free")
    last_err = "fish_tts_failed"
    async with httpx.AsyncClient(timeout=60) as client:
        for model in models:
            r = await client.post(
                TTS_URL,
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                    "model": model,
                },
                json=payload,
            )
            if r.status_code < 400 and r.content and "json" not in (r.headers.get("content-type") or ""):
                return r.content, None
            last_err = f"fish_tts_failed:{r.status_code}"
            if r.status_code in (401, 403):
                return None, last_err
    return None, last_err
