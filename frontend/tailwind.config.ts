import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "2rem", screens: { "2xl": "1400px" } },
    extend: {
      colors: {
        brand: {
          50:  "#eef6fb", 100: "#d8eaf4", 200: "#b3d4e8", 300: "#85b9d8",
          400: "#5b9ac6", 500: "#3a7fb3", 600: "#2a6695", 700: "#1f4e74",
          800: "#163a57", 900: "#0e2a40", 950: "#071829",
        },
        border: "hsl(214 32% 91%)",
        input: "hsl(214 32% 91%)",
        ring: "hsl(210 70% 45%)",
        background: "hsl(0 0% 100%)",
        foreground: "hsl(222 47% 11%)",
        primary: { DEFAULT: "hsl(210 70% 45%)", foreground: "hsl(0 0% 100%)" },
        secondary: { DEFAULT: "hsl(214 32% 95%)", foreground: "hsl(222 47% 11%)" },
        destructive: { DEFAULT: "hsl(0 72% 51%)", foreground: "hsl(0 0% 100%)" },
        muted: { DEFAULT: "hsl(214 32% 95%)", foreground: "hsl(215 16% 47%)" },
        accent: { DEFAULT: "hsl(210 80% 96%)", foreground: "hsl(222 47% 11%)" },
        popover: { DEFAULT: "hsl(0 0% 100%)", foreground: "hsl(222 47% 11%)" },
        card: { DEFAULT: "hsl(0 0% 100%)", foreground: "hsl(222 47% 11%)" },
      },
      borderRadius: {
        lg: "0.75rem", md: "calc(0.75rem - 2px)", sm: "calc(0.75rem - 4px)",
      },
      boxShadow: {
        soft: "0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.04)",
        card: "0 1px 3px 0 rgb(15 35 60 / 0.06), 0 1px 2px -1px rgb(15 35 60 / 0.05)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
