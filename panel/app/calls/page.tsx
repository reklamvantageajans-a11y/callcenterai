"use client";

import { useEffect, useState } from "react";
import { Search, FileText, PhoneOutgoing, PhoneIncoming } from "lucide-react";
import { OutcomeBadge, StatusBadge } from "@/components/Badges";
import { fmtClock, fmtDuration } from "@/lib/format";
import { authHeaders, BACKEND, recordingSrc } from "@/lib/backend";
import type { Call, CallOutcome } from "@/lib/types";

const FILTERS: { key: CallOutcome | ""; label: string }[] = [
  { key: "", label: "Alle" },
  { key: "converted", label: "Konvertiert" },
  { key: "callback", label: "Rückruf" },
  { key: "not_interested", label: "Kein Interesse" },
  { key: "no_answer", label: "Nicht erreicht" },
  { key: "in_progress", label: "Läuft" },
];

export default function CallsPage() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [q, setQ] = useState("");
  const [outcome, setOutcome] = useState<CallOutcome | "">("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (outcome) params.set("outcome", outcome);
      const r = await fetch(`${BACKEND}/api/calls?${params}`, {
        headers: authHeaders(),
      }).then((x) => x.json());
      setCalls(r.calls || []);
      setLoading(false);
    };
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [q, outcome]);

  const [open, setOpen] = useState<Call | null>(null);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name oder Nummer…"
            className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text outline-none placeholder:text-muted focus:border-brand/50 focus:ring-2 focus:ring-brand/10"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key || "all"}
              onClick={() => setOutcome(f.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                outcome === f.key
                  ? "bg-brand text-white"
                  : "border border-border bg-surface text-subtle hover:border-brand/30 hover:text-brand"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-border bg-surface2">
              <tr className="text-left text-[11px] font-medium uppercase tracking-wide text-muted">
                <th className="px-4 py-3">Kontakt</th>
                <th className="px-4 py-3">Nummer</th>
                <th className="px-4 py-3">Richtung</th>
                <th className="px-4 py-3">Zeit</th>
                <th className="px-4 py-3">Dauer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Ergebnis</th>
                <th className="px-4 py-3">Aufnahme</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((c) => (
                <tr
                  key={c.id}
                  className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface2/60"
                  onClick={() => setOpen(c)}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-text">{c.contactName}</p>
                    {c.transcriptPreview && (
                      <p className="mt-0.5 max-w-[200px] truncate text-[11px] text-muted">
                        <FileText className="mr-1 inline h-3 w-3" />
                        {c.transcriptPreview}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-subtle">{c.phoneNumber}</td>
                  <td className="px-4 py-3">
                    {c.direction === "outbound" ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-brand">
                        <PhoneOutgoing className="h-3.5 w-3.5" /> Ausgehend
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-medium text-success">
                        <PhoneIncoming className="h-3.5 w-3.5" /> Eingehend
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-subtle">{fmtClock(c.startedAt)}</td>
                  <td className="num px-4 py-3 text-xs text-subtle">{fmtDuration(c.durationSec)}</td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3"><OutcomeBadge outcome={c.outcome} /></td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {c.twilioRecordingUrl || c.recordingUrl ? (
                      <audio controls preload="none" src={recordingSrc(c.id)} className="h-8 w-36" />
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && calls.length === 0 && (
            <p className="p-8 text-center text-sm text-muted">Keine Anrufe gefunden.</p>
          )}
          {loading && (
            <p className="p-8 text-center text-sm text-muted">Wird geladen…</p>
          )}
        </div>
      </div>

      {open && (
        <div className="card space-y-3 p-4">
          <div className="flex items-center justify-between">
            <p className="font-medium">{open.phoneNumber}</p>
            <button className="text-xs text-muted" onClick={() => setOpen(null)}>Kapat</button>
          </div>
          {(open.transcript || []).map((t, i) => (
            <div
              key={i}
              className={`rounded-lg px-3 py-2 text-sm ${
                t.role === "agent" ? "bg-surface2 text-text" : "bg-successLight text-text"
              }`}
            >
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                {t.role === "agent" ? "Agent" : "Kunde"}
              </p>
              {t.text}
            </div>
          ))}
          {!(open.transcript || []).length && (
            <p className="text-sm text-muted">Noch kein Transkript.</p>
          )}
        </div>
      )}
    </div>
  );
}
