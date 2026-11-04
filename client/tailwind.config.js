/**
 * Klippers design tokens — "royal" theme: deep plum/aubergine surfaces,
 * metallic royal gold accents, ivory light mode and jewel-tone highlights.
 * Token names (ink / brass / cream / pole) are kept so components need no changes.
 */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Royal plum darks (backgrounds, cards, text on light)
        ink: { 950: '#0e0814', 900: '#150c1f', 850: '#1b1028', 800: '#221433', 700: '#2e1b45', 600: '#3d2559', 500: '#5b4275' },
        // Royal gold accent (buttons, highlights)
        brass: { 50: '#fbf7ea', 100: '#f5ebc8', 200: '#ead690', 300: '#dfc15e', 400: '#d4af37', 500: '#b8952b', 600: '#977823', 700: '#735b1c' },
        // Amethyst — secondary royal accent
        royal: { 100: '#ece4f7', 200: '#d6c6ef', 300: '#b39ddb', 400: '#8e6cc9', 500: '#6a46b0', 600: '#55358f', 700: '#3f2670', 800: '#2d1a52' },
        cream: '#faf6ef', // ivory
        pole: { red: '#9b1b3b', blue: '#2f2a8a' }, // ruby & royal blue
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: { glow: '0 0 0 1px rgba(212,175,55,.28), 0 10px 40px -10px rgba(212,175,55,.38)' },
      keyframes: {
        pole: { '0%': { backgroundPosition: '0 0' }, '100%': { backgroundPosition: '0 56px' } },
      },
      animation: { pole: 'pole 1.4s linear infinite' },
    },
  },
  plugins: [],
};
