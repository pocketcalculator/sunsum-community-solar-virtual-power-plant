// @vitest-environment node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { readMigrationApproval } from "../../../scripts/migration-approval";
import type { DatabaseConfig } from "../../../src/backend/infrastructure/database/config";

vi.mock("server-only", () => ({}));

const root = fileURLToPath(new URL("../../../", import.meta.url));
const run = (args: string[], overrides: Readonly<Record<string, string>> = {}) => {
  const env = { ...process.env };
  delete env.PGPASSWORD;
  Object.assign(env, overrides);
  return spawnSync(process.execPath, args, {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 30_000,
  });
};
const operatorArgs = ["--conditions=react-server", "--import=tsx"];

describe("database CLI safety gates", () => {
  it("binds migrations to a reviewed target and detects file drift without connecting", () => {
    const directory = mkdtempSync(join(tmpdir(), "sunsum-migration-review-"));
    const path = join(directory, "approval.json");
    const config: DatabaseConfig = {
      host: "example-sunsum.postgres.database.azure.com", port: 5432, database: "sunsum",
      user: "sunsum_migrator", sslMode: "verify-full", auth: { mode: "azure-cli" },
    };
    const record = {
      operation: "DatabaseMigration", host: config.host, port: config.port, database: config.database,
      user: config.user, sslMode: config.sslMode, authentication: config.auth.mode,
      statementTimeoutMs: 5000, approvalReference: "review-123",
    };
    const text = JSON.stringify(record);
    const hash = createHash("sha256").update(text).digest("hex");
    const env = { SUNSUM_DATABASE_AUTH: "azure-cli", PGHOST: config.host, PGPORT: "5432", PGDATABASE: "sunsum", PGUSER: config.user, PGSSLMODE: "verify-full", SUNSUM_MIGRATION_STATEMENT_TIMEOUT_MS: "5000" };
    try {
      writeFileSync(path, text);
      const approval = readMigrationApproval(path, hash.toUpperCase(), config, 5000);
      expect(() => approval.verifyUnchanged()).not.toThrow();
      expect(() => readMigrationApproval(path, "bad", config, 5000)).toThrow("review-supplied");
      for (const key of Object.keys(record)) {
        const changed = JSON.stringify({ ...record, [key]: key === "approvalReference" ? "" : "unreviewed" });
        writeFileSync(path, changed);
        const changedHash = createHash("sha256").update(changed).digest("hex");
        expect(() => readMigrationApproval(path, changedHash, config, 5000)).toThrow();
        expect(() => approval.verifyUnchanged()).toThrow("reviewed SHA-256");
      }
      writeFileSync(path, text);
      for (const override of [{ PGHOST: "other-sunsum.postgres.database.azure.com" }, { PGDATABASE: "otherdb" }]) {
        const result = run([...operatorArgs, "scripts/db-migrate.ts", "--apply", "--approval", path, "--expected-sha256", hash], { ...env, ...override });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("Migration approval does not match");
        expect(result.stdout).not.toContain("applied");
      }
      const missing = run([...operatorArgs, "scripts/db-migrate.ts", "--apply"], env);
      expect(missing.status).toBe(1);
      expect(missing.stderr).toContain("requires a reviewed --approval");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("does not report a configured database when settings are absent", () => {
    const result = run([...operatorArgs, "scripts/db-check.ts"], { PGHOST: "" });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("PGHOST must be explicitly configured");
    expect(result.stdout).not.toContain("verified");
  });

  it("requires explicit approval before any migration operation", () => {
    const result = run([...operatorArgs, "scripts/db-migrate.ts"]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("requires exactly --apply");
  });

  it("refuses runtime managed identity for migrations before contacting Azure", () => {
    const result = run(
      [...operatorArgs, "scripts/db-migrate.ts", "--apply"],
      {
        SUNSUM_DATABASE_AUTH: "managed-identity",
        PGHOST: "example-sunsum.postgres.database.azure.com",
        PGPORT: "5432",
        PGDATABASE: "sunsum",
        PGUSER: "sunsum_runtime",
        PGSSLMODE: "verify-full",
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Runtime managed identity cannot run migrations");
  });

  it("rejects local password mode in the Azure migration command before connecting", () => {
    const result = run(
      [...operatorArgs, "scripts/db-migrate.ts", "--apply"],
      {
        NODE_ENV: "development",
        SUNSUM_DATABASE_AUTH: "password",
        PGHOST: "127.0.0.1",
        PGPORT: "1",
        PGDATABASE: "sunsum",
        PGUSER: "local_operator",
        PGSSLMODE: "disable",
        PGPASSWORD: "synthetic-local-password",
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Azure migrations require azure-cli authentication");
    expect(result.stderr).not.toContain("synthetic-local-password");
    expect(result.stdout).not.toContain("applied");
  });

  it.each(["postgres", "azure_pg_admin", "sunsum_runtime", "bootstrap_admin", "other_operator", "SUNSUM_MIGRATOR"])("rejects unapproved migration role %s before connecting", (role) => {
    const result = run([...operatorArgs, "scripts/db-migrate.ts", "--apply"], {
      SUNSUM_DATABASE_AUTH: "azure-cli",
      PGHOST: "example-sunsum.postgres.database.azure.com",
      PGPORT: "5432", PGDATABASE: "sunsum", PGUSER: role, PGSSLMODE: "verify-full",
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Azure migrations require PGUSER=sunsum_migrator");
    expect(result.stdout).not.toContain("applied");
  });

  it.each(["0", "4999", "600001", "NaN", "5e4", " 60000", "5000.5", ""])("rejects migration timeout %j before connecting", (timeout) => {
    const result = run([...operatorArgs, "scripts/db-migrate.ts", "--apply"], {
      SUNSUM_DATABASE_AUTH: "azure-cli",
      PGHOST: "example-sunsum.postgres.database.azure.com",
      PGPORT: "5432", PGDATABASE: "sunsum", PGUSER: "sunsum_migrator", PGSSLMODE: "verify-full",
      SUNSUM_MIGRATION_STATEMENT_TIMEOUT_MS: timeout,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("SUNSUM_MIGRATION_STATEMENT_TIMEOUT_MS must be an integer");
    expect(result.stdout).not.toContain("applied");
  });

  it("keeps the real server-only import guard outside the test mock", () => {
    const result = run(
      [
        "--import=tsx",
        "--input-type=module",
        "--eval",
        'await import("./src/backend/infrastructure/database/config.ts")',
      ],
      { NODE_OPTIONS: "" },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("cannot be imported from a Client Component");
  });
});
