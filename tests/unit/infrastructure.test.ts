// @vitest-environment node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("the bounded Azure preparation contract", () => {
  it("keeps the root application on code-based F1 with no paid web fallback", () => {
    const web = read("infrastructure/templates/web.bicep");
    expect(web).toContain("name: 'F1'");
    expect(web).toContain("tier: 'Free'");
    expect(web).toContain("reserved: true");
    expect(web).toContain("alwaysOn: false");
    expect(web).toContain("linuxFxVersion: 'NODE|22-lts'");
    expect(web).toContain("npm run start -- --hostname 0.0.0.0");
    expect(web).not.toMatch(/name: 'PORT'|WEBSITE_RUN_FROM_PACKAGE|container|appinsights/i);
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
      "-NoProfile", "-NonInteractive", "-File",
      join(root, "infrastructure/scripts/tests/deployment-safety.test.ps1"),
    ], { cwd: root, encoding: "utf8", timeout: 45_000 });
    expect(result).toContain("checks passed");
  }, 50_000);

  it("runs the actual bootstrap safety tests without database or identity calls", () => {
    const result = execFileSync(process.execPath, [
      "--test", join(root, "infrastructure/scripts/tests/postgres-bootstrap.test.mjs"),
      join(root, "infrastructure/scripts/tests/postgres-bootstrap-operations.test.mjs"),
    ], { cwd: root, encoding: "utf8", timeout: 30_000 });
    expect(result).toContain("# fail 0");
  }, 35_000);
});
