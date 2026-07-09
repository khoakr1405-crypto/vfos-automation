import type { Config } from 'tailwindcss';

// VFOS Studio dark dashboard theme.
// Surfaces step from canvas (deepest) -> panel -> card -> raised.
// Accents map to the four module families seen in the UI reference:
// blue (intake/overview), violet (AI/creative), green (QA/publish-ok), amber (attention/manual).
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Deep navy theme (redesign concept 07/2026) — surfaces mang sắc xanh
        // navy rõ thay vì xám đen; hairline ngả xanh để viền card "sáng nhẹ".
        canvas: '#070b16',
        panel: '#0b1121',
        card: '#0d1526',
        raised: '#152036',
        hairline: '#1e2b4a',
        accent: {
          blue: '#3b82f6',
          violet: '#8b5cf6',
          green: '#22c55e',
          amber: '#f59e0b',
          rose: '#f43f5e',
          cyan: '#22d3ee',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
    },
  },
  plugins: [],
};

export default config;
