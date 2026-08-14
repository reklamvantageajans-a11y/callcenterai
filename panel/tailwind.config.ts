import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // App shell
        bg: "#f1f5f9",          // slate-100 — page background
        surface: "#ffffff",      // card / panel background
        surface2: "#f8fafc",     // subtle input / hover background
        border: "#e2e8f0",       // slate-200
        muted: "#94a3b8",        // slate-400
        subtle: "#64748b",       // slate-500 (secondary text)
        text: "#0f172a",         // slate-950 — primary text
        // Sidebar
        side: "#1e293b",         // slate-800
        sideActive: "#334155",   // slate-700
        sideText: "#cbd5e1",     // slate-300
        sideTextActive: "#f8fafc",
        // Brand
        brand: "#4f46e5",        // indigo-600
        brandLight: "#eef2ff",   // indigo-50
        brandDark: "#3730a3",    // indigo-800
        // Semantic
        success: "#16a34a",      // green-600
        successLight: "#dcfce7", // green-100
        warning: "#d97706",      // amber-600
        warningLight: "#fef3c7", // amber-100
        danger: "#dc2626",       // red-600
        dangerLight: "#fee2e2",  // red-100
        info: "#2563eb",         // blue-600
        infoLight: "#dbeafe",    // blue-100
        violet: "#7c3aed",       // violet-600
        violetLight: "#ede9fe",  // violet-100
        // legacy aliases (keeps existing page markup working)
        neon: "#16a34a",
        neonBlue: "#4f46e5",
        neonAmber: "#d97706",
        neonRed: "#dc2626",
        neonPurple: "#7c3aed",
      },
      boxShadow: {
        card: "0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)",
        cardHover: "0 4px 16px rgba(15,23,42,0.1)",
        neon: "0 1px 3px rgba(15,23,42,0.06)",
      },
      keyframes: {
        pulseSoft: {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.45" },
        },
        fadeUp: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        pulseGlow: "pulseSoft 2.2s ease-in-out infinite",
        blink: "pulseSoft 1.6s ease-in-out infinite",
        slideUp: "fadeUp 0.3s ease",
      },
    },
  },
  plugins: [],
};

export default config;
