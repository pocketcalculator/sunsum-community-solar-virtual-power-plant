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
| `resources.bicep` | Resource group | Linux F1 App Service and separately billable Entra-only PostgreSQL in an existing group. |
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

Use the validating firewall script rather than passing raw IP input to the
network template. Incremental deployment does not remove old allowances.
The firewall template does not classify public/reserved IP ranges, and the core
template does not enforce first-time creation. Those checks belong to the
supported `Set-PostgresFirewall.ps1` and `Provision-Infrastructure.ps1` entry
points. A caller with direct Azure write permissions can bypass local checks;
enforcing restrictions against that caller requires separately managed Azure
Policy/RBAC controls. No such policy enforcement is provisioned here.

The Blob-role template takes `webAppName` and derives its system-assigned
principal from that resource in the target group. `webPrincipalId` remains an
approval check in the wrapper's input, not a template parameter. Assignment
names now derive from the web resource ID rather than the principal ID. Review
existing assignments before upgrading from older templates or recreating an
identity; do not automatically delete or retarget conflicting assignments.

Follow the [operating guide](../docs/app-service-postgres.md) for approval,
provisioning, bootstrap and code-only deployment; never use group complete mode
or resource-group deletion to clean up this shared/persistent foundation.
