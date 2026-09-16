/**
 * The database connection.
 *
 * One pool per process, created lazily. Next.js reloads modules on every edit in
 * development, so a pool created at import time leaks a new pool per reload
 * until PostgreSQL refuses connections; caching it on `globalThis` survives the
 * reload, which is the standard workaround and the reason this file exists at
 * all rather than a one-line `drizzle(new Pool(...))`.
 *
 * `DATABASE_URL` is read when the pool is first needed, not when this module is
 * imported. That matters because `SUNSUM_STORE=mock` must keep working with no
 * database configured at all — importing the store must not require a
 * connection string.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  sunsumPool?: Pool | undefined;
  sunsumDb?: Database | undefined;
};

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local, or run with SUNSUM_STORE=mock.",
    );
  }

  return url;
}

export function getDb(): Database {
  if (!globalForDb.sunsumDb) {
    globalForDb.sunsumPool ??= new Pool({ connectionString: getDatabaseUrl() });
    globalForDb.sunsumDb = drizzle(globalForDb.sunsumPool, { schema });
  }

  return globalForDb.sunsumDb;
}

/** Closes the pool. For scripts and tests; the server holds its pool for its lifetime. */
export async function closeDb(): Promise<void> {
  await globalForDb.sunsumPool?.end();
  globalForDb.sunsumPool = undefined;
  globalForDb.sunsumDb = undefined;
}
