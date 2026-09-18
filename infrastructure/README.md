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

## Deployment

Start with the [deployment guide](docs/deployment.md#infrastructure-deployment)
for local validation, Azure preview and explicitly authorized deployment.
Creating, updating and reapplying infrastructure use the same source-driven
entry point; generated artifacts are not prerequisites.

The current dev entry manages an explicitly requested, billable Linux B1/Basic
plan, fixture-only web app, private Storage and a new Entra-only PostgreSQL server
with an empty database. Every top-level resource uses a separate test name in the
existing resource group. It does not copy data or change the previous resources.

## Service operations

See the [preparation and operating guide](docs/app-service-postgres.md) for
parameterized Bicep, approved-user sign-in, private Blob containers, Azure CLI scripts, local validation and future
separately authorized operations. Azure uses Linux
App Service code deployment plus separately billable Entra-only
PostgreSQL Flexible Server and Standard LRS Hot Blob storage; no customer
container image or registry is needed. The separate code-deployment script retains
its F1-only guard and does not yet support the new B1 experiment.

Exact-IP review and privileged SQL bootstrap are distinct from
routine code deployment. Only local preparation/checks are represented here,
not new cloud resources, working Azure managed-identity connectivity or
business-data persistence. The guide records administrator gates, retail budget
assumptions and pending Python viability/logging/health/business integrations.
