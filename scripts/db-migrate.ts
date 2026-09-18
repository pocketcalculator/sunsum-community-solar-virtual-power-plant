import { fileURLToPath } from "node:url";
import {
  DatabaseConfigurationError,
  databaseFailureMessage,
} from "../src/backend/infrastructure/database/errors";
import { readDatabaseConfig } from "../src/backend/infrastructure/database/config";
import { readMigrationApproval } from "./migration-approval";
import { captureMigrationSnapshot, migrationDigest } from "./migration-snapshot";

const migrationsFolder = fileURLToPath(
  new URL("../src/backend/db/migrations", import.meta.url),
);

const main = async () => {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--print-digest") {
    console.log(migrationDigest(migrationsFolder));
    return;
  }
  if (args[0] !== "--apply" || (args.length !== 1 &&
      (args.length !== 5 || args[1] !== "--approval" || !args[2] || args[3] !== "--expected-sha256" || !args[4]))) {
    throw new DatabaseConfigurationError("Migration execution requires exactly --apply --approval <local-json> --expected-sha256 <reviewed-hash> after reviewing the target and generated SQL.");
  }
  const environment = { ...process.env };
  const config = readDatabaseConfig(environment, { allowOperatorIdentity: true });
  if (config.auth.mode === "managed-identity") {
    throw new DatabaseConfigurationError("Runtime managed identity cannot run migrations. Use the separately granted operator identity.");
  }
  if (config.auth.mode !== "azure-cli") {
    throw new DatabaseConfigurationError("Azure migrations require azure-cli authentication. Use db:migrate for local password databases.");
  }
  if (config.user !== "sunsum_migrator") {
    throw new DatabaseConfigurationError("Azure migrations require PGUSER=sunsum_migrator, the separately approved operator role; bootstrap administrators and other roles are not permitted.");
  }
  const timeoutText = environment.SUNSUM_MIGRATION_STATEMENT_TIMEOUT_MS ?? "5000";
  const migrationStatementTimeoutMs = Number(timeoutText);
  if (!/^[1-9][0-9]*$/.test(timeoutText) || !Number.isSafeInteger(migrationStatementTimeoutMs) ||
      migrationStatementTimeoutMs < 5_000 || migrationStatementTimeoutMs > 600_000) {
    throw new DatabaseConfigurationError("SUNSUM_MIGRATION_STATEMENT_TIMEOUT_MS must be an integer from 5000 to 600000.");
  }
  const approvalPath = args[2];
  const approvalSha256 = args[4];
  if (args.length !== 5 || !approvalPath || !approvalSha256) {
    throw new DatabaseConfigurationError("Migration execution requires a reviewed --approval file and --expected-sha256 before connecting.");
  }
  const approval = readMigrationApproval(approvalPath, approvalSha256, config, migrationStatementTimeoutMs);
  const snapshot = captureMigrationSnapshot(migrationsFolder, approval.migrationsSha256);
  if (snapshot.count === 0) {
    console.log("No versioned SQL migrations are present; nothing was applied.");
  } else {
    const { createDatabase, assertMigrationPermission } = await import("../src/backend/infrastructure/database");
    approval.verifyUnchanged();
    snapshot.verifyUnchanged();
    const database = createDatabase(environment, { allowOperatorIdentity: true, migrationStatementTimeoutMs });
    try {
      await assertMigrationPermission(database);
      approval.verifyUnchanged();
      await snapshot.migrate(database.pool);
      console.log("Reviewed database migrations applied. Application rollback does not roll back the database.");
    } finally {
      await database.close();
    }
  }
};

main().catch((error) => {
  console.error(`Database migration failed: ${databaseFailureMessage(error)}`);
  process.exitCode = 1;
});
