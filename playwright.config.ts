import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3200);
const executablePath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: `npx next start -p ${PORT}`, port: PORT, reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
