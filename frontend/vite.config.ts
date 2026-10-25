import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss()],
  server: { proxy: { '/api': 'http://localhost:8000' } },
  build: {
    // Never inline fonts as data: URIs. The CSP allows fonts from our own origin only (font-src 'self'),
    // so an inlined font would be blocked. Other small assets keep Vite's default behaviour.
    assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
  },
})
