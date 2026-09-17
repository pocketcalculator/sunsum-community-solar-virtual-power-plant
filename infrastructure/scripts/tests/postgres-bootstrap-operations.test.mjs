import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { inTransaction, requireBootstrapToken, validateBootstrapConfig, withBootstrapClient } from "../postgres-bootstrap-config.mjs";
import { bootstrapPrincipals } from "../postgres-principal-bootstrap.mjs";
import { bootstrapSchemas } from "../postgres-schema-bootstrap.mjs";

const config = validateBootstrapConfig({
  host: "sample-postgres.postgres.database.azure.com",
  database: "sunsum",
  tenantId: "11111111-1111-4111-8111-111111111111",
  administratorRole: 'sample "admin"',
  administratorObjectId: "22222222-2222-4222-8222-222222222222",
  runtimeObjectId: "33333333-3333-4333-8333-333333333333",
  operatorObjectId: "44444444-4444-4444-8444-444444444444",
  approvalReference: "review-123",
});
const quote = (value) => `"${value.replaceAll('"', '""')}"`;
const principal = (role, objectId, type, isAdmin = 0) => ({
  rolename: role, objectid: objectId, principaltype: type,
  tenantid: config.tenantId, isadmin: isAdmin, ismfa: 0,
});

test("bootstrap token expiry must be finite and more than one minute away", () => {
  const now = 1000000;
  for (const expiresOnTimestamp of [undefined, NaN, Infinity, -Infinity, "2000000", now - 1, now + 60000]) {
    assert.throws(() => requireBootstrapToken({ token: "synthetic-token", expiresOnTimestamp }, now), /no usable token/u);
  }
  for (const token of [null, undefined, { token: "", expiresOnTimestamp: now + 60001 }]) {
    assert.throws(() => requireBootstrapToken(token, now), /no usable token/u);
  }
  assert.equal(requireBootstrapToken({ token: "synthetic-token", expiresOnTimestamp: now + 60001 }, now), "synthetic-token");
});

const principalClient = (additional = []) => {
  const queries = [];
  const principals = [
    principal(config.administratorRole, config.administratorObjectId, "group", 1),
    ...additional,
  ];
  return {
    queries,
    query: async (sql, values = []) => {
      queries.push([sql, values]);
      if (sql.startsWith("SELECT current_database")) {
        return { rows: [{ database: "postgres", role: config.administratorRole }] };
      }
      if (sql.includes("pgaadauth_list_principals")) return { rows: principals };
      if (sql.startsWith("SELECT 1 FROM pg_catalog.pg_roles")) {
        return { rows: principals.filter((row) => row.rolename === values[0]) };
      }
      if (sql.includes("pgaadauth_create_principal_with_oid")) {
        principals.push(principal(values[0], values[1], values[2]));
      }
      if (sql.includes("SELECT rolcanlogin")) {
        return { rows: [{
          rolcanlogin: true, rolsuper: false, rolcreatedb: false, rolcreaterole: false,
          rolreplication: false, rolbypassrls: false, has_memberships: false,
        }] };
      }
      return { rows: [] };
    },
  };
};

test("OID creation is parameterized, nonadmin and idempotent", async () => {
  const client = principalClient();
  await bootstrapPrincipals(client, config);
  await bootstrapPrincipals(client, config);
  const creates = client.queries.filter(([sql]) => sql.includes("pgaadauth_create_principal_with_oid"));
  assert.equal(creates.length, 2);
  assert.ok(creates.every(([sql]) => sql.endsWith("false, false)")));
  assert.deepEqual(creates[0][1], [config.runtimeRole, config.runtimeObjectId, "service"]);
  assert.equal(client.queries.filter(([sql]) => sql === "COMMIT").length, 2);
  assert.ok(!client.queries.some(([sql]) => /SECURITY LABEL|ALTER ROLE/u.test(sql)));
});

test("an existing wrong OID rolls back instead of being relabeled", async () => {
  const client = principalClient([principal(config.runtimeRole, config.operatorObjectId, "service")]);
  await assert.rejects(bootstrapPrincipals(client, config), /mapping/u);
  assert.equal(client.queries.at(-1)[0], "ROLLBACK");
  assert.ok(!client.queries.some(([sql]) => sql.includes("pgaadauth_create_principal_with_oid")));
});

test("another role for the same runtime identity requires review", async () => {
  const client = principalClient([principal("other_runtime", config.runtimeObjectId, "service")]);
  await assert.rejects(bootstrapPrincipals(client, config), /different SQL role mapping/u);
  assert.equal(client.queries.at(-1)[0], "ROLLBACK");
});

const schemaClient = (owner, { publicGrants = [], unsafeRuntimeAccess = [], elevated = false } = {}) => {
  const queries = [];
  return {
    queries,
    query: async (sql) => {
      queries.push(sql);
      if (sql.startsWith("SELECT current_database")) {
        return { rows: [{ database: config.database, role: config.administratorRole }] };
      }
      if (sql.includes("aclexplode")) return { rows: publicGrants };
      if (sql.includes("has_schema_privilege")) return { rows: unsafeRuntimeAccess };
      if (sql.includes("AS owner FROM")) return { rows: owner ? [{ owner }] : [] };
      if (sql.includes("pg_has_role")) return { rows: [{ allowed: false, direct: false }] };
      if (sql.includes("has_database_privilege")) {
        return { rows: [{ connect: true, create: elevated, temporary: false }] };
      }
      return { rows: [] };
    },
  };
};

test("schema setup quotes identifiers and grants no broad runtime privileges", async () => {
  const client = schemaClient();
  await bootstrapSchemas(client, config, quote);
  assert.ok(client.queries.includes('GRANT "sunsum_migrator" TO "sample ""admin"""'));
  assert.ok(client.queries.includes('REVOKE "sunsum_migrator" FROM "sample ""admin"""'));
  assert.ok(!client.queries.includes('CREATE SCHEMA "sunsum" AUTHORIZATION "sunsum_migrator"'));
  assert.ok(client.queries.includes('CREATE SCHEMA "drizzle" AUTHORIZATION "sunsum_migrator"'));
  assert.ok(client.queries.includes('GRANT CONNECT ON DATABASE "sunsum" TO "sunsum_runtime", "sunsum_migrator"'));
  assert.ok(!client.queries.some((sql) => /CREATE TABLE|DEFAULT PRIVILEGES|GRANT (ALL|CREATE)|TO "sunsum_runtime"$/u.test(sql)));
  assert.equal(client.queries.at(-1), "COMMIT");
});

test("matching existing schemas are not recreated", async () => {
  const client = schemaClient(config.operatorRole);
  await bootstrapSchemas(client, config, quote);
  await bootstrapSchemas(client, config, quote);
  assert.ok(!client.queries.some((sql) => sql.startsWith("CREATE SCHEMA")));
  assert.ok(!client.queries.some((sql) => /^REVOKE .* ON /u.test(sql)));
  assert.equal(client.queries.filter((sql) => sql === "COMMIT").length, 2);
  assert.equal(client.queries.at(-1), "COMMIT");
});

test("PUBLIC grants stop bootstrap without changing other roles' access", async () => {
  const publicGrants = [{ privilege_type: "CONNECT" }, { privilege_type: "USAGE" }];
  const client = schemaClient(config.operatorRole, { publicGrants });
  await assert.rejects(bootstrapSchemas(client, config, quote), /separately reviewed ACL transition/u);
  assert.ok(!client.queries.some((sql) => /^(GRANT|REVOKE|CREATE)/u.test(sql)));
  assert.deepEqual(publicGrants, [{ privilege_type: "CONNECT" }, { privilege_type: "USAGE" }]);
  assert.equal(client.queries.at(-1), "ROLLBACK");
});

test("excessive existing privileges require review rather than automatic revocation", async () => {
  for (const options of [{ unsafeRuntimeAccess: [{}] }, { elevated: true }]) {
    const client = schemaClient(config.operatorRole, options);
    await assert.rejects(bootstrapSchemas(client, config, quote), /privileges|metadata access/u);
    assert.ok(!client.queries.some((sql) => /^REVOKE .* ON /u.test(sql)));
    assert.equal(client.queries.at(-1), "ROLLBACK");
  }
});

test("wrong schema ownership rolls back before changing any grants", async () => {
  const client = schemaClient("other_owner");
  await assert.rejects(bootstrapSchemas(client, config, quote), /different owner/u);
  assert.ok(!client.queries.some((sql) => /^(GRANT|REVOKE|CREATE)/u.test(sql)));
  assert.equal(client.queries.at(-1), "ROLLBACK");
});

test("rollback failure is explicit rather than silently discarded", async () => {
  const client = {
    query: async (sql) => {
      if (sql === "ROLLBACK") throw new Error("private-driver-detail");
      return { rows: [] };
    },
  };
  await assert.rejects(
    inTransaction(client, async () => { throw new Error("private-query-detail"); }),
    (error) => /rollback could not be confirmed/u.test(error.message) &&
      !error.message.includes("private"),
  );
});

test("idle connection error is sanitized, closed and cannot report completion", async () => {
  const client = new EventEmitter();
  let closed = false;
  client.connect = async () => {};
  client.end = async () => { closed = true; };
  const logs = [];
  await assert.rejects(
    withBootstrapClient(client, async () => {
      client.emit("error", new Error("synthetic-private-credential"));
    }, (message) => logs.push(message)),
    /Bootstrap connection failed/u,
  );
  assert.equal(closed, true);
  assert.equal(logs.length, 1);
  assert.ok(!logs[0].includes("synthetic-private"));
});

test("PostgreSQL preserves unrelated ACLs and application grants across bootstrap reruns", {
  skip: !process.env.SUNSUM_BOOTSTRAP_TEST_PORT,
}, async () => {
  const port = Number(process.env.SUNSUM_BOOTSTRAP_TEST_PORT);
  assert.ok(Number.isInteger(port) && port > 0 && port <= 65535);
  const { Client } = await import("pg");
  const suffix = randomUUID().replaceAll("-", "");
  const database = `bootstrap_${suffix}`;
  const runtimeRole = `runtime_${suffix}`;
  const operatorRole = `operator_${suffix}`;
  const unrelatedRole = `unrelated_${suffix}`;
  const connection = {
    host: "127.0.0.1", port, user: "postgres", password: "synthetic-bootstrap-test-only",
    connectionTimeoutMillis: 5000, query_timeout: 5000,
  };
  const administrator = new Client({ ...connection, database: "postgres" });
  const application = new Client({ ...connection, database });
  const createdRoles = [];
  let databaseCreated = false;
  await administrator.connect();
  try {
    await administrator.query(`CREATE DATABASE ${quote(database)}`);
    databaseCreated = true;
    for (const role of [runtimeRole, operatorRole, unrelatedRole]) {
      await administrator.query(`CREATE ROLE ${quote(role)} LOGIN`);
      createdRoles.push(role);
    }
    await application.connect();
    const localConfig = { ...config, database, administratorRole: "postgres", runtimeRole, operatorRole };
    const aclSnapshot = async () => (await application.query(
      `SELECT datacl::text AS acl FROM pg_database WHERE datname = current_database()
       UNION ALL SELECT nspacl::text FROM pg_namespace WHERE nspname = 'public'`,
    )).rows;
    const before = await aclSnapshot();
    await assert.rejects(bootstrapSchemas(application, localConfig, quote), /ACL transition/u);
    assert.deepEqual(await aclSnapshot(), before);
    const unrelatedAccess = async () => (await application.query(
      "SELECT has_database_privilege($1, current_database(), 'CONNECT') AS connect, has_schema_privilege($1, 'public', 'USAGE') AS usage",
      [unrelatedRole],
    )).rows[0];
    assert.deepEqual(await unrelatedAccess(), { connect: true, usage: true });
    await application.query(`GRANT CONNECT ON DATABASE ${quote(database)} TO ${quote(unrelatedRole)}`);
    await application.query(`GRANT USAGE ON SCHEMA public TO ${quote(unrelatedRole)}, ${quote(runtimeRole)}`);
    await application.query(`REVOKE ALL ON DATABASE ${quote(database)} FROM PUBLIC`);
    await application.query("REVOKE ALL ON SCHEMA public FROM PUBLIC");
    await application.query("CREATE TABLE public.fixture (value integer)");
    await application.query(`GRANT SELECT ON public.fixture TO ${quote(runtimeRole)}, ${quote(unrelatedRole)}`);
    await bootstrapSchemas(application, localConfig, quote);
    const initialized = await aclSnapshot();
    await bootstrapSchemas(application, localConfig, quote);
    assert.deepEqual(await aclSnapshot(), initialized);
    assert.deepEqual(await unrelatedAccess(), { connect: true, usage: true });
    const access = (await application.query(
      "SELECT has_schema_privilege($1, 'public', 'USAGE') AS usage, has_table_privilege($1, 'public.fixture', 'SELECT') AS read, has_schema_privilege($1, 'drizzle', 'USAGE') AS metadata",
      [runtimeRole],
    )).rows[0];
    assert.deepEqual(access, { usage: true, read: true, metadata: false });
    await application.query(`GRANT CREATE ON SCHEMA public TO ${quote(runtimeRole)}`);
    const unsafeSchema = await aclSnapshot();
    await assert.rejects(bootstrapSchemas(application, localConfig, quote), /application schema CREATE/u);
    assert.deepEqual(await aclSnapshot(), unsafeSchema);
    await application.query(`REVOKE CREATE ON SCHEMA public FROM ${quote(runtimeRole)}`);
    await application.query(`GRANT TEMPORARY ON DATABASE ${quote(database)} TO ${quote(runtimeRole)}`);
    const elevated = await aclSnapshot();
    await assert.rejects(bootstrapSchemas(application, localConfig, quote), /CONNECT-only/u);
    assert.deepEqual(await aclSnapshot(), elevated);
  } finally {
    await application.end();
    try {
      if (databaseCreated) await administrator.query(`DROP DATABASE ${quote(database)} WITH (FORCE)`);
      for (const role of createdRoles) await administrator.query(`DROP ROLE ${quote(role)}`);
    } finally { await administrator.end(); }
  }
});
