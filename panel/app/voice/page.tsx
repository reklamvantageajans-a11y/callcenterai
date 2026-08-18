"use client";

import { useEffect, useRef, useState } from "react";
import { authHeaders, BACKEND } from "@/lib/backend";
import { useI18n } from "@/lib/i18n";

type Voice = { id: string; gender: string; label: string };

export default function VoicePage() {
  const { t, lang } = useI18n();
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selected, setSelected] = useState("");
  const [provider, setProvider] = useState("openai");
  const [fishVoices, setFishVoices] = useState<Voice[]>([]);
  const [fishVoice, setFishVoice] = useState("");
  const [fishOn, setFishOn] = useState(false);
  const [elevenVoices, setElevenVoices] = useState<Voice[]>([]);
  const [elevenVoice, setElevenVoice] = useState("");
  const [elevenOn, setElevenOn] = useState(false);
  const [msg, setMsg] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);

  const load = () =>
    fetch(`${BACKEND}/api/voices`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => {
        setVoices(d.voices || []);
        setSelected(d.selected || "");
        setProvider(d.ttsProvider || "openai");
        setFishVoices(d.fishVoices || []);
        setFishVoice(d.fishVoice || "");
        setFishOn(!!d.fishConfigured);
        setElevenVoices(d.elevenVoices || []);
        setElevenVoice(d.elevenVoice || "");
        setElevenOn(!!d.elevenConfigured);
      });

  useEffect(() => {
    load();
  }, []);

  const pick = async (id: string) => {
    await fetch(`${BACKEND}/api/settings`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ voice: id, ttsProvider: "openai" }),
    });
    setSelected(id);
    setProvider("openai");
  };

  const pickFish = async (id: string) => {
    await fetch(`${BACKEND}/api/settings`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ fishVoice: id, ttsProvider: "fish" }),
    });
    setFishVoice(id);
    setProvider("fish");
  };

  const pickEleven = async (id: string) => {
    await fetch(`${BACKEND}/api/settings`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ elevenVoice: id, ttsProvider: "elevenlabs" }),
    });
    setElevenVoice(id);
    setProvider("elevenlabs");
  };

  const preview = async (id: string, engine: "openai" | "fish" | "elevenlabs") => {
    const r = await fetch(`${BACKEND}/api/voices/preview`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ voice: id, provider: engine, lang }),
    });
    if (!r.ok) {
      try {
        setMsg((await r.json()).error || "preview failed");
      } catch {
        setMsg("preview failed");
      }
      return;
    }
    setMsg("");
    if (!audioRef.current) return;
    audioRef.current.src = URL.createObjectURL(await r.blob());
    audioRef.current.play();
  };

  const gender = (g: string) =>
    g === "female" ? t("female") : g === "male" ? t("male") : t("neutral");

  const card = (
    v: Voice,
    on: boolean,
    onPick: () => void,
    onListen: () => void
  ) => (
    <button key={v.id} onClick={onPick} className={`card p-4 text-left ${on ? "ring-2 ring-brand" : ""}`}>
      <div className="font-semibold">{v.label}</div>
      <div className="mt-0.5 text-xs text-muted">{gender(v.gender)}</div>
      <span
        className="mt-3 inline-block text-xs font-medium text-brand"
        onClick={(e) => {
          e.stopPropagation();
          onListen();
        }}
      >
        {t("listen")}
      </span>
    </button>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold">{t("phoneVoice")}</h2>
        <p className="mt-1 text-xs text-muted">{t("phoneVoiceHint")}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {voices.map((v) =>
            card(v, provider === "openai" && selected === v.id, () => pick(v.id), () => preview(v.id, "openai"))
          )}
        </div>
      </div>
      <div>
        <h2 className="text-sm font-semibold">{t("ttsEleven")}</h2>
        <p className="mt-1 text-xs text-muted">{elevenOn ? t("elevenHint") : t("elevenOff")}</p>
        {elevenOn && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {elevenVoices.map((v) =>
              card(
                v,
                provider === "elevenlabs" && elevenVoice === v.id,
                () => pickEleven(v.id),
                () => preview(v.id, "elevenlabs")
              )
            )}
          </div>
        )}
      </div>
      <div>
        <h2 className="text-sm font-semibold">{t("ttsFish")}</h2>
        <p className="mt-1 text-xs text-muted">{fishOn ? t("fishHint") : t("fishOff")}</p>
        {fishOn && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fishVoices.map((v) =>
              card(v, provider === "fish" && fishVoice === v.id, () => pickFish(v.id), () => preview(v.id, "fish"))
            )}
          </div>
        )}
      </div>
      {msg && <p className="text-sm text-danger">{msg}</p>}
      <audio ref={audioRef} controls className="w-full" />
    </div>
  );
}
