"use client";

import { useEffect, useRef, useState } from "react";
import { authHeaders, BACKEND } from "@/lib/backend";
import { useI18n } from "@/lib/i18n";

type Voice = { id: string; gender: string; label: string };

export default function VoicePage() {
  const { t, lang } = useI18n();
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selected, setSelected] = useState("");
  const [fishVoices, setFishVoices] = useState<Voice[]>([]);
  const [fishVoice, setFishVoice] = useState("");
  const [fishOn, setFishOn] = useState(false);
  const [msg, setMsg] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);

  const load = () =>
    fetch(`${BACKEND}/api/voices`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => {
        setVoices(d.voices || []);
        setSelected(d.selected || "");
        setFishVoices(d.fishVoices || []);
        setFishVoice(d.fishVoice || "");
        setFishOn(!!d.fishConfigured);
      });

  useEffect(() => {
    load();
  }, []);

  const pick = async (id: string) => {
    await fetch(`${BACKEND}/api/settings`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ voice: id }),
    });
    setSelected(id);
  };

  const pickFish = async (id: string) => {
    await fetch(`${BACKEND}/api/settings`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ fishVoice: id, ttsProvider: "fish" }),
    });
    setFishVoice(id);
  };

  const preview = async (id: string, provider: "openai" | "fish") => {
    const r = await fetch(`${BACKEND}/api/voices/preview`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ voice: id, provider, lang }),
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold">{t("phoneVoice")}</h2>
        <p className="mt-1 text-xs text-muted">{t("phoneVoiceHint")}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {voices.map((v) => (
            <button
              key={v.id}
              onClick={() => pick(v.id)}
              className={`card p-4 text-left ${selected === v.id ? "ring-2 ring-brand" : ""}`}
            >
              <div className="font-semibold">{v.label}</div>
              <div className="mt-0.5 text-xs text-muted">{gender(v.gender)}</div>
              <span
                className="mt-3 inline-block text-xs font-medium text-brand"
                onClick={(e) => {
                  e.stopPropagation();
                  preview(v.id, "openai");
                }}
              >
                {t("listen")}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <h2 className="text-sm font-semibold">{t("ttsFish")}</h2>
        <p className="mt-1 text-xs text-muted">{fishOn ? t("fishHint") : t("fishOff")}</p>
        {fishOn && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fishVoices.map((v) => (
              <button
                key={v.id}
                onClick={() => pickFish(v.id)}
                className={`card p-4 text-left ${fishVoice === v.id ? "ring-2 ring-brand" : ""}`}
              >
                <div className="font-semibold">{v.label}</div>
                <div className="mt-0.5 text-xs text-muted">{gender(v.gender)}</div>
                <span
                  className="mt-3 inline-block text-xs font-medium text-brand"
                  onClick={(e) => {
                    e.stopPropagation();
                    preview(v.id, "fish");
                  }}
                >
                  {t("listen")}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {msg && <p className="text-sm text-danger">{msg}</p>}
      <audio ref={audioRef} controls className="w-full" />
    </div>
  );
}
