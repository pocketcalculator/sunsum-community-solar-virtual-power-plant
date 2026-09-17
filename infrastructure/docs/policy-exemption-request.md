# Policy exemption request: blob data-plane access for the hackathon demo

This is a ready-to-send request. It exists in the repository rather than in a
chat thread because the decision it asks for is the only thing standing between
the deployed application and working document storage, and whoever picks this
up next needs the evidence, not a summary of it.

**Ask:** a policy exemption for `rg-sunsum-solar-dev-centralus`, or the
`Storage Blob Data Contributor` role plus an alternative route to the data
plane.

**Required to grant:** Owner, or Resource Policy Contributor, at the
subscription or at management group `08cc2a62-5116-449e-bed1-98c29bd48de7`.
Resource-group Contributor is not sufficient and cannot be made sufficient from
inside the resource group.

## What is blocked

Site documents — the electricity bill collected at intake, and the screening
reports, site summaries and land reports the charter adds later — are stored as
blobs in `stsunsumsolardevcus`. The account, its containers, soft delete and
its template all exist and are correct.

The data plane is unreachable. Uploading or downloading a document against the
deployed environment fails, so `SUNSUM_BLOB` is pinned to `memory` or `azurite`
and the deployed application cannot store a real file.

## Why it is blocked

An Azure Policy assignment named `mcapsgovdeploypolicies`, applied at management
group `08cc2a62-5116-449e-bed1-98c29bd48de7`, includes a definition
`StorageAccount_PublicNetwork_Modify` with a **modify** effect. It rewrites
`publicNetworkAccess` to `Disabled` on every create and every update.

The failure mode is quiet, which is what makes it worth writing down: the ARM
call to set it returns **HTTP 200 with no error**, and the property reads back
as `Disabled` immediately afterwards. Nothing in the response indicates that a
policy overrode the request.

A sibling definition, `StorageAccount_DisableLocalAuth_Modify`, pins
`allowSharedKeyAccess` to `false` the same way, so connection strings and
account keys are not an alternative route. Access is Entra plus RBAC only.

## Evidence

Each row was attempted directly against the live subscription, not inferred.

| Attempt | Result |
| --- | --- |
| `az storage account update --public-network-access Enabled` | Exit code 0, no error. Value reads back `Disabled`. |
| `az policy exemption create ...` | `AuthorizationFailed` on `Microsoft.Authorization/policyExemptions/write`. |
| `az policy assignment show` at the management group | `AuthorizationFailed` on `Microsoft.Authorization/policyAssignments/read`. |
| `az role assignment list --all` for the signed-in principal | Exactly one assignment: `Contributor` on `/resourceGroups/rg-sunsum-solar-dev-centralus`. |

To reproduce the diagnosis, run `npm run blob:doctor`. It performs the same
checks read-only and prints which blocker is currently active.

Note that the network rejection happens **before** RBAC is evaluated, so while
this is in place a correct role assignment and a missing one are
indistinguishable. The evidence is the error code: an authenticated request
carrying a valid `https://storage.azure.com/` token is refused with
`AuthorizationFailure`, not the `AuthorizationPermissionMismatch` that a missing
role produces. Granting the role first, on its own, changes nothing observable.

## Option A — policy exemption, then enable public access

Fastest, and appropriate for a short-lived hackathon environment holding no real
data.

```azurecli
az policy exemption create \
  --name sunsum-hackathon-blob-demo \
  --display-name "SunSum hackathon: dev storage data-plane access" \
  --policy-assignment "/providers/microsoft.management/managementgroups/08cc2a62-5116-449e-bed1-98c29bd48de7/providers/microsoft.authorization/policyassignments/mcapsgovdeploypolicies" \
  --exemption-category Waiver \
  --resource-group rg-sunsum-solar-dev-centralus \
  --expires-on 2026-09-30
```

Then, because the property is only rewritten while the policy applies:

```azurecli
az storage account update \
  --name stsunsumsolardevcus \
  --resource-group rg-sunsum-solar-dev-centralus \
  --public-network-access Enabled
```

And grant the data-plane role, which is separately required:

```azurecli
az role assignment create \
  --assignee <objectId> \
  --role "Storage Blob Data Contributor" \
  --scope "/subscriptions/f941228c-d6df-4b2f-93e0-2221773d2ba1/resourceGroups/rg-sunsum-solar-dev-centralus/providers/Microsoft.Storage/storageAccounts/stsunsumsolardevcus"
```

Get the object id for a person with `az ad signed-in-user show --query id -o tsv`,
or for the App Service with `az webapp identity show`. The identity does not
exist yet — see the manual steps in `main.bicep`.

An expiry is included deliberately. The exemption should not outlive the
hackathon, and `--expires-on` means nobody has to remember to remove it.

## Option B — private endpoint, no exemption needed

This path is entirely within resource-group Contributor rights and is already
expressed in code:

```powershell
az deployment group create `
  --resource-group rg-sunsum-solar-dev-centralus `
  --template-file infrastructure/templates/main.bicep `
  --parameters enablePrivateBlobAccess=true
```

That builds a VNet, a delegated subnet, a private endpoint, the
`privatelink.blob` DNS zone and App Service VNet integration. It was validated
with `az deployment group what-if`, which reports the storage account unchanged,
the App Service itself untouched, and the plan moving `F1 => B1`.

The cost is the reason it is not the default. Regional VNet integration does not
exist below the Basic tier, so the App Service plan must move off Free F1. B1 is
roughly **USD 13 per month**, prorated hourly, and is the only charge this path
introduces; the VNet, private DNS zone and the endpoint itself are a few cents
per month at this scale.

This still requires the `Storage Blob Data Contributor` assignment above. A
private endpoint solves reachability, not authorization.

## Recommendation

Option A if an exemption is grantable quickly, because it costs nothing and the
environment holds only placeholder data. Option B if it is not, because it needs
no permission this workstream lacks and can be executed immediately.

Until one of them lands, `SUNSUM_BLOB` stays `memory` or `azurite`. The local
emulator exercises the same `AzureDocumentBlobClient` and the same Blob REST
API, so the code path is not unproven — only the deployed environment is.

## Scope and risk

- Dev environment only. No production resource is in scope.
- The account holds placeholder PDFs generated by `npm run blob:seed` and, during
  a demo, files submitted by the demo operators themselves. No customer data.
- Option A widens network exposure to the public endpoint, mitigated by an
  expiry, by `allowBlobPublicAccess: false`, and by the fact that anonymous
  access is refused at the account level so every request still needs a token.
- Option B widens nothing; the account stays private.
- Neither option changes the application's authorization model. Disclosure
  filtering and the container split described in
  [blob storage](./blob-storage.md) apply the same way in every mode.
