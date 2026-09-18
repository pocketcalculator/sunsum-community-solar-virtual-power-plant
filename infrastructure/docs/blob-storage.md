# Blob storage for site documents

Site documents — the electricity bill collected at intake today, and the
screening reports, site summaries and land reports the charter adds later —
are files. The row in `documents` is metadata; this is where the bytes go.

- **Account** `stsunsumsolardevcus`
- **Resource group** `rg-sunsum-solar-dev-centralus` (centralus)
- **Subscription** `f941228c-d6df-4b2f-93e0-2221773d2ba1`
- **Template** [`../templates/main.bicep`](../templates/main.bicep), which
  composes [`storage.bicep`](../templates/modules/storage.bicep) and
  [`network.bicep`](../templates/modules/network.bicep)

`storage.bicep` is shared with the App Service deployment workstream and owns
the account itself. The document containers, the blob private endpoint and the
data-plane role assignments are declared in `main.bicep` on top of it, so
neither template redefines what the other owns.

The template is the source of truth. It was checked against the live account
with `az deployment group what-if`, which reports every resource as `Modify`
rather than `Create` and no property drift beyond server-populated defaults.

```powershell
az deployment group what-if `
  --resource-group rg-sunsum-solar-dev-centralus `
  --template-file infrastructure/templates/main.bicep
```

To see the current state of every blocker below without reading any of this:

```powershell
npm run blob:doctor
```

That runs the same read-only checks this document describes and prints which
blockers are active, in the order they have to be fixed. It is pinned to the
subscription above, so it is unaffected by whichever subscription the Azure CLI
happens to be pointed at.

## Configuration

| Setting | Value | Why |
| --- | --- | --- |
| SKU | `Standard_LRS` | Dev. Documents are re-uploadable, and geo-redundancy triples the cost of a hackathon environment. |
| Kind / tier | `StorageV2`, Hot | Uploads are read back immediately during a demo. |
| `allowSharedKeyAccess` | `false` | No account key exists to leak, embed or rotate. Access is Entra plus RBAC. |
| `allowBlobPublicAccess` | `false` | No document is public; anonymous access is refused at the account level so a mis-set container cannot open one up. |
| `minimumTlsVersion` | `TLS1_2` | — |
| Blob + container soft delete | Not configured | `storage.bicep` leaves versioning and delete retention off; a deleted blob is not recoverable. |

## Containers

| Container | Holds |
| --- | --- |
| `owner-private` | Everything by default, including the electricity bill. |
| `investor-tier-1` | Only documents an operator explicitly disclosed to investors. |

One container per disclosure class, rather than the class encoded in a path.
The application already enforces disclosure on every read; this puts a coarser
boundary underneath that check, so a credential scoped to `investor-tier-1`
cannot name an owner-private blob at all. The rationale and the path layout are
in [`src/backend/README.md`](../../src/backend/README.md#document-blob-storage).

Within each container, blobs are grouped by owner and then by site or project:

```text
owners/{ownerId}/{sites|projects}/{parentId}/{docType}/{documentId}/{filename}
```

Azure containers cannot nest — a "folder" is only a prefix in the blob name — so
the owner and project grouping lives inside the two containers rather than
above them.

A third container, `$logs`, appears in the portal. It is **not** ours: `$`-prefixed
containers are Storage Analytics artifacts the platform creates, invisible to
ARM. `az storage container-rm list` returns only `owner-private` and
`investor-tier-1`, and `storage.bicep` configures no logging at all.

## Running the same code locally

The deployed account is not reachable (see below), so the Azure SDK path is
exercised against **Azurite**, the official emulator, rather than left unproven:

```powershell
npm run blob:up          # the npm dev dependency; no Docker needed
$env:SUNSUM_BLOB = "azurite"; npm run dev
```

`docker compose up -d --wait azurite` runs the same emulator as a container, for
anyone already running the database that way. The compose service pins
`mcr.microsoft.com/azure-storage/azurite:3.37.0` to the same version as the
`azurite` devDependency, so the two should behave identically — but only the npm
path above has actually been run here, because this machine has no Docker.
`tests/integration/blob-azurite.test.ts` runs the real Blob REST API against
whichever is listening on 10000 — upload, download, overwrite, missing blob and
the container split — and skips cleanly when neither is.

This is the same `AzureDocumentBlobClient` the deployed app uses; only the
credential differs (a connection string against the emulator, Entra against
Azure). In `azurite` mode the client creates the two containers on first use;
in `azure` mode it never does, because there the containers are Bicep's to
create and an application that can create containers holds more rights than it
needs.

`npm run blob:seed` fills the emulator with placeholder PDFs for the documents
in `src/backend/db/seed.sql`, so the seeded rows have bytes behind them instead
of answering every download with a 404; `npm run blob:list` shows what is there.
The script reads the paths out of the seed rather than restating them, sizes
each file to the byte because the upload endpoint enforces `size_bytes`, and
refuses any endpoint that is not local — so it cannot write placeholder data
into a real account. `src/backend/README.md` has the detail.

## The account is not reachable yet

Two blockers, both needing permissions this workstream does not have. Until
both are cleared, `SUNSUM_BLOB` must stay `memory` or `azurite` — `memory` is
the default, so nothing breaks by leaving it alone.

**Order matters: fix the network first.** Granting the role on its own changes
nothing, because the network rejection happens before RBAC is evaluated. The
evidence is the error code: an authenticated request carrying a valid
`https://storage.azure.com/` token is refused with `AuthorizationFailure`, not
the `AuthorizationPermissionMismatch` that a missing role produces. Both an
anonymous and an authenticated request return the identical response, which is
only possible if neither reached authorization.

### 1. Public network access is disabled by tenant policy

An Azure Policy with a **modify** effect, `StorageAccount_PublicNetwork_Modify`,
rewrites `publicNetworkAccess` to `Disabled` on every create and every update in
this subscription. A `PATCH` setting it to `Enabled` returns HTTP 200 and the
value stays `Disabled` — nothing errors, which is what makes this easy to miss.
Two sibling policies enforce `allowSharedKeyAccess` and `allowBlobPublicAccess`
the same way.

The effect is that a request to the blob endpoint is rejected at the network
layer, before any token is looked at — the same response whether or not one is
supplied:

```text
403 AuthorizationFailure
This request is not authorized to perform this operation.
```

The only route in is a **private endpoint**, which needs a VNet and, for the
deployed app, an App Service plan that supports VNet integration. The current
plan is `asp-sunsum-smoke-free` on **Free F1**, which does not — moving to Basic
or higher is a prerequisite.

All of that is now in code rather than described:

```powershell
az deployment group create `
  --resource-group rg-sunsum-solar-dev-centralus `
  --template-file infrastructure/templates/main.bicep `
  --parameters enablePrivateBlobAccess=true
```

That builds the VNet, the delegated `snet-app` subnet, the `snet-privatelink`
subnet, the `privatelink.blob` DNS zone and its VNet link, the private endpoint,
and App Service VNet integration — and raises the plan to B1, roughly **USD 13
per month**, which is the only charge the path introduces and the reason it is
opt-in rather than the default.

The App Service itself is deliberately never declared in the template. It was
created outside Bicep and carries app settings this workstream does not own, and
declaring a site replaces its settings list wholesale; VNet integration is
attached as a child resource on an `existing` reference instead. `what-if`
confirms the site is reported as ignored.

The alternative, which costs nothing, is a policy exemption — see
[policy exemption request](./policy-exemption-request.md). It needs a permission
this workstream does not hold, which is why the private path exists as a
fallback rather than a preference.

The template declares `publicNetworkAccess: 'Disabled'` deliberately. Declaring
`Enabled` would produce a template that never converges and a what-if that
always shows drift, because the policy wins.

### 2. No data-plane role assignment

Creating the containers worked because `az storage container-rm create` is a
control-plane call. Reading or writing a *blob* is a data-plane call and needs
an RBAC role, which this workstream cannot grant: it holds Contributor, not
`Microsoft.Authorization/roleAssignments/write`.

This cannot be verified until blocker 1 is cleared — while the network refuses
the request, a correct role assignment and a missing one look identical.

A subscription Owner or User Access Administrator needs to run:

```powershell
az role assignment create `
  --assignee <objectId> `
  --role "Storage Blob Data Contributor" `
  --scope "/subscriptions/f941228c-d6df-4b2f-93e0-2221773d2ba1/resourceGroups/rg-sunsum-solar-dev-centralus/providers/Microsoft.Storage/storageAccounts/stsunsumsolardevcus"
```

for each principal that needs access:

- each developer running locally against `SUNSUM_BLOB=azure`;
- the App Service's managed identity, which **does not exist yet** —
  `app-sunsum-smoke-928e5e28` has no identity assigned. Assign a system-assigned
  identity first, then grant it the role.

Or supply the ids to the template, which does the same thing re-runnably:

```powershell
az deployment group create `
  --resource-group rg-sunsum-solar-dev-centralus `
  --template-file infrastructure/templates/main.bicep `
  --parameters blobDataContributorPrincipalIds="['<objectId>']"
```

Note that a control-plane role is not a substitute: `Owner` and `Contributor`
carry no `dataActions`, so a subscription Owner can create and delete this
account and still not read a blob inside it. `npm run blob:doctor` checks for
the three `Storage Blob Data *` roles specifically for that reason.

## Cost

Standard_LRS hot storage is roughly $0.02 per GB per month with no minimum.
Demo-scale document volume is well under a gigabyte, so the account is
effectively free. There is no charge for an idle account beyond stored bytes.
