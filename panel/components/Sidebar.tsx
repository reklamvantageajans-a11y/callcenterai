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
} from "lucide-react";

export const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/campaigns", label: "Kampagnen", icon: PhoneOutgoing },
  { href: "/calls", label: "Anrufe", icon: PhoneCall },
  { href: "/callbacks", label: "Rückrufe", icon: PhoneForwarded },
  { href: "/recordings", label: "Aufnahmen", icon: Mic },
  { href: "/drive", label: "Drive", icon: HardDrive },
  { href: "/voice", label: "Stimme", icon: Headset },
  { href: "/logs", label: "Logs", icon: ScrollText },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside
      className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col md:flex"
      style={{ background: "#1e293b" }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ background: "#4f46e5" }}
        >
          <Headset className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="text-sm font-semibold text-white">Callcenter</div>
          <div className="text-[11px]" style={{ color: "#64748b" }}>
            Kontrollpanel
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {NAV.map(({ href, label, icon: Icon }) => {
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
              onMouseEnter={(e) => {
                if (!active)
                  (e.currentTarget as HTMLElement).style.background = "#263347";
              }}
              onMouseLeave={(e) => {
                if (!active)
                  (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              <Icon className="h-[17px] w-[17px] shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Status footer */}
      <div
        className="mx-3 mb-5 rounded-lg px-3 py-3 text-[12px]"
        style={{ background: "#263347" }}
      >
        <div className="mb-1 flex items-center gap-2" style={{ color: "#4ade80" }}>
          <Circle className="h-2 w-2 fill-current animate-blink" />
          <span className="font-medium">System online</span>
        </div>
        <span style={{ color: "#64748b" }}>Agent: </span>
        <span style={{ color: "#cbd5e1" }} className="font-medium">
          Kalmaz (KI)
        </span>
      </div>
    </aside>
  );
}
