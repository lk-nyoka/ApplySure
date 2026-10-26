import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

const routerBuild = (file: string) => fileURLToPath(new URL(`./node_modules/react-router/dist/production/${file}`, import.meta.url))

export default defineConfig(({ command }) => ({
  plugins: [tailwindcss()],
  server: { proxy: { '/api': 'http://localhost:8000' } },
  resolve: {
    // react-router's package exports only point at its development build (bigger, slower, with dev-only checks);
    // production builds use the production files it ships alongside.
    alias: command === 'build' ? [
      { find: /^react-router$/, replacement: routerBuild('index.mjs') },
      { find: /^react-router\/dom$/, replacement: routerBuild('dom-export.mjs') },
    ] : [],
  },
  build: {
    // Never inline fonts as data: URIs. The CSP allows fonts from our own origin only (font-src 'self'),
    // so an inlined font would be blocked. Other small assets keep Vite's default behaviour.
    assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
  },
}))
