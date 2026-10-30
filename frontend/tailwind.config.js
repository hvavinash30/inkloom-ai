/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef5ff',
          100: '#d9e6ff',
          200: '#bcd4ff',
          300: '#8fb8ff',
          400: '#6b9bff',
          500: '#4388ff',
          600: '#2f6fe6',
          700: '#2457b8',
          800: '#1c448c',
          900: '#183a70',
          950: '#0d1f3f',
        },
        ink: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
        night: {
          950: '#050814',
          900: '#070b18',
          850: '#090f1f',
          800: '#0b1224',
          700: '#111b32',
          600: '#16213c',
        },
        navy: {
          50: '#f2f6fb',
          100: '#e4ecf5',
          700: '#162f52',
          800: '#10243f',
          900: '#0b1b33',
          950: '#071426',
        },
        canvas: '#070b18',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        subtle:
          'inset 0 1px 0 rgba(255,255,255,0.045), 0 10px 30px -22px rgba(2, 6, 23, 0.9)',
        card:
          'inset 0 1px 0 rgba(255,255,255,0.055), 0 20px 45px -30px rgba(2, 6, 23, 0.95)',
        elevated:
          'inset 0 1px 0 rgba(255,255,255,0.07), 0 32px 74px -32px rgba(2, 6, 23, 0.98)',
        panel:
          'inset 0 1px 0 rgba(255,255,255,0.06), 0 28px 64px -36px rgba(2, 6, 23, 0.95)',
        'glow-brand':
          '0 0 0 1px rgba(67,136,255,0.25), 0 12px 40px -12px rgba(67,136,255,0.45)',
        'glow-violet':
          '0 0 0 1px rgba(135,101,255,0.24), 0 12px 40px -14px rgba(135,101,255,0.42)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
