"use client";

import { useRef, useState } from "react";
import { authHeaders, BACKEND } from "@/lib/backend";
import { useI18n } from "@/lib/i18n";

type Turn =
  | { role: "user"; text: string }
  | { role: "agent"; speed: string; tone: string; emphasis: string; speech: string };

function block(lang: string, d: Extract<Turn, { role: "agent" }>) {
  if (lang === "de") {
    return `[STIMME]\n- Tempo: ${d.speed}\n- Tonfall: ${d.tone}\n- Betonung: ${d.emphasis || "—"}\n\n[GESPROCHENER TEXT]\n"${d.speech}"`;
  }
  return `[SES AYARLARI]\n- Hız: ${d.speed}\n- Tonlama: ${d.tone}\n- Vurgu: ${d.emphasis || "—"}\n\n[CANLI KONUŞMA METNİ]\n"${d.speech}"`;
}

export default function TestPage() {
  const { t } = useI18n();
  const [lang, setLang] = useState("de");
  const [hist, setHist] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const ask = async (payload: Record<string, unknown>) => {
    setBusy(true);
    try {
      const r = await fetch(`${BACKEND}/api/dialog/test`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) return;
      setHist((h) => [...h, { role: "agent", ...d }]);
    } finally {
      setBusy(false);
    }
  };

  const start = () => {
    setHist([]);
    ask({ lang, start: true, history: [] });
  };

  const send = async () => {
    const msg = text.trim();
    if (!msg || busy) return;
    setText("");
    const next: Turn[] = [...hist, { role: "user", text: msg }];
    setHist(next);
    await ask({
      lang,
      text: msg,
      history: hist.map((x) => ({ role: x.role, text: x.role === "agent" ? x.speech : x.text })),
    });
  };

  const play = async (d: Extract<Turn, { role: "agent" }>) => {
    const r = await fetch(`${BACKEND}/api/voices/preview`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ text: d.speech, speed: d.speed, lang }),
    });
    if (!r.ok || !audioRef.current) return;
    audioRef.current.src = URL.createObjectURL(await r.blob());
    audioRef.current.play();
  };

  return (
    <div className="card max-w-3xl p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t("lab")}</h2>
        <div className="flex gap-2">
          <select
            className="rounded-lg border border-border bg-surface2 px-3 py-2 text-sm"
            value={lang}
            onChange={(e) => {
              setLang(e.target.value);
              setHist([]);
            }}
          >
            <option value="de">Deutsch</option>
            <option value="tr">Türkçe</option>
          </select>
          <button className="rounded-lg border border-border px-3 py-2 text-xs font-medium" onClick={() => setHist([])}>
            {t("labReset")}
          </button>
          <button className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white" onClick={start} disabled={busy}>
            {t("labStart")}
          </button>
        </div>
      </div>
      <div className="scrollbar-thin max-h-[52vh] space-y-3 overflow-auto">
        {hist.map((x, i) =>
          x.role === "user" ? (
            <div key={i} className="ml-auto max-w-[92%] rounded-xl rounded-br-sm bg-text px-3 py-2 text-sm text-white">
              {x.text}
            </div>
          ) : (
            <div key={i} className="max-w-[92%] rounded-xl rounded-bl-sm border border-border bg-surface2 p-3">
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-text">{block(lang, x)}</pre>
              <button className="mt-2 text-xs font-medium text-brand" onClick={() => play(x)}>
                {t("listen")}
              </button>
            </div>
          )
        )}
      </div>
      <div className="mt-4 flex gap-2">
        <input
          className="flex-1 rounded-lg border border-border bg-surface2 px-3 py-2 text-sm"
          placeholder={t("labCust")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white" onClick={send} disabled={busy}>
          {t("labSend")}
        </button>
      </div>
      <audio ref={audioRef} className="hidden" />
    </div>
  );
}
