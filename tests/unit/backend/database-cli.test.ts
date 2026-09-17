// @vitest-environment node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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
