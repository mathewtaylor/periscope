import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{vue,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "#0c0d10",
        "bg-1": "#111317",
        "bg-2": "#171a1f",
        "bg-3": "#1e2229",
        line: "#23272f",
        "line-2": "#2b3039",
        fg: "#e5e8ee",
        "fg-1": "#b4b9c2",
        "fg-2": "#7b8290",
        "fg-3": "#525a66",
        "fg-4": "#363c46",
        run: "#7fb3f0",
        "run-dim": "#2a4366",
        sub: "#b59ce6",
        "sub-dim": "#3a3258",
        attn: "#e3b155",
        "attn-dim": "#58431d",
        err: "#e27a72",
        ok: "#86c49a",
      },
      fontFamily: {
        sans: [
          '"IBM Plex Sans"',
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          '"IBM Plex Mono"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      borderRadius: {
        tile: "10px",
        chip: "6px",
      },
      keyframes: {
        breathe: {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        breathe: "breathe 2200ms ease-in-out infinite",
        "slide-up": "slideUp 400ms ease-out both",
      },
    },
  },
  plugins: [],
} satisfies Config;
