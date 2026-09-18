// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (path: string) => readFileSync(join(root, path), "utf8");
const runnerCommand = (suite: string, argumentsText = "") =>
  `$ErrorActionPreference = 'Stop'; $global:LASTEXITCODE = 1; & './infrastructure/scripts/tests/${suite}.test.ps1' ${argumentsText}; if (Test-Path -LiteralPath variable:\\LASTEXITCODE) { exit $LASTEXITCODE }`;

describe("the bounded Azure preparation contract", () => {
  it("reuses the canonical schema and migrations with a separate explicit Azure operator command", () => {
    expect(read("drizzle.config.ts")).toContain("./src/backend/db/schema.ts");
    expect(read("scripts/db-migrate.ts")).toContain("../src/backend/db/migrations");
    expect(read("src/backend/infrastructure/database/pool.ts")).toContain('from "../../db/schema"');
    expect(read("src/backend/infrastructure/database/pool.ts")).not.toContain('from "../../db"');
    expect(existsSync(join(root, "src/backend/infrastructure/database/schema.ts"))).toBe(false);
    expect(read("package.json")).toContain('"db:migrate": "node scripts/db.mjs migrate"');
    expect(read("package.json")).toContain('"db:migrate:azure"');
  });

  it("leaves existing web resources and authentication unchanged by default", () => {
    const core = read("infrastructure/templates/resources.bicep");
    expect(core).toContain("param webAppMode string = 'Existing'");
    expect(core).toContain("if (webAppMode == 'Create')");
    expect(core).not.toContain("web-sign-in.bicep");
    expect(core).not.toContain("storage-role-grants.bicep");
  });

  it("provides private LRS containers and an explicit policy-approved public-network choice", () => {
    const storage = read("infrastructure/templates/storage.bicep");
    expect(storage).toContain("name: 'Standard_LRS'");
    expect(storage).toContain("accessTier: 'Hot'");
    expect(storage).toContain("allowSharedKeyAccess: false");
    expect(storage).toContain("allowBlobPublicAccess: false");
    expect(storage).toContain("supportsHttpsTrafficOnly: true");
    expect(storage).toContain("minimumTlsVersion: 'TLS1_2'");
    expect(storage).toContain("bypass: 'None'");
    expect(storage).toContain("param networkMode string = 'Closed'");
    expect(storage).toContain("var publicNetworkEnabled = networkMode == 'AuthenticatedPublic' && !empty(trim(publicEndpointApproval))");
    expect(storage).toContain("publicNetworkAccess: publicNetworkEnabled ? 'Enabled' : 'Disabled'");
    expect(storage).toContain("defaultAction: publicNetworkEnabled ? 'Allow' : 'Deny'");
    expect(storage).toContain("output networkAccessEnabled bool = publicNetworkEnabled");
    expect(storage).toContain("param approvalReference string = ''");
    expect(storage).toContain("output APPROVAL_REFERENCE string = approvalReference");
    expect(storage.match(/publicAccess: 'None'/g)).toHaveLength(2);
    expect(storage).toContain("ipRules: []");
  });

  it("requires approved identities and code-flow credentials in a separate sign-in template", () => {
    const auth = read("infrastructure/templates/web-sign-in.bicep");
    expect(auth).toContain("requireAuthentication: true");
    expect(auth).toContain("excludedPaths: []");
    expect(auth).toMatch(/@minLength\(1\)\s+@maxLength\(13\)\s+param approvedParticipantObjectIds string\[\]/u);
    expect(auth).toContain("identities: approvedParticipantObjectIds");
    expect(auth).toContain("clientSecretSettingName: authSettingName");
    expect(auth).toContain("authentication.loginEndpoint");
    expect(auth).not.toContain("allowAnonymous");
    const roles = read("infrastructure/templates/storage-role-grants.bicep");
    expect(roles).toContain("param webAppName string");
    expect(roles).toContain("param approvedWebPrincipalId string");
    expect(roles).toContain("var webPrincipalId = bindApprovedPrincipal(web.?identity.?principalId ?? '', approvedWebPrincipalId)");
    expect(roles).not.toContain("param webPrincipalId");
    expect(roles).toContain("scope: containers[index]");
    expect(roles).toContain("principalType: 'ServicePrincipal'");
    expect(roles).not.toContain("scope: resourceGroup()");
  });

  it("runs real access configuration guards without Azure calls", () => {
    const result = execFileSync("pwsh", [
      "-NoProfile", "-NonInteractive", "-Command",
      runnerCommand("mvp-access"),
    ], { cwd: root, encoding: "utf8", timeout: 45_000 });
    expect(result).toContain("MVP access safety checks passed");
  }, 50_000);
  it("keeps the root application on code-based F1 with no paid web fallback", () => {
    const web = read("infrastructure/templates/web.bicep");
    expect(web).toContain("name: 'F1'");
    expect(web).toContain("tier: 'Free'");
    expect(web).toContain("reserved: true");
    expect(web).toContain("alwaysOn: false");
    expect(web).toContain("linuxFxVersion: 'NODE|22-lts'");
    expect(web).toContain("npm run start -- --hostname 0.0.0.0");
    expect(web).not.toMatch(/name: 'PORT'|WEBSITE_RUN_FROM_PACKAGE|DOCKER\||containerapp|appinsights/i);
    expect(web).toContain("npm ci --include=dev && npm run build");
    const core = read("infrastructure/templates/resources.bicep");
    expect(core).toContain("targetScope = 'resourceGroup'");
    expect(core).not.toMatch(/resourceGroups@|ContainerRegistry|containerApps/u);
    const provision = read("infrastructure/scripts/Provision-Infrastructure.ps1");
    expect(provision).toContain("if (-not $Apply)");
    expect(provision).toContain("--mode Incremental");
    expect(provision).toContain("DatabaseBudgetApproval");
  });

  it("declares TLS, managed identity, disabled publishing passwords and exact shared PG variables", () => {
    const web = read("infrastructure/templates/web.bicep");
    expect(web).toContain("httpsOnly: true");
    expect(web).toContain("ftpsState: 'Disabled'");
    expect(web).toContain("minTlsVersion: '1.2'");
    expect(web).toContain("scmMinTlsVersion: '1.2'");
    expect(web.match(/allow: false/gu)).toHaveLength(2);
    expect(web).toContain("type: 'SystemAssigned'");
    for (const name of ["SUNSUM_DATABASE_AUTH", "PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGSSLMODE"]) {
      expect(web).toContain(`name: '${name}'`);
    }
    expect(web).toContain("value: 'managed-identity'");
    expect(web).toContain("value: 'verify-full'");
    expect(web).not.toMatch(/PGPASSWORD|DATABASE_URL|AZURE_CLIENT_ID/u);
  });

  it("keeps network approval separate from Entra-only PostgreSQL provisioning", () => {
    const postgres = read("infrastructure/templates/postgres.bicep");
    expect(postgres).toContain("activeDirectoryAuth: 'Enabled'");
    expect(postgres).toContain("passwordAuth: 'Disabled'");
    expect(postgres).toContain("publicNetworkAccess: 'Enabled'");
    expect(postgres).not.toMatch(/administratorLogin|firewallRules|delegatedSubnet/u);
    const firewall = read("infrastructure/templates/postgres-firewall.bicep");
    expect(firewall).toContain("param approvedIpv4Addresses string[] = []");
    expect(firewall).toContain("startIpAddress: address");
    expect(firewall).toContain("endIpAddress: address");
    const deploy = read("infrastructure/scripts/Deploy-AppServiceCode.ps1");
    expect(deploy).toContain("--track-status false --timeout 600000");
    expect(deploy).toContain("$attempt -lt 12");
    expect(deploy).toContain("if (-not $Apply)");
  });

  it("runs the actual network and archive guard tests without Azure calls", () => {
    const result = execFileSync("pwsh", [
      "-NoProfile", "-NonInteractive", "-Command",
      runnerCommand("deployment-safety"),
    ], { cwd: root, encoding: "utf8", timeout: 45_000 });
    expect(result).toContain("checks passed");
  }, 50_000);

  it.each(["firewall-template", "deployment-safety", "mvp-access"])("propagates real %s failures through the CI shell wrapper", (suite) => {
    const missingCompiler = "./.validation/nonexistent-bicep-executable";
    expect(existsSync(join(root, missingCompiler))).toBe(false);
    const result = spawnSync("pwsh", [
      "-NoProfile", "-NonInteractive", "-Command",
      runnerCommand(suite, `-BicepPath '${missingCompiler}'`),
    ], { cwd: root, encoding: "utf8", timeout: 45_000 });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("nonexistent-bicep-executable");
    expect(result.stdout).not.toContain("checks passed");
  }, 50_000);

  it("runs the actual bootstrap safety tests without database or identity calls", () => {
    const result = execFileSync(process.execPath, [
      "--test", join(root, "infrastructure/scripts/tests/postgres-bootstrap.test.mjs"),
      join(root, "infrastructure/scripts/tests/postgres-bootstrap-operations.test.mjs"),
    ], { cwd: root, encoding: "utf8", timeout: 30_000 });
    expect(result).toContain("# fail 0");
  }, 35_000);

  it("checks actual App Service HTTP responses without following redirects", () => {
    const result = execFileSync(process.execPath, [
      "--test", join(root, "infrastructure/scripts/tests/app-service-response.test.mjs"),
    ], { cwd: root, encoding: "utf8", timeout: 40_000 });
    expect(result).toContain("# fail 0");
  }, 45_000);
});
