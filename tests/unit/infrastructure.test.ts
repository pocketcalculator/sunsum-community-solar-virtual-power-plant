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

  it("creates the complete dev test stack without existing resource references", () => {
    const source = read("infrastructure/templates/resources.bicep");
    const core = source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
    expect(core).not.toMatch(/webAppMode|postgresMode|existingPostgres|\bexisting\s*=/u);
    expect(core).toContain("module web './modules/web.bicep' = {");
    expect(core).toContain("module storage './modules/storage.bicep' = {");
    expect(core).toContain("module postgres './modules/postgres.bicep' = {");
    expect(core).toContain("serverName: postgresServerName");
    expect(core).toContain("adminObjectId: postgresAdminObjectId");
    expect(core).toContain("output AZURE_POSTGRES_SERVER_NAME string = postgres.outputs.name");
    expect(core).toContain("output PGHOST string = postgres.outputs.fqdn");
    expect(core).not.toContain("web-sign-in.bicep");
    expect(core).not.toContain("storage-role-grants.bicep");
  });

  it("provides private LRS containers and an explicit policy-approved public-network choice", () => {
    const storage = read("infrastructure/templates/modules/storage.bicep");
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
  it("keeps provisioning SKU guards separate from plan-independent code deployment", () => {
    const web = read("infrastructure/templates/modules/web.bicep").replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
    expect(web).toContain("resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {");
    expect(web).not.toContain("existingPlan");
    expect(web).toContain("serverFarmId: plan.id");
    expect(web).toContain("name: 'B1'");
    expect(web).toContain("tier: 'Basic'");
    expect(web).toContain("reserved: true");
    const deploy = read("infrastructure/scripts/Deploy-Infrastructure.ps1");
    const validation = read("infrastructure/scripts/InfrastructureValidation.psm1");
    expect(deploy).toContain("Assert-DeploymentConfiguration -Config $config -Operation Infrastructure");
    expect(deploy).toContain("Assert-InfrastructureTemplate -Compiled $compiled -Inputs $inputs");
    expect(deploy).toContain("-ExpectedWebAppName $config.webAppName");
    expect(deploy).toContain("Get-ValidatedInfrastructureChanges -Result $result");
    expect(validation).toContain("$plan.sku.name -ine 'B1'");
    expect(validation).toContain("$plan.sku.tier -ine 'Basic'");
    expect(validation).not.toContain("'F1'");
    expect(read("infrastructure/scripts/Deploy-AppServiceCode.ps1")).not.toContain("Assert-AppServiceFreePlan");
    expect(validation).toContain("$change.after.sku['name'] -ine 'B1'");
    expect(validation).toContain("$change.after.sku['tier'] -ine 'Basic'");
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
    expect(provision).toContain("Assert-AppServiceFreePlan");
  });

  it("skips every deployment step safely until reviewed artifacts are configured", () => {
    const workflow = read(".github/workflows/deploy-azure.yml");
    const deployJob = workflow.slice(workflow.indexOf("  deploy:"));
    const preflight = "      - name: Check reviewed deployment artifacts availability";
    const deploymentSteps = deployJob.slice(deployJob.indexOf(preflight) + preflight.length).split("\n      - ").slice(1);
    expect(workflow).toContain('echo "configured=false" >> "$GITHUB_OUTPUT"');
    expect(workflow).toContain('missing_artifacts+=("AZURE_RESOURCES_PARAMETERS_JSON")');
    expect(workflow).toContain('missing_artifacts+=("AZURE_PROVISION_APPROVAL_JSON")');
    expect(workflow).toContain("skipping Azure deployment until an operator provisions them.");
    expect(deploymentSteps).toHaveLength(3);
    for (const step of deploymentSteps) {
      expect(step).toMatch(/^name: .+\n        if: steps\.deployment-artifacts\.outputs\.configured == 'true'/u);
    }
  });

  it("declares a fixture-only web host with database configuration kept in operator outputs", () => {
    const web = read("infrastructure/templates/modules/web.bicep");
    expect(web).toContain("httpsOnly: true");
    expect(web).toContain("ftpsState: 'Disabled'");
    expect(web).toContain("minTlsVersion: '1.2'");
    expect(web).toContain("scmMinTlsVersion: '1.2'");
    expect(web.match(/allow: false/gu)).toHaveLength(2);
    expect(web).toContain("type: 'SystemAssigned'");
    expect(web).toContain("name: 'SUNSUM_STORE'");
    expect(web).toContain("value: 'mock'");
    const core = read("infrastructure/templates/resources.bicep");
    for (const name of ["SUNSUM_DATABASE_AUTH", "PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGSSLMODE"]) {
      expect(web).not.toContain(`name: '${name}'`);
      expect(core).toContain(`output ${name} string`);
    }
    expect(web).not.toMatch(/PGPASSWORD|DATABASE_URL|SUNSUM_DB_AUTH|AZURE_CLIENT_ID/u);
  });

  it("keeps network approval separate from Entra-only PostgreSQL provisioning", () => {
    const postgres = read("infrastructure/templates/modules/postgres.bicep");
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

  it("shares one dev target across infrastructure and code deployment", () => {
    const config = JSON.parse(read("infrastructure/config/dev.json"));
    expect(Object.keys(config).sort()).toEqual([
      "code", "infrastructure", "resourceGroupName", "subscriptionId", "webAppName",
    ]);
    expect(config.webAppName).toBe("app-sunsum-dev-test-centralus");
    expect(config.code).toEqual({ expectedAccessMode: "Preview" });
    expect(existsSync(join(root, "infrastructure/config/code.dev.json"))).toBe(false);
    const entry = read("infrastructure/scripts/Deploy-Application.ps1");
    expect(entry).toContain("..\\config\\dev.json");
    expect(entry).toContain("Assert-DeploymentConfiguration -Config $config -Operation Code");
    expect(entry).toContain("New-AppServicePackage.ps1");
    expect(entry).toContain("Deploy-AppServiceCode.ps1");
    expect(entry).toContain("deployment-record.json");
    expect(entry).not.toContain("Deploy-Infrastructure.ps1");
    expect(entry).not.toMatch(/postgresAdmin|BicepPath|build-params/u);
  });

  it("runs the actual network, archive and unified code-entry guards without Azure calls", () => {
    const result = execFileSync("pwsh", [
      "-NoProfile", "-NonInteractive", "-Command",
      runnerCommand("deployment-safety"),
    ], { cwd: root, encoding: "utf8", timeout: 45_000 });
    expect(result).toContain("checks passed");
  }, 50_000);

  it("compiles versioned dev sources and supports repeat deployments without Azure calls", () => {
    const config = JSON.parse(read("infrastructure/config/dev.json"));
    expect(config.infrastructure.templatePath).toBe("../templates/resources.bicep");
    expect(config.infrastructure.parametersPath).toBe("../templates/resources.dev.bicepparam");
    expect(config.infrastructure.deploymentName).toBe("sunsum-dev-test-infrastructure");
    expect(Object.keys(config.infrastructure).sort()).toEqual([
      "deploymentName", "parametersPath", "templatePath",
    ]);
    const parameters = read("infrastructure/templates/resources.dev.bicepparam");
    expect(parameters).toContain("using './resources.bicep'");
    expect(parameters).toContain("param environmentName = 'dev-test'");
    expect(parameters).toContain("param appServicePlanName = 'asp-sunsum-dev-test-centralus'");
    expect(parameters).toContain(`param webAppName = '${config.webAppName}'`);
    expect(parameters).toContain("param storageAccountName = 'stsunsumdevtestcentralus'");
    expect(parameters).toContain("param postgresServerName = 'db-sunsum-dev-test-centralus'");
    expect(parameters).toContain("param databaseName = 'sunsum_test'");
    expect(parameters).toContain("param tenantId = '00000000-0000-0000-0000-000000000000'");
    expect(parameters).toContain("param postgresAdminObjectId = '00000000-0000-0000-0000-000000000000'");
    expect(parameters).toContain("param postgresAdminPrincipalName = '<postgres-admin-principal-name>'");
    expect(parameters).toContain("param postgresAdminPrincipalType = 'User'");
    expect(parameters).toContain("param postgresVersion = '17'");
    expect(parameters).toContain("param postgresSkuName = 'Standard_B1ms'");
    expect(parameters).not.toMatch(/readEnvironmentVariable|stsunsumdev928e5e28|db-sunsum-dev-centralus/u);
    expect(existsSync(join(root, "infrastructure/scripts/Deploy-DevInfrastructure.ps1"))).toBe(false);
    const result = execFileSync("pwsh", [
      "-NoProfile", "-NonInteractive", "-Command",
      runnerCommand("repeatable-deployment"),
    ], { cwd: root, encoding: "utf8", timeout: 45_000 });
    expect(result).toContain("Repeatable deployment checks passed");
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

  /*
   * The reporter is pinned because the assertion reads its output. Node 22
   * defaults `--test` to TAP and emits `# fail 0`; Node 24 defaults to the
   * spec reporter and emits `ℹ fail 0`, so an unpinned run passes on the
   * version CI uses and fails on the one a developer is likely to have.
   */
  it("runs the actual bootstrap safety tests without database or identity calls", () => {
    const result = execFileSync(process.execPath, [
      "--test", "--test-reporter=tap",
      join(root, "infrastructure/scripts/tests/postgres-bootstrap.test.mjs"),
      join(root, "infrastructure/scripts/tests/postgres-bootstrap-operations.test.mjs"),
    ], { cwd: root, encoding: "utf8", timeout: 30_000 });
    expect(result).toContain("# fail 0");
  }, 35_000);

  it("checks actual App Service HTTP responses without following redirects", () => {
    const result = execFileSync(process.execPath, [
      "--test", "--test-reporter=tap",
      join(root, "infrastructure/scripts/tests/app-service-response.test.mjs"),
    ], { cwd: root, encoding: "utf8", timeout: 40_000 });
    expect(result).toContain("# fail 0");
  }, 45_000);
});
