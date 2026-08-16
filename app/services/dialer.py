import asyncio
import os
from app.services import call_store, ops_store
from app.services.ops_store import get_campaign, save_campaign, add_log

_queue: asyncio.Queue = None
_active = 0
_lock = asyncio.Lock()


def queue() -> asyncio.Queue:
    global _queue
    if _queue is None:
        _queue = asyncio.Queue()
    return _queue


def max_parallel() -> int:
    try:
        return max(1, min(int(os.getenv("MAX_CONCURRENT_CALLS", "2")), 5))
    except Exception:
        return 2


async def enqueue_campaign(campaign_id: str):
    await queue().put(campaign_id)
    add_log("info", "dialer", f"Kampagne {campaign_id} kuyruğa alındı")


async def worker_loop(place_call):
    """place_call(to, lang, public_url) -> {sid} or raises."""
    global _active
    while True:
        cid = await queue().get()
        try:
            await _run_campaign(cid, place_call)
        except Exception as e:
            add_log("error", "dialer", f"Kampagne hatası: {e}")
        finally:
            queue().task_done()


async def _run_campaign(cid: str, place_call):
    global _active
    row = get_campaign(cid)
    if not row or row.get("status") == "cancelled":
        return
    row["status"] = "running"
    save_campaign(row)
    dnc = set(ops_store.list_dnc())
    parallel = min(row.get("concurrency") or 2, max_parallel())
    sem = asyncio.Semaphore(parallel)

    async def one(item):
        global _active
        phone = item.get("phone")
        if phone in dnc:
            item["status"] = "dnc"
            item["error"] = "DNC"
            return
        async with sem:
            async with _lock:
                _active += 1
            try:
                item["status"] = "calling"
                save_campaign(row)
                result = await asyncio.to_thread(place_call, phone, row.get("lang") or "de")
                item["callSid"] = (result or {}).get("sid")
                item["status"] = "started"
                row["done"] = row.get("done", 0) + 1
                add_log("success", "dialer", f"Arandı {phone}")
            except Exception as e:
                item["status"] = "failed"
                item["error"] = str(e)[:200]
                row["failed"] = row.get("failed", 0) + 1
                add_log("warn", "dialer", f"{phone}: {e}")
            finally:
                async with _lock:
                    _active -= 1
                save_campaign(row)

    await asyncio.gather(*[one(it) for it in row.get("numbers") or [] if it.get("status") == "queued"])
    row = get_campaign(cid) or row
    row["status"] = "done"
    save_campaign(row)
    add_log("info", "dialer", f"Kampagne {cid} bitti")


def snapshot():
    return {"active": _active, "max": max_parallel(), "queued": 0 if _queue is None else _queue.qsize()}
