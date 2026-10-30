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
          100: '#dbe9ff',
          200: '#bcd7ff',
          300: '#8dbcff',
          400: '#5b98ff',
          500: '#2f6bff',
          600: '#1d54eb',
          700: '#1743c2',
          800: '#173a98',
          900: '#183572',
          950: '#0e1f45',
        },
        ink: {
          50: '#f5f8fd',
          100: '#eaf0f9',
          200: '#d7e1f0',
          300: '#b4c4dc',
          400: '#8497b5',
          500: '#617492',
          600: '#485b78',
          700: '#354865',
          800: '#223553',
          900: '#122440',
          950: '#0a1830',
        },
        night: {
          950: '#050d20',
          900: '#08142e',
          850: '#0b1938',
          800: '#0f2046',
          700: '#152b5c',
          600: '#1c376f',
        },
        navy: {
          50: '#f2f6fd',
          100: '#e4edfa',
          200: '#ccdcf5',
          700: '#2a4472',
          800: '#1d3358',
          900: '#122544',
          950: '#091831',
        },
        aqua: {
          50: '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
        },
        canvas: '#f5f8ff',
        line: 'rgba(20, 47, 94, 0.09)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        subtle: '0 1px 2px rgba(16, 38, 84, 0.04), 0 8px 24px -20px rgba(16, 38, 84, 0.22)',
        card: '0 1px 2px rgba(16, 38, 84, 0.04), 0 16px 40px -28px rgba(16, 38, 84, 0.28)',
        elevated: '0 2px 6px rgba(16, 38, 84, 0.05), 0 30px 70px -32px rgba(16, 38, 84, 0.34)',
        panel: '0 1px 2px rgba(16, 38, 84, 0.04), 0 22px 50px -34px rgba(16, 38, 84, 0.3)',
        'glow-brand': '0 0 0 1px rgba(47, 107, 255, 0.16), 0 16px 36px -16px rgba(47, 107, 255, 0.5)',
        'glow-violet': '0 0 0 1px rgba(124, 92, 255, 0.16), 0 16px 36px -18px rgba(124, 92, 255, 0.45)',
        'inner-soft': 'inset 0 1px 0 rgba(255, 255, 255, 0.8)',
      },
      backdropBlur: {
        xs: '2px',
      },
      backgroundImage: {
        'hero-mesh':
          'radial-gradient(1000px 520px at 8% -10%, rgba(47, 107, 255, 0.12), transparent 62%), radial-gradient(760px 480px at 92% 0%, rgba(34, 211, 238, 0.12), transparent 58%), radial-gradient(680px 460px at 60% 110%, rgba(124, 92, 255, 0.1), transparent 62%)',
        'brand-gradient': 'linear-gradient(96deg, #2f6bff 0%, #4f7dff 45%, #7c5cff 100%)',
        'aqua-gradient': 'linear-gradient(96deg, #2f6bff 0%, #22d3ee 100%)',
      },
      keyframes: {
        'float-slow': {
          '0%, 100%': { transform: 'translate3d(0, 0, 0)' },
          '50%': { transform: 'translate3d(0, -14px, 0)' },
        },
        drift: {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)' },
          '50%': { transform: 'translate3d(18px, -22px, 0) scale(1.06)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.92)', opacity: '0.55' },
          '70%': { transform: 'scale(1.28)', opacity: '0' },
          '100%': { transform: 'scale(1.28)', opacity: '0' },
        },
        waveform: {
          '0%, 100%': { transform: 'scaleY(0.35)' },
          '50%': { transform: 'scaleY(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'float-slow': 'float-slow 9s ease-in-out infinite',
        drift: 'drift 16s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 2.2s cubic-bezier(0.22, 1, 0.36, 1) infinite',
        waveform: 'waveform 900ms ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
