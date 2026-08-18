/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0F2A4A",
        inksoft: "#5E7595",
        paper: "#EEF4FC",
        card: "#FFFFFF",
        border: "#E2E9F5",
        red: "#DA4B4B",
        green: "#18A566",
        gold: "#E08E2D",
        blue: "#2F7DE0",
        bluedeep: "#0F3E8C",
      },
      fontFamily: {
        serif: ["Georgia", "Times New Roman", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
