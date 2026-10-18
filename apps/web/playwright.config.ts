import { defineConfig, devices } from "@playwright/test";

// Runs against the deployed app by default; point E2E_BASE_URL at a local server to test a build.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://updraft-weld.vercel.app",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /pages\.spec\.ts/ },
  ],
});
