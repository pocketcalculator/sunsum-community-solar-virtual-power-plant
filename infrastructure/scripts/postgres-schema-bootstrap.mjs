import { BootstrapSafetyError, inTransaction } from "./postgres-bootstrap-config.mjs";

export const bootstrapSchemas = async (client, config, quoteIdentifier) => inTransaction(client, async () => {
  const context = (await client.query("SELECT current_database() AS database, current_user AS role")).rows[0];
  if (context.database !== config.database || context.role !== config.administratorRole) {
    throw new BootstrapSafetyError("Schema bootstrap is connected to the wrong database or administrator.");
  }
  const { rows: owners } = await client.query(
    `SELECT 1 FROM pg_catalog.pg_database
       WHERE datname = current_database() AND pg_catalog.pg_get_userbyid(datdba) = ANY($1::text[])
     UNION ALL
     SELECT 1 FROM pg_catalog.pg_namespace WHERE pg_catalog.pg_get_userbyid(nspowner) = $2
     UNION ALL
     SELECT 1 FROM pg_catalog.pg_namespace
       WHERE nspname = 'public' AND pg_catalog.pg_get_userbyid(nspowner) = ANY($1::text[])
     UNION ALL
     SELECT 1 FROM pg_catalog.pg_class WHERE pg_catalog.pg_get_userbyid(relowner) = $2`,
    [[config.runtimeRole, config.operatorRole], config.runtimeRole],
  );
  if (owners.length !== 0) {
    throw new BootstrapSafetyError("Runtime owns database objects, or runtime/operator owns the database or public schema; review privileges manually.");
  }
  const { rows: publicGrants } = await client.query(
    `SELECT 1 FROM pg_catalog.pg_database AS database,
       LATERAL pg_catalog.aclexplode(COALESCE(database.datacl, pg_catalog.acldefault('d', database.datdba))) AS acl
       WHERE database.datname = current_database() AND acl.grantee = 0
     UNION ALL
     SELECT 1 FROM pg_catalog.pg_namespace AS schema,
       LATERAL pg_catalog.aclexplode(COALESCE(schema.nspacl, pg_catalog.acldefault('n', schema.nspowner))) AS acl
       WHERE schema.nspname IN ('public', 'drizzle') AND acl.grantee = 0`,
  );
  if (publicGrants.length !== 0) {
    throw new BootstrapSafetyError("PUBLIC privileges require a separately reviewed ACL transition preserving existing access. Bootstrap will not revoke them.");
  }
  const { rows: unsafeRuntimeAccess } = await client.query(
    `SELECT 1 FROM pg_catalog.pg_namespace
       WHERE (nspname = 'drizzle' AND pg_catalog.has_schema_privilege($1, oid, 'USAGE,CREATE'))
          OR (nspname = 'public' AND pg_catalog.has_schema_privilege($1, oid, 'CREATE'))`,
    [config.runtimeRole],
  );
  if (unsafeRuntimeAccess.length !== 0) {
    throw new BootstrapSafetyError("Runtime has metadata access or application schema CREATE; review privileges manually. Bootstrap will not revoke existing grants.");
  }
  const database = quoteIdentifier(config.database);
  const runtime = quoteIdentifier(config.runtimeRole);
  const operator = quoteIdentifier(config.operatorRole);
  const administrator = quoteIdentifier(config.administratorRole);
  const schemasToCreate = [];
  for (const schema of ["drizzle"]) {
    const { rows } = await client.query(
      "SELECT pg_catalog.pg_get_userbyid(nspowner) AS owner FROM pg_catalog.pg_namespace WHERE nspname = $1",
      [schema],
    );
    if (rows.length && rows[0].owner !== config.operatorRole) {
      throw new BootstrapSafetyError("An application/metadata schema has a different owner; bootstrap will not take it over.");
    }
    if (!rows.length) schemasToCreate.push(schema);
  }
  const { rows: membership } = await client.query(
    `SELECT pg_catalog.pg_has_role(current_user, $1, 'SET') AS allowed,
       EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members
         WHERE roleid = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = $1)
           AND member = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)) AS direct`,
    [config.operatorRole],
  );
  const temporaryMembership = !membership[0].allowed;
  if (temporaryMembership && membership[0].direct) {
    throw new BootstrapSafetyError("Existing operator membership forbids SET ROLE; review it rather than changing its options.");
  }
  if (temporaryMembership) await client.query(`GRANT ${operator} TO ${administrator}`);
  for (const schema of schemasToCreate) {
    await client.query(`CREATE SCHEMA ${quoteIdentifier(schema)} AUTHORIZATION ${operator}`);
  }
  await client.query(`GRANT CONNECT ON DATABASE ${database} TO ${runtime}, ${operator}`);

  for (const role of [config.runtimeRole, config.operatorRole]) {
    const { rows } = await client.query(
      `SELECT pg_catalog.has_database_privilege($1, current_database(), 'CONNECT') AS connect,
         pg_catalog.has_database_privilege($1, current_database(), 'CREATE') AS create,
         pg_catalog.has_database_privilege($1, current_database(), 'TEMPORARY') AS temporary`,
      [role],
    );
    if (!rows[0].connect || rows[0].create || rows[0].temporary) {
      throw new BootstrapSafetyError("Effective database privileges do not match the CONNECT-only foundation contract.");
    }
  }
  if (temporaryMembership) await client.query(`REVOKE ${operator} FROM ${administrator}`);
});
