---
title: Deployment
description: Default dev infrastructure commands, deployment behavior, and earlier smoke-app notes
---

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
parents. These are new deployment targets, not Azure resource renames. Existing
resources and any partial earlier attempts are not deleted or modified by this
name change and require separate review before cleanup.

PostgreSQL uses the restored creation defaults: version 17, Burstable
`Standard_B1ms`, 32 GiB, seven-day local backups and Entra-only authentication.
It has a public endpoint with no firewall allowances. Storage is network-closed
with private containers and disabled shared keys. B1 hosting, PostgreSQL and
Storage are separately billable; this is not a data restore of the existing server.

The public native parameter file redacts `tenantId`, `postgresAdminObjectId`
and `postgresAdminPrincipalName`. The two IDs use the all-zero UUID and the name
uses `<postgres-admin-principal-name>`. These are compilation placeholders, not
deployable identities. Preview/apply rejects them locally before any Azure call.

Keep the real values in ignored `.azure/dev/identity-values.json` on your machine;
that file is a local reference, not automatically loaded by the script. For an
authorized deployment, supply them in your local native parameter file and restore
the placeholders before committing. Alternatively, use an ignored copy of the
parameters and config through `-ConfigPath`, adjusting relative paths and the
native `using` target. Never force-add the local values or generated artifacts.
No passwords, tokens or environment variables are required by this input contract.

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

### Commands

Run from the repository root:

```powershell
# Compile and validate locally; no Azure calls.
pwsh -NoProfile -File infrastructure/scripts/Deploy-Infrastructure.ps1
# Read-only Azure preview.
pwsh -NoProfile -File infrastructure/scripts/Deploy-Infrastructure.ps1 -Preview
# Azure writes, only after reviewing the preview and authorizing deployment.
pwsh -NoProfile -File infrastructure/scripts/Deploy-Infrastructure.ps1 -Apply
```

The default config is `infrastructure/config/dev.json`. Its paths resolve from
the config directory, not the terminal directory. `-ConfigPath <file>` selects
an explicit alternative; no environment selector is required. See the
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
and the checks do not replace source review, budget approval, Azure Policy or RBAC.

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

The legacy `Provision-Infrastructure.ps1` wrapper is not the entry point for this
test composition. Migration of the Azure deployment workflow to
the current entry remains deferred; the commands above are the manual path.
The separate `Deploy-AppServiceCode.ps1` and legacy provisioning guards still
require F1/Free and will reject this B1 app. Their scope has not been expanded by
this infrastructure experiment; code deployment needs a separate reviewed change.

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
application presents as `PGUSER`:

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

A `Stopped` server starts with `az postgres flexible-server start` using the
same arguments, and reaches `Ready` in about a minute. The site recovers on its
next request without redeployment. Azure also stops a flexible server on its
own after seven idle days, so a demo environment left alone over a break comes
back in this state. If the server is running, compare the site's current egress
IPs with the approved exact-IP firewall rules. Any allowance changes require
separate review; do not enable an Azure-wide bypass.

`Password returned by client is empty` is the opposite case: the connection
reached PostgreSQL and the access token never arrived. That points at the token
path in `src/backend/db/client.ts` rather than at infrastructure.

### Environment notes

The development plan is the free F1 tier. It cannot keep the site warm, so the
first request after an idle period is slow, and it has a daily CPU quota that
can stop the site altogether. A paid tier requires a separate budget and
deployment decision; it is not a fallback for a failed deployment or cold start.

The database is a Burstable B1ms flexible server. Both tiers are sized for
development rather than for a demonstration.
