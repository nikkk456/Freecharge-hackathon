import animate from "tailwindcss-animate";
import type { Config } from "tailwindcss";

/** Every token is a bare HSL triplet, so `<alpha-value>` lets any colour take an
 *  opacity modifier (`bg-primary/90`, `border-status-critical/30`). */
const hsl = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

export default {
  // Dark mode is an explicit class on <html>, not a media query: a reviewer's
  // choice must survive regardless of what their OS is set to.
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: hsl("border"),
        input: hsl("input"),
        ring: hsl("ring"),
        background: hsl("background"),
        foreground: hsl("foreground"),
        primary: { DEFAULT: hsl("primary"), foreground: hsl("primary-foreground") },
        secondary: { DEFAULT: hsl("secondary"), foreground: hsl("secondary-foreground") },
        destructive: { DEFAULT: hsl("destructive"), foreground: hsl("destructive-foreground") },
        muted: { DEFAULT: hsl("muted"), foreground: hsl("muted-foreground") },
        accent: { DEFAULT: hsl("accent"), foreground: hsl("accent-foreground") },
        popover: { DEFAULT: hsl("popover"), foreground: hsl("popover-foreground") },
        card: { DEFAULT: hsl("card"), foreground: hsl("card-foreground") },

        // Axis brand. Identity and action — never used to express health.
        brand: {
          DEFAULT: hsl("brand"),
          bright: hsl("brand-bright"),
          teal: hsl("brand-teal"),
          "teal-deep": hsl("brand-teal-deep"),
          line: hsl("brand-line"),
          soft: hsl("brand-soft"),
          "teal-soft": hsl("brand-teal-soft"),
          surface: hsl("brand-surface"),
          "surface-strong": hsl("brand-surface-strong"),
          "teal-surface": hsl("teal-surface"),
        },

        // The reserved status palette — state, never chrome. Kept a SEPARATE scale
        // from the surface and brand tokens above.
        status: {
          good: hsl("status-good-hsl"),
          warning: hsl("status-warning-hsl"),
          serious: hsl("status-serious-hsl"),
          critical: hsl("status-critical-hsl"),
          "good-surface": hsl("status-good-surface"),
          "warning-surface": hsl("status-warning-surface"),
          "serious-surface": hsl("status-serious-surface"),
          "critical-surface": hsl("status-critical-surface"),
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: [
          "Inter var",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.01em" }],
        xs: ["0.75rem", { lineHeight: "1.125rem" }],
        sm: ["0.8125rem", { lineHeight: "1.25rem" }],
        base: ["0.875rem", { lineHeight: "1.4375rem" }],
        lg: ["1rem", { lineHeight: "1.5rem" }],
        xl: ["1.125rem", { lineHeight: "1.625rem", letterSpacing: "-0.01em" }],
        "2xl": ["1.375rem", { lineHeight: "1.8125rem", letterSpacing: "-0.015em" }],
        "3xl": ["1.75rem", { lineHeight: "2.125rem", letterSpacing: "-0.02em" }],
        "4xl": ["2.25rem", { lineHeight: "2.5rem", letterSpacing: "-0.025em" }],
      },
      boxShadow: {
        // A brand-tinted elevation rather than neutral black, so cards sit on the
        // Axis ground instead of looking pasted onto it.
        sm: "0 1px 2px 0 hsl(334 30% 20% / 0.06)",
        DEFAULT: "0 1px 3px 0 hsl(334 30% 20% / 0.08), 0 1px 2px -1px hsl(334 30% 20% / 0.06)",
        md: "0 4px 12px -2px hsl(334 30% 20% / 0.10), 0 2px 6px -2px hsl(334 30% 20% / 0.06)",
        lg: "0 12px 32px -8px hsl(334 35% 20% / 0.18), 0 4px 12px -4px hsl(334 30% 20% / 0.10)",
      },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "flash-cite": {
          "0%": { boxShadow: "0 0 0 0 hsl(var(--brand-line) / 0.55)" },
          "100%": { boxShadow: "0 0 0 12px hsl(var(--brand-line) / 0)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.8s infinite",
        "fade-up": "fade-up 0.22s ease-out both",
        "flash-cite": "flash-cite 0.9s ease-out",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
