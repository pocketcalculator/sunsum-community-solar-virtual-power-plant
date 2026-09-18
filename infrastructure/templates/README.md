---
title: Infrastructure templates
description: Deployable infrastructure templates and parameter examples for Sunsum
---

## Purpose

Store infrastructure-as-code templates and non-sensitive parameter examples in
this directory. Keep environment-specific values outside committed templates.

## Development environment

- `app-service.bicep` declares the App Service plan, web app, managed identity
  and application settings for the existing development environment.
- `app-service.dev.bicepparam` contains the non-secret shared development values
  introduced on main. It does not contain a database password.

See the [development deployment guide](../docs/deployment.md) for that path and
the database grant required for a newly created web identity. This is distinct
from the preparation entry points below; review which template owns a site's
settings before applying either to the same app. Keep new approval records and
identity details for the preparation workflow in ignored local configuration.

## Prepared entry points

| Template | Scope | Use |
| --- | --- | --- |
| `resources.bicep` | Resource group | Fixture-only Linux F1 App Service and separately billable Entra-only PostgreSQL in an existing group; database activation is separate. |
| `postgres-firewall.bicep` | Resource group | Only approved individual IPv4 rules for an existing PostgreSQL server; no rules by default. |
| `storage.bicep` | Resource group | Standard LRS Hot private containers, shared keys disabled; closed by default with explicit policy-approved authenticated-public mode. |
| `storage-role-grants.bicep` | Resource group | Separate administrator grant to the web identity at the two container scopes only. |
| `web-sign-in.bicep` | Resource group | Explicit opt-in Easy Auth on an existing app; precreated workforce registration and nonempty approved-user/guest allowlist. |

`web.bicep` and `postgres.bicep` are reusable core modules. The
`resources.parameters.example.json` placeholders are intentionally not
deployable. Copy them into ignored local configuration; never replace
them with real environment/identity details in source control.

Compile locally with `az bicep build --file <entry-point> --outfile <local-json>`.
Use an ignored `.azure\artifacts\` output directory. Compilation makes no cloud
changes and does not validate quotas, cost, directory membership or Azure
policy. The web module has no implicit paid-tier fallback.

`web.bicep` explicitly sets `SUNSUM_STORE=mock` and has no database parameters or
database app settings. The root retains `PG*` outputs for separate operator setup;
app activation requires reviewed `DATABASE_URL`/`SUNSUM_DB_AUTH` settings and grants.
Do not reapply the preparation template over an activated app to deploy code.

`resources.bicep` allows only `sunsum_runtime` for its output-contract
`runtimeRoleName`, including direct-template deployments. The provisioning
wrapper rejects other names before Azure calls. This is a configuration guard,
not SQL privilege enforcement; the separate bootstrap must verify that the role
maps to the runtime identity and is non-admin. Custom runtime names need a
reviewed contract change rather than a parameter override.

Use the validating firewall script rather than passing raw IP input to the
network template. Incremental deployment does not remove old allowances.
The firewall template also validates the entire address list before generating
rules: canonical decimal IPv4 only, no duplicate entries, maximum 128, and the
same excluded address ranges as the wrapper (including the `0.0.0.0` bypass).
An invalid list fails evaluation rather than deploying just its valid entries.
These exclusions implement this repository's policy, not an assertion that every
accepted address is routable or approved. The wrapper still binds input to the
reviewed target and approval record.

The core template does not enforce first-time creation; that guard remains in
the supported `Provision-Infrastructure.ps1` entry point, together with provider
name-availability checks and exact existing-web target validation. Preflights
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
