import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import databaseNamePolicy from "./postgres-database-name-policy.json" with { type: "json" };

export class BootstrapSafetyError extends Error {}

export const readReviewedBootstrapConfig = async (path, expectedSha256) => {
  if (typeof expectedSha256 !== "string" || !/^[a-f0-9]{64}$/iu.test(expectedSha256)) {
    throw new BootstrapSafetyError("A review-supplied bootstrap SHA-256 is required.");
  }
  const resolved = resolve(path);
  const verifiedBytes = async () => {
    const bytes = await readFile(resolved);
    if (createHash("sha256").update(bytes).digest("hex") !== expectedSha256.toLowerCase()) {
      throw new BootstrapSafetyError("Bootstrap configuration no longer matches its reviewed SHA-256.");
    }
    return bytes;
  };
  const config = validateBootstrapConfig(JSON.parse((await verifiedBytes()).toString("utf8").replace(/^\uFEFF/u, "")));
  return Object.freeze({ config, verifyUnchanged: async () => { await verifiedBytes(); } });
};

export const requireBootstrapToken = (token, now = Date.now()) => {
  if (typeof token?.token !== "string" || !token.token.trim() ||
      !Number.isFinite(token.expiresOnTimestamp) || token.expiresOnTimestamp <= now + 60000) {
    throw new BootstrapSafetyError("The explicit Azure CLI credential returned no usable token.");
  }
  return token.token;
};

const requireText = (value, label, maxBytes = 63) => {
  if (typeof value !== "string" || !value.trim() || /[\u0000-\u001f\u007f]/u.test(value) ||
      Buffer.byteLength(value, "utf8") > maxBytes) {
    throw new BootstrapSafetyError(`Invalid ${label}.`);
  }
  return value;
};

const identifier = (value, label) => {
  requireText(value, label);
  if (!/^[a-z][a-z0-9_]*$/u.test(value) ||
      /^(pg_|azure_)/u.test(value) ||
      ["postgres", "public", "template0", "template1"].includes(value)) {
    throw new BootstrapSafetyError(`${label} must be a nonreserved lowercase SQL identifier.`);
  }
  return value;
};

const objectId = (value, label) => {
  if (typeof value !== "string" ||
      !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(value) ||
      value === "00000000-0000-0000-0000-000000000000") {
    throw new BootstrapSafetyError(`${label} must be a nonempty object/tenant UUID.`);
  }
  return value.toLowerCase();
};

export const validateBootstrapConfig = (input) => {
  const fields = [
    "host", "database", "tenantId", "administratorRole", "administratorObjectId",
    "runtimeRole", "runtimeObjectId", "operatorRole", "operatorObjectId",
    "operatorPrincipalType", "approvalReference",
  ];
  if (!input || Array.isArray(input) || typeof input !== "object" ||
      Object.keys(input).some((key) => !fields.includes(key))) {
    throw new BootstrapSafetyError("Only the documented bootstrap configuration fields are accepted.");
  }
  const host = requireText(input.host, "PostgreSQL host", 253);
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]\.postgres\.database\.azure\.com$/u.test(host)) {
    throw new BootstrapSafetyError("Bootstrap requires an Azure public-cloud PostgreSQL server FQDN.");
  }
  const result = {
    host,
    database: requireText(input.database, "Database name"),
    tenantId: objectId(input.tenantId, "Tenant"),
    administratorRole: requireText(input.administratorRole, "Administrator role"),
    administratorObjectId: objectId(input.administratorObjectId, "Administrator"),
    runtimeRole: identifier(input.runtimeRole ?? "sunsum_runtime", "Runtime role"),
    runtimeObjectId: objectId(input.runtimeObjectId, "Runtime"),
    operatorRole: identifier(input.operatorRole ?? "sunsum_migrator", "Operator role"),
    operatorObjectId: objectId(input.operatorObjectId, "Operator"),
    operatorPrincipalType: input.operatorPrincipalType ?? "user",
    approvalReference: requireText(input.approvalReference, "Approval reference", 200),
  };
  if (!new RegExp(databaseNamePolicy.pattern, "u").test(result.database) ||
      databaseNamePolicy.reservedNames.includes(result.database) ||
      databaseNamePolicy.reservedPrefixes.some((prefix) => result.database.startsWith(prefix))) {
    throw new BootstrapSafetyError("Database name must match the nonreserved lowercase application-database policy.");
  }
  if (result.runtimeRole !== "sunsum_runtime" || result.operatorRole !== "sunsum_migrator") {
    throw new BootstrapSafetyError("Bootstrap requires runtimeRole=sunsum_runtime and operatorRole=sunsum_migrator to match deployment and migration tooling.");
  }
  if (!["user", "group", "service"].includes(result.operatorPrincipalType) ||
      new Set([result.administratorRole, result.runtimeRole, result.operatorRole]).size !== 3 ||
      new Set([result.administratorObjectId, result.runtimeObjectId, result.operatorObjectId]).size !== 3) {
    throw new BootstrapSafetyError("Administrator, runtime and operator must be distinct principals and SQL roles.");
  }
  return Object.freeze(result);
};

export const inTransaction = async (client, action) => {
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_catalog.pg_advisory_xact_lock(7368656, 20260916)");
    await action();
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      throw new BootstrapSafetyError(
        "Bootstrap failed and rollback could not be confirmed. Inspect database state before retrying.",
        { cause: new AggregateError([error, rollbackError]) },
      );
    }
    throw error;
  }
};

export const withBootstrapClient = async (client, action, reportError) => {
  let connectionFailed = false;
  client.on("error", () => {
    connectionFailed = true;
    reportError("PostgreSQL bootstrap connection failed; completion cannot be confirmed.");
  });
  try {
    await client.connect();
    await action(client);
  } finally {
    await client.end();
  }
  if (connectionFailed) {
    throw new BootstrapSafetyError("Bootstrap connection failed; verify database state before retrying.");
  }
};
