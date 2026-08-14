"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Download, Mic, User } from "lucide-react";
import { fmtDateTime, fmtDuration } from "@/lib/format";
import { authHeaders, BACKEND, recordingSrc } from "@/lib/backend";
import type { Recording } from "@/lib/types";

function RecordingRow({ rec }: { rec: Recording }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play().catch(() => {}); setPlaying(true); }
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 transition hover:shadow-card">
      <button
        onClick={toggle}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition ${
          playing
            ? "border-brand bg-brandLight text-brand"
            : "border-border bg-surface2 text-subtle hover:border-brand/40 hover:text-brand"
        }`}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <User className="h-3.5 w-3.5 shrink-0 text-muted" />
          <span className="truncate font-medium text-text">{rec.contactName}</span>
        </div>
        <p className="font-mono text-[11px] text-muted">{rec.phoneNumber}</p>
        {/* Waveform */}
        <div className="mt-2 flex h-5 items-end gap-px overflow-hidden">
          {Array.from({ length: 56 }).map((_, i) => (
            <span
              key={i}
              className="w-[2px] rounded-sm transition-colors"
              style={{
                height: `${22 + ((i * 41 + 7) % 78)}%`,
                background: playing ? "#4f46e5" : "#e2e8f0",
              }}
            />
          ))}
        </div>
      </div>

      <div className="hidden shrink-0 text-right text-xs text-muted sm:block">
        <p>{fmtDateTime(rec.createdAt)}</p>
        <p className="num mt-0.5">{fmtDuration(rec.durationSec)} · {rec.sizeKb} KB</p>
      </div>

      <a
        href={recordingSrc(rec.callId || rec.id)}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface2 text-muted hover:text-brand transition-colors"
        title="Herunterladen"
      >
        <Download className="h-4 w-4" />
      </a>
      <audio ref={audioRef} src={recordingSrc(rec.callId || rec.id)} onEnded={() => setPlaying(false)} preload="none" />
    </div>
  );
}

export default function RecordingsPage() {
  const [recs, setRecs] = useState<Recording[]>([]);

  useEffect(() => {
    fetch(`${BACKEND}/api/recordings`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setRecs(d.recordings || []));
  }, []);

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-sm text-subtle">
        <Mic className="h-4 w-4 text-brand" />
        <span><strong className="text-text">{recs.length}</strong> Aufnahmen</span>
      </p>
      <div className="space-y-2">
        {recs.map((r) => <RecordingRow key={r.id} rec={r} />)}
      </div>
      {recs.length === 0 && (
        <div className="card p-10 text-center text-sm text-muted">Noch keine Aufnahmen.</div>
      )}
    </div>
  );
}
