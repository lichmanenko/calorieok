/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        bg2: 'var(--bg2)',
        glass: 'var(--glass)',
        tx: 'var(--tx)',
        mut: 'var(--mut)',
        acc: 'var(--acc)',
        acc2: 'var(--acc2)',
        veil: 'var(--veil)',
        ok: 'var(--ok)',
        warn: 'var(--warn)',
      },
      borderRadius: {
        sheet: '24px',
      },
    },
  },
  plugins: [],
};
