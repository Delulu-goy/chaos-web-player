/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Interlinea: 1.25 su tutta la scala tipografica.
      // Di default Tailwind porta 1.5 (1.625 per leading-relaxed) e il
      // ritmo del testo risulta piu largo del design di riferimento
      // (vedi screenshots/): il blocco di 3 righe di una riga brano deve
      // stare dentro il quadrato della cover, non superarlo.
      fontSize: {
        xs: ["0.75rem", { lineHeight: "0.9375rem" }],
        sm: ["0.875rem", { lineHeight: "1.09375rem" }],
        base: ["1rem", { lineHeight: "1.25rem" }],
        lg: ["1.125rem", { lineHeight: "1.40625rem" }],
        xl: ["1.25rem", { lineHeight: "1.5625rem" }],
        "2xl": ["1.5rem", { lineHeight: "1.875rem" }],
        "3xl": ["1.875rem", { lineHeight: "2.34375rem" }],
        "4xl": ["2.25rem", { lineHeight: "2.8125rem" }],
      },
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
          trackActive: "#191b1c",
          border: "rgba(255, 255, 255, 0.10)",
          muted: "rgba(255, 255, 255, 0.40)",
        },
      },
    },
  },
  plugins: [],
};