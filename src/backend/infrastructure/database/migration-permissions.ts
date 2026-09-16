import "server-only";
import { sql } from "drizzle-orm";
import { DatabaseConfigurationError } from "./errors";
import type { DatabaseDependencies } from "./pool";

export const assertMigrationPermission = async (
  database: Pick<DatabaseDependencies, "db">,
): Promise<void> => {
  const result = await database.db.execute<{ can_create: boolean }>(sql`
    select (
      pg_catalog.has_database_privilege(current_user, current_database(), 'CREATE')
      and pg_catalog.has_schema_privilege(current_user, 'public', 'CREATE')
      and pg_catalog.has_schema_privilege(current_user, 'public', 'USAGE')
    ) as can_create
  `);
  if (result.rows.length !== 1 || result.rows[0]?.can_create !== true) {
    throw new DatabaseConfigurationError(
      "Drizzle migrations require an approved temporary CREATE ON DATABASE and USAGE, CREATE ON SCHEMA public grant for the operator. Revoke only grants added by this window and verify cleanup; never grant them to runtime.",
    );
  }
};
