# Connect and deliver SunSum

## Choose the right artifact

| Artifact | What it does | What it does not do |
| --- | --- | --- |
| Next application source ZIP | Runs the public site and `/app` on the existing Linux/Node host | Provision Azure, establish identity, run migrations or perform frontend workflow writes |
| `build/vibehub` static bundle | Runs the fictional Sunroom demo, including deliberate browser-local workflows | Reach private services or authenticate participants |
| Operator handoff | Provides the README, this guide, connection index, configuration names and existing deployment helpers | Supply credentials or authorize deployment |

**WORKFLOW_WRITES_NOT_IMPLEMENTED:** the connected frontend does not submit
sites, save profiles/notes, upload files, express or withdraw interest, mark
notices read, assign/review projects, rerun assessments, change stages,
publish, send messages or execute financial/legal actions. Existing backend
write endpoints are unchanged; this release does not call them.

An **out of reach right now** connection describes the available handoff,
configuration or access, not whether another workstream has implemented it.
Use the [connection index](connections.md) to find its owning boundary.

## Run the demo first

Use Node 22.22.2 or newer within the Node 22 line, and npm 10. From a full
repository checkout, not the application source ZIP:

```powershell
npm ci
npm run build:demo
npm run preview:demo
```

Open `http://127.0.0.1:4183`. The no-hash root opens Sunroom; `#/` opens the
public site. Need, Opportunity, Impact, participation and the original owner
illustration have hash routes in the same bundle. All requests and assets
must work under the actual Pages directory, not only at a domain root.

The static build refuses a connected data mode or live API base. It does not
inherit credentials from a deployment configuration. Unset
`SUNSUM_PUBLIC_API_BASE_URL` and use `SUNSUM_PUBLIC_DATA_MODE=preview` when
building it. No environment file is required for this path.

Fresh demos use 50 fictional Sunroom records. Existing saved scenarios are
preserved, including smaller ones. Demo state uses `sunsum-design-lab-v2`,
with the existing v1 migration and explicit corrupt-save recovery. Theme is
a separate nonsensitive preference. The demo's reset affects its own
fictional state; it is not a service/database reset.

## Run the Next application

```powershell
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
```

Open `http://127.0.0.1:3000` for the public site and `/app` for the connected
workspace. Without the approved configuration, `/app` shows an explicit
connection state. It must not look populated with fictional projects.

The dynamic `/concepts` aliases and `/dashboard/site-owner` lead to `/app`.
They preserve bounded navigation context, never the caller's requested role.
The static owner illustration remains a labeled preview rather than a
failed-read fallback.

## Connect existing reads

### 1. Confirm the existing service and owner

WS2 is the existing workflow/API boundary. The preferred topology is the
same Next application origin, with `/api` route handlers already in this
repository. Do not add a second database client, proxy, rules engine or
authentication service to connect this UI.

For each enabled family, record the accepted source/deployed revision,
read operation/schema, role and record scope, allowed purpose/export,
provenance, freshness, size/pagination and ordinary error behavior.
`docs/api/openapi.yaml` and actual handlers are the source references.
Version labels alone are insufficient where documents disagree.

### 2. Confirm legitimate identity before enabling the reader

The existing signed HttpOnly `sunsum_session` and service user row establish
identity and role. The role pill, public participation answer, query string,
configuration switch and outer Easy Auth gate do not.

Have the existing service owner supply the approved sign-in path and
participant-to-application mapping through their normal secure process.
Do not call `/api/auth/demo-switch`, mint a cookie, copy a signing secret,
create a user or borrow an operator identity for this release.

`SUNSUM_LIVE_READ_AUTH_APPROVED=true` records the owner's sign-in/mapping
handoff. It is an admission gate, **not an authenticator**. Leave it unset
until the legitimate path exists. A real read still needs a service-accepted
session. Expired or denied sessions stay expired or denied.

### 3. Apply configuration through the existing owner

Use [the names-only example](live-read.env.example). These settings are
read by the Next application, not by Pages:

| Setting | Purpose |
| --- | --- |
| `SUNSUM_PUBLIC_DATA_MODE=connected` | Explicitly selects the connected entry; no silent preview default |
| `SUNSUM_PUBLIC_API_BASE_URL=/api` | Existing same-origin API prefix; no external host |
| `SUNSUM_STORE=db` | Existing WS2 database store; any other source mode is not admitted as live |
| `SUNSUM_DEMO_AUTH=false` | Existing demo sign-in remains disabled |
| `SUNSUM_LIVE_READ_AUTH_APPROVED=true` | Owner confirmed existing legitimate participant sign-in/mapping |
| `SUNSUM_LIVE_EXPORT_APPROVED=true` | Optional, separate approval for authorized export/disclosure; otherwise off |
| `SUNSUM_LIVE_DOCUMENTS_APPROVED=true` | Optional original-file disclosure approval; owner/operator service checks still apply |
| `SUNSUM_SESSION_SECRET` | Existing server-only session configuration; share presence, never its value |
| `DATABASE_URL`, `SUNSUM_DB_AUTH` | Existing application store contract, owned by WS2/WS3 |

The frontend sees only safe admission/provenance flags, never the session
secret or database value. `PG*` and `SUNSUM_DATABASE_AUTH` configure separate
operator tooling; they do not replace `DATABASE_URL`/`SUNSUM_DB_AUTH`.
Retain existing managed identity and verified TLS. No setting change is
performed by the frontend or package helper.

### 4. Observe actual permitted reads

Start with `GET /api/me`, then the role's existing projections. A working
homepage, configured provider or HTTP 200 does not certify real data.
WS2 can otherwise select its fixture store. Keep source/configuration
evidence, record vintage and last successful read separate.

The reader uses same-origin credentials, no-store behavior, bounded operations
and response-shape validation. Late responses cannot replace another viewer's
data. Live records are not persisted in demo storage. Unknown numbers, times,
actors and counts stay unknown rather than becoming zero, midnight or a
made-up name.

Investor lower tiers do not expose exact coordinates, owner identity or
private notes/inputs/documents. Do not fetch operator detail to fill a gap.
Deal rooms require an **existing** engagement; the UI does not POST interest
to unlock them. Original document bytes are owner/operator scoped in the
inspected contract, and a metadata record may correctly return 404 for bytes.
`SUNSUM_LIVE_DOCUMENTS_APPROVED` defaults off independently of summary
exports. Do not enable it until the existing owner has admitted that
original-file disclosure; reading metadata alone is not permission to copy bytes.

Exports require a separate disclosure decision in addition to viewing access.
The existing JSON/CSV export is a projection/document manifest, **not a
binary document bundle**. Do not invent original downloads, SAS links,
recipient delivery or signing.

Saved JSON and CSV carry the adopted WS2 contract revision and observation
time separately from the service's generation timestamp. The deployed
revision remains unknown: JSON uses `null` and CSV leaves its named metadata
value blank. Raw service URLs and original-download references are not
serialized. A project-only document remains metadata even when the service's
export includes a contextual site ID; it is not a working original-file route.

### 5. Leave unsupported families explicit

The separate WS4 candidate, map/geocoder, AI image evidence and external
financial/GIS sources are connection seams, not automatic integrations.
Stored authorized results may be displayed; no new assessment, paid model,
geocode, image analysis, POST calculation or private parcel ingestion occurs.
An unavailable family does not prevent the rest of the application or demo
from being delivered.

## Find a connection quickly

Search from the repository root:

```powershell
git grep -n 'SUNSUM-CONNECTION:'
git grep -n 'WORKFLOW_WRITES_NOT_IMPLEMENTED'
git grep -n 'OUT_OF_REACH_RIGHT_NOW'
```

The pure typed registry in
[`src/domain/connections.ts`](../../src/domain/connections.ts) is the canonical
capability metadata; [connections.md](connections.md) is the human entry point. Keep
source implementation, current connection status and observed deployment
separate. Do not scatter speculative TODO endpoints throughout components.

## Package without Azure

Use PowerShell 7.2+ from the repository root. No Azure login is needed:

```powershell
$artifact = & .\infrastructure\scripts\New-AppServicePackage.ps1 `
  -OutputPath '.azure\artifacts\sunsum-reviewed.zip'

& .\infrastructure\scripts\Test-AppServicePackage.ps1 -Path $artifact.Path
$artifact | Select-Object Path, Files, UncompressedBytes, SHA256
```

Choose a **new output filename each time**; the helper refuses overwriting
a reviewed artifact. It includes allowlisted working-tree source, so review
the actual tree, not only HEAD. A source ZIP is not the compiled Pages
directory and is not a Next standalone build.

The guard requires the root manifest/lock/config and `app/layout.tsx`,
rejects unsafe paths/links/duplicates and limits entries and bytes. Keep
secrets, `.env`, `.npmrc`, `.azure`, `.git`, dependencies, build caches and
private sources out. Verify all required runtime assets exist in the ZIP;
do not broaden the allowlist to include unrelated research or operator data.

Deliver the ZIP and hash together with the source revision, this guide,
README, connection index, safe configuration example and matching helper
scripts. Operator docs and helpers belong **outside the application ZIP**.
Anyone receiving the package should be able to identify the exact source
and reproduce the build without a private research folder.

To assemble both bundles and the operator handoff from a **clean reviewed
commit**, build the demo and run:

```powershell
npm run build:demo
pwsh -NoProfile -File .\scripts\New-UiRelease.ps1 `
  -OutputDirectory '.azure\artifacts\reviewed-ui-release'
```

This creates `sunsum-app-source.zip`, `sunsum-synthetic-demo.zip`, an
`operator` folder and `release-manifest.json` with hashes. It refuses an
existing output directory or dirty source worktree and makes no Azure call.
It also checks that every static file still matches the build stamp; a
stale, added, removed or changed file requires a fresh build.
The helper does not certify a running service; read the release's connection
status separately.

### Use a delivered release without repackaging

From the directory containing `release-manifest.json`, retain the reviewed
application ZIP and bind its digest before using the fixed-artifact uploader:

```powershell
$release = Get-Content -LiteralPath '.\release-manifest.json' -Raw | ConvertFrom-Json
$artifact = [pscustomobject]@{
  Path = (Resolve-Path -LiteralPath '.\sunsum-app-source.zip').Path
  SHA256 = $release.application.sha256
}
if ((Get-FileHash -LiteralPath $artifact.Path -Algorithm SHA256).Hash -ine $artifact.SHA256) {
  throw 'The delivered source ZIP does not match its reviewed manifest.'
}
& .\operator\infrastructure\scripts\Test-AppServicePackage.ps1 -Path $artifact.Path
```

Run the deployment example below with the helper under
`.\operator\infrastructure\scripts\` when using this delivered folder.
Do not regenerate the ZIP to deploy an already approved artifact.

For local development, extract the source ZIP into a **new** directory,
then copy the operator folder's contents into that directory while keeping
their relative paths. The original ZIP remains unchanged. This makes the
included guide, helpers and source-code links usable together. Restore
dependencies and build from that extracted application directory.
Additional workstream documentation is available in the reviewed repository:
use `sourceRepository` and `sourceRevision` from the manifest to open
`<sourceRepository>/tree/<sourceRevision>`, rather than assume current main
still describes the same artifact. Hashes identify files; they do not supply
deployment authority or participant credentials.

The application source ZIP intentionally excludes the separate Vite entry and
its build configuration. Run Next's `npm run build` / `npm run start` there;
do not run `build:demo` against that extracted application.

To preview the **already compiled** demo locally, first extract
`sunsum-synthetic-demo.zip` into a new sibling directory named `sunsum-demo`.
From the extracted application directory after `npm ci --include=dev`, use
the included Vite preview command without downloading another tool:

```powershell
npx --no-install vite preview --outDir '..\sunsum-demo' `
  --host 127.0.0.1 --port 4183 --strictPort
```

Open `http://127.0.0.1:4183`. This serves the delivered static files; it does
not connect the demo to Next or its APIs. Alternatively, publish those
extracted demo files to an approved static host. Do not rely on opening
`index.html` through `file://`, because browser module loading needs HTTP.

## Deploy code to the approved existing host

**SUNSUM-DEPLOYMENT:EXISTING-TARGET.** The original hosting model is Linux
App Service, source ZIP, Oryx and ordinary Next start:

```text
Build: npm ci --include=dev && npm run build
Start: npm run start -- --hostname 0.0.0.0
```

Next consumes platform `PORT`. `NODE|22-lts` alone does not confirm the
required Node patch. Confirm the existing runtime, build/startup, TLS,
publishing settings, quota and app identity with the authorized owner.
This release does not repair those settings, create resources or upgrade
a tier. Never run an infrastructure workflow to work around code-publish
access.

**SUNSUM-DEPLOYMENT:ARTIFACT-APPROVAL.** The owner must approve the exact
existing subscription/resource group/app, source revision, ZIP/hash,
deployment identity and code replacement/restart effects. The committed
deployment config may name a different test target: never accept it blindly.
A database password, GIS credential, repo push permission or infrastructure
OIDC secret name is not app-code publishing authority.

The fixed-artifact uploader validates both the package and a target-bound
approval document. Its no-apply mode makes no Azure call:

Use [the names-only approval template](code-approval.example.json) to record
the **actual owner-approved** values outside source, for example in
`.azure\dev\code-approval.json`. Preserve exactly those seven fields. The
placeholders deliberately fail validation. A filled JSON file is a receipt,
not an authorization grant; obtain approval through the existing owner process
and then record that file's SHA-256 with `Get-FileHash`.

```powershell
pwsh -NoProfile -File .\infrastructure\scripts\Deploy-AppServiceCode.ps1 `
  -SubscriptionId $env:AZURE_SUBSCRIPTION_ID `
  -ResourceGroupName $env:AZURE_RESOURCE_GROUP `
  -WebAppName $env:AZURE_WEB_APP_NAME `
  -PackagePath $artifact.Path -ExpectedSha256 $artifact.SHA256 `
  -ApprovalPath '.azure\dev\code-approval.json' `
  -ApprovalSha256 '<reviewed-approval-sha256>' `
  -ApprovalReference '<actual-code-review-reference>' `
  -ExpectedAccessMode ApprovedSignIn
```

These placeholders are not approval or executable values. Use the matching
[existing operating guide](../../infrastructure/docs/app-service-postgres.md)
for the approval shape and the actual reviewed access mode. Add `-Apply`
**only after** separate deployment authorization. The normal
`Deploy-Application -Apply` wrapper repackages current source; use the
fixed-artifact path when approval binds a particular ZIP.

The uploader replaces code with `--clean true` and may restart the app.
Preserve a compatible previous source ZIP and its review/hash for code
rollback. No migration, schema rollback or database reset is included.
A timeout may mean the deployment is still running: reconcile the existing
deployment/logs before retrying. Never blind-retry or create a new app.

If authority, configuration or access is out of reach, the correct outcome is
**package delivered, not deployed**, with the missing owner handoff named.
Do not describe local builds or a healthy homepage as operational readiness.

### Command effects

| Command | Effect |
| --- | --- |
| `npm run build:demo` / `preview:demo` | Builds or serves local synthetic files; no service workflow |
| `npm run build` / `start` | Builds or serves Next; permitted reads still require separate configuration/session |
| `New-AppServicePackage.ps1` | Creates a new local source ZIP; no Azure call |
| `Test-AppServicePackage.ps1` | Inspects the ZIP locally; no Azure call |
| `New-UiRelease.ps1` | Creates separate local bundles, operator docs and hash manifest |
| `Deploy-AppServiceCode.ps1` without `-Apply` | Validates the exact ZIP and target-bound approval locally |
| `Deploy-AppServiceCode.ps1 -Apply` | Replaces existing app code, cleans old files and may restart the approved target |
| Infrastructure apply, database migration/seed/reset | Not part of this release; do not run as a connection shortcut |

## Troubleshooting

| Symptom | Meaning and safe next action |
| --- | --- |
| Out of reach right now | Use the connection ID to find the missing contract, configuration or access handoff |
| 401 | Use the legitimate existing sign-in at this origin; do not create a demo identity |
| 403 or locked deal room | Respect role/record/tier denial; required workflow writes are outside this release |
| Homepage loads, workspace does not | Public HTML does not establish session, store, Blob or provider readiness |
| Fixture data from a service | Confirm `SUNSUM_STORE=db` and source provenance; HTTP success is insufficient |
| Cross-origin/CORS error | Use the selected same-origin topology; do not expose tokens or weaken CORS/CSRF |
| Metadata without a file | Bytes may not exist; do not upload a placeholder or fabricate a download |
| Map unavailable | Keep the permitted list useful; no invented live coordinates or unauthorized geocoder |
| Export unavailable | Viewing is not export authority; confirm the separate disclosure boundary |
| ZIP/host guard rejects input | Have the owner review the exact mismatch; no automatic settings/tier repair |
| Deploy timed out | Reconcile remote status before another upload; rollback is separate and code-only |
| Pages cannot call `/api` | Expected: it is the synthetic static artifact, not the connected application |

## Handoff checklist

- Source PR/revision, separate artifact names and SHA-256 receipts are provided.
- Each connection has an owner, contract/source reference and honest status.
- Legitimate participant sign-in and export scope are confirmed or explicitly
  out of reach; no credential values are in source or the public bundle.
- Existing target, deployment approval and compatible rollback artifact are
  supplied before any apply; otherwise package-only is stated.
- The demo URL is labeled synthetic and contains no private records/assets.

## Vocabulary

**WS2** owns workflow records and authorization; **WS4** supplies assessment
work. A **read** retrieves existing permitted state. A **workflow write**
changes it or generates/persists new results. **Metadata** describes a file;
it is not its bytes. **Source-implemented** means code exists, not that it
is deployed/configured. **Live-read** names the attempted service mode,
not a promise that every capability is operating.

**Site owners** offer and follow their sites. **Operators** coordinate review
and development work. **Investors** browse only the portfolio and detail
their service grants allow. None of these names implies funding, title,
consent or a role grant by the interface.

**Pages** serves the static fictional demo. The **dynamic host** runs Next
and the existing same-origin APIs. Downloading the app ZIP does not deploy
it or supply its database, identity or provider configuration.
