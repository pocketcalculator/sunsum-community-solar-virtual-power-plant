import "server-only";
import { sql } from "drizzle-orm";
import { DatabaseConfigurationError } from "./errors";
import type { DatabaseDependencies } from "./pool";

export const assertMigrationPermission = async (
  database: Pick<DatabaseDependencies, "db">,
): Promise<void> => {
  const result = await database.db.execute<{ can_create: boolean }>(sql`
    select pg_catalog.has_database_privilege(current_user, current_database(), 'CREATE') as can_create
  `);
  if (result.rows.length !== 1 || result.rows[0]?.can_create !== true) {
    throw new DatabaseConfigurationError(
      "Drizzle migrations require an explicitly approved temporary CREATE ON DATABASE grant for the operator. Revoke and verify it after the migration window; never grant it to runtime.",
    );
  }
};
