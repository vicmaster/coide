/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/**/*.{ts,tsx,html}'
  ],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--canvas)',
        'surface-1': 'var(--surface-1)',
        'surface-2': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
        'surface-4': 'var(--surface-4)',
        'overlay-1': 'var(--overlay-1)',
        'overlay-2': 'var(--overlay-2)',
        'overlay-3': 'var(--overlay-3)',
        'overlay-4': 'var(--overlay-4)',
        fg: 'var(--fg)',
        'fg-strong': 'var(--fg-strong)',
        'fg-muted': 'var(--fg-muted)',
        'fg-subtle': 'var(--fg-subtle)',
        'fg-faint': 'var(--fg-faint)',
        'fg-ghost': 'var(--fg-ghost)',
        'line-soft': 'var(--line-soft)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)'
      }
    }
  },
  plugins: []
}
