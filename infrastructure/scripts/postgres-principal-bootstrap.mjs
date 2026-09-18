import { BootstrapSafetyError, inTransaction } from "./postgres-bootstrap-config.mjs";

const normalize = (row) => Object.fromEntries(
  Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]),
);

export const assertPrincipalMapping = (rows, expected, tenantId) => {
  const mappings = rows.map(normalize).filter((row) => row.rolename === expected.role);
  const value = mappings[0];
  if (mappings.length !== 1 ||
      String(value.objectid).toLowerCase() !== expected.objectId ||
      String(value.tenantid).toLowerCase() !== tenantId ||
      value.principaltype !== expected.type || value.isadmin !== 0 || value.ismfa !== 0) {
    throw new BootstrapSafetyError("An existing role has a missing, ambiguous, privileged or different Entra mapping. No role will be adopted or relabeled.");
  }
};

const listPrincipals = async (client) => (
  await client.query("SELECT * FROM pg_catalog.pgaadauth_list_principals(false)")
).rows;

const assertUnprivilegedRole = async (client, role) => {
  const { rows } = await client.query(
    `SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls,
       EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member = r.oid) AS has_memberships
     FROM pg_catalog.pg_roles r WHERE rolname = $1`,
    [role],
  );
  const current = rows[0];
  if (rows.length !== 1 || !current.rolcanlogin ||
      current.rolsuper || current.rolcreatedb || current.rolcreaterole ||
      current.rolreplication || current.rolbypassrls || current.has_memberships) {
    throw new BootstrapSafetyError("Runtime/operator role has unexpected privileged attributes or memberships.");
  }
};

export const bootstrapPrincipals = async (client, config) => inTransaction(client, async () => {
  const context = (await client.query("SELECT current_database() AS database, current_user AS role")).rows[0];
  if (context.database !== "postgres" || context.role !== config.administratorRole) {
    throw new BootstrapSafetyError("Entra role bootstrap must connect to postgres as the explicitly selected administrator.");
  }
  let principals = await listPrincipals(client);
  const admins = principals.map(normalize).filter((row) => row.rolename === config.administratorRole);
  if (admins.length !== 1 || admins[0].isadmin !== 1 ||
      String(admins[0].objectid).toLowerCase() !== config.administratorObjectId ||
      String(admins[0].tenantid).toLowerCase() !== config.tenantId) {
    throw new BootstrapSafetyError("The connected administrator does not match the approved Entra mapping.");
  }
  for (const expected of [
    { role: config.runtimeRole, objectId: config.runtimeObjectId, type: "service" },
    { role: config.operatorRole, objectId: config.operatorObjectId, type: config.operatorPrincipalType },
  ]) {
    if (principals.map(normalize).some((row) =>
      String(row.objectid).toLowerCase() === expected.objectId &&
      (row.isadmin !== 0 || row.rolename !== expected.role))) {
      throw new BootstrapSafetyError("A runtime/operator object already has a privileged or different SQL role mapping.");
    }
    const existing = await client.query("SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = $1", [expected.role]);
    if (existing.rows.length === 0) {
      await client.query(
        "SELECT * FROM pg_catalog.pgaadauth_create_principal_with_oid($1::text, $2::text, $3::text, false, false)",
        [expected.role, expected.objectId, expected.type],
      );
      principals = await listPrincipals(client);
    }
    assertPrincipalMapping(principals, expected, config.tenantId);
    await assertUnprivilegedRole(client, expected.role);
  }
});
