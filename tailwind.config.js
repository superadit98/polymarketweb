/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './lib/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        polymarket: {
          blue: '#2C5FF6',
          blueDark: '#1A3EB0',
          sky: '#F5F8FF',
        },
      },
    },
  },
  plugins: [],
};
