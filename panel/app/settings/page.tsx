"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { ClockFormat, UiLang } from "@/lib/prefs";

const ZONES = [
  "Europe/Istanbul",
  "Europe/Berlin",
  "Europe/Vienna",
  "Europe/Zurich",
  "Europe/Amsterdam",
  "UTC",
];

export default function SettingsPage() {
  const { t, lang, timezone, clockFormat, save } = useI18n();
  const [l, setL] = useState<UiLang>(lang);
  const [tz, setTz] = useState(timezone);
  const [cf, setCf] = useState<ClockFormat>(clockFormat);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setL(lang);
    setTz(timezone);
    setCf(clockFormat);
  }, [lang, timezone, clockFormat]);

  return (
    <div className="card max-w-xl p-6">
      <h2 className="text-sm font-semibold">{t("pref")}</h2>
      <label className="mt-4 block text-xs font-semibold text-subtle">{t("uiLang")}</label>
      <select
        className="mt-1.5 w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm"
        value={l}
        onChange={(e) => setL(e.target.value as UiLang)}
      >
        <option value="tr">Türkçe</option>
        <option value="de">Deutsch</option>
      </select>
      <label className="mt-4 block text-xs font-semibold text-subtle">{t("tz")}</label>
      <select
        className="mt-1.5 w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm"
        value={tz}
        onChange={(e) => setTz(e.target.value)}
      >
        {ZONES.map((z) => (
          <option key={z} value={z}>
            {z}
          </option>
        ))}
      </select>
      <label className="mt-4 block text-xs font-semibold text-subtle">{t("clockFmt")}</label>
      <select
        className="mt-1.5 w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm"
        value={cf}
        onChange={(e) => setCf(e.target.value as ClockFormat)}
      >
        <option value="24h">24:00</option>
        <option value="12h">12:00</option>
      </select>
      <button
        className="mt-5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
        onClick={async () => {
          await save({ lang: l, timezone: tz, clockFormat: cf });
          setMsg(t("saved"));
        }}
      >
        {t("save")}
      </button>
      {msg && <p className="mt-2 text-sm text-success">{msg}</p>}
    </div>
  );
}
