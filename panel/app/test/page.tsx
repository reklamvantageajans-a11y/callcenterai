"use client";

import { useEffect, useRef, useState } from "react";
import { authHeaders, BACKEND } from "@/lib/backend";
import { useI18n } from "@/lib/i18n";

type Engine = "fish" | "openai" | "elevenlabs";
type Voice = { id: string; gender: string; label: string };
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
  const [err, setErr] = useState("");
  const [provider, setProvider] = useState<Engine>("fish");
  const [fishOn, setFishOn] = useState(false);
  const [elevenOn, setElevenOn] = useState(false);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [fishVoices, setFishVoices] = useState<Voice[]>([]);
  const [elevenVoices, setElevenVoices] = useState<Voice[]>([]);
  const [openaiVoice, setOpenaiVoice] = useState("");
  const [fishVoice, setFishVoice] = useState("");
  const [elevenVoice, setElevenVoice] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    fetch(`${BACKEND}/api/voices`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => {
        const fish = !!d.fishConfigured;
        const eleven = !!d.elevenConfigured;
        setFishOn(fish);
        setElevenOn(eleven);
        setVoices(d.voices || []);
        setFishVoices(d.fishVoices || []);
        setElevenVoices(d.elevenVoices || []);
        setOpenaiVoice(d.selected || "");
        setFishVoice(d.fishVoice || d.fishVoices?.[0]?.id || "");
        setElevenVoice(d.elevenVoice || d.elevenVoices?.[0]?.id || "");
        const p = d.ttsProvider as Engine;
        if (p === "elevenlabs" && eleven) setProvider("elevenlabs");
        else if (p === "fish" && fish) setProvider("fish");
        else if (eleven) setProvider("elevenlabs");
        else setProvider(fish ? "fish" : "openai");
      });
  }, []);

  const list = provider === "elevenlabs" ? elevenVoices : provider === "fish" ? fishVoices : voices;
  const voice = provider === "elevenlabs" ? elevenVoice : provider === "fish" ? fishVoice : openaiVoice;

  const saveEngine = async (next: Engine) => {
    setProvider(next);
    await fetch(`${BACKEND}/api/settings`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ ttsProvider: next }),
    });
  };

  const saveVoice = async (id: string) => {
    if (provider === "elevenlabs") setElevenVoice(id);
    else if (provider === "fish") setFishVoice(id);
    else setOpenaiVoice(id);
    const body =
      provider === "elevenlabs"
        ? { elevenVoice: id, ttsProvider: "elevenlabs" }
        : provider === "fish"
          ? { fishVoice: id, ttsProvider: "fish" }
          : { voice: id, ttsProvider: "openai" };
    await fetch(`${BACKEND}/api/settings`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  };

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

  const playAudio = async (payload: Record<string, unknown>) => {
    const r = await fetch(`${BACKEND}/api/voices/preview`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ provider, voice, lang, ...payload }),
    });
    if (!r.ok) {
      try {
        setErr((await r.json()).error || "preview failed");
      } catch {
        setErr("preview failed");
      }
      return;
    }
    setErr("");
    if (!audioRef.current) return;
    audioRef.current.src = URL.createObjectURL(await r.blob());
    audioRef.current.play();
  };

  const play = (d: Extract<Turn, { role: "agent" }>) =>
    playAudio({ text: d.speech, speed: d.speed });

  return (
    <div className="card max-w-3xl p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t("lab")}</h2>
        <div className="flex flex-wrap gap-2">
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
          <select
            className="rounded-lg border border-border bg-surface2 px-3 py-2 text-sm"
            value={provider}
            onChange={(e) => saveEngine(e.target.value as Engine)}
          >
            <option value="elevenlabs" disabled={!elevenOn}>
              {t("ttsEleven")}
            </option>
            <option value="fish" disabled={!fishOn}>
              {t("ttsFish")}
            </option>
            <option value="openai">{t("ttsOpenAI")}</option>
          </select>
          {list.length > 0 && (
            <select
              className="rounded-lg border border-border bg-surface2 px-3 py-2 text-sm"
              value={voice}
              onChange={(e) => saveVoice(e.target.value)}
            >
              {list.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          )}
          <button className="rounded-lg border border-border px-3 py-2 text-xs font-medium" onClick={() => playAudio({})}>
            {t("listen")}
          </button>
          <button className="rounded-lg border border-border px-3 py-2 text-xs font-medium" onClick={() => setHist([])}>
            {t("labReset")}
          </button>
          <button className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white" onClick={start} disabled={busy}>
            {t("labStart")}
          </button>
        </div>
      </div>
      <p className="mb-3 text-xs text-muted">
        {provider === "elevenlabs" ? t("elevenOn") : provider === "fish" ? (fishOn ? t("fishOn") : t("fishOff")) : t("phoneVoiceHint")}
      </p>
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
      {err && <p className="mt-2 text-sm text-danger">{err}</p>}
      <audio ref={audioRef} className="hidden" />
    </div>
  );
}
