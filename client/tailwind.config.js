/** Klippers design tokens — charcoal, brass gold & barber-pole accents. */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: { 950: '#0b0b0c', 900: '#111113', 850: '#16161a', 800: '#1c1c21', 700: '#26262d', 600: '#34343d', 500: '#4a4a55' },
        brass: { 50: '#fbf6ec', 100: '#f5e9cf', 200: '#ebd29f', 300: '#e0b96d', 400: '#d4a24c', 500: '#b5832c', 600: '#966a22', 700: '#74521b' },
        cream: '#f7f3ec',
        pole: { red: '#c0392b', blue: '#1f4e8c' },
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: { glow: '0 0 0 1px rgba(212,162,76,.25), 0 10px 40px -10px rgba(212,162,76,.35)' },
      keyframes: {
        pole: { '0%': { backgroundPosition: '0 0' }, '100%': { backgroundPosition: '0 56px' } },
      },
      animation: { pole: 'pole 1.4s linear infinite' },
    },
  },
  plugins: [],
};
