export type UiLang = "tr" | "de";
export type ClockFormat = "24h" | "12h";

export type Prefs = {
  lang: UiLang;
  timezone: string;
  clockFormat: ClockFormat;
};

let prefs: Prefs = {
  lang: "tr",
  timezone: "Europe/Istanbul",
  clockFormat: "24h",
};

const listeners = new Set<() => void>();

export function getPrefs(): Prefs {
  return prefs;
}

export function setPrefs(next: Partial<Prefs>) {
  prefs = { ...prefs, ...next };
  listeners.forEach((fn) => fn());
}

export function subscribePrefs(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function localeOf(lang: UiLang = prefs.lang) {
  return lang === "tr" ? "tr-TR" : "de-DE";
}
