// @vitest-environment node
import type { TokenCredential } from "@azure/identity";
import { DrizzleQueryError } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readDatabaseConfig } from "@/backend/infrastructure/database/config";
import {
  databasePassword,
  POSTGRES_TOKEN_SCOPE,
} from "@/backend/infrastructure/database/credentials";
import { databaseFailureMessage } from "@/backend/infrastructure/database/errors";
import { checkDatabase } from "@/backend/infrastructure/database/health";
import {
  closeDatabase,
  createDatabase,
  getDatabase,
  postgresPoolConfig,
} from "@/backend/infrastructure/database/pool";

vi.mock("server-only", () => ({}));

const local = {
  NODE_ENV: "development",
  SUNSUM_DATABASE_AUTH: "password",
  PGHOST: "127.0.0.1",
  PGPORT: "15432",
  PGDATABASE: "sunsum",
  PGUSER: "postgres",
  PGPASSWORD: "synthetic-local-test-password",
  PGSSLMODE: "disable",
};

afterEach(async () => {
  await closeDatabase();
  vi.unstubAllEnvs();
});

describe("pooled server dependencies", () => {
  const operatorEnvironment = {
    ...local, PGPASSWORD: undefined, SUNSUM_DATABASE_AUTH: "azure-cli",
    PGHOST: "example-sunsum.postgres.database.azure.com", PGSSLMODE: "verify-full",
  };

  it.each([5_000, 60_000, 600_000])("uses an explicitly bounded migration timeout of %i ms", async (timeout) => {
    const database = createDatabase(operatorEnvironment, { allowOperatorIdentity: true, migrationStatementTimeoutMs: timeout });
    try {
      expect(database.pool.options).toMatchObject({
        max: 1, application_name: "sunsum-migration", statement_timeout: timeout, query_timeout: timeout + 5_000,
      });
      expect(database.pool.totalCount).toBe(0);
      expect(postgresPoolConfig(readDatabaseConfig(local)).statement_timeout).toBe(5_000);
    } finally { await database.close(); }
  });

  it.each([0, 4_999, 600_001, NaN, Infinity, 5000.5])("rejects unsafe migration timeout %s", (timeout) => {
    expect(() => createDatabase(operatorEnvironment, { allowOperatorIdentity: true, migrationStatementTimeoutMs: timeout })).toThrow("5000-600000");
  });

  it("does not let runtime or local password pools select migration limits", () => {
    expect(() => createDatabase(local, { migrationStatementTimeoutMs: 60_000 })).toThrow("Azure CLI operator");
    expect(() => createDatabase({ ...operatorEnvironment, SUNSUM_DATABASE_AUTH: "managed-identity" }, { migrationStatementTimeoutMs: 60_000 })).toThrow("Azure CLI operator");
  });

  it("uses finite connection, query, idle and pool-lifetime limits", () => {
    expect(postgresPoolConfig(readDatabaseConfig(local))).toMatchObject({
      max: 5,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      maxLifetimeSeconds: 300,
      statement_timeout: 5_000,
      query_timeout: 10_000,
      idle_in_transaction_session_timeout: 10_000,
      ssl: false,
    });
  });

  it("keeps verified TLS and hostname checks in Entra mode", () => {
    const azure = readDatabaseConfig({
      ...local,
      PGPASSWORD: undefined,
      SUNSUM_DATABASE_AUTH: "managed-identity",
      PGHOST: "example-sunsum.postgres.database.azure.com",
      PGSSLMODE: "verify-full",
    });
    expect(postgresPoolConfig(azure).ssl).toEqual({
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
      servername: azure.host,
    });
  });

  it("creates no connection until used and shares the lazy application pool", () => {
    for (const [key, value] of Object.entries(local)) vi.stubEnv(key, value);
    const first = getDatabase();
    expect(getDatabase()).toBe(first);
    expect(first.pool.totalCount).toBe(0);
  });

  it("does not silently substitute fixtures for missing database configuration", () => {
    expect(() => createDatabase({})).toThrow();
  });

  it("surfaces idle failures without logging driver messages or connection details", async () => {
    const database = createDatabase(local);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    database.pool.emit(
      "error",
      Object.assign(new Error("synthetic-secret-value"), { code: "ECONNRESET" }),
    );
    expect(log).toHaveBeenCalledWith("PostgreSQL idle connection failed.", {
      code: "ECONNRESET",
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("synthetic-secret-value");
    await database.close();
  });

  it("reports only safe diagnostics from an unknown failure", () => {
    expect(databaseFailureMessage(new Error("synthetic-secret"))).not.toContain(
      "synthetic-secret",
    );
  });

  it("retains a wrapped driver error code without exposing SQL, parameters or credentials", () => {
    const driverError = Object.assign(new Error("synthetic-password"), {
      code: "28P01",
    });
    const error = new DrizzleQueryError(
      "select synthetic_private_column",
      ["synthetic-private-value"],
      driverError,
    );
    const message = databaseFailureMessage(error);
    expect(message).toContain("28P01");
    expect(message).not.toContain("synthetic");
  });
});

describe("Entra token refresh", () => {
  it("requests a current token for each new physical connection, not once at startup", async () => {
    const getToken = vi.fn<TokenCredential["getToken"]>()
      .mockResolvedValueOnce({
        token: "synthetic-token-one",
        expiresOnTimestamp: Date.now() + 600_000,
      })
      .mockResolvedValueOnce({
        token: "synthetic-token-two",
        expiresOnTimestamp: Date.now() + 600_000,
      });
    const password = databasePassword({ mode: "managed-identity" }, { getToken });
    if (typeof password !== "function") throw new Error("Expected dynamic authentication.");
    expect(getToken).not.toHaveBeenCalled();
    await expect(password()).resolves.toBe("synthetic-token-one");
    await expect(password()).resolves.toBe("synthetic-token-two");
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(getToken).toHaveBeenCalledWith(POSTGRES_TOKEN_SCOPE, {
      abortSignal: expect.any(AbortSignal),
    });
  });

  it.each([null, { token: "", expiresOnTimestamp: Date.now() + 600_000 }, {
    token: "synthetic-expired-token",
    expiresOnTimestamp: 0,
  }])("rejects an unusable token without password fallback", async (token) => {
    const getToken = vi.fn<TokenCredential["getToken"]>().mockResolvedValue(token);
    const password = databasePassword({ mode: "managed-identity" }, { getToken });
    if (typeof password !== "function") throw new Error("Expected dynamic authentication.");
    await expect(password()).rejects.toThrow("no usable access token");
  });

  it("propagates identity failure instead of trying developer credentials", async () => {
    const failure = new Error("identity unavailable");
    const getToken = vi.fn<TokenCredential["getToken"]>().mockRejectedValue(failure);
    const password = databasePassword({ mode: "managed-identity" }, { getToken });
    if (typeof password !== "function") throw new Error("Expected dynamic authentication.");
    await expect(password()).rejects.toBe(failure);
    expect(getToken).toHaveBeenCalledOnce();
  });
});

describe("read-only connectivity check", () => {
  it.each([1, 0])("accepts only the expected SELECT 1 result, not %s", async (ok) => {
    const database = createDatabase(local);
    vi.spyOn(database.db, "execute").mockResolvedValue({
      rows: [{ ok }], command: "SELECT", rowCount: 1, oid: 0, fields: [],
    });

    try {
      if (ok === 1) {
        await expect(checkDatabase(database)).resolves.toBeUndefined();
      } else {
        await expect(checkDatabase(database)).rejects.toThrow("unexpected result");
      }
    } finally {
      await database.close();
    }
  });

  it("propagates a failed query and never reports healthy fixtures", async () => {
    const database = createDatabase(local);
    const failure = new Error("database unavailable");
    vi.spyOn(database.db, "execute").mockRejectedValue(failure);
    try {
      await expect(checkDatabase(database)).rejects.toBe(failure);
    } finally {
      await database.close();
    }
  });
});
