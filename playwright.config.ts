import { defineConfig } from "@playwright/test";

const browserName = process.env.PLAYWRIGHT_WEBKIT === "1" ? "webkit" : "chromium";
const port = process.env.PLAYWRIGHT_PORT || (browserName === "webkit" ? 5174 : 5173);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL,
    browserName,
    launchOptions: browserName === "chromium" ? {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
      args: ["--no-sandbox"],
    } : undefined,
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    env: { BACKWOODS_E2E: "1" },
  },
  reporter: "list",
});
