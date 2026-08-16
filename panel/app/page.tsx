"use client";

import { useEffect, useState } from "react";
import {
  PhoneCall, Activity, PhoneIncoming, PhoneMissed,
  PhoneForwarded, Trophy, Percent, Timer,
} from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { HourlyChart } from "@/components/HourlyChart";
import { OutcomeBadge, LevelBadge } from "@/components/Badges";
import { fmtClock, fmtDuration } from "@/lib/format";
import { authHeaders, BACKEND } from "@/lib/backend";
import { useI18n } from "@/lib/i18n";
import type { Call, LogEntry, Stats } from "@/lib/types";

export default function DashboardPage() {
  const { t, tick } = useI18n();
  void tick;
  const [stats, setStats] = useState<Stats | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    const load = async () => {
      const h = authHeaders();
      const [s, c, l] = await Promise.all([
        fetch(`${BACKEND}/api/stats`, { headers: h }).then((r) => r.json()),
        fetch(`${BACKEND}/api/calls`, { headers: h }).then((r) => r.json()),
        fetch(`${BACKEND}/api/logs`, { headers: h }).then((r) => r.json()),
      ]);
      setStats(s.error ? null : s);
      setCalls((c.calls || []).slice(0, 8));
      setLogs((l.logs || []).slice(0, 14));
    };
    load();
    const tmr = setInterval(load, 5000);
    return () => clearInterval(tmr);
  }, []);

  const s = stats;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={t("sCalls")} value={s?.totalToday ?? 0} icon={PhoneCall} tone="brand" hint={t("hCalls")} />
        <StatCard label={t("sActive")} value={s?.activeNow ?? 0} icon={Activity} tone="info" hint={t("hLive")} live />
        <StatCard label={t("sAnswered")} value={s?.answered ?? 0} icon={PhoneIncoming} tone="success" hint={t("hOk")} />
        <StatCard label={t("sMissed")} value={s?.missed ?? 0} icon={PhoneMissed} tone="danger" hint={t("hMiss")} />
        <StatCard label={t("sCb")} value={s?.callbacksPending ?? 0} icon={PhoneForwarded} tone="warning" hint={t("hPlan")} />
        <StatCard label={t("sConv")} value={s?.conversions ?? 0} icon={Trophy} tone="violet" hint={t("hDone")} />
        <StatCard label={t("sRate")} value={s?.conversionRate ?? 0} suffix="%" decimals={1} icon={Percent} tone="success" hint={t("hPct")} />
        <StatCard label={t("sDur")} value={s ? Math.round(s.avgDurationSec) : 0} suffix="s" icon={Timer} tone="brand" hint={t("hAvg")} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {s && <HourlyChart data={s.hourly} />}
        </div>

        <div className="card flex flex-col p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text">{t("activity")}</h3>
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-blink" />
              {t("live")}
            </span>
          </div>
          <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto">
            {logs.map((l) => (
              <div key={l.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-surface2">
                <LevelBadge level={l.level} />
                <div className="min-w-0">
                  <p className="truncate text-text">{l.message}</p>
                  <p className="text-[10px] text-muted">{fmtClock(l.ts)} · {l.source}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text">{t("recent")}</h3>
          <a href="/calls" className="text-xs font-medium text-brand hover:underline">
            {t("showAll")} →
          </a>
        </div>
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[580px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-medium uppercase tracking-wide text-muted">
                <th className="pb-2.5 pr-4">{t("contact")}</th>
                <th className="pb-2.5 pr-4">{t("number")}</th>
                <th className="pb-2.5 pr-4">{t("time")}</th>
                <th className="pb-2.5 pr-4">{t("duration")}</th>
                <th className="pb-2.5">{t("outcome")}</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((c) => (
                <tr key={c.id} className="border-b border-border/60 last:border-0 hover:bg-surface2/60">
                  <td className="py-2.5 pr-4 font-medium text-text">{c.contactName}</td>
                  <td className="py-2.5 pr-4 font-mono text-xs text-subtle">{c.phoneNumber}</td>
                  <td className="py-2.5 pr-4 text-subtle">{fmtClock(c.startedAt)}</td>
                  <td className="num py-2.5 pr-4 text-xs text-subtle">{fmtDuration(c.durationSec)}</td>
                  <td className="py-2.5"><OutcomeBadge outcome={c.outcome} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
