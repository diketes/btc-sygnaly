/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        tlo: {
          0: '#000000',
          1: '#0A0B0F',
          2: '#12141C',
          3: '#1B1E2A',
        },
        zielen: '#00E28A',
        czerwien: '#FF3B5C',
        fiolet: '#7C5CFF',
        zloto: '#F7931A',
        mglisty: 'rgba(255,255,255,0.08)',
      },
      fontFamily: {
        cyfry: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        naglowek: ['"Space Grotesk"', 'system-ui', '-apple-system', 'sans-serif'],
        tekst: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        zielony: '0 0 32px -8px rgba(0,226,138,0.45)',
        czerwony: '0 0 32px -8px rgba(255,59,92,0.45)',
        fioletowy: '0 0 32px -8px rgba(124,92,255,0.45)',
        zloty: '0 0 32px -8px rgba(247,147,26,0.45)',
        karta: '0 8px 32px -12px rgba(0,0,0,0.9)',
      },
      backdropBlur: { szklo: '18px' },
      animation: {
        puls: 'puls 2.4s cubic-bezier(0.4,0,0.6,1) infinite',
        wjazd: 'wjazd 0.45s cubic-bezier(0.16,1,0.3,1) both',
        obrot: 'obrot 1s linear infinite',
      },
      keyframes: {
        puls: {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
        wjazd: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        obrot: { to: { transform: 'rotate(360deg)' } },
      },
    },
  },
  plugins: [],
}
