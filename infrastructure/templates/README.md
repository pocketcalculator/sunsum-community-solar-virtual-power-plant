---
title: Infrastructure templates
description: Deployable infrastructure templates and parameter examples for Sunsum
---

## Purpose

Store infrastructure-as-code templates and non-sensitive parameter examples in
this directory. Keep environment-specific values outside committed templates.

## Prepared entry points

| Template | Scope | Use |
| --- | --- | --- |
| `resources.bicep` | Resource group | Linux F1 App Service and separately billable Entra-only PostgreSQL in an existing group. |
| `postgres-firewall.bicep` | Resource group | Only approved individual IPv4 rules for an existing PostgreSQL server; no rules by default. |

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
Follow the [operating guide](../docs/app-service-postgres.md) for approval,
provisioning, bootstrap and code-only deployment; never use group complete mode
or resource-group deletion to clean up this shared/persistent foundation.
