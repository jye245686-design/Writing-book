/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // 扁平简约：主色与中性色
        primary: { DEFAULT: '#2563eb', hover: '#1d4ed8' },
        surface: '#fafafa',
        border: '#e5e7eb',
        mute: '#6b7280',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      // 扁平：几乎无阴影，仅必要时极浅
      boxShadow: {
        flat: '0 1px 0 0 rgba(0,0,0,0.04)',
      },
    },
  },
  plugins: [],
}
