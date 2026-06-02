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
        canvas: '#0a0c12',
        panel: '#0f121a',
        card: '#141823',
        raised: '#1b2030',
        hairline: '#232a3a',
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
