"use client";

import { useEffect, useState } from "react";
import { LevelBadge } from "@/components/Badges";
import { fmtDateTime } from "@/lib/format";
import { authHeaders, BACKEND } from "@/lib/backend";
import { useI18n, type I18nKey } from "@/lib/i18n";
import type { LogEntry, LogLevel } from "@/lib/types";

export default function LogsPage() {
  const { t, tick } = useI18n();
  void tick;
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [level, setLevel] = useState<LogLevel | "">("");

  const levels: { key: LogLevel | ""; label: I18nKey }[] = [
    { key: "", label: "levelAll" },
    { key: "info", label: "levelInfo" },
    { key: "success", label: "levelOk" },
    { key: "warn", label: "levelWarn" },
    { key: "error", label: "levelErr" },
  ];

  useEffect(() => {
    const params = new URLSearchParams();
    if (level) params.set("level", level);
    fetch(`${BACKEND}/api/logs?${params}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setLogs(d.logs || []));
  }, [level]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {levels.map((l) => (
          <button
            key={l.key || "all"}
            onClick={() => setLevel(l.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              level === l.key
                ? "bg-brand text-white"
                : "border border-border bg-surface text-subtle hover:border-brand/30 hover:text-brand"
            }`}
          >
            {t(l.label)}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden p-0">
        <div className="scrollbar-thin max-h-[68vh] overflow-y-auto">
          {logs.map((l, i) => (
            <div
              key={l.id}
              className={`flex items-center gap-3 px-4 py-2.5 font-mono text-xs ${
                i % 2 === 0 ? "bg-surface" : "bg-surface2/40"
              } hover:bg-brandLight/40`}
            >
              <span className="w-32 shrink-0 text-muted">{fmtDateTime(l.ts)}</span>
              <LevelBadge level={l.level} />
              <span className="w-20 shrink-0 font-medium text-brand">[{l.source}]</span>
              <span className="truncate text-text">{l.message}</span>
            </div>
          ))}
          {logs.length === 0 && (
            <p className="p-8 text-center text-sm text-muted">{t("emptyLog")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
