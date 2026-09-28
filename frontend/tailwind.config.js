/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        // Chart chrome and ink, from CSS variables so light and dark each get their own steps.
        surface: "var(--surface)",
        page: "var(--page)",
        ink: { DEFAULT: "var(--ink)", 2: "var(--ink-2)", muted: "var(--ink-muted)" },
        line: "var(--line)",
        hover: "var(--hover)",
        sel: "var(--sel)",
        accent: "var(--accent)",
      },
      fontFamily: { sans: ["system-ui", "-apple-system", '"Segoe UI"', "sans-serif"] },
    },
  },
  plugins: [],
};
