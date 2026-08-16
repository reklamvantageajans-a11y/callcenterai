import json
import os
import threading
import uuid
from datetime import datetime, timezone

_LOCK = threading.Lock()
_DIR = os.getenv("DATA_DIR", "data")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def _path(name):
    return os.path.join(_DIR, name)


def load_list(name):
    p = _path(name)
    if not os.path.exists(p):
        return []
    try:
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def save_list(name, items):
    os.makedirs(_DIR, exist_ok=True)
    p = _path(name)
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)
    os.replace(tmp, p)


def add_log(level, source, message):
    with _LOCK:
        items = load_list("logs.json")
        items.insert(0, {
            "id": uuid.uuid4().hex[:10],
            "ts": now_iso(),
            "level": level,
            "source": source,
            "message": message,
        })
        save_list("logs.json", items[:500])


def list_logs(limit=80):
    with _LOCK:
        return load_list("logs.json")[:limit]


def list_campaigns():
    with _LOCK:
        return load_list("campaigns.json")


def get_campaign(cid):
    with _LOCK:
        return next((c for c in load_list("campaigns.json") if c.get("id") == cid), None)


def save_campaign(row):
    with _LOCK:
        items = load_list("campaigns.json")
        found = False
        for i, c in enumerate(items):
            if c.get("id") == row.get("id"):
                items[i] = row
                found = True
                break
        if not found:
            items.insert(0, row)
        save_list("campaigns.json", items)


def new_campaign(name, lang, numbers, concurrency=2):
    row = {
        "id": "cmp_" + uuid.uuid4().hex[:8],
        "name": name or "Kampagne",
        "lang": lang if lang in ("tr", "de") else "de",
        "concurrency": max(1, min(int(concurrency or 2), 5)),
        "status": "queued",
        "createdAt": now_iso(),
        "numbers": [
            {"phone": n, "status": "queued", "callSid": None, "error": None}
            for n in numbers
        ],
        "done": 0,
        "failed": 0,
        "total": len(numbers),
    }
    save_campaign(row)
    return row


def list_callbacks():
    with _LOCK:
        return load_list("callbacks.json")


def add_callback(phone, reason, when, priority="medium"):
    with _LOCK:
        items = load_list("callbacks.json")
        row = {
            "id": "cb_" + uuid.uuid4().hex[:8],
            "phoneNumber": phone,
            "contactName": phone,
            "scheduledAt": when,
            "reason": reason,
            "priority": priority,
            "status": "open",
        }
        items.insert(0, row)
        save_list("callbacks.json", items)
        return row


def list_dnc():
    with _LOCK:
        return load_list("dnc.json")


def add_dnc(phone):
    with _LOCK:
        items = load_list("dnc.json")
        if phone not in items:
            items.append(phone)
            save_list("dnc.json", items)
        return items


_DEFAULT_SETTINGS = {
    "voice": os.getenv("OPENAI_VOICE", "marin"),
    "lang": "de",
    "agentName": "Kalmaz",
    "greetingDe": "Einen wunderschönen guten Tag, mein Name ist Kalmaz vom Verbund der Privat Krankenversicherten. Ich fass mich kurz: gesetzliche und private Kassen erhöhen demnächst wieder die Beiträge. Unser Experte erstellt Ihnen kostenlos und unverbindlich eine Vergleichsanalyse. Wäre das was für Sie?",
    "greetingTr": "İyi günler, ben Kalmaz, Özel Sağlık Sigortacıları Birliği'nden arıyorum. Kısa keseceğim: SGK ve özel sağlık sigortaları yakında prim artışı yapacak. Uzmanımız ücretsiz ve bağlayıcı olmayan bir karşılaştırma hazırlayabilir. Uygun olur mu?",
    "maxConcurrent": 2,
}


def get_settings():
    p = _path("settings.json")
    data = dict(_DEFAULT_SETTINGS)
    if os.path.exists(p):
        try:
            with open(p, "r", encoding="utf-8") as f:
                data.update(json.load(f) or {})
        except Exception:
            pass
    return data


def save_settings(fields: dict):
    data = get_settings()
    allowed = set(_DEFAULT_SETTINGS.keys())
    for k, v in (fields or {}).items():
        if k in allowed and v is not None:
            data[k] = v
    os.makedirs(_DIR, exist_ok=True)
    p = _path("settings.json")
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, p)
    return data
