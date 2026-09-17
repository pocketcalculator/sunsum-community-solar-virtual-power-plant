---
title: Infrastructure templates
description: Deployable infrastructure templates and parameter examples for Sunsum
---

## Purpose

Store infrastructure-as-code templates and non-sensitive parameter examples in
this directory. Keep environment-specific values outside committed templates.

## Templates

| Template | Deploys |
| --- | --- |
| [`storage.bicep`](./storage.bicep) | The site-document storage account, its two disclosure-class containers, soft delete, and optionally a private endpoint and the data-plane role assignments. See [blob storage](../docs/blob-storage.md). |

Check a template against the live resource group before deploying it:

```powershell
az deployment group what-if `
  --resource-group rg-sunsum-solar-dev-centralus `
  --template-file infrastructure/templates/storage.bicep
```
