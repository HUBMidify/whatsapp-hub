/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
      DEFAULT: "oklch(var(--primary) / <alpha-value>)",
      foreground: "oklch(var(--primary-foreground) / <alpha-value>)",
    },
    secondary: {
      DEFAULT: "oklch(var(--secondary) / <alpha-value>)",
      foreground: "oklch(var(--secondary-foreground) / <alpha-value>)",
    },
    accent: {
      DEFAULT: "oklch(var(--accent) / <alpha-value>)",
      foreground: "oklch(var(--accent-foreground) / <alpha-value>)",
    },
    background: "oklch(var(--background) / <alpha-value>)",
    foreground: "oklch(var(--foreground) / <alpha-value>)",
    card: {
      DEFAULT: "oklch(var(--card) / <alpha-value>)",
      foreground: "oklch(var(--card-foreground) / <alpha-value>)",
    },
    muted: {
      DEFAULT: "oklch(var(--muted) / <alpha-value>)",
      foreground: "oklch(var(--muted-foreground) / <alpha-value>)",
    },
    border: "oklch(var(--border) / <alpha-value>)",
    input: "oklch(var(--input) / <alpha-value>)",
    ring: "oklch(var(--ring) / <alpha-value>)",
    destructive: {
      DEFAULT: "oklch(var(--destructive) / <alpha-value>)",
      foreground: "oklch(var(--destructive-foreground) / <alpha-value>)",
    },
    sidebar: {
      DEFAULT: "oklch(var(--sidebar) / <alpha-value>)",
      foreground: "oklch(var(--sidebar-foreground) / <alpha-value>)",
      border: "oklch(var(--sidebar-border) / <alpha-value>)",
    },
        gray: {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          500: '#6b7280',
          700: '#374151',
          900: '#111827',
        }
      }
    },
  },
  plugins: [],
}