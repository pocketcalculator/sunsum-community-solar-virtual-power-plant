import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DatabaseConfig } from "../src/backend/infrastructure/database/config";
import { DatabaseConfigurationError } from "../src/backend/infrastructure/database/errors";

export const readMigrationApproval = (
  path: string,
  expectedSha256: string,
  config: DatabaseConfig,
  statementTimeoutMs: number,
) => {
  if (!/^[a-f0-9]{64}$/iu.test(expectedSha256)) {
    throw new DatabaseConfigurationError("A review-supplied migration approval SHA-256 is required.");
  }
  const resolved = resolve(path);
  const verifiedBytes = () => {
    try {
      const bytes = readFileSync(resolved);
      if (createHash("sha256").update(bytes).digest("hex") !== expectedSha256.toLowerCase()) {
        throw new DatabaseConfigurationError("Migration approval no longer matches its reviewed SHA-256.");
      }
      return bytes;
    } catch (error) {
      if (error instanceof DatabaseConfigurationError) throw error;
      throw new DatabaseConfigurationError("Cannot read the migration approval file. Check --approval points to an existing readable file.");
    }
  };
  const bytes = verifiedBytes();
  let input: unknown;
  try {
    input = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/u, ""));
  } catch {
    throw new DatabaseConfigurationError("Migration approval file is not valid JSON. Correct the file and obtain a new reviewed SHA-256.");
  }
  const expected = {
    operation: "DatabaseMigration",
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    authentication: config.auth.mode,
    sslMode: config.sslMode,
    statementTimeoutMs,
  };
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).length !== Object.keys(expected).length + 2) {
    throw new DatabaseConfigurationError("Migration approval must contain exactly the documented fields.");
  }
  const record = input as Record<string, unknown>;
  if (typeof record.migrationsSha256 !== "string" || !/^[a-f0-9]{64}$/iu.test(record.migrationsSha256)) {
    throw new DatabaseConfigurationError("A reviewed migrationsSha256 digest is required in migration approval.");
  }
  if (typeof record.approvalReference !== "string" || !record.approvalReference.trim() ||
      record.approvalReference.length > 200 || /[<>\u0000-\u001f\u007f]/u.test(record.approvalReference)) {
    throw new DatabaseConfigurationError("A migration review reference is required.");
  }
  for (const [key, value] of Object.entries(expected)) {
    if (record[key] !== value) {
      throw new DatabaseConfigurationError(`Migration approval does not match the configured target (${key}).`);
    }
  }
  return Object.freeze({ migrationsSha256: record.migrationsSha256, verifyUnchanged: () => { verifiedBytes(); } });
};