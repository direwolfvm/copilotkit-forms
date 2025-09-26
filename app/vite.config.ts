import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Use absolute paths during development for the Vite dev server, but
  // switch to relative paths in the production build so the app can be
  // hosted from a subdirectory (e.g. behind a Google Cloud Run service
  // that mounts the site on a non-root path).
  base: command === 'serve' ? '/' : './',
  plugins: [react()],
}))
