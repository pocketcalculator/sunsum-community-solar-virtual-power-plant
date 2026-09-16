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
     SELECT 1 FROM pg_catalog.pg_class WHERE pg_catalog.pg_get_userbyid(relowner) = $2`,
    [[config.runtimeRole, config.operatorRole], config.runtimeRole],
  );
  if (owners.length !== 0) {
    throw new BootstrapSafetyError("Runtime owns database objects, or runtime/operator owns the database; review privileges manually.");
  }
  const database = quoteIdentifier(config.database);
  const runtime = quoteIdentifier(config.runtimeRole);
  const operator = quoteIdentifier(config.operatorRole);
  const administrator = quoteIdentifier(config.administratorRole);
  const schemasToCreate = [];
  for (const schema of ["sunsum", "drizzle"]) {
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
  await client.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC`);
  await client.query("REVOKE ALL ON SCHEMA public FROM PUBLIC");
  await client.query(`REVOKE ALL ON SCHEMA public FROM ${runtime}`);
  await client.query(`SET LOCAL ROLE ${operator}`);
  await client.query("REVOKE ALL ON SCHEMA sunsum, drizzle FROM PUBLIC");
  await client.query(`REVOKE ALL ON SCHEMA sunsum, drizzle FROM ${runtime}`);
  await client.query("RESET ROLE");
  await client.query(`REVOKE CREATE, TEMPORARY ON DATABASE ${database} FROM ${runtime}, ${operator}`);
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
