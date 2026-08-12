/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        panel: '#0f172a',
        surface: '#1e293b',
        accent: '#38bdf8',
      },
    },
  },
  plugins: [],
}
