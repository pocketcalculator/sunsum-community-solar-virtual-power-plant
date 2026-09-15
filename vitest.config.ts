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
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: [
      "tests/unit/**/*.test.{ts,tsx}",
      "src/features/**/*.test.{ts,tsx}",
      "src/backend/**/*.test.{ts,tsx}",
    ],
    restoreMocks: true,
  },
});
