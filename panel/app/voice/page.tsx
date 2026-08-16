"use client";

import { useEffect, useRef, useState } from "react";
import { authHeaders, BACKEND } from "@/lib/backend";

type Voice = { id: string; gender: string; label: string };

export default function VoicePage() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selected, setSelected] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);

  const load = () =>
    fetch(`${BACKEND}/api/voices`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => {
        setVoices(d.voices || []);
        setSelected(d.selected || "");
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

  const preview = async (id: string) => {
    const r = await fetch(`${BACKEND}/api/voices/preview`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ voice: id, lang: "de" }),
    });
    if (!r.ok || !audioRef.current) return;
    audioRef.current.src = URL.createObjectURL(await r.blob());
    audioRef.current.play();
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {voices.map((v) => (
          <button
            key={v.id}
            onClick={() => pick(v.id)}
            className={`card p-4 text-left ${selected === v.id ? "ring-2 ring-brand" : ""}`}
          >
            <div className="font-semibold">{v.label}</div>
            <div className="mt-0.5 text-xs text-muted">
              {v.gender === "female" ? "Weiblich" : v.gender === "male" ? "Männlich" : "Neutral"}
            </div>
            <span
              className="mt-3 inline-block text-xs font-medium text-brand"
              onClick={(e) => {
                e.stopPropagation();
                preview(v.id);
              }}
            >
              Anhören
            </span>
          </button>
        ))}
      </div>
      <audio ref={audioRef} controls className="w-full" />
    </div>
  );
}
