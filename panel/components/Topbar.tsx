"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useNav } from "./Sidebar";
import { useI18n, type I18nKey } from "@/lib/i18n";
import { fmtTimeNow, fmtDateLong } from "@/lib/format";
import { setSecret } from "@/lib/backend";

const TITLES: Record<string, I18nKey> = {
  "/": "titleDash",
  "/contacts": "titleNums",
  "/campaigns": "titleCamp",
  "/calls": "titleCalls",
  "/callbacks": "titleCb",
  "/recordings": "titleRecs",
  "/drive": "titleDrive",
  "/voice": "titleVoice",
  "/logs": "titleLogs",
  "/settings": "titlePref",
};

export function Topbar() {
  const path = usePathname();
  const { t, tick, timezone } = useI18n();
  const nav = useNav();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
  }, [tick]);

  const title = t(TITLES[path] ?? "brandSub");

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-white/90 backdrop-blur">
      <div className="flex items-center justify-between px-6 py-3.5">
        <div>
          <h1 className="text-[16px] font-semibold tracking-tight text-text">{title}</h1>
          <p className="text-xs text-muted">{now ? fmtDateLong(now) : "\u00a0"}</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="password"
            placeholder={t("pin")}
            defaultValue=""
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v) setSecret(v);
            }}
            className="hidden w-[120px] rounded-lg border border-border bg-[#fafafa] px-2.5 py-1.5 text-xs text-text outline-none sm:block"
          />
          <div className="text-right">
            <div className="num text-[13px] font-semibold text-text">
              {now ? fmtTimeNow() : "--:--:--"}
            </div>
            <div className="text-[10px] text-muted">{timezone}</div>
          </div>
        </div>
      </div>

      <nav className="scrollbar-thin flex gap-1 overflow-x-auto border-t border-border bg-white px-3 py-2 md:hidden">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                active ? "bg-brandLight text-brand" : "text-subtle hover:bg-surface2"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
