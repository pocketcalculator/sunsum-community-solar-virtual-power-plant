import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { NodePgSession } from "drizzle-orm/node-postgres";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Pool } from "pg";
import { DatabaseConfigurationError } from "../src/backend/infrastructure/database/errors";

const captureFiles = (folder: string) => {
  try {
    const journalBytes = readFileSync(join(folder, "meta/_journal.json"));
    const journal = JSON.parse(journalBytes.toString("utf8")) as { dialect?: unknown; entries?: unknown };
    if (!journal || journal.dialect !== "postgresql" || !Array.isArray(journal.entries)) {
      throw new DatabaseConfigurationError("Expected a PostgreSQL migration journal.");
    }
    const files = [{ name: "meta/_journal.json", bytes: journalBytes }];
    const names = new Set<string>();
    let previousTimestamp = -1;
    for (const entry of journal.entries) {
      if (!entry || typeof entry.tag !== "string" || !/^[a-z0-9_-]+$/iu.test(entry.tag) ||
          names.has(entry.tag.toLowerCase()) || !Number.isSafeInteger(entry.when) ||
          entry.when <= previousTimestamp || typeof entry.breakpoints !== "boolean") {
        throw new DatabaseConfigurationError("Migration journal entries must have unique safe names and increasing timestamps.");
      }
      names.add(entry.tag.toLowerCase());
      previousTimestamp = entry.when;
      const name = `${entry.tag}.sql`;
      files.push({ name, bytes: readFileSync(join(folder, name)) });
    }
    const manifest = files.map(({ name, bytes }) => [name, createHash("sha256").update(bytes).digest("hex")]);
    const sha256 = createHash("sha256").update(JSON.stringify(manifest), "utf8").digest("hex");
    return { files, sha256 };
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) throw error;
    throw new DatabaseConfigurationError("Cannot read the migration journal or its SQL files. Check the reviewed migration bundle.");
  }
};

export const migrationDigest = (folder: string): string => captureFiles(resolve(folder)).sha256;

export const captureMigrationSnapshot = (folder: string, expectedSha256: string) => {
  if (!/^[a-f0-9]{64}$/iu.test(expectedSha256)) {
    throw new DatabaseConfigurationError("A reviewed migrationsSha256 digest is required.");
  }
  const source = resolve(folder);
  const captured = captureFiles(source);
  const verifyDigest = (actual: string) => {
    if (actual !== expectedSha256.toLowerCase()) {
      throw new DatabaseConfigurationError("Migration journal or SQL no longer matches the reviewed migrationsSha256.");
    }
  };
  verifyDigest(captured.sha256);
  const directory = mkdtempSync(join(tmpdir(), "sunsum-migration-snapshot-"));
  const migrations = (() => {
    try {
      mkdirSync(join(directory, "meta"));
      for (const file of captured.files) {
        writeFileSync(join(directory, file.name), file.bytes, { flag: "wx", mode: 0o600 });
      }
      const parsed = readMigrationFiles({ migrationsFolder: directory });
      verifyDigest(migrationDigest(directory));
      for (const migration of parsed) {
        Object.freeze(migration.sql);
        Object.freeze(migration);
      }
      return Object.freeze(parsed);
    } catch (error) {
      if (error instanceof DatabaseConfigurationError) throw error;
      throw new DatabaseConfigurationError("Cannot parse the verified migration snapshot.");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  })();
  const verifyUnchanged = () => { verifyDigest(migrationDigest(source)); };
  return Object.freeze({
    count: migrations.length,
    verifyUnchanged,
    migrate: async (pool: Pool) => {
      verifyUnchanged();
      const dialect = new PgDialect();
      const session = new NodePgSession<Record<string, never>, Record<string, never>>(pool, dialect, undefined);
      await dialect.migrate([...migrations], session, { migrationsFolder: source, migrationsSchema: "drizzle" });
    },
  });
};