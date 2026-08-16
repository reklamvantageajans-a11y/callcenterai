import json
import os
import threading
from datetime import datetime, timezone

_LOCK = threading.Lock()
_PATH = os.path.join(os.getenv("DATA_DIR", "data"), "calls.json")


def _now():
    return datetime.now(timezone.utc).isoformat()


def _load():
    if not os.path.exists(_PATH):
        return []
    try:
        with open(_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def _save(items):
    os.makedirs(os.path.dirname(_PATH) or ".", exist_ok=True)
    tmp = _PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)
    os.replace(tmp, _PATH)


def upsert(call_id: str, **fields):
    if not call_id:
        return
    with _LOCK:
        items = _load()
        row = next((c for c in items if c.get("id") == call_id), None)
        if not row:
            row = {
                "id": call_id,
                "phoneNumber": "",
                "contactName": "",
                "direction": "inbound",
                "startedAt": _now(),
                "durationSec": 0,
                "status": "in_progress",
                "outcome": "in_progress",
                "agent": "Kalmaz",
                "lang": "de",
                "recordingUrl": None,
                "twilioRecordingUrl": None,
                "transcript": [],
                "transcriptPreview": "",
            }
            items.insert(0, row)
        row.update({k: v for k, v in fields.items() if v is not None})
        _save(items)


def add_turn(call_id: str, role: str, text: str):
    text = (text or "").strip()
    if not call_id or not text:
        return
    with _LOCK:
        items = _load()
        row = next((c for c in items if c.get("id") == call_id), None)
        if not row:
            return
        turns = row.setdefault("transcript", [])
        if turns and turns[-1].get("role") == role:
            turns[-1]["text"] = (turns[-1].get("text") or "") + text
            turns[-1]["ts"] = _now()
        else:
            turns.append({"role": role, "text": text, "ts": _now()})
        preview = " ".join(t.get("text", "") for t in turns)[:160]
        row["transcriptPreview"] = preview
        _save(items)


def finish(call_id: str):
    if not call_id:
        return
    with _LOCK:
        items = _load()
        row = next((c for c in items if c.get("id") == call_id), None)
        if not row:
            return
        started = row.get("startedAt")
        try:
            t0 = datetime.fromisoformat(started.replace("Z", "+00:00"))
            row["durationSec"] = max(0, int((datetime.now(timezone.utc) - t0).total_seconds()))
        except Exception:
            pass
        if row.get("status") == "in_progress":
            row["status"] = "answered"
        _save(items)


def set_recording(call_id: str, twilio_url: str):
    upsert(call_id, twilioRecordingUrl=twilio_url, recordingUrl=f"/api/calls/{call_id}/recording")


def set_drive_url(call_id: str, link: str):
    upsert(call_id, driveUrl=link)


def list_calls():
    with _LOCK:
        return _load()


def get_call(call_id: str):
    with _LOCK:
        return next((c for c in _load() if c.get("id") == call_id), None)
