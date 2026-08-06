/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#182849",
        inksoft: "#3C4A6B",
        paper: "#F6F1E4",
        card: "#FFFDF7",
        border: "#DCD3B8",
        red: "#A5322A",
        green: "#2F6B4F",
        gold: "#8A6A22",
      },
      fontFamily: {
        serif: ["Georgia", "Times New Roman", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
