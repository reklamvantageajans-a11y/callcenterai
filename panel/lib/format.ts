import { getPrefs, localeOf } from "./prefs";

function opts(extra: Intl.DateTimeFormatOptions = {}): Intl.DateTimeFormatOptions {
  const p = getPrefs();
  return {
    timeZone: p.timezone,
    hour12: p.clockFormat === "12h",
    ...extra,
  };
}

export function fmtDuration(sec: number): string {
  if (!sec) return "0:00";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function fmtClock(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(localeOf(), opts({ hour: "2-digit", minute: "2-digit" }));
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(
    localeOf(),
    opts({ day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
  );
}

export function fmtNow(): string {
  return new Date().toLocaleString(
    localeOf(),
    opts({
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  );
}

export function fmtDateLong(d: Date): string {
  const p = getPrefs();
  return d.toLocaleDateString(localeOf(), {
    timeZone: p.timezone,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function fmtTimeNow(): string {
  return new Date().toLocaleTimeString(
    localeOf(),
    opts({ hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );
}

export function fmtRelative(iso: string): string {
  const p = getPrefs();
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (p.lang === "de") {
    if (min < 1) return "gerade eben";
    if (min < 60) return `vor ${min} Min`;
    const h = Math.round(min / 60);
    if (h < 24) return `vor ${h} Std`;
    return `vor ${Math.round(h / 24)} Tg`;
  }
  if (min < 1) return "şimdi";
  if (min < 60) return `${min} dk önce`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} sa önce`;
  return `${Math.round(h / 24)} gün önce`;
}
