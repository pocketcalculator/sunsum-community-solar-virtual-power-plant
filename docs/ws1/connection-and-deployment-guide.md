# Connect and deliver SunSum

**Source handoff; publication held. No Azure deployment, main push/merge or
cloud-workflow dispatch is authorized here.** The maintainer has merged PR62,
and newer upstream API/dependency changes await coordinator reconciliation and
re-frozen contracts. See the [upstream status](../../README.md#upstream-reconciliation-hold).
This guide describes the retained integration worktree; commands are references,
not permission to run cloud, database or business operations.

## Choose an experience

| Experience | Source and session | Delivery |
| --- | --- | --- |
| Static synthetic | Fictional browser-local workflow; no service/session transport | Already compiled `sunsum-synthetic-demo.zip` |
| Developer/demo mode | Existing same-origin APIs, explicit mock store and seeded demo-session adapter | Next application in `server-demo` mode |
| Connected workspace | Db store, demo auth disabled, legitimate approved sign-in/mapping and fresh authorized identity | Next application in `connected` mode |

The dynamic header displays **Connected workspace**, **Developer/demo mode**
or **Connection unavailable** for `connected`, `server-demo` or `unavailable`,
respectively. These source labels are not a role grant or a different set of
configuration values.

The dynamic modes share one service client, current GETs and one deliberately
invoked business command: `POST /api/projects/{id}/engagements` with `{}`.
Only server-demo mounts `POST /api/auth/demo-switch`. Static actions remain
local simulations. A failed live read never selects samples or another mode.
`/join` remains fictional and unsaved in all three experiences.

Use **Node `^22.22.2` (Node 22.22.2+ within major 22), npm `^10.0.0` and the
committed lockfile**. The retained worktree manifest pins Next 16.3.4, React 19.2.8,
TypeScript 5.9.3, Vite 8.2.2, Vitest 5.0.0 and Playwright 1.63.0; the manifest
and lockfile, not this summary, are authoritative. These are not a claim of
parity with the newer upstream dependency versions. Package helpers need
PowerShell 7.2+; no Azure login, WAM session or new dependency is needed.

Run from a full repository checkout, using a separate terminal for each mode.
Run `npm ci` once to restore the existing lockfile. Do not copy the root
environment example blindly: it also documents unrelated backend tooling.
Restart the server when changing mode; mode is trusted startup configuration,
not a query parameter or browser role choice.

### Dependency reproducibility

The retained integration worktree restores three transitive lock entries from predecessor
commit `42e2551`: `@grpc/grpc-js@1.14.4`, `moment@2.30.1` and
`proxy-addr@2.0.7`. These entries came from the predecessor, not PR61/PR65
upgrades. The earlier main snapshot's `proxy-addr@2.0.8` returned `ETARGET` on the
configured approved feed during integration. The pre-reconciliation direct
manifest is retained; later upstream changes remain under review, and this
lockfile is not current-main parity. Use the reviewed worktree lockfile with
`npm ci`, not guessed replacements or a feed bypass. This availability
reconciliation is not a claim that all dependency vulnerabilities are fixed.

## Static synthetic quick start

No credentials or environment file are required:

```powershell
$env:SUNSUM_PUBLIC_DATA_MODE = 'preview'
Remove-Item Env:SUNSUM_PUBLIC_API_BASE_URL -ErrorAction SilentlyContinue
npm run build:demo
npm run preview:demo
```

Open `http://127.0.0.1:4183`: both bare root and `#/` open the **public landing**.
Choose **Open Sunroom workspace** on that landing or use the explicit address:
`http://127.0.0.1:4183/#/concepts/sunroom`. `#/need`, `#/opportunity`, `#/impact`,
`#/join` and the legacy `#/dashboard/site-owner` illustration stay in this bundle.
The shared landing action targets `/app`; static `#/app` canonicalizes to
`#/concepts/sunroom`, while Next keeps `/app` as the dynamic workspace.
Assets must work under `/sunsum-ui-demo/` and a deeper physical prefix, not only
at domain root.

Vite rejects both dynamic modes and any nonempty API base, including values
in a static environment file. It injects only synthetic constants. Fresh
Sunroom scenarios contain 50 fictional records; saved scenarios and existing
v1/v2 recovery stay separate from service data. Never enter real personal
information. The demo's reset affects only its local fictional workflow.

## Server-demo quick start

Use [the safe configuration example](server-demo.env.example). This path
exercises the existing APIs against in-memory fixtures; it is **not production
sign-in**. The exact backend sentinel is `enabled`, not `true` or `1`.

```powershell
$env:SUNSUM_PUBLIC_DATA_MODE = 'server-demo'
$env:SUNSUM_PUBLIC_API_BASE_URL = '/api'
$env:SUNSUM_STORE = 'mock'
$env:SUNSUM_DEMO_AUTH = 'enabled'
$env:SUNSUM_BLOB = 'memory'
$env:SUNSUM_VIABILITY = 'demo'
$env:SUNSUM_LIVE_READ_AUTH_APPROVED = 'false'
$env:SUNSUM_LIVE_EXPORT_APPROVED = 'false'
$env:SUNSUM_LIVE_DOCUMENTS_APPROVED = 'false'
$env:SUNSUM_SESSION_SECRET = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"
npm run dev -- --hostname 127.0.0.1 --port 3000
```

The generated local-only signing value is captured in this terminal, not
printed or committed. Do not reuse it for connected operation or copy a real
session secret into a demo. Workspace admission requires explicitly configured
signing; the backend's development ephemeral-secret fallback does not satisfy it.
Server-demo does not require the legitimate connected-sign-in approval flag.
No database, migration, seeding command, Blob
emulator, Azure login or participant cookie is needed for this start.

Open `http://127.0.0.1:3000/app`. Deliberately choosing a demo role uses the
existing adapter and signed-session endpoint; `GET /api/me` confirms the
result. A switch retires old reads, downloads and pending action context before
refreshing identity. Anyone who can reach this demo endpoint can select a
seeded role, including operator: keep this developer example loopback-bound and
never combine it with real records. Fixture-store changes are not durable
production records.

## Connected quick start

This is a configuration/admission path, **not a way to fabricate a session**.
Use the existing service owner's legitimate participant sign-in and
participant-to-application mapping. Do not call demo-switch, mint/copy cookies,
create a user, borrow an operator identity or run database setup to unblock it.

PR27's session-auth/anonymous-request protection is implemented. PR41's operator
override is [source-verified, not only merged](contracts.md#merged-service-code-and-runtime-evidence),
in the existing projects core/handlers at `/api/sites/{id}/assessment/override`.
That is distinct from configured production sign-in and real WS4/model verification.
Do not claim either that these services are absent or that their merger proves
an operational participant/model integration.

The [new upstream handoffs](contracts.md#new-upstream-handoffs-awaiting-admission)
include merged anonymous, origin-checked `POST /api/profiles`: request
`password` and `role_id` are rejected. A 201 is an **intake receipt**, with a
server-derived response `role_id` that may validly be null; it is not an
account, session, grant or durable-database proof. The current fixture-backed
dev intake can lose rows on process restart. `/join` remains unsaved until an
explicitly admitted save is actually implemented; static no-save copy stays
correct. The admitted frontend business command remains project interest only.

**Do not switch the current fixture-only dev target to `SUNSUM_STORE=db` as a
GIS/UI fix.** The infrastructure's `web.bicep` explicitly fixes its store to
`mock`; an AI-suggested setup checklist does not override that guard. The
following connected example is for a separately approved database-backed
environment, not a request to reconfigure dev or Azure.

After that distinct owner handoff, use the existing secure process.
[live-read.env.example](live-read.env.example) keeps disclosure approvals off
by default and contains no secret values.

```powershell
# Separately approved database-backed environment only; not the fixture-only dev target.
$env:SUNSUM_PUBLIC_DATA_MODE = 'connected'
$env:SUNSUM_PUBLIC_API_BASE_URL = '/api'
$env:SUNSUM_STORE = 'db'
$env:SUNSUM_DEMO_AUTH = 'false'
# Set true only after the legitimate sign-in/mapping handoff:
$env:SUNSUM_LIVE_READ_AUTH_APPROVED = 'true'
$env:SUNSUM_LIVE_EXPORT_APPROVED = 'false'
$env:SUNSUM_LIVE_DOCUMENTS_APPROVED = 'false'
# Existing SUNSUM_SESSION_SECRET, DATABASE_URL and SUNSUM_DB_AUTH are supplied
# by the service owner; no example credentials or production cookie are provided.
npm run dev -- --hostname 127.0.0.1 --port 3000
```

If those prerequisites are absent, `/app` must remain unavailable. Configuring
`connected` does not certify database access or authenticate anyone.
Known seeded demo principals are refused even if an old signed cookie survives
turning demo auth off. Connected mode presents a service-confirmed role, not
a seeded role switcher.

### Connect existing reads

The selected topology is the existing Next origin and `/api` handlers.
Do not introduce another database client, proxy, authorization provider or
rules engine. `app\app\configuration.ts` projects public-safe mode/capability
evidence through the pure resolver in `src\domain\live-configuration.ts`;
both `/app` and the public layout use it. It returns `WorkspaceConfiguration`;
`source` is `database-configured`, `mock-configured` or `not-confirmed`, describing
configuration rather than observed deployment.

| Setting / capability | Meaning |
| --- | --- |
| `SUNSUM_PUBLIC_DATA_MODE` | Explicit `connected` or `server-demo`; invalid/mixed configuration is unavailable |
| `SUNSUM_PUBLIC_API_BASE_URL=/api` | Existing same-origin API only |
| `SUNSUM_STORE` | Exact `db` for connected; exact `mock` for server-demo, not an implicit fixture default |
| `SUNSUM_DEMO_AUTH` | `enabled` only in server-demo; disabled in connected |
| `SUNSUM_SESSION_SECRET` | Existing server-only signing configuration, at least 32 characters; expose presence only |
| `SUNSUM_LIVE_READ_AUTH_APPROVED` | Compatibility name for legitimate sign-in/mapping admission; not an authenticator or blanket read-only promise |
| `canAttemptInterest` | Derived public-safe capability for one scoped command; no `SUNSUM_LIVE_INTEREST_*` flag or generic `canWrite` is introduced |
| `SUNSUM_LIVE_EXPORT_APPROVED` | Independent approval for authorized summary/manifest export; off by default |
| `SUNSUM_LIVE_DOCUMENTS_APPROVED` | Independent original-byte disclosure approval; retained route/role/record checks still apply, not automatic adoption of newer document APIs |
| `DATABASE_URL`, `SUNSUM_DB_AUTH` | Existing application-store contract; retain managed identity and verified TLS |

`PG*` and `SUNSUM_DATABASE_AUTH` configure separate operator tooling; they do
not configure the application store. No frontend or package helper changes
these settings. No secret belongs in `NEXT_PUBLIC_*`, a public manifest or
the browser bundle.

The source-supported Blob selector is separate from the record store.
[`src/backend/blob/index.ts`](../../src/backend/blob/index.ts) defaults an
**unset** `SUNSUM_BLOB` to `memory`; invalid values fail rather than silently
falling back. `SUNSUM_BLOB=azure` requires `AZURE_STORAGE_ACCOUNT_NAME` and uses
the Entra branch: `DefaultAzureCredential` only when `NODE_ENV=development`,
managed identity otherwise. Only the emulator path auto-creates containers, not Azure. These
verified source seams do not establish live settings, identity grants,
container existence or stored bytes. They are future operator setup references,
not authorization to repair cloud configuration or change fixture-only dev.

Start with an authorized `GET /api/me`, then the role's projections. The
source-backed contracts come from inspected lineage
`db0c6a5d6e39fe7cf079dab27e9616189945cf6c`, the actual handlers and
`docs\api\openapi.yaml`. That pin is not deployed-service proof. Keep configured
store, source revision, GET observation, nullable record timestamps and
deployed revision separate; the last is unknown until actually established.
A healthy homepage or HTTP 200 from a fixture store is not participant evidence.
Updating the backend pin waits for immutable contract review and reconciliation,
not merely a newer upstream head or an open PR.

### Client extension seam

Import through `src\features\live-read\index.ts`, not a feature's internals:

| Public API | Contract |
| --- | --- |
| `createWorkspaceClient(configuration, options?)` | Modern typed factory returning `ReadResult<WorkspaceClient>`; handle `ok/error` before using `data` |
| `createLiveReadClient(configuration, options?)` | Same implementation with interest forced off for legacy read-only callers |
| `expressInterest(projectId, InterestOptions)` | Required current `scope`; optional `signal` and `acknowledgeUnknownOutcome`; local options are not the POST body, which stays exactly `{}` |
| `readMyEngagements(ScopedReadOptions)` | Required `scope`, optional `signal`; GET-only authoritative refresh/reconciliation |

`ReadScope` is a correlation/lifetime handle, not authentication. Interest
results are `created`, `existing`, `not-sent`, `refused` or `unknown`.
An unresolved attempt needs deliberate uncertainty acknowledgement before any
new attempt, not a retry loop. New read/export provenance records configured
`mode`/`store`, `contractRevision`, `retrievedAt` and `deployedRevision: null`.
`ReadProvenance.operations` remains GET-only; mutation receipts are separate.

### Queries, interest and disclosure

Role-specific pages are our shared `/app` workspace plus authorized dashboard
aliases: owner sites/requests, operator submissions/pipeline and investor
portfolio/engagement/detail. Filters support those views, not replace them.
Never copy legacy role pages or their sample-on-failed-service fallbacks.

Investor queries send repeated `stage`, `viability`, exact `project_type`
and explicit `mandate_match=true/false` (default matching on). Operator
pipeline/submissions send repeated `status`, `type=rooftop/land`, `viability`
and applied `location` against raw address. Page size 25/50/100, sorting,
cards/list and labeled local facets stay client-side. Do not confuse ribbon
stages, project stages, submission statuses or site/project types.

Only the current actor/query may publish results or clear loading. Sensitive
queries/records stay out of URLs, history and browser storage; same-actor
navigation uses bounded in-memory context. Failure is not an unfiltered
success or sample fallback. Counts describe loaded permitted records.

Interest requires a current onboarded investor, a loaded permitted portfolio
project, fresh identity/engagement preflight and a deliberate click. `{}` means
project-level interest; funding-need-specific rows are not interchangeable
duplicates. Preserve the service's last-emitted engagement order and existing
deal-room eligibility.

| Command outcome | Meaning |
| --- | --- |
| Valid matching 201 receipt | Nonbinding interest recorded; refresh authoritative engagements, not invented funding totals |
| Expected 409 | Existing-engagement state, not a second creation or an automatic retry |
| Auth/role/onboarding/origin/not-found refusal | Respect the refusal; retire scope as appropriate, never sign in as a demo or weaken protections |
| Canceled before dispatch | Not sent |
| Timeout/network loss/abort after dispatch, 5xx or invalid success receipt | Outcome unknown; bounded authorized GET reconciliation only |
| Identity changes while pending | Retire the old UI/receipt; never update another actor or replay in the new session |

One deliberate click sends at most one POST. An empty/failed reconciliation
does not prove a write failed. Any deliberate new attempt warns about the
unresolved outcome and repeats preflight. No automatic retry, command queue,
service-worker replay or automatic interest to unlock detail is allowed.

An unengaged investor sees permitted tier-zero context and a locked state.
An explicit confirmed interest may enable the existing eligible deal-room GET;
the server decides. It does not transfer/commit funds. Submission, withdrawal,
profile/mandate/notes saving, uploads, review, assignment, stages, publication,
provider processing and financial/legal actions remain excluded here.
This frontend has not automatically adopted the newer upstream APIs; their
contracts and any effects on these boundaries remain under reconciliation.

Retained site-original reads are independently admitted and owner/operator
scoped. PR70 implements
`GET /api/projects/{projectId}/documents/{documentId}/content`; eligible tier-one
investors remain subject to disclosure/engagement checks. That service capability
is not automatic frontend read admission. Metadata registration and raw-byte
upload are separate: the GET may return 404 when bytes have not been uploaded.
No POST-register or PUT-bytes upload approval is added here. Container access,
memory-store contents and actual byte
availability need separate evidence, not remote configuration writes.
Metadata can legitimately exist without downloadable bytes.
An export is normalized JSON/CSV and a document manifest, not a binary file
bundle. It carries GET provenance, never a mutation receipt. A contextual site
ID does not make a project-only document downloadable through a site route.
Do not invent SAS links, recipient delivery or signing.

The [single connection index](connections.md) points to
`src\domain\connections.ts`. Search `SUNSUM-CONNECTION:` to locate the ten
families. WS4, GIS/maps, AI/image, finance and external-data seams remain held
until separately admitted; stored authorized results do not authorize new
provider calls. Parcel access is backend GeoJSON, not a frontend parcel key;
the optional basemap-only key is a separate, presently unapproved concern.

## Backend GeoJSON map boundary

Future GIS work must support repeated lookup/enrichment for newly submitted or
changed sites feeding WS4 assessment, not just render a fixed parcel overlay.

| Concern | Boundary |
| --- | --- |
| Basemap/reference-layer cache | Display context; cache only as provider terms/licensing permit, never assume a right to mirror |
| Parcel overlay | Permitted geometry/disclosure and site linkage; private source parcels are not public fixtures |
| Site-specific enrichment | Inputs for new/changed-site assessment; backend/model/frontend must confirm actual WS4 DTO agreement and conformance, not infer it from local types |

**Parcel data must come from our backend as GeoJSON `FeatureCollection` in
EPSG:4326; parcel/admin/account credentials and parcel-access tokens stay
backend-only**, even if short-lived or referer-bound. A separate basemap-only,
referrer-restricted key is an optional browser credential, not parcel access.
No key use or basemap/provider call is authorized now. Long-term least-privilege
parcel authentication remains backend/operator work.

Evaluate the actual ArcGIS product/version, subscription, tenant privileges and
required services/items before selecting among these documented options:

| Official Esri option | What the owner must establish |
| --- | --- |
| [Scoped API key](https://developers.arcgis.com/documentation/security-and-authentication/api-key-authentication/) | Supported service privileges and feature-service/item access, not assumed per-feature row authorization; Esri recommends stronger OAuth methods for confidential data |
| [Server OAuth app credentials](https://developers.arcgis.com/documentation/security-and-authentication/app-authentication/) | Supported client-credentials grants and service/item permissions for that product/tenant; credentials and resulting provider tokens remain server-side |
| [User OAuth](https://developers.arcgis.com/documentation/security-and-authentication/user-authentication/) | Whether an approved ArcGIS user context/consent is required and which user privileges apply; retain this integration's server-only token boundary |

Legacy `generateToken` tests do not establish that ArcGIS lacks secure
authentication. These are evaluation options, not permission to use accounts,
make provider calls or expose parcel-access tokens through browser examples.

PR71 is **OPEN** at `c6549bd4267acd7c4e5f079677aa491228453a57`. Its proposed
operator-only `GET /api/sites/candidate-parcels` accepts **no query parameters**
and uses the [nullable snake_case response contract](contracts.md#new-upstream-handoffs-awaiting-admission).
Do not forward pipeline filters, bbox, layer, where, tokens or map-pan queries.
It is not merged/live/admitted; immutable core/driver and permission/provenance
review remains. Default demo fixtures and metadata `fetched_at`/`stale` do not
identify a live source: neither a 200, `stale=false` nor the core database-mode
flag proves ArcGIS access. Keep candidates separate from submitted records;
selecting a parcel must not create a site/project or infer viability.

Geometry/address alone are not complete viability inputs. Zoning/land-class
coverage cannot be assumed; the WS4/model owner's required field/layer list
is still needed. The existing
`src\backend\viability` HTTP translator already feeds `src\backend\core\sites`
workflows, but its local input/output schema does not prove the actual WS4
tool agreed to or conforms to it. Reuse that boundary; do not invent a second
translator or a replacement DTO.

A hybrid cache with change-driven enrichment or agreed scheduled refresh is
only a **proposal**. Cadence remains unknown; no default frontend polling or
refresh machinery is introduced. Do not invent a WS4 DTO, claim live viability
readiness or treat cached data as proof of provider integration. Static demos
remain synthetic and transport-free.

| Editing seam | Responsibility |
| --- | --- |
| `src\domain\connections.ts`, `SUNSUM-CONNECTION:MAPS-LOCATION` | Reconcile the supplied PR71 operation after code/role/provenance review; retain one registry and explicit admission |
| `src\features\live-read\` public client boundary | Adopt the supplied backend response through the existing bounded client only after endpoint/data-shape assessment; no direct ESRI transport or token handling |
| `src\features\live-workspace\MapLimit.tsx` and its `CollectionView.tsx` caller | Current unavailable-map presentation; coordinator-owned follow-up may add bounded fictional fixture/rendering behavior without claiming connectivity |
| Existing backend/model/operator boundary | Product-specific authentication, licensed caching, site enrichment and agreed WS4 output/refresh contracts; not frontend-owned infrastructure work |

Privately supplied parcel evidence is not a public fixture, release asset or
permission to reveal real polygons. Keep it out of source, Pages and bundles.
Private format/hash receipts confer no disclosure authority, and parcel
appraisals must not be recast as investment data. EPSG:4326 is the supplied
interface requirement, not a claim that a CRS member was read from private input.
Audio publication approval does not extend to parcel data. This amendment
authorizes neither credential use, a new backend/proxy, new writes nor Azure
operations. Package path/hash checks are not permission to publish data.

## Public audio and editing

The [README edit map](../../README.md#where-to-edit) identifies the current
route, copy, role, mode, query and client modules. The
[public audio manifest](../../src/features/participation/content/pageAudioAssets.json)
is the sole mapping for `need`, `opportunity` and `impact`; all nine track
fields are public-safe measured metadata. Application paths are
`public/audio/<topic>.mp3`; static paths are `audio/<topic>.mp3`.

The existing player has deliberate Play/Pause, independent Mute/Unmute,
native-media status/errors and one-active-clip lifetime. Leaving the topic
stops it. There is no autoplay, loop/restart or remote song provider. Next's
root media URLs and the static physical hosting prefix are resolved separately
from hash navigation. Narrative remains readable if media fails.

These supplied recordings are **third-party media, not MIT code**. Follow
[media credits and replacement steps](media-credits.md) to approve, privately
probe, stage and measure a replacement without publishing private provenance.
The single portable notice is [audio-credits.txt](audio-credits.txt).
The app packager and Vite place its exact bytes at `AUDIO-CREDITS.txt` in each
ZIP root; neither a docs-only guide nor static `LICENSE.txt` substitutes for it.
Titles and attributions must match the canonical public manifest.
Graph/envelope sizes are not actual file lengths or digests. Packaging verifies
the reviewed manifest and exact bytes; it does not download, transcode, decode
or supply missing clips.

## Package without Azure

Both packagers are network-free and refuse an existing output. For a reviewed
working-tree **application-only** package:

```powershell
$artifact = & .\infrastructure\scripts\New-AppServicePackage.ps1 `
  -OutputPath '.azure\artifacts\sunsum-reviewed.zip'
& .\infrastructure\scripts\Test-AppServicePackage.ps1 -Path $artifact.Path
$artifact | Select-Object Path, Files, CompressedBytes, UncompressedBytes, SHA256
```

The helper includes allowlisted app/source/public files, all three exact MP3s
and the public manifest. Its one explicit documentation input,
`docs\ws1\audio-credits.txt`, is mapped to root `AUDIO-CREDITS.txt`; the rest of
`docs` is not added to the application ZIP. It excludes `.env`, `.npmrc`, credentials, links,
dependencies, build caches, tests and operator material. The validator requires
exact Linux casing, rejects duplicate/unsafe entries and checks every file's
bytes/hash plus the manifest's schema, clip paths, measured fields and digests.
The standalone source helper packages the working tree, not just HEAD.

For **both artifacts and the operator handoff**, use a full checkout at a
clean, reviewed commit. Select static `preview` with no API base as above,
build it, then choose a new release directory:

```powershell
npm run build:demo
pwsh -NoProfile -File .\scripts\New-UiRelease.ps1 `
  -OutputDirectory '.azure\artifacts\reviewed-ui-release'
```

This creates `sunsum-app-source.zip`, `sunsum-synthetic-demo.zip`, `operator`
and `release-manifest.json`. It requires the clean source revision to match
the static build stamp; stale, missing, extra or modified static files fail.
All media and the portable credit notice must already be staged and identical
in both ZIPs, with media bound to the same public manifest. Vite must emit
`AUDIO-CREDITS.txt` from `docs\ws1\audio-credits.txt` before stamping its files.
Operator docs, configuration examples, media credits,
the public manifest and matching helpers are separately hashed.

**Each ZIP is bounded independently:** 64 MiB compressed, 64 MiB total
uncompressed, 32 MiB per entry and 10,000 entries. MP3 is admitted only at the
three exact paths, not for arbitrary uploads. Size failures do not drop media,
download substitutes or raise caps. A failed assembly produces no completed
release manifest; review the cause and use a new output path.

### Release manifest schema 2

Schema 1's blanket `LIVE_READ_ONLY` semantics are historical. Do not reinterpret
or edit earlier manifests.

| Field | Interpretation |
| --- | --- |
| `sourceRevision` / `backendContractRevision` | Actual clean release source / retained inspected `db0c6a5` contract lineage, not current upstream; reconcile before publication |
| `deployedRevision` | `null`; packaging did not observe deployment |
| `application.mode` | `DYNAMIC_WORKSPACE`, supporting explicitly configured `connected` and `server-demo` |
| `application.allowedMutations` | Exact per-mode declarations: interest POST with `{}`; server-demo additionally allows the existing demo-switch adapter |
| `demo.mode` / `demo.allowedMutations` | `SYNTHETIC_DEMO_ONLY` / empty; service and session transport are false |
| Per-artifact counts, sizes, hashes and `fileHashes` | Actual archive and entry-byte receipts, not source-implementation claims |
| `audio` | Same public-manifest digest, topic paths, clip bytes/digests and measured properties; `THIRD_PARTY_NOT_MIT`; `credits` binds the identical root `AUDIO-CREDITS.txt` in both ZIPs |
| `operator` / engine requirements / `limits` | Separate handoff hashes, actual package-manifest engines and unchanged safety budgets |
| `AzureCalls` | `0`; package-only, not deployment permission |

File hashes bind actual checkout/archive bytes. Respect `.gitattributes`
(including PowerShell CRLF) when comparing them with raw Git blobs. Do not
silently normalize an already reviewed ZIP or rewrite a historical manifest.

### Use a delivered release without repackaging

Keep the received ZIPs unchanged. From their containing directory:

```powershell
$release = Get-Content -LiteralPath '.\release-manifest.json' -Raw | ConvertFrom-Json
$artifact = [pscustomobject]@{
  Path = (Resolve-Path -LiteralPath '.\sunsum-app-source.zip').Path
  SHA256 = $release.application.sha256
}
if ((Get-FileHash -LiteralPath $artifact.Path -Algorithm SHA256).Hash -ine $artifact.SHA256) {
  throw 'The application ZIP does not match its reviewed manifest.'
}
& .\operator\infrastructure\scripts\Test-AppServicePackage.ps1 -Path $artifact.Path
```

For local application use, extract into a **new** directory and copy the
operator folder contents there, retaining relative paths. Run `npm ci`,
configure the chosen dynamic mode, then `npm run build` and
`npm run start -- --hostname 127.0.0.1 --port 3000`.
The application ZIP deliberately excludes the Vite entry/configuration.
`build:demo` and `New-UiRelease.ps1` require the full reviewed checkout,
not that extracted application.

To preview the already compiled demo, extract it into a new sibling directory
`sunsum-demo`. From the restored application directory, use its existing Vite:

```powershell
npx --no-install vite preview --outDir '..\sunsum-demo' `
  --host 127.0.0.1 --port 4183 --strictPort
```

Use HTTP, not `file://`. This serves the delivered static bytes without
connecting them to Next. Resolve additional workstream documentation from
`<sourceRepository>/tree/<sourceRevision>` in the manifest, not mutable main.
Hashes do not supply identity, operating authority or deployment approval.

## Future deployment reference only

The retained hosting contract is Linux App Service source ZIP/Oryx and normal
Next start: `npm ci --include=dev && npm run build`, then
`npm run start -- --hostname 0.0.0.0`. Next consumes platform `PORT`;
`NODE|22-lts` alone does not guarantee the required patch. Existing-target
settings, quota, TLS, publishing and participant identity require separate
owner confirmation. This handoff repairs none of them.

**SUNSUM-DEPLOYMENT:EXISTING-TARGET** and
**SUNSUM-DEPLOYMENT:ARTIFACT-APPROVAL** bind any future operation to the actual
approved existing target, exact ZIP/hash/revision, actor and replacement/restart
effects. The [seven-field names-only approval example](code-approval.example.json)
deliberately fails validation. Keep filled target/approval values outside
source and record their reviewed SHA-256; a JSON receipt is not itself authority.
See the [existing operating guide](../../infrastructure/docs/app-service-postgres.md)
for the fixed-artifact uploader and future authorization process.

When composing this handoff, preserve PR66's deployment-timeout changes from
commit `44345b758b3f08afdafc05f863e4441046153aae`: asynchronous submission and
status polling tied to the **matching deployment ID**. A different/latest
deployment's success or a healthy homepage does not prove this upload finished.
Timeout is an uncertain remote outcome, not permission to redeploy; a later
authorized operator must reconcile that same deployment before considering
another upload. PR66 itself is infrastructure-only; later upstream API changes
require separate reconciliation. Neither authorizes deployment here.

`Deploy-AppServiceCode.ps1` without `-Apply` validates locally; `-Apply` would
replace/clean existing code and may restart the target. It is **not part of
this delivery**. Main-push app deployment exists (PR60), and the incompatible
legacy provisioning workflow is guarded (PR65). Preserve both; do not push or
merge main, dispatch/enable cloud workflows, add `-Apply` or provision an
alternative target. No migration, seed/reset or database rollback is included.

## Command effects and troubleshooting

| Command | Effect |
| --- | --- |
| `npm run dev` / `build` / `start` | Develop/build/serve Next; startup mode and legitimate service checks still govern operations |
| `npm run build:demo` / `preview:demo` | Build/serve transport-free synthetic files and approved public media |
| `New-AppServicePackage.ps1` / `Test-AppServicePackage.ps1` | Create/inspect an application source ZIP locally |
| `New-UiRelease.ps1` | Assemble revision-bound app/demo/operator outputs; no build, download or Azure call |
| Deployment apply, database migration/seed/reset | Separate authorization; not connection shortcuts or release steps |

| Symptom | Meaning and safe next action |
| --- | --- |
| `npm ci` reports `ETARGET proxy-addr@2.0.8` | Use the reviewed successor lockfile and its documented three-entry reconciliation; do not bypass the approved feed or regenerate arbitrary versions |
| Unavailable/mixed mode | Check exact selector/store/demo-auth/signing values; never fall back to another mode |
| `server-demo` with `true`/`1` | Wrong sentinel; only explicit `enabled` with mock store admits that experience |
| Connected 401 or seeded identity | Use legitimate sign-in/mapping; do not issue a demo cookie |
| 403, onboarding refusal or locked deal room | Respect service scope; only the deliberate eligible interest action is added |
| Unknown interest outcome | Read-only reconciliation; no automatic retry and no inferred failure from empty results |
| Homepage works, workspace does not | Public HTML does not prove auth, database, storage or provider readiness |
| Cross-origin/CORS failure | Use the existing same-origin topology; do not expose tokens or weaken CSRF/CORS |
| Candidate parcel map unavailable | PR71 is open/proposed and has a no-query contract; immutable review/admission remains, with no browser parcel credentials or assumed provider success |
| Setup checklist proposes `SUNSUM_STORE=db` in dev | Preserve the intentional infrastructure fixture-store guard; use explicit server-demo, not a cloud configuration fix |
| Metadata GET succeeds but original GET is 404 | PR70 registration and raw-byte upload are separate; do not invent bytes or silently add an upload/configuration write |
| Basemap credential request | A separate basemap-only referrer-restricted key is optional, not parcel access; no key use/provider call is authorized here now |
| ArcGIS authentication question | Assess documented scoped-key/app-OAuth/user-OAuth support for the actual product/tenant; a legacy token failure is not a universal capability verdict |
| Metadata without bytes / export unavailable | Original/download and export admission are independent; do not invent a file/grant |
| Media absent/hash mismatch | Restore the exact approved source and manifest, then rebuild; no runtime download or substitute |
| Audio credits missing/stale | Emit the canonical `docs\ws1\audio-credits.txt` as `AUDIO-CREDITS.txt` in Vite; keep its titles/attributions aligned with the one public manifest |
| Media works at root but not Pages prefix | Fix physical asset-base resolution, not hash navigation or a remote song URL |
| ZIP size/path/link guard failure | Review the exact offending input; do not weaken caps/allowlists or omit required audio |
| Future authorized deployment times out | Reconcile asynchronous status for the matching deployment ID; do not accept another deployment's result or blindly redeploy |
| Pages cannot call `/api` | Expected: static has no session/service transport |

A complete handoff identifies the source PR/revision, immutable artifact
hashes, per-connection source/mode/observed evidence and any missing legitimate
identity/disclosure handoff. Describe an unobserved deployment as **not
deployed**, not as a successful service connection.
