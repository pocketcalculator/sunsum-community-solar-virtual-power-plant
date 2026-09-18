import { readDatabaseConfig } from "../src/backend/infrastructure/database/config";
import { databaseFailureMessage } from "../src/backend/infrastructure/database/errors";

try {
  const environment = { ...process.env };
  readDatabaseConfig(environment, { allowOperatorIdentity: true });
  const { createDatabase, checkDatabase } = await import("../src/backend/infrastructure/database");
  const database = createDatabase(environment, { allowOperatorIdentity: true });
  try {
    await checkDatabase(database);
    console.log("PostgreSQL connectivity verified through Drizzle (SELECT 1). No data was saved.");
  } finally {
    await database.close();
  }
} catch (error) {
  console.error(`Database check failed: ${databaseFailureMessage(error)}`);
  process.exitCode = 1;
}
