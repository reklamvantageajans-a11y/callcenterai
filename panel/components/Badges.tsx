"use client";

import type { CallOutcome, CallStatus, LogLevel } from "@/lib/types";
import { useI18n, type I18nKey } from "@/lib/i18n";

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

const OUTCOME: Record<CallOutcome, { key: I18nKey; bg: string; text: string; border: string }> = {
  converted: { key: "converted", bg: "#dcfce7", text: "#15803d", border: "#86efac" },
  callback: { key: "callback", bg: "#fef3c7", text: "#b45309", border: "#fcd34d" },
  not_interested: { key: "notInterested", bg: "#f8fafc", text: "#64748b", border: "#e2e8f0" },
  no_answer: { key: "noAnswer", bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5" },
  in_progress: { key: "inProgress", bg: "#dbeafe", text: "#1d4ed8", border: "#93c5fd" },
};

const STATUS: Record<CallStatus, { key: I18nKey; bg: string; text: string; border: string }> = {
  answered: { key: "answered", bg: "#dcfce7", text: "#15803d", border: "#86efac" },
  missed: { key: "missed", bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5" },
  busy: { key: "busy", bg: "#fef3c7", text: "#b45309", border: "#fcd34d" },
  no_answer: { key: "noAnswer", bg: "#f8fafc", text: "#64748b", border: "#e2e8f0" },
  voicemail: { key: "voicemail", bg: "#ede9fe", text: "#6d28d9", border: "#c4b5fd" },
};

const LEVEL: Record<LogLevel, { label: string; bg: string; text: string; border: string }> = {
  info: { label: "INFO", bg: "#dbeafe", text: "#1d4ed8", border: "#93c5fd" },
  success: { label: "OK", bg: "#dcfce7", text: "#15803d", border: "#86efac" },
  warn: { label: "WARN", bg: "#fef3c7", text: "#b45309", border: "#fcd34d" },
  error: { label: "ERR", bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5" },
};

export function OutcomeBadge({ outcome }: { outcome: CallOutcome }) {
  const { t } = useI18n();
  const m = OUTCOME[outcome] || OUTCOME.in_progress;
  return <Pill label={t(m.key)} bg={m.bg} text={m.text} border={m.border} />;
}

export function StatusBadge({ status }: { status: CallStatus }) {
  const { t } = useI18n();
  const m = STATUS[status] || STATUS.answered;
  return <Pill label={t(m.key)} bg={m.bg} text={m.text} border={m.border} />;
}

export function LevelBadge({ level }: { level: LogLevel }) {
  const m = LEVEL[level] || LEVEL.info;
  return (
    <span
      className="inline-flex w-12 justify-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold"
      style={{ background: m.bg, color: m.text, borderColor: m.border }}
    >
      {m.label}
    </span>
  );
}
