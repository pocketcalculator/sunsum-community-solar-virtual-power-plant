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
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/backend/db/schema.ts",
  out: "./src/backend/db/migrations",
  casing: "snake_case",
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://sunsum:sunsum@localhost:5432/sunsum",
  },
});
