import { Buffer } from "node:buffer";

export class BootstrapSafetyError extends Error {}

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
    database: identifier(input.database, "Database name"),
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
