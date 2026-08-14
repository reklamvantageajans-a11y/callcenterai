"use client";

import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";

type Tone = "brand" | "success" | "warning" | "danger" | "violet" | "info";

const CHIP: Record<Tone, { icon: string; num: string }> = {
  brand:   { icon: "bg-brandLight text-brand",   num: "text-text" },
  success: { icon: "bg-successLight text-success", num: "text-text" },
  warning: { icon: "bg-warningLight text-warning", num: "text-text" },
  danger:  { icon: "bg-dangerLight text-danger",   num: "text-text" },
  violet:  { icon: "bg-violetLight text-violet",   num: "text-text" },
  info:    { icon: "bg-infoLight text-info",       num: "text-text" },
};

function useCountUp(target: number, duration = 600) {
  const [val, setVal] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else prev.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

export function StatCard({
  label,
  value,
  suffix = "",
  decimals = 0,
  icon: Icon,
  tone = "brand",
  hint,
  live = false,
}: {
  label: string;
  value: number;
  suffix?: string;
  decimals?: number;
  icon: LucideIcon;
  tone?: Tone;
  hint?: string;
  live?: boolean;
}) {
  const animated = useCountUp(value);
  const c = CHIP[tone];
  return (
    <div className="card animate-slideUp p-5 transition-shadow hover:shadow-cardHover">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[13px] font-medium text-subtle">{label}</p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${c.icon}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`num text-3xl font-bold ${c.num}`}>
          {animated.toFixed(decimals)}
        </span>
        {suffix && <span className="text-base font-medium text-muted">{suffix}</span>}
      </div>
      {hint && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
          {live && <span className="h-1.5 w-1.5 rounded-full bg-success animate-blink" />}
          {hint}
        </div>
      )}
    </div>
  );
}
