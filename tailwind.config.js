/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        primary: "#002366",
        secondary: "#C5A059",
        background: "#F5F5F0",
      },
    },
  },
  plugins: [],
}

