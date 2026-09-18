import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    maxWorkers: process.env.CI ? 2 : 4,
    // The onboarding flow tests drive a multi-step form through several hundred
    // accessibility-tree queries, which cost 3-4s on an unloaded machine. The
    // 5s default left too little headroom: under worker contention they timed
    // out intermittently, on CI most of all, where maxWorkers is lower. This is
    // a ceiling for catching genuine hangs, not a budget to spend.
    testTimeout: 20_000,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: [
      "tests/unit/**/*.test.{ts,tsx}",
      "tests/integration/**/*.test.{ts,tsx}",
      "src/features/**/*.test.{ts,tsx}",
      "src/backend/**/*.test.{ts,tsx}",
    ],
    restoreMocks: true,
  },
});
