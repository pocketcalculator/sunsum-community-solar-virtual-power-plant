import "server-only";
import { sql } from "drizzle-orm";
import type { DatabaseDependencies } from "./pool";

export const checkDatabase = async (
  database: Pick<DatabaseDependencies, "db">,
): Promise<void> => {
  const result = await database.db.execute<{ ok: number }>(sql`select 1 as ok`);
  if (result.rows.length !== 1 || result.rows[0]?.ok !== 1) {
    throw new Error("PostgreSQL connectivity check returned an unexpected result.");
  }
};
