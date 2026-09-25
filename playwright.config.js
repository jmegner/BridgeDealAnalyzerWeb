import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:4173/BridgeDealAnalyzerWeb/",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/serve.mjs",
    url: "http://127.0.0.1:4173/BridgeDealAnalyzerWeb/",
    reuseExistingServer: !process.env.CI,
  },
  reporter: "list",
});
