// @vitest-environment node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { readMigrationApproval } from "../../../scripts/migration-approval";
import type { DatabaseConfig } from "../../../src/backend/infrastructure/database/config";
import { DatabaseConfigurationError } from "../../../src/backend/infrastructure/database/errors";
import { captureMigrationSnapshot, migrationDigest } from "../../../scripts/migration-snapshot";
import { PgDialect } from "drizzle-orm/pg-core";
import { Client, Pool } from "pg";
import type { QueryConfig } from "pg";

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
      migrationsSha256: migrationDigest(join(root, "src/backend/db/migrations")),
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
      const unreviewedSql = JSON.stringify({ ...record, migrationsSha256: "0".repeat(64) });
      writeFileSync(path, unreviewedSql);
      const sqlMismatch = run([...operatorArgs, "scripts/db-migrate.ts", "--apply", "--approval", path, "--expected-sha256", createHash("sha256").update(unreviewedSql).digest("hex")], env);
      expect(sqlMismatch.status).toBe(1);
      expect(sqlMismatch.stderr).toContain("SQL no longer matches");
      expect(sqlMismatch.stdout).not.toContain("applied");
      writeFileSync(path, text);
      for (const unreadable of [join(directory, "synthetic-private-missing.json"), directory]) {
        expect(() => readMigrationApproval(unreadable, hash, config, 5000)).toThrow(DatabaseConfigurationError);
        const result = run([...operatorArgs, "scripts/db-migrate.ts", "--apply", "--approval", unreadable, "--expected-sha256", hash], env);
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("Cannot read the migration approval file");
        expect(result.stderr).not.toContain(directory);
        expect(result.stderr).not.toContain("Check network");
        expect(result.stdout).not.toContain("applied");
      }
      const invalidJson = '{"synthetic-private-value":';
      writeFileSync(path, invalidJson);
      const invalidHash = createHash("sha256").update(invalidJson).digest("hex");
      expect(() => readMigrationApproval(path, invalidHash, config, 5000)).toThrow(DatabaseConfigurationError);
      const invalid = run([...operatorArgs, "scripts/db-migrate.ts", "--apply", "--approval", path, "--expected-sha256", invalidHash], env);
      expect(invalid.status).toBe(1);
      expect(invalid.stderr).toContain("Migration approval file is not valid JSON");
      expect(invalid.stderr).not.toContain("synthetic-private-value");
      expect(invalid.stderr).not.toContain("Check network");
      rmSync(path);
      expect(() => approval.verifyUnchanged()).toThrow("Cannot read the migration approval file");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 30_000);

  it("hashes journal and SQL bytes and executes only the captured migrations", async () => {
    const folder = mkdtempSync(join(tmpdir(), "sunsum-reviewed-sql-"));
    mkdirSync(join(folder, "meta"));
    const journal = JSON.stringify({ version: "7", dialect: "postgresql", entries: [{ idx: 0, tag: "0000_test", when: 1, breakpoints: true }] });
    const journalPath = join(folder, "meta/_journal.json");
    const sqlPath = join(folder, "0000_test.sql");
    const originalSql = "SELECT 1;\n--> statement-breakpoint\nSELECT 2;";
    const pool = new Pool();
    try {
      writeFileSync(journalPath, journal);
      writeFileSync(sqlPath, originalSql);
      const digest = migrationDigest(folder);
      const expected = createHash("sha256").update(JSON.stringify([
        ["meta/_journal.json", createHash("sha256").update(journal).digest("hex")],
        ["0000_test.sql", createHash("sha256").update(originalSql).digest("hex")],
      ])).digest("hex");
      expect(digest).toBe(expected);
      const snapshot = captureMigrationSnapshot(folder, digest.toUpperCase());
      expect(snapshot.count).toBe(1);
      const migrate = vi.spyOn(PgDialect.prototype, "migrate").mockImplementation(async (migrations) => {
        writeFileSync(sqlPath, "SELECT 'unreviewed';");
        expect(migrations[0]?.sql.join("--> statement-breakpoint")).toBe(originalSql);
        expect(migrations[0]?.hash).toBe(createHash("sha256").update(originalSql).digest("hex"));
        expect(Object.isFrozen(migrations[0]?.sql)).toBe(true);
      });
      await snapshot.migrate(pool);
      expect(migrate).toHaveBeenCalledOnce();
      await expect(snapshot.migrate(pool)).rejects.toThrow("SQL no longer matches");
      expect(migrate).toHaveBeenCalledOnce();
      expect(() => captureMigrationSnapshot(folder, digest)).toThrow("SQL no longer matches");
      writeFileSync(sqlPath, originalSql);
      writeFileSync(journalPath, `${journal}\n`);
      expect(() => snapshot.verifyUnchanged()).toThrow("SQL no longer matches");
      writeFileSync(journalPath, journal.replace("0000_test", "../outside"));
      expect(() => migrationDigest(folder)).toThrow("unique safe names");
      writeFileSync(journalPath, journal);
      rmSync(sqlPath);
      expect(() => snapshot.verifyUnchanged()).toThrow("Cannot read the migration journal");
    } finally {
      vi.restoreAllMocks();
      await pool.end();
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("prints the migration digest without database configuration or connections", () => {
    const result = run([...operatorArgs, "scripts/db-migrate.ts", "--print-digest"], { PGHOST: "" });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(migrationDigest(join(root, "src/backend/db/migrations")));
  });

  it.each([false, true])("runs captured SQL through Drizzle transaction/history handling (failure=%s)", async (failStatement) => {
    const folder = mkdtempSync(join(tmpdir(), "sunsum-drizzle-snapshot-"));
    mkdirSync(join(folder, "meta"));
    const pool = new Pool();
    const client = Object.assign(new Client(), { release: vi.fn() });
    const result = { rows: [], command: "", rowCount: 0, oid: 0, fields: [] };
    try {
      writeFileSync(join(folder, "meta/_journal.json"), JSON.stringify({ dialect: "postgresql", entries: [{ tag: "0000_test", when: 1, breakpoints: true }] }));
      const sqlPath = join(folder, "0000_test.sql");
      writeFileSync(sqlPath, "SELECT 1;\n--> statement-breakpoint\nSELECT 2;");
      const snapshot = captureMigrationSnapshot(folder, migrationDigest(folder));
      const outsideTransaction = vi.spyOn(pool, "query").mockImplementation(async () => {
        writeFileSync(sqlPath, "SELECT 'unreviewed';");
        return result;
      });
      vi.spyOn(pool, "connect").mockImplementation(async () => client);
      const executed: string[] = [];
      vi.spyOn(client, "query").mockImplementation(async (query: string | QueryConfig) => {
        const text = typeof query === "string" ? query : query.text;
        executed.push(text);
        if (failStatement && text.includes("SELECT 2")) throw new Error("synthetic statement failure");
        return result;
      });
      if (failStatement) { await expect(snapshot.migrate(pool)).rejects.toThrow(); }
      else { await snapshot.migrate(pool); }
      expect(outsideTransaction).toHaveBeenCalledTimes(3);
      expect(executed[0]).toBe("begin");
      expect(executed).toContain("SELECT 1;\n");
      expect(executed).toContain("\nSELECT 2;");
      expect(executed.some((query) => query.includes('insert into "drizzle"."__drizzle_migrations"'))).toBe(!failStatement);
      expect(executed.at(-1)).toBe(failStatement ? "rollback" : "commit");
      expect(executed.join("\n")).not.toContain("unreviewed");
      expect(client.release).toHaveBeenCalledOnce();
      expect(pool.totalCount).toBe(0);
    } finally {
      vi.restoreAllMocks();
      await pool.end();
      rmSync(folder, { recursive: true, force: true });
    }
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

  it.each(["postgres", "public", "template0", "template1", "pg_custom", "azure_custom", "SunSum", "sunsum-prod", "_sunsum", "1sunsum", "sunsum.prod", "sunsum prod", "db\u00e9"])("rejects unsupported migration database %s even with matching reviewed approval", (database) => {
    const directory = mkdtempSync(join(tmpdir(), "sunsum-database-policy-"));
    const path = join(directory, "approval.json");
    const record = {
      operation: "DatabaseMigration", host: "example-sunsum.postgres.database.azure.com", port: 5432,
      database, user: "sunsum_migrator", authentication: "azure-cli", sslMode: "verify-full",
      statementTimeoutMs: 5000, approvalReference: "review-123", migrationsSha256: migrationDigest(join(root, "src/backend/db/migrations")),
    };
    const text = JSON.stringify(record);
    try {
      writeFileSync(path, text);
      const result = run([...operatorArgs, "scripts/db-migrate.ts", "--apply", "--approval", path, "--expected-sha256", createHash("sha256").update(text).digest("hex")], {
        SUNSUM_DATABASE_AUTH: "azure-cli", PGHOST: record.host, PGPORT: "5432", PGDATABASE: database,
        PGUSER: record.user, PGSSLMODE: "verify-full", SUNSUM_MIGRATION_STATEMENT_TIMEOUT_MS: "5000",
      });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Azure migrations require PGDATABASE to be a nonreserved application database");
      expect(result.stdout).not.toContain("applied");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it.each(["a", "sunsum", "sunsum_prod", "app123", "a".repeat(63)])("preserves supported migration database %s", (database) => {
    const result = run([...operatorArgs, "scripts/db-migrate.ts", "--apply"], {
      SUNSUM_DATABASE_AUTH: "azure-cli", PGHOST: "example-sunsum.postgres.database.azure.com", PGPORT: "5432",
      PGDATABASE: database, PGUSER: "sunsum_migrator", PGSSLMODE: "verify-full", SUNSUM_MIGRATION_STATEMENT_TIMEOUT_MS: "5000",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("requires a reviewed --approval");
    expect(result.stderr).not.toContain("require PGDATABASE");
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
