/** @type {import('tailwindcss').Config} */
// Tailwind 3 (invece del 4) perché funziona anche su iPhone con iOS 14-16
// e su Android di qualche anno fa: molti clienti di una piscina non hanno il telefono nuovo.
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        abisso: "#0b2e45",
        vasca: "#12557a",
        acqua: "#0e9bb0",
        riflesso: "#7fd6e3",
        schiuma: "#eef6f9",
        corsia: "#f2b84b",
      },
      fontFamily: {
        sans: ["var(--font-figtree)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
