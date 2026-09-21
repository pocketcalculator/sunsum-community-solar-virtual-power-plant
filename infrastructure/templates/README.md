---
title: Infrastructure templates
description: Deployable infrastructure templates and parameter examples for Sunsum
---

## Purpose

Store infrastructure-as-code templates and non-sensitive parameter examples in
this directory. Keep environment-specific values outside committed templates.

## Development environment

- `resources.bicep` is the dev infrastructure entry, with versioned inputs in
  `resources.dev.bicepparam` and the Azure target in `../config/dev.json`.
  It manages a Linux B1/Basic plan, fixture-only web app, private Storage and a
  new Entra-only PostgreSQL server/database. All use separate test targets in
  the existing resource group; no create/existing modes are used.
- `modules/` holds `web.bicep`, `storage.bicep`, `network.bicep`, `postgres.bicep`,
  `observability.bicep`, `diagnostics.bicep` and `private-network.bicep`.
  These are invoked by parent templates rather than used as deployment entry points.
  The dev entry always invokes the web, Storage and PostgreSQL creation modules,
  and invokes the observability, diagnostics and private-network modules only
  when `enableObservability` or `enablePrivateNetworking` is true.
- `resources.bicep` passes explicit PostgreSQL creation inputs to the module and
  returns the new server's connection outputs. The native parameters select
  PostgreSQL 17/Burstable B1ms/32 GiB. Tenant and administrator identity values are
  redacted in public parameters; supply approved values locally before preview/apply.
  Placeholders compile locally but cannot pass deployment preflight.
  `postgresAdministrators` accepts the exported sealed `EntraAdministrator[]` type;
  the current dev input contains one entry. Each entry has `objectId`,
  `principalName` and `principalType`, in the shared `tenantId`. The root passes the
  list to the module's `administrators` input. Legacy scalar inputs remain a
  one-entry fallback only when the array is omitted. See
  [local identity setup](../docs/deployment.md#local-identity-setup) for migration
  and multi-admin examples; private inputs are not changed automatically.
- `modules/web.bicep` creates the explicitly requested, billable B1 plan and links
  the web app through `plan.id`.
  Dev uses `asp-sunsum-dev-test-centralus` and `app-sunsum-dev-test-centralus`:
  resource type, project, environment, test purpose and region, without a SKU suffix.
  Storage is `stsunsumdevtestcentralus` and PostgreSQL is
  `db-sunsum-dev-test-centralus` with an empty `sunsum_test` database. Child resource
  names are scoped to these new parents. Earlier targets are not reused or removed.
  Confirm global name availability, regional quota and charges before deployment.
- `app-service.bicep` declares the App Service plan, web app, managed identity
  and application settings for the existing development environment.
- `app-service.dev.bicepparam` contains the non-secret shared development values
  introduced on main. It does not contain a database password.

See the [earlier smoke-app notes](../docs/deployment.md#earlier-database-backed-smoke-app) for that path and
the database grant required for a newly created web identity. This is distinct
from the preparation entry points below; review which template owns a site's
settings before applying either to the same app. Use the
[local identity setup](../docs/deployment.md#local-identity-setup) for ignored
parameter/config copies. An optional `.azure/dev/identity-values.json` is a local
reference, not an input loaded automatically. Keep approval records local too;
do not publish credentials or personal administrator data.

## Configuration contract

| Input | Owns |
| --- | --- |
| `../config/dev.json` | Shared subscription, resource group and web-app name; `infrastructure` holds the deployment name and input paths, while `code` holds the HTTP check mode. Infrastructure paths resolve from this config's directory. |
| `resources.dev.bicepparam` | Test resource names and compute settings, with tenant/administrator placeholders; bound to `resources.bicep` by its native `using` declaration. |
| `resources.bicep` and `modules/` | Desired resource state: B1/Basic plan, fixture-only web app, private Storage, and a new Entra-only PostgreSQL server/database, plus the opt-in observability and private-network resources. |

Versioned inputs support local compilation; preview/apply also needs the three
redacted identity values supplied locally. The ignored identity backup is not
automatically loaded, and generated `.azure/` artifacts are not required inputs.
There are no SQL/plan/web creation-mode switches. The deployment script
compiles the parameters and root together and verifies that their binding matches.
It also requires the compiled `webAppName` to match the shared config; update both
when renaming the app. Code deployment reads only the shared target and `code`
section, without requiring Bicep or private database identity inputs.
See [infrastructure deployment](../docs/deployment.md#infrastructure-deployment)
for commands, artifact handling and normal create/update/no-change behavior.

## Prepared entry points

| Template | Scope | Use |
| --- | --- | --- |
| `resources.bicep` | Resource group | Complete test copy: Linux B1/Basic plan, fixture-only web app, private Storage and new Entra-only PostgreSQL server/database. |
| `postgres-firewall.bicep` | Resource group | Only approved individual IPv4 rules for an existing PostgreSQL server; no rules by default. |
| `main.bicep` | Resource group | Separate document-storage entry using Storage/network modules; its optional network path is not selected by dev config. |
| `storage-role-grants.bicep` | Resource group | Separate administrator grant to the web identity at the two container scopes only. |
| `web-sign-in.bicep` | Resource group | Explicit opt-in Easy Auth on an existing app; precreated workforce registration and nonempty approved-user/guest allowlist. |

`resources.bicep` takes `enableObservability` and `enablePrivateNetworking`,
both `false` by default so existing reviewed deployments keep their current
resource set and cost. When enabled it creates a Log Analytics workspace, a
workspace-based Application Insights component, diagnostic settings on the web
app and PostgreSQL server, a virtual network with a delegated App Service subnet
and a private-endpoint subnet, the blob private endpoint, the
`privatelink.blob.*` private DNS zone, its virtual-network link and the private
DNS zone group. Names, the address space, retention and the daily ingestion cap
are explicit parameters; `resources.dev.bicepparam` and
`../../.github/workflows/deploy-azure2.yaml` supply the dev-test values. The web
module reads the Application Insights connection string from the deployed
component, so no deployment output carries it. PostgreSQL keeps public network
access with separately approved firewall rules and gets no private endpoint.
See [observability and private networking](../docs/app-service-postgres.md#observability-and-private-networking)
for names, portal locations and the cost and address-space assumptions.

`modules/web.bicep` and `modules/postgres.bicep` are reusable core modules. The
`resources.parameters.example.json` is the preserved legacy creation example,
not an input to the current dev root. Its placeholders are intentionally not
deployable. The dev command uses `resources.dev.bicepparam` instead.

Compile locally with `az bicep build --file <entry-point> --outfile <local-json>`.
Use an ignored `.azure\artifacts\` output directory. Compilation makes no cloud
changes and does not validate quotas, cost, directory membership or Azure
policy. The web module has no implicit paid-tier fallback.

`modules/web.bicep` explicitly sets `SUNSUM_STORE=mock` and has no database parameters or
database app settings. The root retains `PG*` outputs for separate operator setup;
app activation requires reviewed `DATABASE_URL`/`SUNSUM_DB_AUTH` settings and grants.
Do not reapply the preparation template over an activated app to deploy code.

`resources.bicep` allows only `sunsum_runtime` for its output-contract
`runtimeRoleName`, including direct-template deployments. The provisioning
wrapper rejects other names before Azure calls. This is a configuration guard,
not SQL privilege enforcement; the separate bootstrap must verify that the role
maps to the runtime identity and is non-admin. Custom runtime names need a
reviewed contract change rather than a parameter override.

The deployable `postgres.bicep` module validates the database resource name:
1-63 lowercase ASCII letters/digits/underscores, starting with a letter, no
`pg_` or `azure_` prefix, and not `postgres`, `public`, `template0` or `template1`.
This matches provisioning, bootstrap and Azure migration policy. Direct-template
inputs are checked too; valid custom names and the `sunsum` default are preserved.
Compiler-backed tests evaluate boundary inputs and verify that the database
resource uses the validated expression. This is not a SQL permission check.

PostgreSQL child writes are serialized after server creation: secure transport,
minimum TLS, each Entra administrator (`@batchSize(1)`), then database. The list
must be nonempty and have unique, valid object IDs. Omitting an administrator from
the list does not revoke it in Incremental mode; removal needs separate approval.
This avoids competing provider
updates within the module; it is not a cross-deployment lock or a guarantee of
data-plane readiness. Inspect partial failures before an authorized rerun.

Use the validating firewall script rather than passing raw IP input to the
network template. Incremental deployment does not remove old allowances.
The firewall template also validates the entire address list before generating
rules: canonical decimal IPv4 only, no duplicate entries, maximum 128, and the
same excluded address ranges as the wrapper (including the `0.0.0.0` bypass).
An invalid list fails evaluation rather than deploying just its valid entries.
These exclusions implement this repository's policy, not an assertion that every
accepted address is routable or approved. The wrapper still binds input to the
reviewed target and approval record.

The dev entry is reapplied using `Deploy-Infrastructure.ps1`; it generates local
artifacts and uses Incremental mode rather than a first-time collision guard.
The legacy `Provision-Infrastructure.ps1` retains its F1-only web checks and
is not an entry point for the current B1 test composition. Preflights
do not reserve names or make an ARM deployment transactional. A caller with direct
Azure write permissions can submit a different template or direct resource write;
enforcing restrictions against that caller requires separately managed Azure
Policy/RBAC controls. No such policy enforcement is provisioned here.

The Blob-role template takes `webAppName` and `approvedWebPrincipalId`, which
the wrapper supplies from its reviewed `webPrincipalId` input. It compares that
approval with the named web app's current system-assigned identity and fails
on drift or an absent identity. Assignments consume only the approved principal;
the template cannot silently grant to a newly recreated identity. Assignment
names now derive from the web resource ID rather than the principal ID. Review
existing assignments before upgrading from older templates or recreating an
identity; do not automatically delete or retarget conflicting assignments.

Follow the [operating guide](../docs/app-service-postgres.md) for approval,
provisioning, bootstrap and code-only deployment; never use group complete mode
or resource-group deletion to clean up this shared/persistent foundation.
