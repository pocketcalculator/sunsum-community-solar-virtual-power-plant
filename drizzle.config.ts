import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

import { defineConfig } from "drizzle-kit";

/**
 * Configuration for `drizzle-kit`, which reads the schema and emits SQL
 * migrations. It is a development tool only — nothing at runtime imports this,
 * and `drizzle-kit` stays a devDependency.
 *
 * The generated SQL in `src/backend/db/migrations` is the real artifact and is
 * committed. Review it like code: it is what actually runs against the
 * database, and ADR 0001 notes that plain SQL is what keeps the decision
 * reversible.
 */

/**
 * `drizzle-kit` is sometimes invoked directly rather than through
 * `scripts/db.mjs`, and nothing else loads .env.local for it, so it has to do
 * that itself. Without this, `drizzle-kit studio` fell back to a hardcoded
 * default and connected to the wrong port.
 *
 * `.env.example` is last, and is the reason no connection string is duplicated
 * here. It holds the docker-compose credentials rather than PostgreSQL's
 * default port, which matters: the previous fallback was 5432, so on a machine
 * with PostgreSQL already installed a missing .env.local pointed drizzle-kit at
 * *that* server — an unrelated database, silently, with no error.
 */
function databaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  for (const file of [".env.local", ".env", ".env.example"]) {
    try {
      const value = parseEnv(readFileSync(new URL(file, import.meta.url), "utf8")).DATABASE_URL;
      if (typeof value === "string" && value !== "") {
        return value;
      }
    } catch {
      // No such file, which is normal.
    }
  }

  throw new Error("DATABASE_URL is not set and .env.example is missing.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/backend/db/schema.ts",
  out: "./src/backend/db/migrations",
  casing: "snake_case",
  strict: true,
  verbose: true,
  dbCredentials: {
    url: databaseUrl(),
  },
});
