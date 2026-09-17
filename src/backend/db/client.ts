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
 *
 * Two ways of proving who is connecting, chosen by the host rather than by the
 * code: a password for the local container, and a Microsoft Entra token for the
 * Azure server, which is provisioned with password authentication switched off.
 * See `usesEntraAuth` below and `entra.ts`.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import { getPostgresAccessToken } from "./entra";
import * as schema from "./schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  sunsumPool?: Pool | undefined;
  sunsumDb?: Database | undefined;
};

/** The suffix every Azure Database for PostgreSQL flexible server carries. */
const AZURE_POSTGRES_SUFFIX = ".postgres.database.azure.com";

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local, or run with SUNSUM_STORE=mock.",
    );
  }

  return url;
}

/**
 * Whether to authenticate with a Microsoft Entra token rather than a password.
 *
 * Defaults from the host, because the host is what actually decides: the Azure
 * server has password authentication disabled, and the local container has no
 * Entra to ask. `SUNSUM_DB_AUTH` overrides that for the cases the hostname
 * cannot describe — a private endpoint reached by an alias, or a developer
 * pointing at the cloud server from a workstation.
 */
export function usesEntraAuth(url: string = getDatabaseUrl()): boolean {
  const configured = process.env.SUNSUM_DB_AUTH?.trim().toLowerCase();

  if (configured === "entra") return true;
  if (configured === "password") return false;

  if (configured !== undefined && configured !== "") {
    throw new Error(
      `SUNSUM_DB_AUTH must be "entra" or "password", not ${JSON.stringify(configured)}.`,
    );
  }

  try {
    return new URL(url).hostname
      .toLowerCase()
      .endsWith(AZURE_POSTGRES_SUFFIX);
  } catch {
    // An unparseable URL is the pool's problem to report, not this function's.
    return false;
  }
}

/**
 * Builds the pool configuration.
 *
 * Exported so the auth decision can be asserted without opening a connection,
 * which is the only way to test it: `new Pool(...)` connects lazily, so a wrong
 * choice here would otherwise surface as an authentication failure at the first
 * query rather than as a failing test.
 */
export function buildPoolConfig(url: string = getDatabaseUrl()): PoolConfig {
  if (!usesEntraAuth(url)) {
    return { connectionString: url };
  }

  return {
    connectionString: url,
    /**
     * A function, not a string: `pg` calls it for every new connection, so the
     * pool keeps working after the first token expires. A token fetched once at
     * startup would take the process down roughly an hour later.
     */
    password: () => getPostgresAccessToken(),
    /**
     * Azure requires TLS and presents a publicly trusted certificate, so the
     * default verification is the correct one. It is spelled out because
     * `rejectUnauthorized: false` is the usual way this gets "fixed" when a
     * certificate error appears, and that would silently accept any server.
     */
    ssl: { rejectUnauthorized: true },
  };
}

export function getDb(): Database {
  if (!globalForDb.sunsumDb) {
    globalForDb.sunsumPool ??= new Pool(buildPoolConfig());
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
