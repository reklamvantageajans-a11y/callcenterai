"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { NAV } from "./Sidebar";

const TITLES: Record<string, string> = {
  "/": "Übersicht",
  "/calls": "Anrufprotokoll",
  "/callbacks": "Geplante Rückrufe",
  "/recordings": "Gesprächsaufnahmen",
  "/logs": "System-Logs",
};

export function Topbar() {
  const path = usePathname();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const title = TITLES[path] ?? "Kontrollpanel";

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface">
      <div className="flex items-center justify-between px-5 py-3.5">
        <div>
          <h1 className="text-base font-semibold text-text">{title}</h1>
          <p className="text-xs text-muted">
            {now
              ? now.toLocaleDateString("de-DE", {
                  weekday: "long",
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })
              : "\u00a0"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="password"
            placeholder="CALL_SECRET"
            defaultValue=""
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v) localStorage.setItem("call_secret", v);
            }}
            className="hidden w-36 rounded-lg border border-border bg-surface2 px-2.5 py-1.5 text-xs text-text outline-none sm:block"
          />
          <span className="hidden items-center gap-1.5 rounded-full border border-success/30 bg-successLight px-3 py-1 text-xs font-medium text-success sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-blink" />
            Live
          </span>
          <div className="num rounded-lg border border-border bg-surface2 px-3 py-1.5 text-sm font-semibold text-text">
            {now
              ? now.toLocaleTimeString("de-DE", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })
              : "--:--:--"}
          </div>
        </div>
      </div>

      {/* Mobile nav */}
      <nav className="scrollbar-thin flex gap-1 overflow-x-auto border-t border-border bg-surface px-3 py-2 md:hidden">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? "bg-brandLight text-brand"
                  : "text-subtle hover:bg-surface2"
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
