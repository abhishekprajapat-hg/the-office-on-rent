/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['selector', 'html.theme-dark'],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        void: "#f6f8fb",
        crm: {
          bg: "#f6f8fb",
          surface: "#ffffff",
          muted: "#f1f5f9",
          border: "#e2e8f0",
          ink: "#0f172a",
          subtle: "#64748b",
          accent: "#2563eb",
        },

        text: {
          primary: "#0f172a",
          secondary: "#475569",
          tertiary: "#94a3b8"
        },

        gem: {
          cyan: "#38bdf8", cyanDark: "#0284c7",
          gold: "#f59e0b", goldDark: "#b45309",
          pink: "#f472b6", pinkDark: "#be185d",
          violet: "#8b5cf6", violetDark: "#6d28d9",
          emerald: "#10b981", emeraldDark: "#047857",
          sun: "#2563eb",
        }
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'Arial', 'sans-serif'],
        display: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'Arial', 'sans-serif'],
        mono: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'Arial', 'sans-serif'],
      },
      animation: {
        'spin-slow': 'spin 120s linear infinite',
      },
      boxShadow: {
        clay: 'inset 1px 1px 2px rgba(148, 163, 184, 0.18), inset -1px -1px 2px rgba(255, 255, 255, 0.72)',
        'clay-sm': 'inset 1px 1px 2px rgba(148, 163, 184, 0.16), inset -1px -1px 2px rgba(255, 255, 255, 0.68)',
        'clay-inset': 'inset 1px 1px 2px rgba(148, 163, 184, 0.18), inset -1px -1px 2px rgba(255, 255, 255, 0.72)',
        'glass-light': '0 18px 48px -36px rgba(37, 99, 235, 0.65)',
        'glass-light-hover': '0 22px 56px -34px rgba(37, 99, 235, 0.72)',
        'flat-card': '0 1px 2px rgba(15, 23, 42, 0.06), 0 10px 30px -24px rgba(15, 23, 42, 0.3)',
        'crm-soft': '0 1px 2px rgba(15, 23, 42, 0.06), 0 10px 24px -22px rgba(15, 23, 42, 0.32)',
        'crm-card': '0 1px 2px rgba(15, 23, 42, 0.06), 0 16px 34px -30px rgba(15, 23, 42, 0.32)',
        'crm-panel': '0 18px 48px -34px rgba(15, 23, 42, 0.42)',
      }
    },
  },
  safelist: [
    // Ensure these are safe for dynamic use
    'text-gem-cyan', 'text-gem-gold', 'text-gem-pink', 'text-gem-violet', 'text-gem-emerald',
    'bg-gem-cyan/10', 'bg-gem-gold/10', 'bg-gem-pink/10', 'bg-gem-violet/10', 'bg-gem-emerald/10',
    'border-gem-cyan/30', 'border-gem-gold/30', 'border-gem-pink/30', 'border-gem-violet/30', 'border-gem-emerald/30',
  ],
  plugins: [],
}
