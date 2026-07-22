/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: { ink: "#101828", electric: "#2563eb", surface: "#f7f9fc" },
      boxShadow: { card: "0 10px 35px rgb(15 23 42 / 0.08)" }
    }
  },
  plugins: []
};
