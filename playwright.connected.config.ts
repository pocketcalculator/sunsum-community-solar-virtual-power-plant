import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const server = base.webServer;
if (!server || Array.isArray(server)) {
  throw new Error("Connected browser cases require the single local server from the base configuration.");
}

export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: "connected-workspace.spec.ts",
  metadata: { readEvidence: "Mocked frontend contracts; not real sign-in or remote access." },
  webServer: {
    ...server,
    reuseExistingServer: false,
    env: {
      NEXT_TELEMETRY_DISABLED: "1",
      SUNSUM_PUBLIC_DATA_MODE: "connected",
      SUNSUM_PUBLIC_API_BASE_URL: "/api",
      SUNSUM_STORE: "db",
      SUNSUM_DEMO_AUTH: "",
      SUNSUM_SESSION_SECRET: "local-browser-contract-fixture-only-not-a-real-session",
      SUNSUM_LIVE_READ_AUTH_APPROVED: "true",
      SUNSUM_LIVE_EXPORT_APPROVED: "true",
      SUNSUM_LIVE_DOCUMENTS_APPROVED: "true",
    },
  },
});
