# App Service and PostgreSQL foundation

## Status and boundaries

**Preparation only.** The templates and scripts have local validation, not a
deployment certification. This change does not create cloud resources, register
providers, create identities or role assignments, bootstrap a database, or add
business-table persistence. The public preview must continue to work without a
database connection. A successful homepage response is not a database check.

The [approved design](../../docs/sunsum_technical_design_doc.md#3-technology-stack)
uses **Bicep and Azure CLI**, with no orchestration framework. Azure hosts the existing root
Next.js app as **Linux App Service code**, not a customer container image. The
web plan is fixed to **F1**; changing to a paid plan requires a separate decision
and template change. There is no ACR, Container Apps, Blob/Azurite, Fabric, Key
Vault, Application Insights, or Log Analytics resource in this foundation.

PostgreSQL Flexible Server is **separately billable**. The initial defaults are
PostgreSQL 17, `Burstable` / `Standard_B1ms`, `storageSizeGB=32`, seven-day local
backup retention, no high availability, no geo-redundant backups, and no storage
autogrowth. These are development-budget choices, not production availability
claims. Confirm regional SKU/version availability, compute/storage/backup
charges and quotas before provisioning. Disabled autogrowth needs deliberate
capacity monitoring and expansion; do not silently change tier or storage.
F1 has shared-resource and cold-start limits; a failed Oryx build is not approval
to upgrade it. See [PostgreSQL pricing](https://azure.microsoft.com/pricing/details/postgresql/flexible-server/).

All cloud-write commands below are **future procedures requiring separate
authorization**. Setup has distinct privilege boundaries, and the existing
resource group can contain other work and persistent data. There is no automatic
resource-group creation/deletion or deployment during ordinary app development.

## Tool and permission prerequisites

- Use the repository's Node `^22.22.2`, npm `^10.0.0` and committed lockfile.
  Restore explicitly with `npm ci`; do not upgrade a global Node installation.
- Scripts require PowerShell 7.2+. Bicep was compiled locally with Azure
  CLI-managed Bicep **0.42.1**. No cloud validation or Azure what-if is required
  for these local checks.
- Azure CLI **2.48.1+** supports Entra deployment when basic publishing is
  disabled. The installed CLI must also expose `webapp deploy --track-status`;
  the deployment script checks that capability instead of assuming it.
- An authorized subscription administrator must have registered
  `Microsoft.Web` and `Microsoft.DBforPostgreSQL`, approved the budget/region,
  and provided an **existing resource group**. Registration, directory setup
  and Azure role grants are not routine app deployment operations.
- Initial infrastructure deployment needs resource-group deployment and
  resource-write permissions, including the publishing-credential policies
  and PostgreSQL Entra administrator configuration. Do not infer these from
  access to deploy code to an existing site.
- `resources.bicep` is resource-group scoped and targets an existing group.
  It does not require a subscription-scope deployment wrapper.
- Privileged SQL bootstrap needs the configured PostgreSQL Entra administrator
  to manage nonadmin roles, grant database privileges, create schemas, and
  temporarily grant itself membership in the migration role if needed for
  `SET ROLE`. It does not create a password administrator. The administrator,
  runtime service principal and migration/operator principal must be distinct;
  review directory group memberships too. An operator who belongs to an Entra
  administrator group is not made least-privileged by a second SQL role.
- Routine code deployment needs the approved existing site's deployment/read
  permissions and an Entra-authenticated CLI session, not provider
  registration, database-administrator rights or a publish profile.

Keep subscription/tenant IDs, actual resource names, principal IDs, approval
records and environment configuration in ignored `.azure\<environment>\`
files. Do not commit them or use personal data as tags. Scripts do not switch
the active subscription, grant Azure roles, or enable basic publishing.

## Templates and configuration contract

| File | Purpose |
| --- | --- |
| `templates/resources.bicep` | Resource-group-scoped core; parameters include region, names, tenant, administrator, compute tier/SKU, storage and version. |
| `templates/web.bicep` | Linux F1 plan/site, system-assigned managed identity, HTTPS/TLS, disabled FTP/SCM basic publishing and database settings. |
| `templates/postgres.bicep` | Entra-only server/database and TLS settings; **no firewall rules**. |
| `templates/postgres-firewall.bicep` | Separate incremental exact-IP allowances on an existing server; empty by default. |
| `templates/resources.parameters.example.json` | Nondeployable placeholders; copy to ignored configuration and replace them. |

The web resource declares
`NODE|22-lts`, `alwaysOn=false`, `httpsOnly=true`, TLS 1.2 minimum for site and
SCM, `ftpsState=Disabled`, and both publishing policies `allow=false`.
`npm run start -- --hostname 0.0.0.0` lets Next.js use the platform's `PORT`;
there is no hardcoded port setting. A system-assigned identity is a declaration
for future provisioning, not evidence that an identity already exists.

| Setting | Azure runtime | Optional local PostgreSQL |
| --- | --- | --- |
| `SUNSUM_DATABASE_AUTH` | `managed-identity` | `password` |
| `PGHOST` | PostgreSQL server FQDN | Loopback |
| `PGPORT` | `5432` | Assigned local port |
| `PGDATABASE` | Chosen database, default `sunsum` | Injected |
| `PGUSER` | Runtime Entra SQL role, default `sunsum_runtime` | Injected |
| `PGSSLMODE` | `verify-full` | `disable`, **only nonproduction loopback** |
| `PGPASSWORD` | **Not an App Service setting** | Generated local secret |

Do not set Azure `DATABASE_URL`, `PGPASSWORD`, or `AZURE_CLIENT_ID` for this
system-assigned identity path. Runtime must not fall back to Azure CLI.
`SUNSUM_DATABASE_AUTH=azure-cli` is an **explicit operator-tooling mode** with
verified TLS, never the App Service runtime mode. Use trusted root CAs and the
server FQDN, not an IP or a pinned intermediate/server certificate.

## 1. Prepare and compile locally

From the repository root:

```powershell
New-Item -ItemType Directory -Path .azure\artifacts -Force | Out-Null
az bicep build --file infrastructure\templates\resources.bicep --outfile .azure\artifacts\resources.json
az bicep build --file infrastructure\templates\postgres-firewall.bicep --outfile .azure\artifacts\postgres-firewall.json
pwsh -NoProfile -File infrastructure\scripts\tests\deployment-safety.test.ps1
node --test infrastructure\scripts\tests\postgres-bootstrap.test.mjs
node --test infrastructure\scripts\tests\postgres-bootstrap-operations.test.mjs
npm test -- tests/unit/infrastructure.test.ts
```

These checks do not authenticate to Azure or PostgreSQL. Type compilation
does not verify name availability, quotas, billing, Azure policy, directory
membership or the installed cloud server's authentication extension.

## 2. Approved first-time provisioning

Copy the parameter example to an ignored local file and replace every
placeholder. Keep the defaults only after the separate database budget review.

```powershell
# LOCAL validation: no Azure calls without -Apply.
$parameters = '.azure\dev\resources.parameters.json'
$hash = (Get-FileHash -LiteralPath $parameters -Algorithm SHA256).Hash
pwsh -NoProfile -File infrastructure\scripts\Provision-Infrastructure.ps1 `
  -SubscriptionId $env:AZURE_SUBSCRIPTION_ID -ResourceGroupName $env:AZURE_RESOURCE_GROUP `
  -ParametersPath $parameters -ExpectedSha256 $hash `
  -ApprovalReference '<infrastructure-review>' -DatabaseBudgetApproval '<approved-budget>'
# Future WRITE: repeat with -Apply only after authorization.
```

The script validates explicit inputs and the reviewed parameter hash, then uses
`az deployment group create --mode Incremental` only with `-Apply`. It never
registers a provider, switches the active subscription, or grants Azure roles.
Review the Bicep revision alongside the parameters and retain both with the
approval record. Literal process variables such as `AZURE_SUBSCRIPTION_ID` and
`AZURE_RESOURCE_GROUP` are supplied by the operator, not a deployment framework.

Read the named deployment's outputs after authorized provisioning:

```powershell
az deployment group show --subscription $env:AZURE_SUBSCRIPTION_ID `
  --resource-group $env:AZURE_RESOURCE_GROUP --name '<deployment-name>' `
  --query properties.outputs --output json
```

Outputs include `AZURE_WEB_APP_PRINCIPAL_ID`, `AZURE_POSTGRES_SERVER_NAME` and
the shared PG settings. Identity IDs are not credentials, but still belong in
ignored environment records rather than committed examples.

## 3. Review exact network allowances

F1 **does not support VNet integration**. A private-only database would not be
reachable on this architecture. PostgreSQL therefore has a public endpoint
with **zero allowances on initial creation**. Do not enable `0.0.0.0`, the
"Allow Azure services" bypass, all-world ranges, service-tag substitutes, or
CIDRs. A paid private-network architecture needs a separate decision.

App Service egress IPs are **shared with other tenants**. A firewall allowance
permits network access, not application identity. Entra authentication,
least-privilege SQL grants and verified TLS remain required. Current outbound
IPs must all be considered because selection varies between connections.
Possible outbound IPs can be larger and change over time; approving them
reduces some disruption but increases network exposure and is not automatic.

```powershell
# Future READ ONLY: records current + possible IPs; changes no firewall.
pwsh -NoProfile -File infrastructure\scripts\Get-AppServiceEgressProposal.ps1 `
  -SubscriptionId $env:AZURE_SUBSCRIPTION_ID -ResourceGroupName $env:AZURE_RESOURCE_GROUP `
  -WebAppName $env:AZURE_WEB_APP_NAME -OutputPath .azure\dev\egress-proposal.json
```

An operator's exact public egress IP must be independently established by the
approved network process. The discovery script optionally accepts
`-OperatorIpv4Addresses`; it never sends traffic to an external IP-echo service.
Review the proposal, record the approval/ticket reference, and write a separate
ignored approval file:

```json
{
  "subscriptionId": "<subscription-id>",
  "resourceGroupName": "<existing-group>",
  "postgresServerName": "<existing-postgres-server>",
  "approvalReference": "<approved-review-reference>",
  "approvedIpv4Addresses": []
}
```

Replace `[]` with only the explicitly approved literal IPv4 addresses. No
addresses are preapproved by this example. The validator rejects the bypass,
ranges/CIDRs, noncanonical syntax, IPv6, private/reserved/test addresses,
duplicates, over 128 entries, absent approval, and a different target.

```powershell
# LOCAL ONLY by default: validates all input before any Azure command.
pwsh -NoProfile -File infrastructure\scripts\Set-PostgresFirewall.ps1 `
  -SubscriptionId $env:AZURE_SUBSCRIPTION_ID -ResourceGroupName $env:AZURE_RESOURCE_GROUP `
  -PostgresServerName $env:AZURE_POSTGRES_SERVER_NAME -ApprovalFile .azure\dev\firewall-approval.json `
  -OutputPath .azure\dev\firewall-reviewed.parameters.json

# Future WRITE: after authorization, repeat with -Apply and a NEW output path.
```

Each generated rule uses **start=end**. The deployment records the nonsecret
approval reference as an input/output for audit. Apply only through the validating
script, not by hand-passing an unchecked array to Bicep. The template is
incremental: removed entries and `[]` **do not remove existing rules**. Inspect
existing rules before/after updates and have an authorized operator explicitly
delete reviewed stale/temporary allowances by their exact rule name:

```powershell
az postgres flexible-server firewall-rule list --subscription $env:AZURE_SUBSCRIPTION_ID `
  --resource-group $env:AZURE_RESOURCE_GROUP --name $env:AZURE_POSTGRES_SERVER_NAME
# Future WRITE, only for an explicitly reviewed rule:
az postgres flexible-server firewall-rule delete --subscription $env:AZURE_SUBSCRIPTION_ID `
  --resource-group $env:AZURE_RESOURCE_GROUP --name $env:AZURE_POSTGRES_SERVER_NAME `
  --rule-name '<exact-approved-stale-rule-name>' --yes
```

Do not use a resource-group complete-mode deployment to prune firewall rules.
Repeat discovery/review after site recreation, plan/region changes, networking
changes, or observed egress drift. Firewall changes can take several minutes.

## 4. Privileged SQL bootstrap

Directory owners first verify the three object IDs and their group memberships.
The runtime ID is the site's **`identity.principalId`**, not its application/
client ID. The configured administrator must not be used for runtime or normal
migrations. Prepare an ignored `.azure\dev\bootstrap.json`:

```json
{
  "host": "<server-name>.postgres.database.azure.com",
  "database": "sunsum",
  "tenantId": "<tenant-id>",
  "administratorRole": "<existing-entra-admin-sql-role>",
  "administratorObjectId": "<admin-object-id>",
  "runtimeRole": "sunsum_runtime",
  "runtimeObjectId": "<web-system-assigned-principal-id>",
  "operatorRole": "sunsum_migrator",
  "operatorObjectId": "<separate-operator-object-id>",
  "operatorPrincipalType": "user",
  "approvalReference": "<approved-review-reference>"
}
```

```powershell
# LOCAL validation; no token or SQL request without --apply.
node infrastructure\scripts\bootstrap-postgres.mjs --config .azure\dev\bootstrap.json
# Future privileged SQL WRITE, after administrator login and separate approval:
node infrastructure\scripts\bootstrap-postgres.mjs --config .azure\dev\bootstrap.json --apply
```

This tool uses only `AzureCliCredential` for the explicitly selected tenant,
fresh PostgreSQL audience tokens in memory and certificate/hostname-verified
TLS. It does not log server errors or credentials, write tokens, set an Azure
`PGPASSWORD`, or create a password login. Root `pg` and `@azure/identity`
dependencies must already have been restored.

The two bounded, transactional phases are:

1. Connect as the approved administrator to **`postgres`**, where the Entra
   functions are available. Verify its mapping, then create missing roles with
   `pg_catalog.pgaadauth_create_principal_with_oid(roleName, objectId,
   objectType, false, false)` using query parameters. The runtime type is
   `service`. Existing roles are accepted only when object ID, tenant, type and
   nonadmin flags match, with no privileged role attributes or memberships.
   A local password role or changed MI object ID is **not** silently relabeled.
2. Connect to the chosen app database. Refuse runtime-owned objects,
   runtime/operator database ownership, and incorrectly owned existing schemas.
   Create only `sunsum` and `drizzle`, owned by the migration role. When needed,
   grant the administrator temporary migration-role membership for `SET ROLE`,
   then revoke it within the same transaction; preexisting membership options
   are not overwritten. Revoke PUBLIC database/schema defaults and runtime
   schema access, and grant **CONNECT only** to runtime/operator at database
   scope. The operator can create objects inside its two schemas by ownership.

There are no business tables, broad runtime role grants, runtime `CREATE`,
default privileges for future tables, or runtime database ownership.
Future runtime schema `USAGE` and per-table/sequence permissions need a reviewed
migration/grant change. Role creation and app-schema setup cannot be one
cross-database transaction: if phase two fails, verified nonadmin roles from
phase one can remain. Diagnose and rerun; wrong mappings/ownership require
explicit review, not an automatic drop or takeover.

## 5. Operator connectivity and migrations

Switch to the separately approved migration/operator identity, never the
runtime MI or bootstrap administrator. Set local process variables
`SUNSUM_DATABASE_AUTH=azure-cli`, `PGHOST`, `PGPORT=5432`, `PGDATABASE`,
`PGUSER=sunsum_migrator` and `PGSSLMODE=verify-full`. Do not add these operator
credentials or its SQL role to App Service. Then:

```powershell
npm run db:check
# Future explicit SQL WRITE only after migration SQL and permissions review:
npm run db:migrate -- --apply
```

**Important Drizzle prerequisite:** PostgreSQL checks database `CREATE` before
honoring `CREATE SCHEMA IF NOT EXISTS`. The standard Drizzle PostgreSQL migrator
emits that statement for its `drizzle` metadata schema; merely precreating the
schema does not bypass the privilege check. Bootstrap intentionally grants no
permanent database `CREATE`. A read-only preflight checks the operator's
effective permission before Drizzle makes any schema changes; it never
self-grants. A separately authorized administrator may open a bounded
**operator-only** permission window:

1. Record `current_user`, database owner, effective operator permissions,
   direct ACL entries and grantors, and the reviewed migration/code revision.
   If `CREATE` already exists (directly or through membership), preserve it:
   introduce no grant and perform no cleanup revocation for that existing access.
2. If permission is absent, approve and record the exact new grant before adding
   it as the recorded administrator. Run migrations through the distinct operator
   identity, never the application identity or bootstrap administrator.
3. On success **or failure**, return as that same grantor, revoke only the grant
   introduced by this window, and compare effective access and ACLs with the
   recorded baseline. Do not use `CASCADE`. If another permission change occurred
   during the window, stop for review rather than revoke unrelated access.

For the example database/role names (replace identifiers with correctly quoted,
reviewed names), the administrator's SQL is:

```sql
SELECT current_user, current_database(),
       pg_catalog.has_database_privilege('sunsum_migrator', current_database(), 'CREATE');
SELECT grantor::regrole, grantee::regrole, privilege_type, is_grantable
FROM pg_catalog.pg_database d,
     LATERAL pg_catalog.aclexplode(COALESCE(d.datacl, pg_catalog.acldefault('d', d.datdba)))
WHERE d.datname = current_database();
-- Only if CREATE was absent and this precise window was approved:
GRANT CREATE ON DATABASE "sunsum" TO "sunsum_migrator";
-- After operator execution, including failure, only for the grant added above:
REVOKE CREATE ON DATABASE "sunsum" FROM "sunsum_migrator";
-- Repeat the two read-only queries and verify the recorded baseline.
```

This is an explicit manual administrative procedure, not automatic grant/revoke
logic. Never grant database `CREATE` to `sunsum_runtime` or make either principal
a database administrator to get past an error. Lost access preventing cleanup is
an operational blocker requiring administrator follow-up, not a successful close.

CONNECT-only plus `db:check` (`SELECT 1`) is not proof of table CRUD permissions or migration
completion. There is no public HTTP database diagnostic route.

## 6. Package and deploy code only

The packaging script uses a source allowlist: root app manifests/lock/build
config, `app`, `src` and optional `public`. It excludes local env files, raw
`.npmrc`, `.azure`, `.git`, tests, unrelated tooling,
`.next`, caches, Windows `node_modules`, credential/certificate paths and
symbolic links. Review source contents too: a path allowlist is not a secret
scanner. Configuration added outside this allowlist needs an explicit packaging
review. Each ZIP puts `package.json` at its root, not under a repository folder.

Oryx builds this source on Linux because `SCM_DO_BUILD_DURING_DEPLOYMENT=true`.
The documented `CUSTOM_BUILD_COMMAND` is
`npm ci --include=dev && npm run build`, preserving strict lockfile installation.
Build-time dependencies remain available for the TypeScript Next config;
neither local Windows dependencies nor local `.next` output is shipped.

```powershell
$artifact = & .\infrastructure\scripts\New-AppServicePackage.ps1 `
  -OutputPath .azure\artifacts\web-reviewed.zip
$artifact | Format-List
# LOCAL validation by default, including the reviewed archive hash.
pwsh -NoProfile -File infrastructure\scripts\Deploy-AppServiceCode.ps1 `
  -SubscriptionId $env:AZURE_SUBSCRIPTION_ID -ResourceGroupName $env:AZURE_RESOURCE_GROUP `
  -WebAppName $env:AZURE_WEB_APP_NAME -PackagePath $artifact.Path `
  -ExpectedSha256 $artifact.SHA256 -ApprovalReference '<code-review-reference>'
# Future WRITE: add -Apply only after authorization.
```

The explicit Azure CLI path checks the existing Linux/HTTPS target and disabled
FTP/SCM policies, then uses `az webapp deploy --type zip --track-status false
--timeout 600000`. It never changes resource definitions, roles or app settings. It follows
deployment with at most 12 public-preview checks (10-second request timeout,
10-second retry delay), rather than relying on unbounded startup tracking.
On timeout, inspect deployment logs before retrying: a remote operation can
continue after the client exits. No automatic redeploy, tier change or rollback
is attempted.

Preserve the reviewed source ZIP, hash, code revision, deployment record and
explicit target in an approved artifact store. F1 has no staging-slot rollback
workflow here. Redeploying a prior compatible ZIP is **code rollback only**:
it does not reverse schema migrations or restore PostgreSQL data. Review schema
compatibility and backup/restore procedures before any future migration.

## Verified source references

- [App Service Node configuration and PORT](https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs),
  [ZIP deployment](https://learn.microsoft.com/en-us/azure/app-service/deploy-zip),
  [disabled basic publishing](https://learn.microsoft.com/en-us/azure/app-service/configure-basic-auth-disable),
  and [Oryx custom builds](https://github.com/microsoft/Oryx/blob/main/doc/runtimes/nodejs.md).
- [App Service egress and VNet tier limits](https://learn.microsoft.com/en-us/azure/app-service/overview-inbound-outbound-ips)
  and [PostgreSQL public access/firewall defaults](https://learn.microsoft.com/en-us/azure/postgresql/network/concepts-networking-public).
- [PostgreSQL Bicep schema](https://learn.microsoft.com/en-us/azure/templates/microsoft.dbforpostgresql/2024-08-01/flexibleservers)
  and [Entra administrator schema](https://learn.microsoft.com/en-us/azure/templates/microsoft.dbforpostgresql/2024-08-01/flexibleservers/administrators).
- [Entra role creation and mapping inspection](https://learn.microsoft.com/en-us/azure/postgresql/security/security-manage-entra-users),
  [managed-identity connections and the postgres bootstrap database](https://learn.microsoft.com/en-us/azure/postgresql/security/security-connect-with-managed-identity),
  and [node-postgres identifier escaping](https://node-postgres.com/apis/utilities).
- [PostgreSQL CREATE SCHEMA permissions](https://www.postgresql.org/docs/17/sql-createschema.html),
  [17 server source showing the IF NOT EXISTS privilege order](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/backend/commands/schemacmds.c),
  [REVOKE semantics](https://www.postgresql.org/docs/17/sql-revoke.html),
  and [verified TLS with verify-full](https://www.postgresql.org/docs/17/libpq-ssl.html).
