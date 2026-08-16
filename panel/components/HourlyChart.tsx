"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Stats } from "@/lib/types";
import { useI18n } from "@/lib/i18n";

export function HourlyChart({ data }: { data: Stats["hourly"] }) {
  const { t } = useI18n();
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text">{t("hourly")}</h3>
        <div className="flex items-center gap-4 text-xs text-subtle">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#4f46e5" }} />
            {t("sCalls")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#16a34a" }} />
            {t("conversions")}
          </span>
        </div>
      </div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gCalls" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#4f46e5" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gConv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#16a34a" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="hour" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={32} />
            <Tooltip
              contentStyle={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: 10,
                fontSize: 12,
                boxShadow: "0 4px 16px rgba(15,23,42,0.08)",
              }}
              labelStyle={{ color: "#0f172a", fontWeight: 600, marginBottom: 4 }}
            />
            <Area type="monotone" dataKey="calls" stroke="#4f46e5" strokeWidth={2} fill="url(#gCalls)" name={t("sCalls")} dot={false} />
            <Area type="monotone" dataKey="conversions" stroke="#16a34a" strokeWidth={2} fill="url(#gConv)" name={t("conversions")} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
