"use client";

import { useEffect, useState } from "react";
import { Phone, Clock, User, MessageSquare } from "lucide-react";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { authHeaders, BACKEND } from "@/lib/backend";
import { useI18n } from "@/lib/i18n";
import type { Callback } from "@/lib/types";

export default function CallbacksPage() {
  const { t, tick } = useI18n();
  void tick;
  const [items, setItems] = useState<Callback[]>([]);

  useEffect(() => {
    fetch(`${BACKEND}/api/callbacks`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setItems(d.callbacks || []));
  }, []);

  const prio = {
    high: { label: t("prioHigh"), bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5", dot: "#dc2626" },
    medium: { label: t("prioMed"), bg: "#fef3c7", text: "#b45309", border: "#fcd34d", dot: "#d97706" },
    low: { label: t("prioLow"), bg: "#f8fafc", text: "#64748b", border: "#e2e8f0", dot: "#94a3b8" },
  };

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-sm text-subtle">
        <Phone className="h-4 w-4" />
        <span>
          <strong className="text-text">{items.length}</strong> {t("cbCount")}
        </span>
      </p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((cb) => {
          const p = prio[cb.priority] || prio.medium;
          return (
            <div key={cb.id} className="card animate-slideUp p-4 transition-shadow hover:shadow-cardHover">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface2 text-subtle">
                    <User className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-text">{cb.contactName}</p>
                    <p className="font-mono text-[11px] text-subtle">{cb.phoneNumber}</p>
                  </div>
                </div>
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium"
                  style={{ background: p.bg, color: p.text, borderColor: p.border }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.dot }} />
                  {p.label}
                </span>
              </div>
              <div className="mb-3 flex items-start gap-2 rounded-lg bg-surface2 px-3 py-2 text-xs text-subtle">
                <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
                {cb.reason}
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs text-subtle">
                  <Clock className="h-3.5 w-3.5 text-brand" />
                  <span>{fmtDateTime(cb.scheduledAt)}</span>
                  <span className="text-muted">· {fmtRelative(cb.scheduledAt)}</span>
                </div>
                <button className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brandDark">
                  {t("callBtn")}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {items.length === 0 && (
        <div className="card p-10 text-center text-sm text-muted">{t("emptyCb")}</div>
      )}
    </div>
  );
}
