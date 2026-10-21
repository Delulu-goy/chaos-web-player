/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: [
          '"Source Code Pro"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      colors: {
        accent: "#FF5A1F",
        chaos: {
          black: "#0d0d0d",
          surface: "#141516",
          border: "rgba(255, 255, 255, 0.10)",
          muted: "rgba(255, 255, 255, 0.40)",
        },
      },
    },
  },
  plugins: [],
};