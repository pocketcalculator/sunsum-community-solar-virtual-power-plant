// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { readDatabaseConfig } from "@/backend/infrastructure/database/config";

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

const azure = {
  NODE_ENV: "production",
  SUNSUM_DATABASE_AUTH: "managed-identity",
  PGHOST: "example-sunsum.postgres.database.azure.com",
  PGPORT: "5432",
  PGDATABASE: "sunsum",
  PGUSER: "sunsum_runtime",
  PGSSLMODE: "verify-full",
};

describe("explicit server database configuration", () => {
  it("accepts explicit local connection fields without a URL parser", () => {
    expect(readDatabaseConfig(local)).toEqual({
      host: local.PGHOST,
      port: 15432,
      database: "sunsum",
      user: "postgres",
      sslMode: "disable",
      auth: { mode: "password", password: local.PGPASSWORD },
    });
  });

  it("accepts Azure managed identity with verified TLS and no stored password", () => {
    expect(readDatabaseConfig(azure).auth).toEqual({
      mode: "managed-identity",
    });
  });

  it.each([
    "SUNSUM_DATABASE_AUTH",
    "PGHOST",
    "PGPORT",
    "PGDATABASE",
    "PGUSER",
    "PGSSLMODE",
    "PGPASSWORD",
  ])("rejects a missing %s instead of using driver defaults", (name) => {
    expect(() => readDatabaseConfig({ ...local, [name]: undefined })).toThrow(
      name,
    );
  });

  it.each(["", "0", "-1", "65536", "5432x", "5432.5", " 5432", "5e3"])(
    "rejects invalid port %j",
    (port) => {
      expect(() => readDatabaseConfig({ ...local, PGPORT: port })).toThrow(
        "PGPORT",
      );
    },
  );

  it.each(["1", "65535"])("accepts port boundary %s", (port) => {
    expect(readDatabaseConfig({ ...local, PGPORT: port }).port).toBe(
      Number(port),
    );
  });

  it.each(["localhost", "127.0.0.1", "::1"])(
    "allows local password authentication only on loopback: %s",
    (host) => {
      expect(readDatabaseConfig({ ...local, PGHOST: host }).host).toBe(host);
    },
  );

  it.each([
    { NODE_ENV: "production" },
    { PGHOST: "database.example.com" },
    { PGHOST: "localhost.example.com" },
    { PGHOST: "192.168.1.5" },
    { PGPASSWORD: "" },
    { SUNSUM_DATABASE_AUTH: "default" },
    { PGSSLMODE: "require" },
    { PGSSLMODE: "prefer" },
    { NODE_TLS_REJECT_UNAUTHORIZED: "0" },
    { PGDATABASE: "sunsum\noptions" },
    { PGUSER: "user\u0000suffix" },
  ])("rejects unsafe local overrides %j", (overrides) => {
    expect(() => readDatabaseConfig({ ...local, ...overrides })).toThrow();
  });

  it.each([
    { PGSSLMODE: "disable" },
    { PGSSLMODE: "require" },
    { PGHOST: "postgres.database.azure.com.example.com" },
    { PGHOST: "127.0.0.1" },
    { PGHOST: "https://example-sunsum.postgres.database.azure.com" },
    { PGPASSWORD: "stale-secret" },
    { SUNSUM_DATABASE_AUTH: "azure-cli" },
    { NODE_TLS_REJECT_UNAUTHORIZED: "0" },
  ])("rejects unsafe Azure overrides %j", (overrides) => {
    expect(() => readDatabaseConfig({ ...azure, ...overrides })).toThrow();
  });

  it("allows Azure CLI credentials only through the explicit operator seam", () => {
    expect(
      readDatabaseConfig(
        { ...azure, SUNSUM_DATABASE_AUTH: "azure-cli" },
        { allowOperatorIdentity: true },
      ).auth,
    ).toEqual({ mode: "azure-cli" });
  });

  it("reports field names but never the supplied credential", () => {
    const password = "synthetic-secret-not-for-error-output";
    expect(() =>
      readDatabaseConfig({ ...azure, PGPASSWORD: password }),
    ).toThrow("PGPASSWORD");
    try {
      readDatabaseConfig({ ...azure, PGPASSWORD: password });
    } catch (error) {
      expect(String(error)).not.toContain(password);
    }
  });
});
