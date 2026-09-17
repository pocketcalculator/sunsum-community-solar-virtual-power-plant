---
title: Infrastructure templates
description: Deployable infrastructure templates and parameter examples for Sunsum
---

## Purpose

Store infrastructure-as-code templates and non-sensitive parameter examples in
this directory. Keep environment-specific values outside committed templates.

## Contents

* `app-service.bicep` provisions the App Service plan, the web app, its managed
  identity, and the settings that connect it to PostgreSQL
* `app-service.dev.bicepparam` holds the values for the shared development
  environment

The parameters are committed rather than kept outside the repository because
none of them is a secret. The application authenticates to PostgreSQL with a
managed identity, so there is no connection password to withhold. A template
that needs a secret should take it from Key Vault rather than from a parameter
file.

See [deployment](../docs/deployment.md) for how these templates are applied and
for the database grant that must accompany a newly created web app.
