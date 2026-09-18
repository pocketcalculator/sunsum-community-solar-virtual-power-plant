---
title: Infrastructure documentation
description: Architecture notes, deployment guidance, and infrastructure decisions for Sunsum
---

## Purpose

Store infrastructure architecture notes, deployment guidance, operational
procedures, and decision records in this directory.

## Selected database and hosting

As of September 16, 2026, the selected persistence stack is **Azure Database
for PostgreSQL Flexible Server with Drizzle ORM**, using Drizzle Kit for
schema and migrations.
The web application uses Linux App Service code deployment; its F1 smoke test
does not require Container Apps or a container registry. See the
[technical design](../../docs/sunsum_technical_design_doc.md) for the decision.

The [App Service / PostgreSQL operating guide](app-service-postgres.md) describes
the prepared Bicep/Azure CLI foundation, local checks, exact-IP approval and explicit
Entra SQL bootstrap. This preparation does not provision or connect a cloud
database. No orchestration framework is required.

For reviewed create/update reruns, see
[repeatable infrastructure deployment](app-service-postgres.md#repeatable-infrastructure-deployment).
For dev, `pwsh -File infrastructure/scripts/Deploy-DevInfrastructure.ps1` reads
all reviewed values from ignored `.azure/dev/deployment.json`; add `-Preview`
for what-if or `-Apply` for separately authorized writes.
That command accepts template-owned updates and no-change runs; the separate
first-time provisioning command retains its resource-collision guards.

The separate [development deployment guide](deployment.md) records the existing
Azure environment and its verified PostgreSQL-backed application deployment.
That path uses managed identity rather than a database password. It also records
the one-time database grant that a template cannot perform. These recorded
results do not certify a new deployment of the broader preparation foundation.
F1 is the web-hosting tier only; PostgreSQL compute and storage costs must be
confirmed separately.

If enabling [Fabric mirroring](https://learn.microsoft.com/en-us/fabric/mirroring/azure-database-postgresql),
use a supported General Purpose or Memory Optimized PostgreSQL server.
Burstable is not a supported mirroring source; do not assume a low-cost
development server can enable that feature without a tier and budget decision.

## Needed provider registrations

The following is a previously recorded September 16, 2026 snapshot, not a
check performed by the new templates and not a guarantee of current access,
quotas, or deployment permission. Confirm the chosen subscription explicitly.

| Service | Provider | Observed state | Action |
| --- | --- | --- | --- |
| Azure Database for PostgreSQL Flexible Server | `Microsoft.DBforPostgreSQL` | Registered (September 16, 2026 update) | Verify in the selected subscription; do not re-register routinely. |
| New Azure-billed Fabric capacity | `Microsoft.Fabric` | Not registered | Enable only if creating new capacity; existing capacity or an eligible trial is a separate path. |

After separate authorization, a subscription administrator can register the
selected database provider only if a target subscription actually needs it
(the observed subscription does not; this preparation does not execute it):

```azurecli
az provider register --subscription <subscription-id> --namespace Microsoft.DBforPostgreSQL --wait
```

This enables the provider; it does not create a database or grant the application
database access. Resource-group deployment permissions do not necessarily allow
subscription-level provider registration.

## Providers already registered

| Service | Provider |
| --- | --- |
| App Service / Azure Functions | `Microsoft.Web` |
| Blob Storage / Functions storage | `Microsoft.Storage` |
| Key Vault | `Microsoft.KeyVault` |
| User-assigned managed identities | `Microsoft.ManagedIdentity` |
| Application Insights | `Microsoft.Insights` |
| Log Analytics | `Microsoft.OperationalInsights` |
| Networking, if needed | `Microsoft.Network` |

Entra app registration and sign-in require directory configuration and
permissions, not another resource provider. Fabric capacity, workspace access,
and licensing are also separate prerequisites.

## Not needed for the selected path

- `Microsoft.Sql`: Azure SQL Database is not the selected database.
- `Microsoft.ContainerRegistry`: source-code deployment does not publish images.
- `Microsoft.App`: not required by the Next.js App Service deployment.

The separate Python viability service still needs a hosting decision.
[Azure Functions Flex Consumption VNet integration](https://learn.microsoft.com/en-us/azure/azure-functions/flex-consumption-how-to)
requires `Microsoft.App`; revisit that provider only if selecting that
configuration or another service that needs it. Do not enable unrelated
providers as a substitute for resolving the service requirements.
