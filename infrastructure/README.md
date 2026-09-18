---
title: Infrastructure workspace
description: Location for infrastructure templates, documentation, and architecture diagrams
---

## Contents

* `templates/` contains deployable infrastructure templates and parameter examples
* `scripts/` contains guarded packaging, network-approval, deployment, and SQL-bootstrap tools
* `docs/` contains architecture notes, deployment guidance, and decisions
* `diagrams/` contains editable diagram sources and exported images

Keep credentials, production configuration, personal data, and telemetry out of
this directory. Document assumptions, units, regions, and security boundaries
alongside each infrastructure design.

## Prepared App Service / PostgreSQL foundation

See the [preparation and operating guide](docs/app-service-postgres.md) for
parameterized Bicep, approved-user sign-in, private Blob containers, Azure CLI scripts, local validation and future
separately authorized operations. Azure uses Linux
App Service **F1 code deployment** plus separately billable Entra-only
PostgreSQL Flexible Server and Standard LRS Hot Blob storage; no customer
container image or registry is needed.

The core targets an existing resource group. PostgreSQL starts without firewall
allowances; exact-IP review and privileged SQL bootstrap are distinct from
routine code deployment. Only local preparation/checks are represented here,
not new cloud resources, working Azure managed-identity connectivity or
business-data persistence. The guide records administrator gates, retail budget
assumptions and pending Python viability/logging/health/business integrations.
