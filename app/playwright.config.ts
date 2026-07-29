import { defineConfig } from "@playwright/test"

// E2E tests for the project portal. Requirements:
//   - a production build in dist/ (npm run build)
//   - app/.env with portal Supabase + Copilot runtime configuration
// The tests drive the real Express server (all /api proxies live), so auto-save writes
// real rows to the configured Supabase project; test projects are named "E2E …" so they
// are easy to identify and delete.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: "http://localhost:4310",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "node --env-file=.env server.mjs",
    port: 4310,
    env: { PORT: "4310" },
    reuseExistingServer: true,
    timeout: 30_000
  }
})
