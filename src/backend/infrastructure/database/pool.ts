import "server-only";
import type { TokenCredential } from "@azure/identity";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { PoolConfig } from "pg";
import { readDatabaseConfig } from "./config";
import type {
  DatabaseConfig,
  DatabaseConfigOptions,
  DatabaseEnvironment,
} from "./config";
import { databasePassword } from "./credentials";
import { databaseErrorCode } from "./errors";
import * as schema from "../../db";

export const postgresPoolConfig = (
  config: DatabaseConfig,
  credential?: TokenCredential,
): PoolConfig => ({
  host: config.host,
  port: config.port,
  database: config.database,
  user: config.user,
  password: databasePassword(config.auth, credential),
  ssl:
    config.sslMode === "verify-full"
      ? { rejectUnauthorized: true, minVersion: "TLSv1.2", servername: config.host }
      : false,
  application_name: "sunsum",
  options: "-c search_path=public",
  max: 5,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
  maxLifetimeSeconds: 300,
  statement_timeout: 5_000,
  query_timeout: 10_000,
  idle_in_transaction_session_timeout: 10_000,
});

export const createDatabase = (
  environment: DatabaseEnvironment,
  options: DatabaseConfigOptions & { readonly credential?: TokenCredential } = {},
) => {
  const config = readDatabaseConfig(environment, options);
  const pool = new Pool(postgresPoolConfig(config, options.credential));
  pool.on("error", (error) => {
    console.error("PostgreSQL idle connection failed.", {
      code: databaseErrorCode(error),
    });
  });
  return {
    db: drizzle({ client: pool, schema }),
    pool,
    close: () => pool.end(),
  };
};

export type DatabaseDependencies = ReturnType<typeof createDatabase>;

const serverState = globalThis as typeof globalThis & {
  sunsumDatabase?: DatabaseDependencies;
};

// Retain one lazy pool across Next.js hot reloads; importing the backend never opens it.
export const getDatabase = (): DatabaseDependencies =>
  (serverState.sunsumDatabase ??= createDatabase(process.env));

export const closeDatabase = async (): Promise<void> => {
  const database = serverState.sunsumDatabase;
  delete serverState.sunsumDatabase;
  if (database) await database.close();
};
