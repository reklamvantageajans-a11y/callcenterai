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
  Circle,
  Settings,
  Users,
} from "lucide-react";
import { useI18n, type I18nKey } from "@/lib/i18n";

export function useNav() {
  const { t } = useI18n();
  return [
    { href: "/", label: t("dash"), icon: LayoutDashboard, key: "dash" as I18nKey },
    { href: "/contacts", label: t("nums"), icon: Users, key: "nums" as I18nKey },
    { href: "/campaigns", label: t("camp"), icon: PhoneOutgoing, key: "camp" as I18nKey },
    { href: "/calls", label: t("calls"), icon: PhoneCall, key: "calls" as I18nKey },
    { href: "/callbacks", label: t("cb"), icon: PhoneForwarded, key: "cb" as I18nKey },
    { href: "/recordings", label: t("recs"), icon: Mic, key: "recs" as I18nKey },
    { href: "/drive", label: t("drive"), icon: HardDrive, key: "drive" as I18nKey },
    { href: "/voice", label: t("voice"), icon: Headset, key: "voice" as I18nKey },
    { href: "/logs", label: t("logs"), icon: ScrollText, key: "logs" as I18nKey },
    { href: "/settings", label: t("pref"), icon: Settings, key: "pref" as I18nKey },
  ];
}

export function Sidebar() {
  const path = usePathname();
  const { t } = useI18n();
  const nav = useNav();
  return (
    <aside
      className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col md:flex"
      style={{ background: "#1e293b" }}
    >
      <div className="flex items-center gap-3 px-5 py-6">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ background: "#4f46e5" }}
        >
          <Headset className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="text-sm font-semibold text-white">{t("brand")}</div>
          <div className="text-[11px]" style={{ color: "#64748b" }}>
            {t("brandSub")}
          </div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-auto px-3">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
              style={{
                color: active ? "#f8fafc" : "#94a3b8",
                background: active ? "#334155" : "transparent",
              }}
            >
              <Icon className="h-[17px] w-[17px] shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div
        className="mx-3 mb-5 rounded-lg px-3 py-3 text-[12px]"
        style={{ background: "#263347" }}
      >
        <div className="mb-1 flex items-center gap-2" style={{ color: "#4ade80" }}>
          <Circle className="h-2 w-2 fill-current animate-blink" />
          <span className="font-medium">{t("online")}</span>
        </div>
        <span style={{ color: "#64748b" }}>{t("agent")}: </span>
        <span style={{ color: "#cbd5e1" }} className="font-medium">
          Kalmaz
        </span>
      </div>
    </aside>
  );
}
