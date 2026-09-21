import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
import base from "../../playwright.config";

const port = Number(process.env.SUNSUM_SERVER_DEMO_TEST_PORT ?? "3119");
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("SUNSUM_SERVER_DEMO_TEST_PORT must be an integer between 1024 and 65535.");
}
const baseURL = `http://127.0.0.1:${port}`;
const launcher = fileURLToPath(new URL("./start-server.mjs", import.meta.url));
const projects = base.projects;
if (!projects) throw new Error("The existing desktop/tablet/mobile browser projects are required.");

// Outside tests/e2e: the ordinary and intercepted-connected lanes never collect these cases.
export default defineConfig({
  testDir: ".",
  testMatch: "server-demo-workspace.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 60_000,
  outputDir: "../../test-results/server-demo",
  reporter: [["list"]],
  metadata: {
    evidence: "Isolated loopback mock store and actual seeded-session handler; not connected access.",
    sourceMode: "server-demo",
  },
  use: {
    baseURL,
    storageState: { cookies: [], origins: [] },
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
  },
  projects,
  webServer: {
    command: `"${process.execPath}" "${launcher}" ${port}`,
    url: `${baseURL}/api/me`,
    reuseExistingServer: false,
    timeout: 90_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
