import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const baseURL = "http://127.0.0.1:4183";
const hostingPath = process.env.PLAYWRIGHT_HOSTING_PATH ?? "/app/sunsum-ui-demo/";
if (!/^\/(?:[a-zA-Z0-9_-]+\/)+$/.test(hostingPath)) throw new Error("PLAYWRIGHT_HOSTING_PATH must be a safe absolute directory path.");

export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: ["design-lab.spec.ts", "vibehub.spec.ts", "sunroom-preview.spec.ts"],
  metadata: { routePrefix: `${hostingPath}#` },
  use: { ...base.use, baseURL },
  webServer: {
    command: `npm run preview:demo -- --base ${hostingPath}`,
    url: `${baseURL}${hostingPath}`,
    reuseExistingServer: false,
    timeout: 90_000,
  },
});
