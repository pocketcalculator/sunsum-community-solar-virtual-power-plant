import assert from "node:assert/strict";
import test from "node:test";
import { validateBootstrapConfig } from "../postgres-bootstrap-config.mjs";
import { assertPrincipalMapping } from "../postgres-principal-bootstrap.mjs";

const config = {
  host: "sample-postgres.postgres.database.azure.com",
  database: "sunsum",
  tenantId: "11111111-1111-4111-8111-111111111111",
  administratorRole: "sample-admin-group",
  administratorObjectId: "22222222-2222-4222-8222-222222222222",
  runtimeObjectId: "33333333-3333-4333-8333-333333333333",
  operatorObjectId: "44444444-4444-4444-8444-444444444444",
  approvalReference: "review-123",
};

test("bootstrap defaults separate nonadmin runtime/operator roles", () => {
  const validated = validateBootstrapConfig(config);
  assert.equal(validated.runtimeRole, "sunsum_runtime");
  assert.equal(validated.operatorRole, "sunsum_migrator");
  assert.equal(validated.operatorPrincipalType, "user");
});

test("database naming boundaries match the provisioning preflight", () => {
  for (const database of ["a", "sunsum", "sunsum_prod", "app123", "a".repeat(63)]) {
    assert.equal(validateBootstrapConfig({ ...config, database }).database, database);
  }
  for (const database of ["sunsum-prod", "postgres", "public", "template0", "template1", "pg_custom", "azure_custom",
    "SunSum", "_sunsum", "1sunsum", "sunsum.prod", "sunsum prod", "a".repeat(64), "db\u00e9",
    "", " sunsum", "sunsum ", "sunsum\n", "app;drop", 123, null]) {
    assert.throws(() => validateBootstrapConfig({ ...config, database }));
  }
});

for (const patch of [
  { host: "localhost" },
  { host: "sample-postgres.postgres.database.azure.com.attacker.test" },
  { database: "postgres" },
  { database: "app'; DROP DATABASE sunsum; --" },
  { runtimeRole: "postgres" },
  { runtimeRole: 'runtime"; GRANT azure_pg_admin TO runtime; --' },
  { runtimeRole: "sunsum_migrator" },
  { runtimeObjectId: config.operatorObjectId },
  { operatorObjectId: config.administratorObjectId },
  { runtimeObjectId: "00000000-0000-0000-0000-000000000000" },
  { tenantId: "not-a-uuid" },
  { operatorPrincipalType: "admin" },
  { administratorRole: "x\nset role sunsum_runtime" },
  { approvalReference: "" },
  { password: "not-accepted" },
]) {
  test(`rejects unsafe bootstrap configuration: ${Object.keys(patch)[0]}`, () => {
    assert.throws(() => validateBootstrapConfig({ ...config, ...patch }));
  });
}

const mapping = {
  rolename: "sunsum_runtime",
  principalType: "service",
  objectId: config.runtimeObjectId,
  tenantId: config.tenantId,
  isAdmin: 0,
  isMfa: 0,
};
const expected = {
  role: "sunsum_runtime",
  objectId: config.runtimeObjectId,
  type: "service",
};

test("accepts only an exact existing nonadmin Entra identity mapping", () => {
  assert.doesNotThrow(() => assertPrincipalMapping([mapping], expected, config.tenantId));
  const lowercase = Object.fromEntries(
    Object.entries(mapping).map(([key, value]) => [key.toLowerCase(), value]),
  );
  assert.doesNotThrow(() => assertPrincipalMapping([lowercase], expected, config.tenantId));
});

for (const patch of [
  { objectId: config.operatorObjectId },
  { tenantId: config.operatorObjectId },
  { principalType: "user" },
  { isAdmin: 1 },
  { isMfa: 1 },
]) {
  test(`rejects existing identity drift: ${Object.keys(patch)[0]}`, () => {
    assert.throws(() => assertPrincipalMapping([{ ...mapping, ...patch }], expected, config.tenantId));
  });
}
test("does not adopt unmapped local roles or duplicate mappings", () => {
  assert.throws(() => assertPrincipalMapping([], expected, config.tenantId));
  assert.throws(() => assertPrincipalMapping([mapping, mapping], expected, config.tenantId));
});
