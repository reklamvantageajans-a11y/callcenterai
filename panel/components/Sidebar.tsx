"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PhoneCall,
  PhoneForwarded,
  PhoneOutgoing,
  Mic,
  ScrollText,
  Headset,
  HardDrive,
  Settings,
  Users,
  Beaker,
} from "lucide-react";
import { useI18n, type I18nKey } from "@/lib/i18n";
import type { LucideIcon } from "lucide-react";

type NavItem = { href: string; label: string; icon: LucideIcon; key: I18nKey };

export function useNav(): NavItem[] {
  const { t } = useI18n();
  return [
    { href: "/", label: t("dash"), icon: LayoutDashboard, key: "dash" },
    { href: "/contacts", label: t("nums"), icon: Users, key: "nums" },
    { href: "/campaigns", label: t("camp"), icon: PhoneOutgoing, key: "camp" },
    { href: "/calls", label: t("calls"), icon: PhoneCall, key: "calls" },
    { href: "/callbacks", label: t("cb"), icon: PhoneForwarded, key: "cb" },
    { href: "/recordings", label: t("recs"), icon: Mic, key: "recs" },
    { href: "/voice", label: t("voice"), icon: Headset, key: "voice" },
    { href: "/test", label: t("lab"), icon: Beaker, key: "lab" },
    { href: "/drive", label: t("drive"), icon: HardDrive, key: "drive" },
    { href: "/logs", label: t("logs"), icon: ScrollText, key: "logs" },
    { href: "/settings", label: t("pref"), icon: Settings, key: "pref" },
  ];
}

export function Sidebar() {
  const path = usePathname();
  const { t } = useI18n();
  const nav = useNav();
  const groups: { label: I18nKey; hrefs: string[] }[] = [
    { label: "gOps", hrefs: ["/", "/contacts", "/campaigns", "/calls", "/callbacks"] },
    { label: "gLib", hrefs: ["/recordings", "/voice", "/test", "/drive"] },
    { label: "gSys", hrefs: ["/logs", "/settings"] },
  ];

  return (
    <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-white/[0.06] md:flex" style={{ background: "#0b1020" }}>
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-[18px] py-5">
        <div
          className="grid h-8 w-8 place-items-center rounded-[9px] text-[13px] font-bold tracking-tight text-white"
          style={{ background: "linear-gradient(145deg,#6366f1,#4338ca)", boxShadow: "0 10px 22px rgba(79,70,229,.28)" }}
        >
          K
        </div>
        <div>
          <div className="text-[14px] font-semibold tracking-tight text-white">{t("brand")}</div>
          <div className="text-[11px] font-medium" style={{ color: "#64748b" }}>
            {t("brandSub")}
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-auto px-2.5 py-2">
        {groups.map((g) => (
          <div key={g.label} className="mb-2.5">
            <div className="px-2.5 pb-1.5 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#4b5568" }}>
              {t(g.label)}
            </div>
            {nav
              .filter((n) => g.hrefs.includes(n.href))
              .map(({ href, label, icon: Icon }) => {
                const active = href === "/" ? path === "/" : path.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className="mb-px flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors"
                    style={{
                      color: active ? "#ffffff" : "#8b95a8",
                      background: active ? "rgba(255,255,255,0.07)" : "transparent",
                      boxShadow: active ? "inset 2px 0 0 #818cf8" : "none",
                    }}
                  >
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                    {label}
                  </Link>
                );
              })}
          </div>
        ))}
      </nav>

      <div className="mx-3 mb-4 flex items-center gap-2.5 rounded-xl border border-white/[0.06] px-3 py-2.5" style={{ background: "rgba(255,255,255,0.04)" }}>
        <div className="grid h-[30px] w-[30px] place-items-center rounded-full text-[11px] font-semibold" style={{ background: "#1a2236", color: "#e2e8f0" }}>
          K
        </div>
        <div>
          <div className="text-[12.5px] font-semibold" style={{ color: "#e5e7eb" }}>
            Kalmaz
          </div>
          <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "#64748b" }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#34d399" }} />
            {t("online")}
          </div>
        </div>
      </div>
    </aside>
  );
}
