import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { defineConfig } from "vitest/config";

/**
 * Integration tests, run separately from `npm test`.
 *
 * They need a live PostgreSQL, so they are not in the default suite: `npm test`
 * and CI must keep passing on a machine with no database. Keeping them in their
 * own config makes that explicit rather than relying on every such test
 * remembering to skip itself.
 *
 *   docker compose up -d --wait
 *   npm run db:migrate && npm run db:reset && npm run db:seed
 *   npm run test:db
 */

/**
 * `next dev` reads .env.local and Vitest does not, so without this the tests
 * only passed for whoever happened to have DATABASE_URL exported in their shell
 * and failed for everyone following the README. An already-set variable still
 * wins, which is how CI would point these at a service container.
 */
function loadLocalEnv(): void {
  let contents: string;
  try {
    contents = readFileSync(new URL("./.env.local", import.meta.url), "utf8");
  } catch {
    return;
  }

  const parsed = parseEnv(contents);
  for (const key of ["DATABASE_URL", "SUNSUM_STORE"]) {
    const value = parsed[key];
    if (typeof value === "string" && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadLocalEnv();

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    restoreMocks: true,
  },
});
