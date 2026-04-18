import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#ff6a00",
          light: "#ff8a33",
          dark: "#e65c00"
        },
        ink: "#e7eaf0",
        muted: "#9aa3b2",
        card: "#171a21",
        line: "#252a33",
        input: "#0b0d12"
      }
    }
  },
  plugins: []
};

export default config;
