---
title: Deployment
description: Default dev infrastructure commands, deployment behavior, and earlier smoke-app notes
---

## Shared deployment configuration

Both `Deploy-Infrastructure.ps1` and `Deploy-Application.ps1` default to
[`infrastructure/config/dev.json`](../config/dev.json). Use the same `-ConfigPath`
for both when selecting a local environment config. Infrastructure and code
remain separate commands; running either never invokes the other.

| Config field | Used by |
| --- | --- |
| `subscriptionId`, `resourceGroupName`, `webAppName` | Shared target for both commands. |
| `infrastructure.deploymentName` | Infrastructure deployment record. |
| `infrastructure.templatePath`, `infrastructure.parametersPath` | Infrastructure Bicep inputs; paths resolve from the config directory. |
| `code.expectedAccessMode` | Code deployment's HTTP response check: `Preview` or `ApprovedSignIn`. |

Each command validates the shared target and only its own section. Code deployment
does not read Bicep inputs, compile templates or require PostgreSQL identity values.
Native `.bicepparam` files still own resource settings and private identity inputs.
The compiled `webAppName` must match the shared config (case-insensitive); a
missing or different name stops infrastructure validation before Azure calls,
even in local-only mode. When changing the app name, update both declarations.
This check prevents input drift; it does not verify that a live app was previously
created by these templates. Code deployment always targets the selected config.

For an older local config, move `deploymentName`, `templatePath` and `parametersPath`
under `infrastructure`, add the shared `webAppName`, and add
`code: { "expectedAccessMode": "Preview" }`. Review the target while migrating.
The earlier separate code config is retired; the scripts reject the old flat
schemas rather than choosing a fallback target. Config cannot enable apply.

## Infrastructure deployment

Use `infrastructure/scripts/Deploy-Infrastructure.ps1` for the first deployment
and subsequent updates. The same command handles unchanged reruns; there is no
separate repeat-deployment mode or first-time provisioning step for this path.

The dev template manages a Linux **B1/Basic** plan, fixture-backed web app and
private Storage, plus a new PostgreSQL server, Entra administrator and empty
database. This is a separate infrastructure test copy in the existing resource
group, not a clone of source data, users, grants or runtime settings. It does not
deploy application code or enable application database access. Network approvals,
SQL bootstrap, schema migrations and application activation remain separate
operations in the [operating guide](app-service-postgres.md).

B1 is a paid tier explicitly selected for this dev experiment after Azure rejected
Linux F1 creation in the target resource group (`FreeLinuxSkuNotAllowedInResourceGroup`).
This is not an automatic fallback or evidence that B1 has deployed successfully.

### Test targets

| Resource | Name |
| --- | --- |
| Resource group (existing) | `rg-sunsum-solar-dev-centralus` |
| Deployment record | `sunsum-dev-test-infrastructure` |
| App Service plan | `asp-sunsum-dev-test-centralus` |
| Web app | `app-sunsum-dev-test-centralus` |
| Storage account | `stsunsumdevtestcentralus` |
| PostgreSQL server | `db-sunsum-dev-test-centralus` |
| Database (new server) | `sunsum_test` |

Names identify resource type, project, environment, test purpose and region;
Storage omits hyphens to meet its naming rules. Resource tags use `dev-test`.
The containers retain `site-documents` and `project-documents` under the new
account; other child names such as `default` and `ftp` are scoped to their new
parents. These names select deployment targets, not Azure resource renames.
Missing targets are created; targets that already exist are updated to the
declared state. Inspect the preview rather than assuming every target is new.
Resources under other names and any partial earlier attempts are not cleaned up
by changing parameters; cleanup requires a separate review.

PostgreSQL uses the restored creation defaults: version 17, Burstable
`Standard_B1ms`, 32 GiB, seven-day local backups and Entra-only authentication.
It has a public endpoint with no firewall allowances. Storage is network-closed
with private containers and disabled shared keys. B1 hosting, PostgreSQL and
Storage are separately billable; this is not a data restore of the existing server.

The public native parameter file redacts `tenantId`, `postgresAdminObjectId`
and `postgresAdminPrincipalName`. The two IDs use the all-zero UUID and the name
uses `<postgres-admin-principal-name>`. These are compilation placeholders, not
deployable identities. Preview/apply rejects them locally before any Azure call.

Use the [local identity setup](#local-identity-setup) below before preview/apply.
No passwords, tokens or environment variables are required in these parameter
files; Azure CLI authentication is still required for cloud operations.

### Prerequisites

- PowerShell 7.2+ and Bicep CLI (validated with 0.42.1), installed through the
  approved tool process. The script uses `bicep` from PATH or an explicit
  `-BicepPath <installed-executable>`; it does not install tools or restore remote
  modules automatically.
- The versioned [dev config](../config/dev.json),
  [native parameters](../templates/resources.dev.bicepparam) and Bicep sources.
  A fresh clone supports local compilation. Supply the three redacted identity
  values before preview/apply; no precompiled deployment bundle or approval file
  must be prepared first.
- Azure CLI, sign-in and appropriate permissions for preview/apply only. The
  target resource group must already exist. Confirm name availability, Central US
  web/Storage/PostgreSQL names, B1 and PostgreSQL quota, charges and Azure policy
  before authorizing deployment; compilation does not verify these cloud conditions.
  Deployment also requires permission to configure the new PostgreSQL Entra
  administrator; selecting an identity is not proof of those permissions.

### GitHub Actions OIDC credential

The `azure-infrastructure` environment uses GitHub Actions OIDC, not a client
secret. GitHub now emits this repository's immutable, ID-qualified subject:

```text
repo:pocketcalculator@34637263/sunsum-community-solar-virtual-power-plant@1370296682:environment:azure-infrastructure
```

Entra must have a federated identity credential with that exact issuer, subject
and audience for the application identified by `AZURE_CLIENT_ID`. The legacy
name-only subject does not match and causes `AADSTS700213` before any Azure
deployment command runs.

An authorized identity administrator can add the versioned credential while
signed in to the intended tenant. This is a cloud write and must not be run as
part of ordinary deployment:

```powershell
$applicationObjectId = az ad app show `
  --id '<AZURE_CLIENT_ID>' `
  --query id `
  --output tsv

az ad app federated-credential create `
  --id $applicationObjectId `
  --parameters '@infrastructure/config/github-actions-azure-infrastructure.federated-credential.json'
```

Keep the previous credential until a main-branch workflow dispatch signs in
successfully, then separately review its removal. Repository changes alone
cannot update an Entra application registration.

### Local identity setup

The recommended deployment setup keeps private values out of tracked files.
The following local copies are needed only for preview/apply, not for the default
local compilation command. No compiled artifacts or approval files are inputs.

1. Create `.azure/dev/` if needed. Copy `infrastructure/config/dev.json` to
   `.azure/dev/deployment.local.json` and `infrastructure/templates/resources.dev.bicepparam`
   to `.azure/dev/resources.local.bicepparam`. Do not overwrite existing local
   copies without reviewing them.
2. In the local config, keep the approved shared subscription, resource group and
  web-app name, plus the code section. Under `infrastructure`, keep the deployment
  name, set `templatePath` to `../../infrastructure/templates/resources.bicep`
   and `parametersPath` to `resources.local.bicepparam`.
3. In the local parameters, set the first line to
   `using '../../infrastructure/templates/resources.bicep'`. Supply the approved
   values for the fields below and verify that `postgresAdminPrincipalType`
  matches the selected identity (`User`, `Group` or `ServicePrincipal`). Keep the
  native `webAppName` equal to the shared config's `webAppName`.
4. Keep both local copies ignored by Git. Do not force-add them, paste real values
   into the public parameter file, or include generated artifacts in a commit.

| Local parameter | Value to supply |
| --- | --- |
| `tenantId` | The approved Entra tenant ID, a nonempty UUID. |
| `postgresAdminObjectId` | The selected administrator's object ID in that tenant, not an app/client ID. |
| `postgresAdminPrincipalName` | The approved principal name matching that object and principal type. |

If `.azure/dev/identity-values.json` already exists on your machine, it is only a
local reference for these three values. The script does not create or load it,
and the repository does not provide the real values. Obtain them through your
approved identity process if you do not have that local reference. Do not change
the Azure CLI deployment identity or grant roles as part of filling these fields.

Both infrastructure paths resolve relative to `.azure/dev/`; the native `using` path
resolves relative to the local parameter file. The script verifies that they
refer to the same Bicep root. Local copies do not automatically pick up later
changes to the tracked dev inputs: compare them before each deployment.

### Commands

Run from the repository root. The first command works with the public redacted
parameters and needs no Azure login:

```powershell
# Compile and validate locally; no Azure calls.
pwsh -NoProfile -File infrastructure/scripts/Deploy-Infrastructure.ps1
```

After completing [local identity setup](#local-identity-setup), use the same
local config for preview and apply:

```powershell
# Read-only Azure preview.
pwsh -NoProfile -File infrastructure/scripts/Deploy-Infrastructure.ps1 -ConfigPath .azure/dev/deployment.local.json -Preview
# Azure writes, only after reviewing the preview and authorizing deployment.
pwsh -NoProfile -File infrastructure/scripts/Deploy-Infrastructure.ps1 -ConfigPath .azure/dev/deployment.local.json -Apply
```

Without `-ConfigPath`, the infrastructure script reads `infrastructure/config/dev.json`,
whose referenced parameters still contain redactions. Adding only `-Preview` or `-Apply` will
therefore fail locally until real identity inputs are supplied. `-Preview` and
`-Apply` are mutually exclusive; neither is implied by the config. See the
[template configuration contract](../templates/README.md#configuration-contract)
for the inputs and their ownership.

### Generated artifacts

Each run compiles the native parameters and referenced template together,
verifies that the `using` target matches the configured root, and writes a unique
directory under ignored `.azure/dev/deployments/`. It contains `template.json`,
`parameters.json` and `manifest.json` with the target and file hashes.
Preview/apply also saves `what-if.json`.

These outputs and older local config/approval files are not prerequisites.
Generated hashes record the compiled inputs; they are not independent approval
or permission to deploy. Keep secrets out of source/parameter files and protect
the generated artifacts too.

### Deployment behavior

`-Apply` compiles, previews, then deploys the same protected compiled bytes in
Incremental mode. It does not recompile between preview and apply. A separate
invocation recompiles current sources and runs a new preview, so source changes
after an earlier preview must be reviewed again.

Stable names make creation, updates and unchanged reruns part of the normal
workflow. `Create`, `Modify` and `NoChange`, mixed results and empty change lists
are accepted. Template-owned settings overwrite manual drift, including property
removal. Provider defaults can produce recurring what-if differences; an empty
preview is not required for a valid rerun.

Reported resource deletions, unresolved diagnostics, duplicate IDs and writes
outside the configured resource group are blocked. Planned and referenced App
Service plans must be B1/Basic. What-if must expose `sku.name=B1`; Azure may omit
the derived `sku.tier`, but when supplied it must be the string `Basic`.
Existing-plan reads still require both fields. Other SKUs, conflicting or malformed
tiers and missing SKU names block deployment. What-if can mask or omit properties,
and a successful preview is not a guarantee that resource-provider validation will
accept an apply. The checks do not replace source review, budget approval, Azure
Policy or RBAC.

All top-level test resources use distinct names from the earlier resources.
Incremental mode leaves those earlier resources in place; it neither deletes
them nor stops their charges. A new app gets a new system-assigned identity;
database and Blob grants for another app do not transfer. The template reapplies
`SUNSUM_STORE=mock` and closed Storage networking, so do not use an infrastructure
apply as a code-only deployment to an activated application.

Preview/apply is not atomic. Serialize deployments and inspect partial failures
before retrying. There is no automatic retry, rollback, resource-group creation
or tier fallback. The script checks the deployment CLI exit code and reports
success or failure; it does not add application, resource or SQL probes after
deployment. A successful infrastructure operation alone does not prove the
application or its database connection works.

### Recovering from a partial failure

On an unsuccessful apply, the command saves `deployment-error.txt` under that
run's ignored artifact directory, shows any parsed Azure error codes, and prints
a read-only command to inspect failed deployment operations. Raw diagnostics can
contain identity values; keep them local. If the failed target is a nested
deployment, inspect its operations using its name as well. A deployment's summary
error can contain only wrapper codes while its operations hold the provider error.

`ServerIsBusy` indicates another operation on the PostgreSQL server. An accompanying
`AadAuthOperationCannotBePerformedWhenServerIsNotAccessible` can reflect readiness
rather than an incorrect administrator. Neither message alone proves the cause.
The PostgreSQL module serializes secure-transport configuration, minimum TLS,
Entra administrator and database creation after the server to prevent its own
child writes from competing. Other deployments and provider settling can still
cause temporary failures.

Before a manual retry, inspect partial resources and confirm the server is `Ready`
with no other updates running. Run a fresh preview and then apply the same config;
existing resources are reconciled rather than intentionally recreated. Do not
delete the server or resource group, change identity or weaken TLS to get past a
busy error. Persistent readiness failures need investigation; authorization,
policy and validation errors require resolution, not repeated retries. Only
continue to code deployment after infrastructure apply succeeds. No automated
wait/retry loop or extra post-apply Azure calls are added.

The legacy `Provision-Infrastructure.ps1` wrapper is not the entry point for this
test composition. Migration of the Azure deployment workflow to
the current entry remains deferred; the commands above are the manual path.
Legacy provisioning still requires F1/Free. Code-only deployment is separate and
does not inspect the plan SKU or change infrastructure.

## Application code deployment

Pushes to `main` that touch application sources deploy automatically through
[`.github/workflows/deploy-app.yml`](../../.github/workflows/deploy-app.yml);
the manual PowerShell entry below remains available for local or out-of-band
deployments. Both paths package and ship the same allowlisted source.

### Automatic deployment from `main`

The **Deploy SunSum application code** workflow runs on every push to `main`
that changes `app/`, `src/`, `public/`, `package.json`, `package-lock.json`,
`next.config.ts`, `tsconfig.json` or the workflow file itself, and can also be
dispatched manually. It is queued through a concurrency group so two pushes
cannot upload competing packages.

The job installs dependencies with `npm ci` and then runs `npm run lint`,
`npm run typecheck`, `npm test` and `npm run build`. Any failure stops the run
before Azure sign-in, so a broken build never reaches the web app. It then
fails fast when `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` or `AZURE_SUBSCRIPTION_ID`
is missing, signs in with the same federated OIDC credential and
`azure-infrastructure` environment used by the infrastructure workflow, and
invokes `Deploy-Application.ps1 -Apply` with the run identifiers as the review
reference. The target web app therefore comes from the same
[shared dev config](../config/dev.json) the manual path uses; the workflow does
not restate it. Reusing that script keeps packaging, the guarded upload and the
bounded HTTP verification identical to the manual path. Artifacts are written
under the runner temporary directory and removed when the job ends.

The workflow deploys application code only: it applies no Bicep template,
creates no resources and neither sets nor changes `SUNSUM_STORE`,
`SUNSUM_BLOB`, `SUNSUM_VIABILITY` or any other app setting. The web app must
already exist with the reviewed runtime and Oryx build settings before a code
deployment can succeed.

### Infrastructure validation and deployment

Pushes to `main` that change `infrastructure/templates/`,
`infrastructure/config/`, `infrastructure/scripts/`, or
`.github/workflows/deploy-azure2.yaml` automatically run the **validate** job
in [`deploy-azure2.yaml`](../../.github/workflows/deploy-azure2.yaml). It builds
the Bicep template and runs Azure deployment validation and `what-if`; it never
creates Azure resources.

To create or update infrastructure, manually dispatch that workflow. Its
**deploy** job runs only after validation succeeds and uses the
`azure-infrastructure` environment, so any required reviewers configured for
that environment continue to gate billable Azure writes.

### Manual deployment

Use `infrastructure/scripts/Deploy-Application.ps1` as the single source-to-service
entry. It packages the source, validates the ZIP and records its hash and target.
With `-Apply`, it calls the existing guarded uploader, waits for the Azure CLI
deployment result and performs the existing bounded homepage/sign-in check.

```powershell
# Package and validate locally; no build, installation, or Azure calls.
pwsh -NoProfile -File infrastructure/scripts/Deploy-Application.ps1
# Package, upload, build on Azure and verify HTTP, only after authorization.
pwsh -NoProfile -File infrastructure/scripts/Deploy-Application.ps1 -Apply -ApprovalReference 'approved-code-review'
```

Replace the illustrative review reference with the actual approved change or
operator decision. Applying uploads code and can restart the app. It does not
create resources, change the plan, mutate app settings or grant database/Blob
access. It never retries the upload automatically or rolls back a partial failure.

The [shared dev config](../config/dev.json) supplies the same subscription,
resource group and web-app name used for infrastructure. `code.expectedAccessMode`
selects an HTTP verification expectation (`Preview` or `ApprovedSignIn`), not a
deployment mode or identity configuration. Code deployment ignores the
`infrastructure` section and needs neither Bicep nor PostgreSQL identity inputs.
It can package or deploy code even while the native parameters remain redacted.

If infrastructure uses a local config, pass that same file here rather than
falling back to the committed target:

```powershell
pwsh -NoProfile -File infrastructure/scripts/Deploy-Application.ps1 -ConfigPath .azure/dev/deployment.local.json -Apply -ApprovalReference 'approved-code-review'
```

Inspect the shared target before every apply; `-ConfigPath` does not activate
infrastructure deployment or change the application's runtime configuration.

The default source is the repository containing the script, independent of the
current terminal directory; `-SourceRoot <directory>` overrides it. The packager
uses its existing path allowlist and can include local/uncommitted application
edits, so review the source before deploying. Each invocation creates a unique
ignored `.azure/code/deployments/<app>-<guid>/` with `web-source.zip` and
`deployment-record.json`. `-OutputRoot <directory>` overrides that destination;
keep it outside application source and out of source control. The generated record
binds the target, review reference, HTTP mode and ZIP digest. It is execution
evidence, not independent approval or permission to deploy.

The build runs on Azure Linux through Oryx using the existing
`SCM_DO_BUILD_DURING_DEPLOYMENT=true` and
`CUSTOM_BUILD_COMMAND=npm ci --include=dev && npm run build` settings. This command
does not run a local npm build or upload Windows dependencies or `.next` output.
Without `-Apply`, success means packaging/validation passed, not that the app built.
An apply packages current sources again; use the lower-level
[reviewed-artifact path](app-service-postgres.md#7-package-and-deploy-code-only)
when a separately approved, fixed ZIP must be deployed unchanged.

The existing app must be HTTPS-only Linux with Node 22, the reviewed startup/build
settings, TLS 1.2 or newer and FTP/SCM basic publishing disabled. Plan SKU and plan
read permissions are not checked. PowerShell 7.2+ is required; apply also needs an
authenticated Azure CLI that supports `webapp deploy --clean` and `--track-status`
and permission to inspect and deploy to the named app. A successful HTTP check
does not verify application readiness, database access, document storage or user
authorization. Inspect remote build/deployment logs before retrying a failure.

Runtime setup remains separate: production sessions need `SUNSUM_SESSION_SECRET`
supplied through an approved secret process. Demo sign-in must be explicitly
approved and restricted to trusted demo users. For a fixture-only deployment,
retain `SUNSUM_STORE=mock`, `SUNSUM_BLOB=memory` and `SUNSUM_VIABILITY=demo`; this
script neither sets nor changes those modes. Real database, Blob and viability
integration remains a separate rollout decision.

## Earlier database-backed smoke app

The remaining sections describe the earlier `app-service.bicep` smoke-app path,
not the default infrastructure command above. That template targets a different
web app and activates its database-backed store. Do not apply both templates to
the same app or copy its database grants to the new fixture app without a
separate activation review. Use the [operating guide](app-service-postgres.md)
for current network approvals, bootstrap and guarded code-deployment procedures.

### What deploys

`infrastructure/templates/app-service.bicep` describes the App Service plan, the
web app, and the settings that point it at PostgreSQL. The earlier manual
sequence is recorded under [Deploying](#deploying) below.

Automation for that path uses a federated credential rather than a stored
password. `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` and `AZURE_SUBSCRIPTION_ID` are
repository secrets that identify the application registration to sign in as;
none of them is itself a secret value, and no deployment credential is stored in
GitHub. App Service has basic publishing credentials disabled, so this is the
only way in.

### What the template covers

The template owns the App Service plan, the web app, its system-assigned managed
identity, and the application settings that point the app at PostgreSQL. It
contains no secrets, because there is no database password to hold: the
application presents an Entra token instead.

The PostgreSQL server is deliberately outside the template. It is shared, it
holds data, and it is administered separately, so a deployment of the
application should not be able to alter or replace it. The template takes its
host name and database name as parameters instead.

### The one-time database grant

A managed identity can be created by a template, but the matching PostgreSQL
role cannot: roles live in the database rather than in Azure Resource Manager.
Run this once per environment, and again if the web app is ever recreated, since
a new site receives a new identity.

Two details cause most of the trouble here:

- The `pgaadauth` functions exist only in the `postgres` maintenance database,
  not in the application database. Connecting to the application database and
  finding no such function is the expected result, not a broken server.
- The password administrator cannot create Entra principals. PostgreSQL will
  refuse with a message about security labels. Connect as an Entra
  administrator, which means signing in with a token rather than a password.

Collect the identity the template reported:

```bash
az deployment group show \
  --resource-group rg-sunsum-solar-dev-centralus \
  --name <deployment-name> \
  --query "properties.outputs.principalId.value" \
  --output tsv
```

Sign in to the maintenance database as an Entra administrator and create the
role. The role name must equal the web app name, because that is the name the
earlier template sets as the username in `DATABASE_URL`. This is distinct from
the current test stack's `PGUSER` operator output:

```bash
PGPASSWORD="$(az account get-access-token --resource-type oss-rdbms --query accessToken --output tsv)" \
  psql "host=db-sunsum-dev-centralus.postgres.database.azure.com \
        port=5432 dbname=postgres sslmode=verify-full \
        user=<your-entra-admin-name>"
```

```sql
SELECT pgaadauth_create_principal_with_oid(
  'app-sunsum-smoke-928e5e28',
  '<principal-id>',
  'service',
  false,
  false
);
```

Roles are cluster-wide, so the role created in `postgres` is the same role the
application database sees. Reconnect to the application database and grant it
what the application needs:

```sql
GRANT CONNECT ON DATABASE sunsumsolardb TO "app-sunsum-smoke-928e5e28";
GRANT USAGE ON SCHEMA public TO "app-sunsum-smoke-928e5e28";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO "app-sunsum-smoke-928e5e28";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO "app-sunsum-smoke-928e5e28";

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES
  TO "app-sunsum-smoke-928e5e28";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES
  TO "app-sunsum-smoke-928e5e28";
```

The default privileges matter: without them a later migration that adds a table
leaves the application unable to read it, and the failure appears long after the
change that caused it.

Database network access requires separately approved exact App Service egress
IPs. Follow the [network approval procedure](app-service-postgres.md#3-review-exact-network-allowances);
do not enable the broad "Allow Azure services" firewall bypass.

### How the hosted app proves who it is

The application chooses its credential from the host name: anything ending in
`.postgres.database.azure.com` authenticates with a Microsoft Entra token, and
anything else uses the password in `DATABASE_URL`. The template sets
`SUNSUM_DB_AUTH=entra` as well, so a host name change cannot quietly downgrade a
deployed environment into looking for a password that was never configured.

The connection string the template builds therefore carries no password, and its
user is the web app name, because that is the PostgreSQL role the grant above
creates for the site identity.

`AZURE_CLIENT_ID` must stay unset on the web app. It selects *which*
user-assigned identity to authenticate as, and setting it on a site that uses a
system-assigned identity sends the token request looking for an identity that
does not exist. The repository secret of the same name is unrelated: it belongs
to the deployment sign-in described above and never reaches the site.

### Deploying

Apply the template, then ship the tracked files:

```bash
az deployment group create \
  --resource-group rg-sunsum-solar-dev-centralus \
  --template-file infrastructure/templates/app-service.bicep \
  --parameters infrastructure/templates/app-service.dev.bicepparam

git ls-files -z | xargs -0 zip -q -X deploy.zip
az webapp deploy \
  --resource-group rg-sunsum-solar-dev-centralus \
  --name app-sunsum-smoke-928e5e28 \
  --src-path deploy.zip --type zip
```

Package the tracked files rather than the working tree. A plain archive of the
directory carries local build output and any untracked local configuration into
the deployment.

`az webapp deploy` can report a gateway timeout for a deployment that is in fact
still running and will succeed. Confirm the outcome with
`az webapp log deployment show` rather than trusting the timeout.

Then confirm the site serves records out of PostgreSQL:

```bash
curl -s https://app-sunsum-smoke-928e5e28.azurewebsites.net/api/portfolio \
  | jq '.project_count'
```

This is the check that matters. `SUNSUM_STORE` is set to `db` with no fallback
to the in-memory fixtures, so a successful read exercises the managed identity,
the TLS verification and the table grants together. Allow for a cold start on
the free tier: the first request after an idle period can fail while the site is
still waking.

### When the site returns 500

`SUNSUM_STORE` is `db` with no fallback, so anything that stops the site from
reaching PostgreSQL surfaces as a 500 from every data route. That looks like a
failed deployment and usually is not one. Read the container log first:

```bash
az webapp log tail --resource-group rg-sunsum-solar-dev-centralus \
  --name app-sunsum-smoke-928e5e28
```

The cause is in the error the query throws, and the two common ones are
distinct.

`connect ETIMEDOUT <address>:5432` is a network failure: nothing accepted the
connection. The usual reason is that the database server is stopped, which is
easy to miss because every other resource stays healthy and the site itself
reports as running.

```bash
az postgres flexible-server show --resource-group rg-sunsum-solar-dev-centralus \
  --name db-sunsum-dev-centralus --query state --output tsv
```

If the server is `Stopped`, an explicitly authorized operator can start it with
`az postgres flexible-server start` using the same target arguments. Wait for
`Ready` and verify connectivity; this is a separate cloud write, not a routine
infrastructure retry. If the server is running, compare the site's current
egress IPs with the approved exact-IP firewall rules. Any allowance changes
require separate review; do not enable an Azure-wide bypass.

`Password returned by client is empty` is the opposite case: the connection
reached PostgreSQL and the access token never arrived. That points at the token
path in `src/backend/db/client.ts` rather than at infrastructure.

### Environment notes

The earlier smoke-app parameters request the free F1 tier; that is not a check
of the live plan's current SKU. F1 cannot keep the site warm, so the
first request after an idle period is slow, and it has a daily CPU quota that
can stop the site altogether. A paid tier requires a separate budget and
deployment decision; it is not a fallback for a failed deployment or cold start.

The database is a Burstable B1ms flexible server. Both tiers are sized for
development rather than for a demonstration.
