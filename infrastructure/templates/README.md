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
| [`main.bicep`](./main.bicep) | Everything below, composed. The entry point. |
| [`storage.bicep`](./storage.bicep) | The site-document storage account, its two disclosure-class containers, soft delete, and optionally a private endpoint and the data-plane role assignments. See [blob storage](../docs/blob-storage.md). |
| [`network.bicep`](./network.bicep) | The VNet, the delegated App Service subnet, the private-endpoint subnet and the `privatelink.blob` DNS zone that the private endpoint needs to resolve. |

`main.bicep` has two shapes, and the default one changes nothing:

```powershell
# Storage only. This is the current state of the resource group; costs nothing.
az deployment group create `
  --resource-group rg-sunsum-solar-dev-centralus `
  --template-file infrastructure/templates/main.bicep

# Additionally build the network that makes the blob data plane reachable.
# Moves the App Service plan from Free F1 to B1, which bills.
az deployment group create `
  --resource-group rg-sunsum-solar-dev-centralus `
  --template-file infrastructure/templates/main.bicep `
  --parameters enablePrivateBlobAccess=true
```

The private path is opt-in because it is the fallback. The cheaper route is a
policy exemption, which nobody in this workstream can grant — the request is
written up in
[policy exemption request](../docs/policy-exemption-request.md), and
`npm run blob:doctor` reports which blockers are currently active.

Check a template against the live resource group before deploying it:

```powershell
az deployment group what-if `
  --resource-group rg-sunsum-solar-dev-centralus `
  --template-file infrastructure/templates/main.bicep
```

Both shapes were checked that way. With the private path off, what-if reports no
change beyond server-populated defaults. With it on, it reports the VNet, DNS
zone, zone link and private endpoint as creates, the plan as `F1 => B1`, and the
App Service itself as **ignored** — the site is never declared, so its app
settings and current release are untouched.
