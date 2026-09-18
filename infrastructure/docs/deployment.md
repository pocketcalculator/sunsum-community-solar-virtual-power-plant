---
title: Deployment
description: How the Sunsum application reaches Azure, and the one-time database grant that must be performed by hand
---

## What deploys

`infrastructure/templates/app-service.bicep` describes the App Service plan, the
web app, and the settings that point it at PostgreSQL. Applying it and shipping
the code is a manual sequence today, written out under [Deploying](#deploying)
below.

A workflow that performs that sequence on every push to `main` is not in the
repository yet. It is written, but adding it needs a credential carrying
GitHub's `workflow` scope, which the change that introduced this template could
not supply. Until it lands, the manual steps are the supported path.

That workflow signs in with a federated credential rather than a stored
password. `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` and `AZURE_SUBSCRIPTION_ID` are
repository secrets that identify the application registration to sign in as;
none of them is itself a secret value, and no deployment credential is stored in
GitHub. App Service has basic publishing credentials disabled, so this is the
only way in.

## What the template covers

The template owns the App Service plan, the web app, its system-assigned managed
identity, and the application settings that point the app at PostgreSQL. It
contains no secrets, because there is no database password to hold: the
application presents an Entra token instead.

The PostgreSQL server is deliberately outside the template. It is shared, it
holds data, and it is administered separately, so a deployment of the
application should not be able to alter or replace it. The template takes its
host name and database name as parameters instead.

## The one-time database grant

A managed identity can be created by a template, but the matching PostgreSQL
role cannot: roles live in the database rather than in Azure Resource Manager.
Run this once per environment, and again if the web app is ever recreated, since
a new site receives a new identity.

Two details cause most of the trouble here:

* The `pgaadauth` functions exist only in the `postgres` maintenance database,
  not in the application database. Connecting to the application database and
  finding no such function is the expected result, not a broken server.
* The password administrator cannot create Entra principals. PostgreSQL will
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
        port=5432 dbname=postgres sslmode=require \
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

The server also needs its firewall to allow Azure services, which App Service
relies on for outbound access.

## How the hosted app proves who it is

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

## Deploying

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

## When the site returns 500

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
back in this state. If the server is running, check that the firewall still
carries a rule admitting Azure services, since the site reaches the database
over its public endpoint.

`Password returned by client is empty` is the opposite case: the connection
reached PostgreSQL and the access token never arrived. That points at the token
path in `src/backend/db/client.ts` rather than at infrastructure.

## Environment notes

The development plan is the free F1 tier. It cannot keep the site warm, so the
first request after an idle period is slow, and it has a daily CPU quota that
can stop the site altogether. Move the plan to B1 before relying on it for a
demonstration; the template takes the SKU as a parameter.

The database is a Burstable B1ms flexible server. Both tiers are sized for
development rather than for a demonstration.
