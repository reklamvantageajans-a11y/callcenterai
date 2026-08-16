import io
import json
import os
from datetime import datetime, timezone


def configured() -> bool:
    folder = os.getenv("GOOGLE_DRIVE_FOLDER_ID", "").strip()
    raw = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    path = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE", "").strip()
    return bool(folder and (raw or path))


def status() -> dict:
    return {
        "configured": configured(),
        "folderId": os.getenv("GOOGLE_DRIVE_FOLDER_ID", "")[:8] + "…" if os.getenv("GOOGLE_DRIVE_FOLDER_ID") else "",
        "message": "Drive bağlı" if configured() else "JSON anahtar ve klasör ID bekleniyor",
    }


def _creds():
    from google.oauth2 import service_account
    scopes = ["https://www.googleapis.com/auth/drive.file"]
    raw = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    path = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE", "").strip()
    if raw:
        info = json.loads(raw)
        return service_account.Credentials.from_service_account_info(info, scopes=scopes)
    return service_account.Credentials.from_service_account_file(path, scopes=scopes)


def upload_mp3(filename: str, data: bytes) -> str:
    if not configured() or not data:
        return ""
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaIoBaseUpload
    folder = os.getenv("GOOGLE_DRIVE_FOLDER_ID", "").strip()
    service = build("drive", "v3", credentials=_creds(), cache_discovery=False)
    media = MediaIoBaseUpload(io.BytesIO(data), mimetype="audio/mpeg", resumable=False)
    body = {"name": filename, "parents": [folder]}
    f = service.files().create(body=body, media_body=media, fields="id,webViewLink").execute()
    return f.get("webViewLink") or f.get("id") or ""


def filename_for(phone: str, call_id: str) -> str:
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    safe = "".join(ch for ch in (phone or "unknown") if ch.isdigit() or ch == "+")
    return f"{day}_{safe}_{call_id[-8:]}.mp3"
