// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { assertMigrationPermission } from "@/backend/infrastructure/database/migration-permissions";
import { createDatabase } from "@/backend/infrastructure/database/pool";

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

describe("migration permission preflight", () => {
  it.each([true, false])("requires operator database CREATE: %s", async (canCreate) => {
    const database = createDatabase(local);
    const execute = vi.spyOn(database.db, "execute").mockResolvedValue({
      rows: [{ can_create: canCreate }],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });
    try {
      if (canCreate) {
        await expect(assertMigrationPermission(database)).resolves.toBeUndefined();
      } else {
        await expect(assertMigrationPermission(database)).rejects.toThrow(
          "temporary CREATE ON DATABASE",
        );
      }
      expect(execute).toHaveBeenCalledOnce();
    } finally {
      await database.close();
    }
  });
});
