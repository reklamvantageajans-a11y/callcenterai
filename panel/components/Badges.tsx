import type { CallOutcome, CallStatus, LogLevel } from "@/lib/types";

function Pill({ label, bg, text, border }: { label: string; bg: string; text: string; border: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
      style={{ background: bg, color: text, borderColor: border }}
    >
      {label}
    </span>
  );
}

const OUTCOME: Record<CallOutcome, { label: string; bg: string; text: string; border: string }> = {
  converted:      { label: "Konvertiert",   bg: "#dcfce7", text: "#15803d", border: "#86efac" },
  callback:       { label: "Rückruf",       bg: "#fef3c7", text: "#b45309", border: "#fcd34d" },
  not_interested: { label: "Kein Interesse",bg: "#f8fafc", text: "#64748b", border: "#e2e8f0" },
  no_answer:      { label: "Nicht erreicht",bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5" },
  in_progress:    { label: "Läuft…",        bg: "#dbeafe", text: "#1d4ed8", border: "#93c5fd" },
};

const STATUS: Record<CallStatus, { label: string; bg: string; text: string; border: string }> = {
  answered:  { label: "Angenommen",    bg: "#dcfce7", text: "#15803d", border: "#86efac" },
  missed:    { label: "Verpasst",      bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5" },
  busy:      { label: "Besetzt",       bg: "#fef3c7", text: "#b45309", border: "#fcd34d" },
  no_answer: { label: "Keine Antwort", bg: "#f8fafc", text: "#64748b", border: "#e2e8f0" },
  voicemail: { label: "Mailbox",       bg: "#ede9fe", text: "#6d28d9", border: "#c4b5fd" },
};

const LEVEL: Record<LogLevel, { label: string; bg: string; text: string; border: string }> = {
  info:    { label: "INFO", bg: "#dbeafe", text: "#1d4ed8", border: "#93c5fd" },
  success: { label: "OK",   bg: "#dcfce7", text: "#15803d", border: "#86efac" },
  warn:    { label: "WARN", bg: "#fef3c7", text: "#b45309", border: "#fcd34d" },
  error:   { label: "ERR",  bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5" },
};

export function OutcomeBadge({ outcome }: { outcome: CallOutcome }) {
  return <Pill {...OUTCOME[outcome]} />;
}

export function StatusBadge({ status }: { status: CallStatus }) {
  return <Pill {...STATUS[status]} />;
}

export function LevelBadge({ level }: { level: LogLevel }) {
  const m = LEVEL[level];
  return (
    <span
      className="inline-flex w-12 justify-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold"
      style={{ background: m.bg, color: m.text, borderColor: m.border }}
    >
      {m.label}
    </span>
  );
}
