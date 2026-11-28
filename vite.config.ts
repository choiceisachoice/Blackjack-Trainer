import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // `dist/.vite/manifest.json`: which chunks each page module pulls in.
    // `scripts/prerender.mjs` reads it to write `<link rel="modulepreload">`
    // for a prerendered page's own chunks (and its language), so they are
    // fetched in parallel with the entry instead of after it has run — and
    // then deletes it, so the server never hands out the build's map.
    manifest: true,
  },
})
