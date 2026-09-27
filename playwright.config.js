import { defineConfig } from "@playwright/test";
const origin = `http://127.0.0.1:${process.env.PORT || 4173}`;
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 60000,
  use: {
    baseURL: `${origin}/BridgeDealAnalyzerWeb/`,
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/serve.mjs",
    url: `${origin}/BridgeDealAnalyzerWeb/`,
    reuseExistingServer: !process.env.CI,
  },
  reporter: "list",
});
