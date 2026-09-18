---
title: Infrastructure workspace
description: Location for infrastructure templates, documentation, and architecture diagrams
---

## Contents

* `config/dev.json` selects the dev target and versioned source inputs
* `templates/` contains deployment entry templates and native Bicep parameter files
* `templates/modules/` contains reusable Bicep modules invoked by entry templates
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

The current dev entry references existing PostgreSQL and an existing App Service
plan, and manages the fixture-only web app and private Storage. It does not create
or change the database or plan. Exact-IP review and privileged SQL bootstrap are distinct from
routine code deployment. Only local preparation/checks are represented here,
not new cloud resources, working Azure managed-identity connectivity or
business-data persistence. The guide records administrator gates, retail budget
assumptions and pending Python viability/logging/health/business integrations.

From the repository root, `pwsh -File infrastructure/scripts/Deploy-Infrastructure.ps1`
compiles the versioned sources locally. Add `-Preview` for read-only what-if or
`-Apply` for an explicitly authorized Incremental deployment. Generated artifacts
go under ignored `.azure/dev/deployments/`; no prebuilt files are required.
