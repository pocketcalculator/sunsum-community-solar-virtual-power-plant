import { fileURLToPath } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";
import {
  DatabaseConfigurationError,
  databaseFailureMessage,
} from "../src/backend/infrastructure/database/errors";
import { readDatabaseConfig } from "../src/backend/infrastructure/database/config";

const migrationsFolder = fileURLToPath(
  new URL("../src/backend/db/migrations", import.meta.url),
);

try {
  if (process.argv.slice(2).join(" ") !== "--apply") {
    throw new DatabaseConfigurationError("Migration execution requires exactly --apply after reviewing the generated SQL.");
  }
  const environment = { ...process.env };
  const config = readDatabaseConfig(environment, { allowOperatorIdentity: true });
  if (config.auth.mode === "managed-identity") {
    throw new DatabaseConfigurationError("Runtime managed identity cannot run migrations. Use the separately granted operator identity.");
  }
  if (config.auth.mode !== "azure-cli") {
    throw new DatabaseConfigurationError("Azure migrations require azure-cli authentication. Use db:migrate for local password databases.");
  }
  const migrations = readMigrationFiles({ migrationsFolder });
  if (migrations.length === 0) {
    console.log("No versioned SQL migrations are present; nothing was applied.");
  } else {
    const [{ createDatabase, assertMigrationPermission }, { migrate }] = await Promise.all([
      import("../src/backend/infrastructure/database"),
      import("drizzle-orm/node-postgres/migrator"),
    ]);
    const database = createDatabase(environment, { allowOperatorIdentity: true });
    try {
      await assertMigrationPermission(database);
      await migrate(database.db, { migrationsFolder, migrationsSchema: "drizzle" });
      console.log("Reviewed database migrations applied. Application rollback does not roll back the database.");
    } finally {
      await database.close();
    }
  }
} catch (error) {
  console.error(`Database migration failed: ${databaseFailureMessage(error)}`);
  process.exitCode = 1;
}
