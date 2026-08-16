"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { authHeaders, BACKEND } from "./backend";
import { setPrefs, type ClockFormat, type UiLang } from "./prefs";
import { DICT, type I18nKey } from "./i18n-dict";

export type { I18nKey };

type Snapshot = { lang: UiLang; timezone: string; clockFormat: ClockFormat };

type Ctx = Snapshot & {
  t: (k: I18nKey) => string;
  save: (p: Partial<Snapshot>) => Promise<void>;
  tick: number;
};

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [snap, setSnap] = useState<Snapshot>({
    lang: "tr",
    timezone: "Europe/Istanbul",
    clockFormat: "24h",
  });
  const [tick, setTick] = useState(0);

  const commit = useCallback((next: Snapshot) => {
    setSnap(next);
    setPrefs(next);
    if (typeof document !== "undefined") document.documentElement.lang = next.lang;
    setTick((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await fetch(`${BACKEND}/api/settings`, { headers: authHeaders() }).then((r) =>
          r.json()
        );
        if (cancelled || s.error) return;
        commit({
          lang: s.panelLang === "de" ? "de" : "tr",
          timezone: s.timezone || "Europe/Istanbul",
          clockFormat: s.clockFormat === "12h" ? "12h" : "24h",
        });
      } catch {
        /* offline */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [commit]);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const t = useCallback((k: I18nKey) => DICT[snap.lang][k] || k, [snap.lang]);

  const save = useCallback(
    async (p: Partial<Snapshot>) => {
      const next = { ...snap, ...p };
      commit(next);
      await fetch(`${BACKEND}/api/settings`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          panelLang: next.lang,
          timezone: next.timezone,
          clockFormat: next.clockFormat,
        }),
      });
    },
    [snap, commit]
  );

  const value = useMemo(
    () => ({ ...snap, t, save, tick }),
    [snap, t, save, tick]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("I18nProvider missing");
  return ctx;
}
