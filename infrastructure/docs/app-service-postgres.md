# MVP deployment guide: App Service, PostgreSQL, sign-in and Blob

## Status and boundaries

Use the [deployment guide](deployment.md#infrastructure-deployment) for the
normal source-driven infrastructure commands, including updates and reruns.
It manages a Linux B1/Basic plan, web app, private Storage and a new Entra-only
PostgreSQL server with an empty database. All top-level resources use test names
in the existing resource group; no existing data or grants are copied. There is
no creation-mode switch.
The first-time creation procedure below is historical and is not the dev entry.

**Preparation only.** The templates and scripts have local validation, not a
deployment certification. This change does not create cloud resources, register
providers, create identities or role assignments, bootstrap a database, or add
business-table integration. The public preview must continue to work without a
database connection. A successful homepage response is not a database check.

The [approved design](../../docs/sunsum_technical_design_doc.md#3-technology-stack)
uses **Bicep and Azure CLI**, with no orchestration framework. Azure hosts the existing root
Next.js app as **Linux App Service code**, not a customer container image. The
dev plan is explicitly **B1/Basic** for this experiment after the target resource
group rejected Linux F1 creation. B1 is billable; there is no automatic tier
fallback. Distinct plan and app names leave the previous B1 resources untouched.
There is no ACR, Container Apps, Azurite, Fabric or Key Vault resource in this
foundation. A Log Analytics workspace, a workspace-based Application Insights
component, a virtual network and a blob private endpoint are declared but
deployed only when `enableObservability` and `enablePrivateNetworking` are set
to true; both are false by default and both add separately billable resources.
See [observability and private networking](#observability-and-private-networking).
The Storage account is Standard LRS, StorageV2, Hot, with private
`site-documents` and `project-documents` containers. Shared-key access and
anonymous Blob access are disabled.

The legacy provisioning command reads the named site's
`serverFarmId`, then inspects that linked plan by resource ID. It requires
`sku.name=F1` and `sku.tier=Free`; missing, unreadable, malformed
or paid plans stop the operation. The operator needs read access to the linked
plan, including when it is in another resource group in the same subscription.
That preflight does not change the plan or offer a paid-tier bypass. It is a
preflight, not a lock against concurrent Azure configuration changes; serialize
plan changes during provisioning. Code-only deployment does not inspect or
change the plan SKU. It retains app/runtime, transport, publishing, archive and
HTTP checks. The dev infrastructure entry owns only its explicitly named B1 plan.

| Surface | Preparation status | Deployment/application gate |
| --- | --- | --- |
| B1 site/plan and system identity | Bicep prepared for explicitly requested paid-tier creation | Confirm charges, quota and policy; compilation is not proof of deployment |
| New PostgreSQL test server/database | Creation module configures Entra-only authentication, the selected administrator, TLS and an empty database | Confirm separate compute/storage budget and permissions; no firewall allowances, SQL runtime grants or schema migrations |
| Storage/private containers | Bicep ready, network closed by default | Network access remains a separate approval; B1 alone adds no VNet integration or container RBAC |
| Approved internal/guest sign-in | Separate opt-in `authsettingsV2` template and guards ready | Precreated workforce Web registration, code-flow credential, enterprise-app assignments and named participants required |
| Application user/role mapping | **NOT IMPLEMENTED** | Easy Auth gate/claims do not replace fixed demo owner/operator/investor identities or implement business authorization |
| Blob upload/download service | **NOT IMPLEMENTED** | Container role grants do not implement per-site/project document access or browser upload paths |
| Business schema and store | Canonical `src/backend/db` schema, four migrations, seed, constraint probes and PostgreSQL-backed store from main | Runtime configuration, real data and table grants require separate integration and review; no parallel schema is created |
| Python viability service | **PENDING** | Hosting/runtime/model interface not configured by this PR |
| Log Analytics, Application Insights and platform diagnostics | Opt-in Bicep modules ready | Separately billable ingestion and retention; confirm the daily cap. Deploying them configures no readiness probes, alerts, dashboards or application-side telemetry SDK |
| Private blob networking | Opt-in Bicep module ready | Separately billable virtual network and private endpoint; the address space must be confirmed free before deploying |
| Application telemetry instrumentation and health configuration | **PENDING** | The connection string app setting does not add an SDK, traces, readiness probes or alerts |

These are prepared artifacts, not a deployed or production-ready MVP. Public
registration is not implemented; an external collaborator must first be approved
and onboarded as a guest in the chosen workforce tenant.

The application now selects its PostgreSQL-backed store with `SUNSUM_STORE=db`
and uses `DATABASE_URL` plus optional `SUNSUM_DB_AUTH`, as documented in the
[runtime database guide](../../src/backend/db/README.md). The default remains
the explicit fixture store. The `PG*` and `SUNSUM_DATABASE_AUTH` settings below
configure this PR's separate connection/migration tooling; they do not configure
that application store. The dev web module explicitly sets `SUNSUM_STORE=mock`
and installs no database connection settings. The root template retains database
connection outputs for separate operator setup. Database activation with the
application contract, identity mapping and table grants requires its own review;
neither provisioning nor routine ZIP deployment activates it.

PostgreSQL Flexible Server is **separately billable**. The initial defaults are
PostgreSQL 17, `Burstable` / `Standard_B1ms`, `storageSizeGB=32`, seven-day local
backup retention, no high availability, no geo-redundant backups, and no storage
autogrowth. These are development-budget choices, not production availability
claims. Confirm regional SKU/version availability, compute/storage/backup
charges and quotas before provisioning. Disabled autogrowth needs deliberate
capacity monitoring and expansion; do not silently change tier or storage.
F1 has shared-resource and cold-start limits; a failed Oryx build is not approval
to upgrade it. See [PostgreSQL pricing](https://azure.microsoft.com/pricing/details/postgresql/flexible-server/).

### Budget assumptions (September 16, 2026)

The user approved the proposed MVP budget, **not deployments**. Public USD retail
rates observed for Central US, assuming 730 running hours per month:

These historical assumptions predate the explicit B1 experiment. The $0 web-plan
row does not apply to the new dev plan; confirm current B1 pricing before deployment.

| Item | Retail assumption | Approximate charge before extras |
| --- | --- | --- |
| Existing App Service F1 | Free tier, no paid upgrade | $0 web-plan charge subject to F1 quotas/terms |
| PostgreSQL Burstable B1ms | $0.01921/hour | $14.02/month |
| PostgreSQL storage | 32 GiB at $0.13/GB-month retail meter | $4.16/month |
| PostgreSQL base total | No HA, seven-day local backups, autogrowth disabled | **$18.18/month** |
| Hot LRS Blob capacity | $0.0184/GB-month | $0.184/month for an illustrative 10 GB |
| Blob read operations | $0.004 per 10,000 | Usage-dependent |
| Blob write/list/create operations | $0.05 per 10,000 | Usage-dependent |

Use the [retail prices API](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices)
and [Storage pricing](https://azure.microsoft.com/pricing/details/storage/blobs/)
to refresh rates before execution. Egress, extra backup/storage, transactions,
taxes, regional or organizational charges and negotiated discounts are separate.
This is not the corporate bill or a guarantee of zero cost. LRS is not a backup;
Blob versioning, soft-delete retention and immutable retention are not enabled
by this cheapest-tier template and require a separately reviewed data-protection
decision before valuable documents are stored. Fabric mirroring does not support
Burstable PostgreSQL and no Fabric deployment is included.

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
  disabled. The installed CLI must also expose `webapp deploy --track-status` and `--clean`;
  the deployment script checks that capability instead of assuming it.
- Required providers are `Microsoft.Web`, `Microsoft.Storage` and
  `Microsoft.DBforPostgreSQL`; the relevant web/storage/identity and PostgreSQL
  providers were reported **Registered** on September 16, 2026. Confirm for the
  chosen subscription rather than attempting registration routinely. An
  authorized administrator must have approved the budget/region
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

**Dated access constraints, anonymized:** the current operator was an existing
workforce-tenant guest with resource-group deployment rights that exclude
`Microsoft.Authorization/*/Write`. That operator cannot assign Blob Azure RBAC.
App-registration listing and the Graph authorization-policy read returned
insufficient privileges. Directory app creation, guest onboarding/assignment and
the initial container role grants therefore need the appropriate administrator.
Do not work around a denial with account keys, personal tenants, broad SAS tokens,
tenant-wide access or an elevated database runtime principal. Routine code
deployment does **not** require an Owner to repeat these administrator steps.
Approved application participants require no Azure subscription/RG roles.

The shared non-secret dev target is versioned in `infrastructure/config/dev.json`
for both infrastructure and code deployment. Its `infrastructure` section selects
the Bicep inputs and its `code` section selects the HTTP check mode. Resource inputs
remain in `infrastructure/templates/resources.dev.bicepparam`; the compiled
web-app name must match the shared config before infrastructure calls Azure.
Tenant and administrator identity values are redacted in the public parameters.
Keep real values in ignored `.azure/dev/identity-values.json`, supply them only
in local deployment inputs, and restore placeholders before committing. Preview
and apply reject placeholders before calling Azure. Keep generated artifacts, review
hashes, approval records, principal IDs and secrets in ignored `.azure/` files;
do not commit them or use personal data as tags. Scripts do not switch
the active subscription or enable basic publishing. The separately approved
`BlobRoles` operation is the only new role-grant path.

## Templates and configuration contract

| File | Purpose |
| --- | --- |
| `templates/resources.bicep` | Dev entry: manages a complete new test stack including the B1 plan, web app, Storage and Entra-only PostgreSQL. |
| `templates/resources.dev.bicepparam` | Versioned non-secret dev resource names and settings. |
| `config/dev.json` | Shared Azure target; `infrastructure` deployment name/Bicep paths and `code` HTTP check mode. |
| `templates/modules/web.bicep` | Linux B1/Basic plan and fixture-only site with an explicit dependency on the plan. |
| `templates/modules/postgres.bicep` | Creates the test PostgreSQL server, selected Entra administrator, empty database and TLS configuration; no firewall allowances. |
| `templates/postgres-firewall.bicep` | Separate incremental exact-IP allowances on an existing server; empty by default. |
| `templates/resources.parameters.example.json` | Legacy creation example retained for later restoration; not used by the dev entry. |
| `templates/modules/storage.bicep` | Standard LRS Hot account and two private containers; closed unless authenticated-public mode has a policy approval reference. |
| `templates/storage-role-grants.bicep` | Separate Reader/Contributor assignments only on the two intended containers, never RG/subscription-wide. |
| `templates/web-sign-in.bicep` | Separate opt-in gate on an existing site; precreated single-tenant registration and nonempty participant object-ID list. |
| `templates/sign-in.example.json`, `blob-roles.example.json`, `storage-network.example.json` | Nondeployable access-review inputs for `Deploy-AccessConfiguration.ps1`. |

The web resource declares
`NODE|22-lts`, `alwaysOn=false`, `httpsOnly=true`, TLS 1.2 minimum for site and
SCM, `ftpsState=Disabled`, and both publishing policies `allow=false`.
`npm run start -- --hostname 0.0.0.0` lets Next.js use the platform's `PORT`;
there is no hardcoded port setting. A system-assigned identity is a declaration
for future provisioning, not evidence that an identity already exists.
`SUNSUM_STORE=mock` is explicit. The module takes no database host/name/role
parameters and installs no `PG*`, `SUNSUM_DATABASE_AUTH`, `DATABASE_URL` or
`SUNSUM_DB_AUTH` settings. Direct web-module callers must remove the former
database parameters; root callers retain the database configuration/output contract.

The root connection outputs below describe the separate tooling contract. They
are not automatically installed into App Service. Azure migration operators use
their separately approved `azure-cli` identity and `sunsum_migrator` role.

| Setting | Azure tooling connection | Optional local PostgreSQL |
| --- | --- | --- |
| `SUNSUM_DATABASE_AUTH` | `managed-identity` | `password` |
| `PGHOST` | PostgreSQL server FQDN | Loopback |
| `PGPORT` | `5432` | Assigned local port |
| `PGDATABASE` | Chosen database, default `sunsum` | Injected |
| `PGUSER` | Designated runtime Entra SQL role `sunsum_runtime` | Injected |
| `PGSSLMODE` | `verify-full` | `disable`, **only nonproduction loopback** |
| `PGPASSWORD` | **Not an App Service setting** | Generated local secret |

The root template constrains its connection-output `runtimeRoleName` to
`sunsum_runtime`; the provisioning script rejects other values before Azure
calls. Use that same name for `runtimeRole` in the separate bootstrap config.
Custom runtime role names require a reviewed change to the template/bootstrap
contract, not an arbitrary parameter override. A role name does not prove
least privilege: bootstrap must verify the distinct runtime identity's Entra
mapping, non-admin role attributes, memberships and ownership before database
access is enabled. Setting `PGUSER` alone cannot impersonate a different Entra
principal, and these template constraints do not inspect existing SQL grants.

Future Blob adapters receive server-only `AZURE_STORAGE_BLOB_ENDPOINT`,
`SITE_DOCUMENTS_CONTAINER` and `PROJECT_DOCUMENTS_CONTAINER`. They must use the
web app's `ManagedIdentityCredential`, not account keys. Declaring these settings
does not install or implement a Storage client.

The preparation template must remain fixture-only until separate activation is
reviewed. The application path uses a passwordless `DATABASE_URL` with verified
TLS and managed identity; it must not be confused with this tooling contract.
Do not set Azure `PGPASSWORD` or select a user-assigned identity implicitly.
Runtime must not fall back to Azure CLI.
`SUNSUM_DATABASE_AUTH=azure-cli` is an **explicit operator-tooling mode** with
verified TLS, never the App Service runtime mode. Use trusted root CAs and the
server FQDN, not an IP or a pinned intermediate/server certificate.

## 1. Prepare and compile locally

From the repository root:

```powershell
New-Item -ItemType Directory -Path .azure\artifacts -Force | Out-Null
az bicep build --file infrastructure\templates\resources.bicep --outfile .azure\artifacts\resources.json
az bicep build --file infrastructure\templates\postgres-firewall.bicep --outfile .azure\artifacts\postgres-firewall.json
az bicep build --file infrastructure\templates\modules\storage.bicep --outfile .azure\artifacts\storage.json
az bicep build --file infrastructure\templates\storage-role-grants.bicep --outfile .azure\artifacts\blob-roles.json
az bicep build --file infrastructure\templates\web-sign-in.bicep --outfile .azure\artifacts\sign-in.json
pwsh -NoProfile -File infrastructure\scripts\tests\deployment-safety.test.ps1
pwsh -NoProfile -File infrastructure\scripts\tests\mvp-access.test.ps1
node --test infrastructure\scripts\tests\postgres-bootstrap.test.mjs
node --test infrastructure\scripts\tests\postgres-bootstrap-operations.test.mjs
node --test infrastructure\scripts\tests\app-service-response.test.mjs
npm test -- tests/unit/infrastructure.test.ts
```

These checks do not authenticate to Azure or PostgreSQL. Type compilation
does not verify name availability, quotas, billing, Azure policy, directory
membership or the installed cloud server's authentication extension.

Repository health also compiles every Bicep template with version 0.42.1, using
a SHA-256-verified compiler and no Azure credentials. String-based policy tests
remain supplemental checks, not a substitute for compilation.

The Bicep job also runs the deployment safety suite with `-BicepPath` set to the
verified compiler. It checks both runtime-role allowlists in compiled templates
and tests accepted/default and rejected role parameters through `build-params`.
The suite still runs its wrapper checks without Bicep when that option is absent.

The access safety suite accepts the same `-BicepPath` option. The Bicep job uses
it to evaluate matching, changed and missing Blob identity cases in both role
modes and to verify that compiled assignments consume only the identity bound
to the approved principal. Neither suite makes Azure calls.

Its firewall check imports and evaluates the template's actual address validator
using `bicep build-params`, compares results with the PowerShell wrapper, and
checks that compiled resources consume only the validated list. Run it locally
with the same installed compiler:

```powershell
pwsh -NoProfile -File infrastructure\scripts\tests\firewall-template.test.ps1 -BicepPath '<path-to-bicep-0.42.1>'
```

This evaluates valid/invalid inputs locally, including excluded ranges, malformed
addresses, duplicates and mixed lists. It does not contact Azure or prove a live
firewall rollout.

The bootstrap operations suite includes an opt-in real PostgreSQL test. Use a
dedicated, disposable PostgreSQL 17 instance exposed only on loopback with user
`postgres` and the synthetic password `synthetic-bootstrap-test-only`. Set
`SUNSUM_BOOTSTRAP_TEST_PORT` to its mapped port for that test command, then remove
the variable and stop the instance. The test creates and drops uniquely named
databases and roles; never point it at a shared database. It checks catalog SQL,
ACL preservation and reruns, not Azure Entra principal creation or cloud access.

## 2. Approved first-time provisioning

This section describes the earlier provisioning wrapper and its creation modes.
Do not use it for the current B1 test stack: its F1 guards and first-time-only
collision checks differ from the normal dev workflow. Use the
[deployment guide](deployment.md#infrastructure-deployment) for both creation and
reruns. The current root always deploys web, Storage and PostgreSQL modules.

Copy the parameter example to an ignored local file and replace every
placeholder. Keep the defaults only after the separate database budget review.

Before any Azure call, the provisioning wrapper validates `databaseName` against
the mandatory bootstrap contract: 1-63 lowercase ASCII letters, digits or
underscores, starting with a letter. It rejects `pg_` and `azure_` prefixes and
the reserved names `postgres`, `public`, `template0` and `template1`. An omitted
name keeps the `sunsum` default; valid custom names such as `sunsum_prod` remain
supported. Use the same name in bootstrap. The deployable `postgres.bicep`
module also validates the name used by its database resource, including direct
deployment; the Azure migration command rejects incompatible `PGDATABASE`
values before client creation. Bootstrap and migration share
`infrastructure/scripts/postgres-database-name-policy.json`, and compiler tests
check parity with the Bicep guard. These name checks do not inspect SQL readiness,
reserve resources or make provisioning transactional.

`webAppMode=Existing` is the default: the entry point references the named
existing app but does **not** change its code, plan, identity, settings or auth.
If its system identity is absent, the identity output is empty and bootstrap/RBAC
cannot proceed. For a new app, explicitly select `Create` with unused site/plan
names; `web.bicep` enables system identity on F1. Never select `Create` with a
live site's name: its full app-settings collection would be managed by that
template, potentially replacing a later sign-in secret or other settings.

Database/Storage names are globally constrained. Inspect inventory/name
availability and the planned resource diff before a future authorized deployment.
The provisioning script rejects existing PostgreSQL or Storage targets in both
web modes, and existing web app/plan targets in Create mode. Failed or malformed
inventory also blocks deployment. Use separately reviewed targeted operations
for subsequent changes. Existing mode also reads the named web app before any
deployment, requiring the exact subscription/group/resource ID, Linux web-app
kind, HTTPS-only setting and a valid public-cloud hostname. An absent, malformed,
or unreadable target stops provisioning rather than failing after new resources
are created.

After those checks, the script calls the providers' name-availability operations
for PostgreSQL and Storage in both modes, and for the web app in Create mode.
These POST operations are read-only: they neither reserve names nor create
resources. Only a boolean `nameAvailable=true` permits continuation; unavailable,
unknown, malformed and failed results stop before deployment. The names and
types come from the hash-verified inputs, and temporary JSON request files are
removed afterward. Operators need permission to perform these subscription-level
checks; failure is not permission to skip them or grant broader roles.

The preflights reduce predictable failures but do not reserve names against
concurrent provisioning or guarantee an all-or-nothing ARM deployment. Failures
from quotas, policy, later name claims or deleted targets can still leave partial
resources. Inspect deployment state before retrying; do not automatically delete
billable resources. Directly reapplying the core template bypasses these guards
and restores Storage's **closed** default; it is not a code-only deployment.

Prepare a separate ignored `.azure\dev\provision-approval.json` and record its
SHA-256 in the review. It must contain exactly these fields, with reviewed values:

```json
{
  "operation": "ProvisionInfrastructure",
  "subscriptionId": "<subscription-id>",
  "resourceGroupName": "<approved-resource-group>",
  "payloadSha256": "<reviewed-parameters-sha256>",
  "approvalReference": "<infrastructure-review>",
  "databaseBudgetApproval": "<approved-db-budget>",
  "storageBudgetApproval": "<approved-storage-budget>"
}
```

The approval file is not an ARM parameter file. Both dry-run and apply require
its reviewed digest and exact agreement with the explicit target, payload hash,
and approval arguments before any Azure call. Keep the original approval file
and digest with the deployment record; temporary snapshots are not audit storage.

```powershell
# LOCAL validation: no Azure calls without -Apply.
$parameters = '.azure\dev\resources.parameters.json'
$hash = '<sha256-recorded-in-the-approved-review>'
pwsh -NoProfile -File infrastructure\scripts\Provision-Infrastructure.ps1 `
  -SubscriptionId $env:AZURE_SUBSCRIPTION_ID -ResourceGroupName $env:AZURE_RESOURCE_GROUP `
  -ParametersPath $parameters -ExpectedSha256 $hash `
  -ApprovalPath .azure\dev\provision-approval.json -ApprovalSha256 '<reviewed-approval-sha256>' `
  -ApprovalReference '<infrastructure-review>' -DatabaseBudgetApproval '<approved-db-budget>' `
  -StorageBudgetApproval '<approved-storage-budget>'
# Future WRITE: repeat with -Apply only after authorization.
```

The script validates explicit inputs and the reviewed parameter hash, then uses
`az deployment group create --mode Incremental` only with `-Apply`. It never
registers a provider, switches the active subscription, or grants Azure roles.
Provisioning, access configuration and ZIP deployment use create-only temporary
copies verified against the reviewed SHA-256. Validation and CLI consumption use
the same copies; the original inputs and copies are held open with read-only
sharing until the operation finishes, and their hashes are rechecked before the
write. Temporary copies are removed on ordinary success, dry-run and failure;
an abruptly terminated process may leave copies in the operator's temporary
directory. Preserve originals and audit records separately.

Record hashes during review, not by recomputing them from edited inputs at apply
time. Keep inputs, templates, audit files and the temporary directory under the
operator's control and serialize deployment changes. File sharing is enforced
by Windows but may be advisory on other operating systems; these guards do not
defend against a compromised operator account or a writer bypassing OS sharing.
They also do not serialize remote Azure configuration changes.
An expected digest must come from the authorized review, not be generated from
the current input at apply time. These local records are integrity and target
checks, not digital signatures, Azure permissions, or proof of budget approval.

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

### Existing App Service identity and settings

After separate authorization, a resource administrator can add system identity
to the existing site without deploying its code or replacing its plan:

```powershell
# Future WRITE: only when absent, after inspecting existing identities.
az webapp identity assign --subscription $env:AZURE_SUBSCRIPTION_ID `
  --resource-group $env:AZURE_RESOURCE_GROUP --name $env:AZURE_WEB_APP_NAME
```

Preserve existing user-assigned identities. Capture the resulting
`identity.principalId` (not client ID) for database/Blob bootstrap. Recreating a
site changes this principal and requires explicit grant reconciliation.

Create an ignored JSON object containing only the reviewed **nonsecret** PG/Blob
settings above, then merge those settings using `az webapp config appsettings set
--settings @<local-json> --output none` with explicit subscription, group and name.
Do not replace the full configuration collection or export secrets into source
control. Check the existing Node/Oryx/TLS/F1 settings separately; identity and
configuration changes can restart the app and need a maintenance decision.
Do not supply operator credentials or overwrite the sign-in credential.

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

Record the SHA-256 of the exact UTF-8 approval file in the review. Supply that
reviewed digest as `ExpectedSha256`; do not recompute it from an edited file at
apply time and treat the result as approval. Changing even one address or the
file's formatting requires a new reviewed digest.

```powershell
# LOCAL ONLY by default: validates all input before any Azure command.
$reviewedHash = '<sha256-recorded-in-the-approved-review>'
pwsh -NoProfile -File infrastructure\scripts\Set-PostgresFirewall.ps1 `
  -SubscriptionId $env:AZURE_SUBSCRIPTION_ID -ResourceGroupName $env:AZURE_RESOURCE_GROUP `
  -PostgresServerName $env:AZURE_POSTGRES_SERVER_NAME -ApprovalFile .azure\dev\firewall-approval.json `
  -ExpectedSha256 $reviewedHash `
  -OutputPath .azure\dev\firewall-reviewed.parameters.json

# Future WRITE: after authorization, repeat with -Apply and a NEW output path.
```

Each generated rule uses **start=end**. The deployment records the nonsecret
approval reference as an input/output for audit. Apply only through the validating
script to retain the target-bound approval checks. The script hashes the bytes it
parses, creates a new parameter record without overwriting an existing file, and
rechecks the approval and generated-parameter hashes immediately before deployment.
It holds the parameter file open with read-only sharing until the Azure command
finishes. Keep review/apply files in an operator-controlled directory and serialize
changes; local file-sharing checks are not protection against a privileged local
actor or writers that bypass the operating system's sharing rules.
The template independently
rejects noncanonical addresses, the wrapper's excluded address ranges,
duplicates and lists exceeding 128 entries, including direct-template inputs.
Validation covers the whole list before the resource loop, so a mixed list fails
rather than creating a valid subset. It does not prove ownership or approval of
an address. The template is
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

Before this database step, resolve the separate Storage network/role gates below
if document access is part of the intended rollout; neither is automatically
performed by PostgreSQL bootstrap.

### Storage network and container roles

Storage differs from PostgreSQL: **public IP firewall rules cannot allow
same-region Azure services by their public outbound IPs**. Same-region traffic
uses private Azure addresses. F1 has no VNet integration; a private endpoint or
service-endpoint-only account is not reachable from this app. Do not copy the
PostgreSQL IP rules into Storage and call the connection ready.

The chosen cheapest MVP path is an **authenticated public Storage endpoint with
private containers**, subject to explicit tenant-policy approval. This permits
network access from anywhere, but it does not permit anonymous Blob access:
`allowBlobPublicAccess=false`, both containers have `publicAccess=None`,
`allowSharedKeyAccess=false`, HTTPS/TLS 1.2 and Entra data-plane RBAC remain
required. Easy Auth protects the web app, not the Blob endpoint. A browser's web
session is not a Blob credential.

`Closed` sets `publicNetworkAccess=Disabled` and keeps `defaultAction=Deny` with
no bypass. This disables public-network data access rather than only denying it
through ACLs. `AuthenticatedPublic` enables that access only with a nonblank
policy approval. The template uses the same condition for its endpoint, ACL and
`networkAccessEnabled` output. The script rejects unapproved public mode before
any Azure call. Disabling public-network access does not configure private
endpoints or prove that existing private paths are inaccessible.

If policy forbids this public data-plane network, leave `Closed` in place and
mark Blob runtime access **blocked**. A paid/private-network architecture needs a
separate decision; no IP trick, trusted-service bypass or shared key is provided.
The operator's own network must also be permitted for direct data-plane checks;
successful ARM container creation does not prove Blob access.

1. A resource administrator creates the account/containers in closed mode.
   Copy `storage-network.example.json` into ignored configuration. Keep `Closed`
   until policy approval; then explicitly select `AuthenticatedPublic` and record
   `publicEndpointApproval` and the target-bound change review.
2. An authorized RBAC administrator reviews the web principal and deploys
   `storage-role-grants.bicep` separately. `Reader` is the default; `Contributor`
   must be selected explicitly for a later upload integration and includes
   read/write/delete. The two assignments are scoped only to `site-documents`
   and `project-documents`. There is no subscription/RG/account-wide Blob role,
   no grant to the browser participant, and no SAS/key fallback.
3. Validate with the web identity: permitted container operations should succeed,
   unrelated containers should fail, and anonymous/key-based access must fail.
   RBAC propagation can take time; never broaden the scope as a retry strategy.

For each access operation, use a reviewed input and a new output path.
The parameters file and both possible audit sidecars must be absent. All records
use create-only writes, so an existing baseline cannot be replaced even if a
file appears after the initial check. Preserve these records for rollback review.

Every operation's parameters record retains `approvalReference`, including
`StorageNetwork` which uses a direct CLI update instead of an ARM deployment.
This change-review reference is separate from `publicEndpointApproval` (the
tenant-policy approval). The Storage template declares the optional reference
and exposes it as `APPROVAL_REFERENCE`; adding it does not activate public access.

```powershell
$inputFile = '.azure\dev\storage-network.json'
$hash = '<sha256-recorded-in-the-approved-review>'
# LOCAL ONLY by default. For roles use -Operation BlobRoles and blob-roles.json.
pwsh -NoProfile -File infrastructure\scripts\Deploy-AccessConfiguration.ps1 `
  -Operation StorageNetwork -SubscriptionId $env:AZURE_SUBSCRIPTION_ID `
  -ResourceGroupName $env:AZURE_RESOURCE_GROUP -ConfigurationPath $inputFile `
  -ExpectedSha256 $hash -OutputPath .azure\dev\storage-network-reviewed.json
# Future WRITE: use a NEW output path and -Apply after separate authorization.
```

`StorageNetwork` checks the existing private/LRS baseline, requires HTTPS-only
and minimum TLS 1.2, and refuses to replace existing IP/VNet/resource exceptions.
It checks the Azure CLI response fields `enableHttpsTrafficOnly` and
`minimumTlsVersion` (the corresponding Bicep HTTPS property is
`supportsHttpsTrafficOnly`). Missing or incompatible transport settings block
both modes and require separately reviewed remediation, not automatic changes.
Its targeted Azure CLI update changes only
network mode/bypass/public-endpoint properties, preserving tags and containers.
The storage Bicep parameter exposes the same approved choice for declarative
deployment. `BlobRoles` verifies that the supplied principal matches the named
web app, checks disabled shared-key/anonymous account access and HTTPS/TLS,
and reads both containers through ARM to require `publicAccess=None` before
deploying assignments. These are control-plane reads, not Blob data access or
account-key requests. The wrapper passes the reviewed `webPrincipalId` as
`approvedWebPrincipalId`. The template resolves the identity from `webAppName`
and fails if it differs from that approved ID or is absent. Assignments use only
the normalized approved principal, not a newly discovered replacement. An
identity removed after evaluation can still invalidate the deployment or leave
an obsolete grant; inspect state and obtain new approval rather than retrying
against a new identity automatically. Its assignment names now use
the web resource ID; inspect legacy principal-based assignments and identity
recreation conflicts before deploying. Cleanup requires separate review.
Role-assignment writes
require an administrator only for this setup/change, not every code deployment.
Switching Reader/Contributor is additive in incremental deployments: inspect and
explicitly remove the obsolete, precisely identified assignment after review.

StorageNetwork also requires the existing `networkRuleSet.bypass` to be exactly
`None`. Missing, unknown, `AzureServices`, `Logging`, or `Metrics` bypass settings
block the update, just like existing IP/VNet/resource-access exceptions. Removing
such exceptions requires a separate reviewed operation; this script does not
silently remove them by sending `--bypass None`.

### PostgreSQL administrator procedure

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
$bootstrapHash = '<sha256-recorded-in-the-approved-review>'
node infrastructure\scripts\bootstrap-postgres.mjs --config .azure\dev\bootstrap.json --expected-sha256 $bootstrapHash
# Future privileged SQL WRITE, after administrator login and separate approval:
node infrastructure\scripts\bootstrap-postgres.mjs --config .azure\dev\bootstrap.json --expected-sha256 $bootstrapHash --apply
```

The hash covers the exact UTF-8 bootstrap file, including target, principal IDs
and approval reference. Only verified bytes are parsed. The file is rechecked
before each connection and changed values are never adopted. A change between
the two phases stops phase two but cannot undo completed phase-one changes.

This tool uses only `AzureCliCredential` for the explicitly selected tenant,
fresh PostgreSQL audience tokens in memory and certificate/hostname-verified
TLS. It does not log server errors or credentials, write tokens, set an Azure
`PGPASSWORD`, or create a password login. Root `pg` and `@azure/identity`
dependencies must already have been restored.

Bootstrap requires `runtimeRole=sunsum_runtime` and
`operatorRole=sunsum_migrator`, matching the template and migration-tool contracts.
Omitted names keep those defaults; other names are rejected before authentication
or SQL calls. Custom names require a coordinated, separately reviewed contract
change, not just a bootstrap override. Matching names do not prove permissions
or identity mappings; the checks below still apply.

The two bounded, transactional phases are:

1. Connect as the approved administrator to **`postgres`**, where the Entra
   functions are available. Verify its mapping, then create missing roles with
   `pg_catalog.pgaadauth_create_principal_with_oid(roleName, objectId,
   objectType, false, false)` using query parameters. The runtime type is
   `service`. Existing roles are accepted only when object ID, tenant, type and
   nonadmin flags match, with no privileged role attributes or memberships.
   A local password role or changed MI object ID is **not** silently relabeled.
2. Connect to the chosen app database. Refuse runtime-owned objects,
  runtime/operator database or `public` schema ownership, incorrectly owned existing schemas,
  PUBLIC database/public/metadata schema grants, runtime metadata access, and
  runtime application schema CREATE privileges.
   Create only the `drizzle` metadata schema, owned by the migration role.
   Preserve main's canonical `public` application schema. When needed,
   grant the administrator temporary migration-role membership for `SET ROLE`,
   then revoke it within the same transaction; preexisting membership options
  are not overwritten. Preserve existing application grants and grant
  **CONNECT only** to runtime/operator at database scope. Existing effective
  database CREATE/TEMPORARY privileges cause rollback, not automatic revocation.
  The operator owns metadata, not the database or public schema.

Before phase two, an administrator must capture the database/schema ACL baseline,
identify roles relying on PUBLIC defaults, and approve a separate ACL transition
that preserves their required access with explicit grants. This is required even
for a new database with default PUBLIC grants. Bootstrap does not perform that
transition or provide a force switch. On reruns it preserves runtime `USAGE` on
the canonical `public` schema and existing per-table grants; it never revokes
database or schema privileges from PUBLIC, runtime, operator, or unrelated roles.

Bootstrap creates no business tables, broad runtime role grants, runtime `CREATE`,
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

The migration command requires that exact operator role name before constructing
a database client; administrator, runtime and arbitrary role names are rejected.
Use the same role in bootstrap. Custom names require a reviewed contract change,
and the name restriction does not substitute for bootstrap's non-admin identity
mapping and permission checks.

The Azure migration target must also satisfy the application-database naming
policy used by bootstrap and provisioning. `postgres`, `public`, `template0`,
`template1`, `pg_`/`azure_` prefixes, uppercase and other unsupported names are
rejected even when the approval matches. Use 1-63 lowercase ASCII letters,
digits or underscores, starting with a letter. This guard applies to application
migrations, not the general connection checker or bootstrap's intentional
administrator connection to the `postgres` maintenance database.

Review the journal and referenced SQL in `src/backend/db/migrations`, then obtain
their content digest with this local-only command (no database configuration,
credentials or connection needed):

```powershell
npm run db:migrate:azure -- --print-digest
```

Record that value as `migrationsSha256` in an ignored
`.azure\dev\migration-approval.json`, binding the SQL and captured `PG*`
environment to the reviewed operation. Record the approval file's own SHA-256
in the approval process as well; these are two different digests:

```json
{
  "operation": "DatabaseMigration",
  "host": "<server-name>.postgres.database.azure.com",
  "port": 5432,
  "database": "sunsum",
  "user": "sunsum_migrator",
  "authentication": "azure-cli",
  "sslMode": "verify-full",
  "statementTimeoutMs": 5000,
  "migrationsSha256": "<reviewed-journal-and-sql-sha256>",
  "approvalReference": "<migration-review>"
}
```

All fields are required; extra fields or mismatches fail before client creation.
Missing or unreadable approval files and malformed JSON are reported as local
configuration errors, not PostgreSQL connectivity errors. Diagnostics omit file
contents and paths, including if the approval file disappears before the final check.
The migration digest is SHA-256 of compact UTF-8 JSON containing ordered
`[relativePath, fileSha256]` pairs: `meta/_journal.json` first, then each referenced
`<tag>.sql` in journal order. Per-file hashes cover exact bytes, including line
endings, and use lowercase hex. Paths use `/`. Changes to SQL, journal ordering,
timestamps, names or formatting require a new digest and approval. Unreferenced
SQL and Drizzle Kit snapshot JSON are not executed and are not included.

The command verifies the captured bytes before constructing a client, parses
only that copy with Drizzle, and removes the temporary files after parsing.
Approval and source digests are rechecked after the permission preflight,
immediately before execution. Drizzle's PostgreSQL dialect and session then apply
the frozen in-memory migrations through the existing pool, preserving its
transaction and migration-history handling without rereading the source folder.
Edits after the final check cannot substitute SQL into that execution. Keep the
reviewed SQL, journal, approval and code revision together; don't recompute an
edited bundle's digest at apply time and treat it as approval. As with other
local guards, this does not protect against a compromised operator or changed
tooling/dependencies. An abrupt process termination may leave a temporary copy;
use an operator-controlled temporary directory.

```powershell
npm run db:check
# Future explicit SQL WRITE only after migration SQL and permissions review:
npm run db:migrate:azure -- --apply --approval .azure\dev\migration-approval.json --expected-sha256 '<reviewed-approval-sha256>'
```

Longer migrations can explicitly set `SUNSUM_MIGRATION_STATEMENT_TIMEOUT_MS`
in the operator process to a reviewed integer from 5,000 through 600,000 ms.
The default remains 5,000 ms. The migration client uses one connection and a
client query deadline 5,000 ms above the statement deadline. Application pool
limits remain unchanged; this is not an unlimited or whole-run timeout.

**Important Drizzle prerequisite:** PostgreSQL checks database `CREATE` before
honoring `CREATE SCHEMA IF NOT EXISTS`. The standard Drizzle PostgreSQL migrator
emits that statement for its `drizzle` metadata schema; merely precreating the
schema does not bypass the privilege check. Bootstrap intentionally grants no
permanent database `CREATE`. Canonical migrations from main also create tables
and the append-only trigger function in `public`; they require operator
`USAGE, CREATE ON SCHEMA public`. Both local `db:migrate` and the explicit Azure
operator command use the **same** `src/backend/db/migrations` journal/SQL; there
is no separate Azure schema or parallel migration history. Local seed/reset/probes
remain the existing loopback-only tooling and are not cloud rollout commands.

A read-only preflight checks these effective permissions before Drizzle makes any schema changes; it never
self-grants. A separately authorized administrator may open a bounded
**operator-only** permission window:

1. Record `current_user`, database owner, effective operator permissions,
   direct ACL entries and grantors, and the reviewed migration/code revision.
   If a required permission already exists (directly or through membership), preserve it:
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
       pg_catalog.has_database_privilege('sunsum_migrator', current_database(), 'CREATE'),
       pg_catalog.has_schema_privilege('sunsum_migrator', 'public', 'USAGE'),
       pg_catalog.has_schema_privilege('sunsum_migrator', 'public', 'CREATE');
SELECT grantor::regrole, grantee::regrole, privilege_type, is_grantable
FROM pg_catalog.pg_database d,
     LATERAL pg_catalog.aclexplode(COALESCE(d.datacl, pg_catalog.acldefault('d', d.datdba)))
WHERE d.datname = current_database();
SELECT grantor::regrole, grantee::regrole, privilege_type, is_grantable
FROM pg_catalog.pg_namespace n,
     LATERAL pg_catalog.aclexplode(COALESCE(n.nspacl, pg_catalog.acldefault('n', n.nspowner)))
WHERE n.nspname = 'public';
-- Only if CREATE was absent and this precise window was approved:
GRANT CREATE ON DATABASE "sunsum" TO "sunsum_migrator";
-- Grant only the schema permissions absent from the recorded baseline:
GRANT USAGE, CREATE ON SCHEMA "public" TO "sunsum_migrator";
-- After operator execution, including failure, only for the grant added above:
REVOKE CREATE ON DATABASE "sunsum" FROM "sunsum_migrator";
REVOKE USAGE, CREATE ON SCHEMA "public" FROM "sunsum_migrator";
-- Repeat the read-only queries and verify the recorded baseline.
```

This is an explicit manual administrative procedure, not automatic grant/revoke
logic. Never grant database `CREATE` to `sunsum_runtime` or make either principal
a database administrator to get past an error. Lost access preventing cleanup is
an operational blocker requiring administrator follow-up, not a successful close.

CONNECT-only plus `db:check` (`SELECT 1`) is not proof of table CRUD permissions or migration
completion. There is no public HTTP database diagnostic route.

## 6. Approved internal and guest user sign-in

Use a **precreated single-tenant workforce Web application registration** in the
approved tenant (FDPO for this demo). External collaborators must be invited,
redeem the invitation, satisfy tenant policies and be explicitly assigned.
No public self-service sign-up, automatic approval, personal-tenant fallback or
Azure subscription roles for participants are part of this design.

An authorized directory administrator must complete these steps, using the
[Entra admin center](https://entra.microsoft.com) or the organization's approved
directory automation. Standard ARM Bicep cannot create these workforce directory
objects; this PR does not introduce Graph Bicep preview or request broad Graph
permissions as a workaround.

1. Register or select the reviewed **single-tenant** Web app. Record the tenant
   ID, application/client ID and enterprise-app/service-principal object ID
   separately. Configure exact Web redirect URI
   `https://<app-hostname>/.auth/login/aad/callback`; add custom hosts only after
   hostname/TLS ownership review. Do not use `common`/`organizations`, wildcard
   redirect URIs, implicit-only flow, or public/native-client settings.
2. Configure the enterprise application with **Assignment required = Yes** and
   grant administrator consent to only the required sign-in permissions.
   Assign approved individual internal members and approved redeemed guests.
   Individual assignment avoids assuming group-assignment P1/P2 licensing;
   group-based/nested membership is not a substitute for the explicit list.
   Guest onboarding, conditional access/MFA and invitation policy remain the
   directory administrator's responsibility.
3. Create an appropriately short-lived client secret for authorization-code
   flow under the approved credential process. Place the value in an existing,
   **slot-sticky** App Service setting named, for example,
   `MICROSOFT_PROVIDER_AUTHENTICATION_SECRET`, through the secure portal or
   approved secret-injection channel. It is encrypted as an app setting but
   accessible to privileged app-setting readers: restrict access, track expiry,
   assign rotation ownership and rehearse renewal before the demo. Do not put
   the value in Bicep parameters, command-line arguments, `.env.example`,
   deployment output, logs, or this repository. No Key Vault service is added.
   A certificate or federated client assertion is a separate reviewed credential
   configuration, not an implicit-flow fallback supported by this template.
4. Record the **user/guest object IDs in the workforce tenant**, not home-tenant
   IDs, emails, group IDs, client IDs or the web managed identity. These must be
   the same participants assigned to the enterprise app. Copy
   `sign-in.example.json` to an ignored local file, fill the exact target and
   IDs, and set `directoryPrerequisitesConfirmed=true` only after verification.
5. Coordinate the activation window and recovery access before enabling the
   gate. `resources.bicep` never activates or disables sign-in. The separate
   `web-sign-in.bicep` requires explicit activation, a secret-setting reference
   and **1-13** participant GUIDs. Easy Auth's identity list limit is 500 total
   characters; 13 GUIDs remain below it. Empty lists mean unrestricted in the
   platform and are rejected here. If the approved audience grows beyond this,
   design a separately reviewed authorization strategy rather than truncate the
   list or broaden access to the whole tenant.

The sign-in template requires authentication on every application path,
tenant-specific issuer, the registration's audiences and the explicit `oid`
allowlist. It configures no external redirects, validates nonce, requires HTTPS,
and keeps a one-hour session cookie; token storage is disabled because this
foundation does not call downstream APIs as the participant. The app uses its
own managed identity for PostgreSQL/Blob, never a participant's subscription role.

```powershell
$inputFile = '.azure\dev\sign-in.json'
$hash = '<sha256-recorded-in-the-approved-review>'
# LOCAL validation only; no directory/secret/network calls.
pwsh -NoProfile -File infrastructure\scripts\Deploy-AccessConfiguration.ps1 `
  -Operation SignIn -SubscriptionId $env:AZURE_SUBSCRIPTION_ID `
  -ResourceGroupName $env:AZURE_RESOURCE_GROUP -ConfigurationPath $inputFile `
  -ExpectedSha256 $hash -OutputPath .azure\dev\sign-in-reviewed.json
# Future WRITE: new output path plus -Apply, only after administrator/user approval.
```

Both SignIn and BlobRoles read the site's `ftpsState` and require exactly
`Disabled`, then inspect the named app's FTP and SCM basic-publishing policies
through ARM. Only explicit `false` values permit continuation; missing, malformed
or failed reads stop before secret inspection or access deployment. Operators
need read permission for both publishing-policy resources. Remediation is a
separate approved operation; the script never disables settings automatically.
These preflights are not a lock against concurrent Azure configuration changes.

Before sign-in activation, the script also reads the site's `minTlsVersion` and
`scmMinTlsVersion` and requires each to be the string `1.2` or `1.3`. Older,
missing, malformed or unreadable settings block activation. It does not change
transport configuration; remediate it through a separate approved operation.

Before applying, the script inspects the existing site/auth and requires a
nonempty slot-sticky secret setting without printing its value. Existing enabled
auth is not replaced unless `allowReplaceExistingSignIn=true` is explicitly
reviewed; the previous auth configuration is recorded in the ignored output
directory. This is a **full authsettingsV2 replacement**, not an additive provider
patch. Directory assignments, secret validity/expiry and guest redemption cannot
be inferred from a parameter file and still require administrator verification.

Immediately before the deployment command, the script re-reads authsettingsV2
and aborts if the properties differ from its recorded baseline or cannot be
read, even when replacement was approved. This is a best-effort drift check,
not an atomic conditional update: the API contract used here does not document
an `If-Match` precondition and another writer can still act after the final
read. Serialize all sign-in configuration changes during the approved window
and verify the resulting configuration afterward. Do not rely on the recheck
as a lock or bypass it with a direct template deployment.

Verify anonymously (redirect, no application data), as an approved member, as an
approved guest, as an unassigned tenant user, as an unapproved guest, and with a
token issued for another tenant/audience. Only approved members/guests should
reach the app. Platform callbacks under `/.auth` are necessary for sign-in and
are not an anonymous business API. Check the API separately, not only the home
page. Do not exclude an API or a health path from authentication to pass a test.

This is an **authentication/admission gate**, not business role enforcement.
The fixed demo principals still supply owner/operator/investor endpoint identities,
`/join` still creates no account, and no persistent participant record is created
from claims. All admitted demo participants can reach the same role-specific
endpoints; this gate does not grant least-privilege business roles. Those
endpoints use the selected fixture or PostgreSQL store, so database mode can
persist actions performed under these fixed demo identities.
Future code must map trusted platform claims to application users/roles and
authorize site/project/document operations and implement cookie-session CSRF
protection or an appropriate bearer-token strategy. Do not trust spoofed identity headers
on local/ungated endpoints. Approved-participant sign-in is not full self-service
registration or a completed authenticated three-role MVP.

Maintain a reviewed participant register. Removal requires enterprise-app
unassignment, allowlist update and a tested session-revocation/expiry procedure;
directory unassignment alone must not be assumed to invalidate an existing app
cookie immediately. Do not set an empty allowlist to deny everyone. For urgent
all-user closure, obtain approval to take the app offline or use a reviewed
deny-all restriction while preserving authentication. Code rollback does not
restore auth, directory assignments, secrets or sessions.

## 7. Package and deploy code only

For the normal source-package/build/deploy command, start with
[application code deployment](deployment.md#application-code-deployment).
The entry composes the packager and uploader below, generating a fresh target-bound
execution record automatically. The lower-level path in this section remains
available when the ZIP and approval digest are supplied by a separate review.
Neither code path reads or changes the App Service plan.

The packaging script uses a source allowlist: root app manifests/lock/build
config, `app`, `src` and optional `public`. It excludes local env files, raw
`.npmrc`, `.azure`, `.git`, tests, unrelated tooling,
`.next`, caches, Windows `node_modules`, credential/certificate paths and
symbolic links. The source root itself must also be a real directory, not a
symbolic link or junction; a linked root is rejected before archive creation.
Required ZIP paths use exact Linux casing; `Package.json` and `app/Layout.tsx`
do not satisfy `package.json` and `app/layout.tsx`. Case-colliding entries are
also rejected, even when both spellings would exist on Linux.
Review source contents too: a path allowlist is not a secret
scanner. Configuration added outside this allowlist needs an explicit packaging
review. Each ZIP puts `package.json` at its root, not under a repository folder.

Oryx builds this source on Linux because `SCM_DO_BUILD_DURING_DEPLOYMENT=true`.
The documented `CUSTOM_BUILD_COMMAND` is
`npm ci --include=dev && npm run build`, preserving strict lockfile installation.
Build-time dependencies remain available for the TypeScript Next config;
neither local Windows dependencies nor local `.next` output is shipped.

Before rollout, prepare an ignored `.azure\dev\code-approval.json` with exactly
these fields and record its own digest in the review:

```json
{
  "operation": "CodeDeployment",
  "subscriptionId": "<subscription-id>",
  "resourceGroupName": "<approved-resource-group>",
  "webAppName": "<approved-web-app>",
  "payloadSha256": "<reviewed-zip-sha256>",
  "approvalReference": "<code-review-reference>",
  "expectedAccessMode": "Preview"
}
```

The target fields identify the exact App Service resource. Reusing the same ZIP
on a different target or changing the expected access mode requires a new review
record and digest. Use `ApprovedSignIn` only for an already approved sign-in site.

```powershell
$artifact = & .\infrastructure\scripts\New-AppServicePackage.ps1 `
  -OutputPath .azure\artifacts\web-reviewed.zip
$artifact | Format-List
# LOCAL validation by default, including the reviewed archive hash.
pwsh -NoProfile -File infrastructure\scripts\Deploy-AppServiceCode.ps1 `
  -SubscriptionId $env:AZURE_SUBSCRIPTION_ID -ResourceGroupName $env:AZURE_RESOURCE_GROUP `
  -WebAppName $env:AZURE_WEB_APP_NAME -PackagePath $artifact.Path `
  -ApprovalPath .azure\dev\code-approval.json -ApprovalSha256 '<reviewed-approval-sha256>' `
  -ExpectedSha256 $artifact.SHA256 -ApprovalReference '<code-review-reference>'
# Future WRITE: add -Apply only after authorization.
```

Both access-configuration and code-deployment operations require the `app` and
`linux` kind tokens and reject `functionapp`, including mixed-kind responses.
These operations are for the web application, not the separate viability service.
The ZIP allowlist and reviewed hash are checked against the temporary copy that
is passed to `az webapp deploy`, not against a source path later reopened for
upload. Access operations hash generated parameter bytes before writing their
create-only audit record, then deploy a protected copy of those same bytes.
The original audit record remains after temporary-copy cleanup. StorageNetwork
continues to use validated in-memory values, with record integrity checked before
its direct update; it does not read network settings back from the audit file.

The explicit Azure CLI path checks the existing Linux/HTTPS target,
`ftpsState=Disabled`, and disabled FTP/SCM basic-publishing policies using the
same publishing guard as access configuration. It also requires `NODE|22-lts`, the exact documented npm startup
command, `SCM_DO_BUILD_DURING_DEPLOYMENT=true`, and the documented custom build
command. Both site and SCM minimum TLS must be explicitly `1.2` or `1.3`, checked
in the same configuration read before the ZIP is uploaded. An enabled
`WEBSITE_RUN_FROM_PACKAGE` is rejected. Missing or different
settings stop the source ZIP upload and require a separately reviewed correction,
including when the foundation uses Existing web mode.
It then uses `az webapp deploy --type zip --clean true --track-status false
--timeout 600000`. The CLI timeout is in milliseconds, so this requests a
10-minute deployment timeout, not 600,000 seconds. It never changes resource
definitions, roles or app settings. It follows
deployment with at most 12 public-preview checks (10-second request timeout,
10-second retry delay), rather than relying on unbounded startup tracking.
Before sign-in activation use the default `-ExpectedAccessMode Preview` (HTTP
200). After activation explicitly use `-ExpectedAccessMode ApprovedSignIn`:
the bounded check expects the Microsoft/local Easy Auth redirect, not a public
200, and does not follow it or log tokens. A redirect alone proves neither
successful participant login nor application readiness.
On timeout, inspect deployment logs before retrying: a remote operation can
continue after the client exits. No automatic redeploy, tier change or rollback
is attempted.

`--clean true` explicitly requests cleanup of the deployment target before
installing the new artifact instead of relying on artifact/stack defaults.
The target directory must contain only replaceable application files; keep
documents, uploads and other persistent data outside it. Approve this cleanup
as part of code rollout, retain a compatible rollback ZIP, and account for
possible unavailability if the subsequent build/deployment fails. Local tests
verify the requested option and CLI capability gate, not live Kudu cleanup.

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
- [Storage firewall limitations, including same-region traffic](https://learn.microsoft.com/en-us/azure/storage/common/storage-network-security-limitations),
  [Storage Blob data roles](https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles/storage),
  and [private container ARM schema](https://learn.microsoft.com/en-us/azure/templates/microsoft.storage/storageaccounts/blobservices/containers).
- [Easy Auth workforce configuration, code flow and 500-character identity limit](https://learn.microsoft.com/en-us/azure/app-service/configure-authentication-provider-aad),
  [authsettingsV2 schema](https://learn.microsoft.com/en-us/azure/templates/microsoft.web/sites/config-authsettingsv2),
  and [enterprise-app assignment and licensing](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/assign-user-or-group-access-portal).

## Observability and private networking

`resources.bicep` declares two opt-in groups of resources. Both default to
false, so a deployment that does not set them keeps the previous four top-level
resources and their current cost.

| Parameter | Creates | Default |
| --- | --- | --- |
| `enableObservability` | Log Analytics workspace, workspace-based Application Insights component, diagnostic settings on the web app and the PostgreSQL server, and the site's `APPLICATIONINSIGHTS_CONNECTION_STRING` setting | `false` |
| `enablePrivateNetworking` | Virtual network with `snet-app` and `snet-privatelink`, the blob private endpoint and its network interface, the `privatelink.blob.*` private DNS zone, the virtual-network link, the private DNS zone group, and App Service regional virtual-network integration | `false` |

`.github/workflows/deploy-azure2.yaml` and `resources.dev.bicepparam` set both
to true for the dev-test target, with these names:

| Resource | Dev-test name | Portal location |
| --- | --- | --- |
| Log Analytics workspace | `log-sunsum-dev-test-centralus` | Resource group → the workspace → **Logs** |
| Application Insights | `appi-sunsum-dev-test-centralus` | Resource group → the component → **Overview**, **Logs** |
| Diagnostic settings | `send-to-log-analytics` | App Service or PostgreSQL server → **Monitoring → Diagnostic settings** |
| Virtual network | `vnet-sunsum-dev-test-centralus` | Resource group → the network → **Subnets** |
| Blob private endpoint | `pe-stsunsumdevtestcentralus-blob` | Resource group → the endpoint → **DNS configuration** |
| Private DNS zone | `privatelink.blob.core.windows.net` | Resource group → the zone → **Recordsets**, **Virtual network links** |
| Virtual-network link | `vnet-sunsum-dev-test-centralus-link` | The private DNS zone → **Virtual network links** |
| App Service integration | `snet-app` | App Service → **Networking → Virtual network integration** |

The workflow prints the same names, and direct portal links, in its job summary
and returns them as deployment outputs (`AZURE_LOG_ANALYTICS_WORKSPACE_NAME`,
`AZURE_APPLICATION_INSIGHTS_NAME`, `AZURE_VIRTUAL_NETWORK_NAME`,
`AZURE_BLOB_PRIVATE_ENDPOINT_NAME`, `AZURE_BLOB_PRIVATE_DNS_ZONE_NAME`,
`AZURE_PRIVATE_DNS_ZONE_LINK_NAME`, `AZURE_DIAGNOSTIC_SETTING_NAME`). The
Application Insights connection string is read by the web module from the
deployed component; it is never written to a deployment output.

Cost and network assumptions to confirm before deploying:

- Log Analytics ingestion and retention are billed. The workspace is created
  with a 1 GB daily cap (`logAnalyticsDailyQuotaGb`) and 30-day retention
  (`logAnalyticsRetentionDays`). The cap stops ingestion for the rest of the
  UTC day; it is a cost guard, not a quality-of-service setting.
- `10.30.0.0/16` is used for the dev-test network so it does not overlap the
  `10.20.0.0/16` range that `main.bicep`'s optional network path uses. Confirm
  both ranges are free in the subscription; overlapping ranges break routing
  rather than failing deployment.
- The delegated `snet-app` prefix cannot be resized after the plan joins it.
- PostgreSQL keeps public network access with separately approved individual
  firewall rules. It gets no private endpoint here; moving it behind private
  link is a reviewed architecture change.
- Storage keeps `publicNetworkAccess` disabled, shared-key access disabled and
  the network ACL default action Deny. The private endpoint is the route to the
  data plane, not an exception to that posture.
- `Microsoft.OperationalInsights`, `Microsoft.Insights` and `Microsoft.Network`
  must be registered in the subscription. The workflow checks this and fails
  with a named provider before attempting any deployment.

Deployment stays Incremental and rerunnable: the added resources are declared
by name, so a repeat run reports no change rather than recreating them.
