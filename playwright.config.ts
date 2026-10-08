import { defineConfig, devices } from "@playwright/test";

const preview = process.env.E2E_PREVIEW === "1";
const port = preview ? 5181 : 5180;
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"]],
  // Tests ask for reduced motion, so nothing waits for an animation. One test turns motion back on.
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure", screenshot: "only-on-failure", contextOptions: { reducedMotion: "reduce" } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: { args: ["--enable-unsafe-swiftshader"] } } }],
  webServer: {
    command: preview ? `npm run build && npm run preview -- --host 127.0.0.1 --port ${port} --strictPort` : `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      // Never run mocked UI tests against the configured cloud project, nor against a local Supabase
      // stack that happens to be running on its usual port 54321. Nothing listens on this port.
      VITE_SUPABASE_URL: "http://127.0.0.1:54399",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_ui_test_only",
      VITE_ENABLE_DEMO: "true",
      VITE_GOOGLE_CLIENT_ID: "ui-test.apps.googleusercontent.com",
      // The tests are of a build without push, whatever .env.local says.
      VITE_WEB_PUSH_VAPID_PUBLIC_KEY: "",
    },
  },
});
