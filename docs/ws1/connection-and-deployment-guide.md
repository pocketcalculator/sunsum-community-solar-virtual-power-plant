# Connect and deliver SunSum

This guide covers the locally reconciled follow-up to externally merged PR62,
using upstream `449f6b0660609af3c80946f618c5e73828a36768`. **An implemented backend
API is not automatically enabled by this frontend.** The approved scope remains existing
reads, explicit project interest and server-demo-only session switching.
No source-main push/merge or Azure deployment was performed by this work.

## Choose an experience

| Experience | Entry | Prerequisites |
| --- | --- | --- |
| Static synthetic | Public landing, then explicit fictional Sunroom | No credentials, API base or session adapter |
| Developer/demo mode | Next `/app`, `server-demo` | Explicit mock store, exact `enabled` demo sentinel, configured test-only signing, same-origin `/api` |
| Connected workspace | Next `/app`, `connected` | Separately approved db-backed environment, demo auth off, legitimate sign-in/mapping and current service identity |

Use Node 22.22.2+ within major 22, npm 10 and the committed lockfile; restore with
`npm ci` from a full checkout. `package.json`/`package-lock.json` own exact
dependency versions. Package helpers require PowerShell 7.2+. Do not bypass the
configured feed or replace reviewed lock entries by guessing newer versions.
Use separate terminals for the modes and restart the server when changing
configuration. No example below supplies a real credential or production session.

## Static synthetic quick start

```powershell
$env:SUNSUM_PUBLIC_DATA_MODE = 'preview'
Remove-Item Env:SUNSUM_PUBLIC_API_BASE_URL -ErrorAction SilentlyContinue
npm run build:demo
npm run preview:demo
```

Open `http://127.0.0.1:4183`: bare root and `#/` show the **public landing**.
Choose **Open Sunroom workspace** or open `#/concepts/sunroom` explicitly.
The shared `/app` action becomes `#/app`, which canonicalizes to that workspace.
`#/need`, `#/opportunity`, `#/impact`, `#/join` and the original
`#/dashboard/site-owner` illustration remain separate routes.

Vite rejects dynamic modes and any nonempty API base, including static env-file
values. `SYNTHETIC_DEMO_ONLY` describes the artifact; the environment spelling
remains `preview`. All assets must work under the actual hosting prefix.
Sunroom's fictional local storage/recovery is distinct from the public `/join`
flow, which saves nothing. Never enter real personal information.

## Server-demo quick start

This uses existing APIs with in-memory fixtures, **not production sign-in**.
See [server-demo.env.example](server-demo.env.example).

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

Open `http://127.0.0.1:3000/app`. The header says **Developer/demo mode**.
Deliberate role selection uses the existing seeded-session adapter; `GET /api/me`
confirms identity. Switching retires old reads/actions before refreshing scope.
Anyone reaching the demo endpoint can select a seeded role, so keep this example
loopback-bound and never mix it with real records.

The generated signing value stays in the terminal, not output/source. Workspace
admission requires explicit signing; the backend's development ephemeral-secret
fallback is insufficient. Use exactly `enabled`, not `true`/`1`. No legitimate
connected-sign-in approval, database rollout or seeding command is needed.

## Connected quick start

**The current infrastructure dev target intentionally stays `SUNSUM_STORE=mock`.**
Do not switch it to db mode as a UI or GIS workaround. This example applies
only to a separately approved database-backed environment.

Signed-session validation exists, but a production sign-in integration and
approved participant mapping must still be supplied by the service owner.
Configuration flags do not implement that flow or grant access. Without it,
the public pages can run, but a genuine connected participant cannot sign in
through the developer role control.

Use [live-read.env.example](live-read.env.example) as a names-only reference.
The service owner supplies existing server-only signing and database configuration
through the approved secure process; do not mint a cookie, borrow an identity,
create a user or use demo-switch as a connected recovery path.

```powershell
# Separately approved database-backed environment only; not fixture-only dev.
$env:SUNSUM_PUBLIC_DATA_MODE = 'connected'
$env:SUNSUM_PUBLIC_API_BASE_URL = '/api'
$env:SUNSUM_STORE = 'db'
$env:SUNSUM_DEMO_AUTH = 'false'
# True only after the legitimate sign-in/mapping handoff:
$env:SUNSUM_LIVE_READ_AUTH_APPROVED = 'true'
$env:SUNSUM_LIVE_EXPORT_APPROVED = 'false'
$env:SUNSUM_LIVE_DOCUMENTS_APPROVED = 'false'
# Existing SUNSUM_SESSION_SECRET, DATABASE_URL and SUNSUM_DB_AUTH come from the owner.
npm run dev -- --hostname 127.0.0.1 --port 3000
```

The header is **Connected workspace** when admitted, otherwise **Connection
unavailable**. Source/role labels are not grants. Known seeded identities remain
refused even if an old demo cookie survives disabling demo auth. Failure never
selects another source mode or fills the UI with samples.

### Connect existing reads

Both `/app` and the public layout use
`app\app\configuration.ts` -> `getWorkspaceConfiguration()`.
The pure resolver projects only public-safe flags; `source` values
`database-configured`, `mock-configured`, `not-confirmed` are configuration
evidence, not observed deployment.

| Setting / capability | Meaning |
| --- | --- |
| `SUNSUM_PUBLIC_DATA_MODE` / `SUNSUM_PUBLIC_API_BASE_URL` | Explicit dynamic mode and existing same-origin `/api`; no alternate proxy/host |
| `SUNSUM_STORE` / `SUNSUM_DEMO_AUTH` | `mock` + exact `enabled` for server-demo; `db` + disabled demo auth for connected |
| `SUNSUM_SESSION_SECRET` | Configured server-only signing, at least 32 characters; expose presence, not value |
| `SUNSUM_LIVE_READ_AUTH_APPROVED` | Existing legitimate sign-in/mapping handoff, not authentication or a blanket write grant |
| `canAttemptInterest` | Derived admission for one command; no new `SUNSUM_LIVE_INTEREST_*` flag or generic `canWrite` |
| `SUNSUM_LIVE_EXPORT_APPROVED` / `SUNSUM_LIVE_DOCUMENTS_APPROVED` | Independent disclosure gates, off by default; viewing/interest never enables them |
| `DATABASE_URL`, `SUNSUM_DB_AUTH` | Application persistence; separate `PG*`/`SUNSUM_DATABASE_AUTH` tooling is not interchangeable |

Start with the current authorized `GET /api/me`, then permitted projections.
Keep the reviewed contract pin, frontend source revision, configured store,
retrieval time and deployed revision distinct. Existing consumed contracts are
pinned to inspected upstream `449f6b0660609af3c80946f618c5e73828a36768`;
no new endpoint is enabled merely by that pin.

### Client extension seam

Import only the public `src\features\live-read\index.ts`.

| API | Contract |
| --- | --- |
| `createWorkspaceClient(configuration, options?)` | Returns `ReadResult<WorkspaceClient>`; handle `ok/error` before using `data` |
| `createLiveReadClient(configuration, options?)` | Same implementation, with interest forced off for legacy read-only callers |
| `expressInterest(projectId, InterestOptions)` | Required current `scope`; optional `signal`/`acknowledgeUnknownOutcome`; wire body is exactly `{}` |
| `readMyEngagements(ScopedReadOptions)` | Scoped, GET-only authoritative refresh/reconciliation |

`ReadScope` is a lifetime/correlation handle, not authentication. Read/export
provenance carries mode/store, contract revision, retrieval time and
`deployedRevision: null`. `ReadProvenance.operations` is GET-only; mutation
receipts are separate.

### Queries, interest and disclosure

Role UI means the shared workspace's collections/details/actions plus authorized
dashboard aliases, not just filters. Investor queries use repeated `stage`,
`viability`, exact `project_type` and explicit `mandate_match` (default on).
Operator pipeline/submissions use repeated `status`, `type=rooftop/land`,
`viability` and applied `location`. Page size 25/50/100, sorting and cards/list
stay local. Only the current actor/query may publish results or clear loading.
Keep sensitive queries/records out of URLs, history and browser storage.

Interest requires a current onboarded investor, a loaded permitted portfolio
project, fresh identity/onboarding/engagement checks and an explicit click.
Before dispatch, the client also re-reads the portfolio using the exact current
service query; a disappeared project or failed read is not permission to write.
Confirmed 201 receipts require both creation and state-change timestamps.

| Outcome | Required interpretation |
| --- | --- |
| Matching 201 / expected 409 | Created nonbinding interest / existing engagement; refresh authoritative state without inventing funding |
| Auth/role/onboarding/origin/not-found refusal | Respect refusal and retire scope as appropriate; no demo recovery or automatic onboarding |
| Canceled before dispatch | Not sent |
| Timeout, loss/abort after dispatch, 5xx or invalid success receipt | Unknown outcome; bounded authorized GET reconciliation, not rollback or automatic replay |

An empty/failed reconciliation does not prove failure. A deliberate new attempt
must acknowledge the unresolved outcome and repeat preflight. Project-level
interest is distinct from funding-need-specific rows; preserve the service's
engagement ordering/binding state. Reading detail does not itself express interest.

If a mismatched receipt retires access, use **Refresh permitted reads**, then
reselect a newly authorized project before checking its interest status.
Only unresolved-command bookkeeping survives temporary retirement in RAM,
hidden until the same actor is freshly authorized by the same client.
A different actor or client/configuration lifetime discards that bookkeeping;
it does not retain authorized records, persist a command or trigger a retry.

**UI originals remain site-only** for permitted owner/operator scope behind the
independent gate. PR70 implements project-content GET in the backend, including
eligible tier-one investor access, but this frontend does not call it. There is
no GET project-document-list route. Metadata, POST registration, PUT bytes and
GET content are distinct; missing bytes may produce 404. No upload mutation is
enabled. Exports remain normalized manifests, not binary document bundles or
proof that a contextual site ID supplies a working original route.

## Implemented backend does not mean enabled frontend

Session auth (PR27) and operator override (PR41) are implemented; legitimate
production sign-in and real WS4/model verification remain separate.
See [source-backed capabilities](contracts.md#merged-service-code-and-runtime-evidence).

| Backend capability | Current frontend boundary |
| --- | --- |
| Profile POST and operator contact/sign-up-list read | Neither is called by this frontend |
| Project-document registration/upload/content GET | No new writes or project-original reads; UI originals stay site-only |
| Candidate-parcel GET (merged PR71) | No GIS reader, renderer/provider request or audit allowance is enabled |

`POST /api/profiles` is anonymous, origin-checked intake, not sign-in. A 201 is
an intake receipt; server-derived `role_id` may be null and grants no session or
workspace access. The current public `ProfileDraft` no longer collects an account
method/password, while the backend requires `account_method` and rejects password
and caller `role_id`. It is **not** a simple snake_case serialization. Any later
save needs an explicit scope/UX/mapping decision; never invent a sign-in choice.
Preview-role mapping may differ from backend derivation. Both dynamic and static
`/join` remain no-save under this approval.

## Backend GeoJSON map boundary

PR71 is merged in the reconciled upstream; its final head `5be551b` changes
authentication-code handling, not the role/provenance conclusions below.
`GET /api/sites/candidate-parcels` admits authenticated **`site_owner` or
`operator`**, with **no per-owner filtering**. It is not an operator-only API,
and a frontend button cannot narrow the server's policy. It remains unadmitted
in this frontend.

The route accepts no query parameters and returns `application/geo+json`,
`no-store`, Polygon/MultiPolygon XY geometry in EPSG:4326 and five nullable
properties: `parcel_id`, `site_address`, `city`, `state`, `postal_code`.
It defaults to **three synthetic parcels**, independently of the core store.
`fetched_at`/`stale` does not disclose source mode, completeness or source revision.
Neither 200, `stale=false` nor `SUNSUM_STORE=db` proves live GIS data.

Before any future admission, owners must resolve disclosure/join policy,
source labeling, completeness and cache behavior, including authorization-denial
and concurrent-failure cases. These source/cache policies have not been validated
against a live provider. Do not send bbox, layer, field-list, token, paging or
map-pan queries, or reinterpret parcel IDs as site/project IDs.

| Concern | Boundary |
| --- | --- |
| Basemap/reference cache | Cache only as provider licensing permits; no assumed mirror right |
| Parcel overlay | Candidate collection, not owned/submitted projects; selection creates no site or viability result |
| Site-specific enrichment | Repeated new/changed-site GIS/WS4 work is a separate contract; the bulk parcel GET does not implement it |

Parcel/admin/account credentials and parcel-access tokens remain backend-side.
A separate basemap-only, referrer-restricted browser key is optional, **not
provisioned or authorized for use here**. Backend owners must assess supported
[API-key scopes](https://developers.arcgis.com/documentation/security-and-authentication/api-key-authentication/),
[app OAuth](https://developers.arcgis.com/documentation/security-and-authentication/app-authentication/)
or [user OAuth](https://developers.arcgis.com/documentation/security-and-authentication/user-authentication/)
for the actual product/tenant; legacy `generateToken` results are not a blanket
authentication verdict.

The backend has an on-demand cache; that is not an agreed freshness SLA or
permission for frontend polling. A hybrid/change-driven/scheduled policy remains
a proposal. Geometry/address and incomplete zoning/land-class inputs do not prove
viability. Reuse the existing `src\backend\viability` -> `core\sites` boundary;
the model owner's required layers and actual DTO agreement remain separate.

The editing seam remains `MAPS-LOCATION` in the sole registry, the public
`live-read` client and `MapLimit.tsx` / `CollectionView.tsx`. Do not introduce a
second proxy/registry or wire these services without admission. No real parcel
geometry/properties belong in source, fixtures or bundles; appraisal is not
investment data. Format/hash receipts grant no disclosure rights, and EPSG:4326
is the interface requirement, not a claim that a CRS member was read from a
private attachment.

## Blob configuration is not operational proof

The source-supported [Blob selector](../../src/backend/blob/index.ts) is
independent of `SUNSUM_STORE`. Unset `SUNSUM_BLOB` selects memory; invalid modes
fail. `SUNSUM_BLOB=azure` requires `AZURE_STORAGE_ACCOUNT_NAME` and the Entra
branch: `DefaultAzureCredential` when `NODE_ENV=development`, managed identity
otherwise. Only the emulator path auto-creates containers.

These settings do not prove deployed values, permissions, containers or bytes.
Do not change cloud configuration to repair an unverified condition or weaken
fixture-only dev. Registration can succeed while bytes remain absent; a 201
does not prove persistent database/blob storage.

## Public audio and editing

The [edit map](../../README.md#where-to-edit) locates current modules.
[pageAudioAssets.json](../../src/features/participation/content/pageAudioAssets.json)
is the single schema-1 mapping for the three approved clips and their nine public
fields. Next serves `/audio/<topic>.mp3`; static uses `audio/<topic>.mp3` under
the physical hosting prefix, not hash navigation.

Use deliberate Play/Pause and independent Mute/Unmute; navigation stops playback
and errors leave narrative readable. The [third-party notice](audio-credits.txt)
must travel unchanged as root `AUDIO-CREDITS.txt` in both ZIPs. It is separate
from MIT code; titles/attributions match the canonical manifest. Follow
[media replacement steps](media-credits.md); never publish private provenance.

## Package without Azure

Use a new output for each reviewed artifact. Packagers are network-free:

```powershell
$artifact = & .\infrastructure\scripts\New-AppServicePackage.ps1 `
  -OutputPath '.azure\artifacts\sunsum-reviewed.zip'
& .\infrastructure\scripts\Test-AppServicePackage.ps1 -Path $artifact.Path
```

That packages allowlisted working-tree application files, the three MP3s and
manifest, plus `docs\ws1\audio-credits.txt` mapped to `AUDIO-CREDITS.txt`.
It is not a compiled Next standalone or the static demo.

For both ZIPs and operator material, use a full checkout at a clean reviewed
commit and a matching static build. Select static `preview` with no API base:

```powershell
npm run build:demo
pwsh -NoProfile -File .\scripts\New-UiRelease.ps1 `
  -OutputDirectory '.azure\artifacts\reviewed-ui-release'
```

The output is `sunsum-app-source.zip`, `sunsum-synthetic-demo.zip`, `operator`
and `release-manifest.json`. Source/static revisions and every stamped file must
match; required media and credits must have identical reviewed bytes. Vite emits
the notice before stamping. No downloads, substitutes or historical manifest
rewrites are allowed.

The operator kit includes the backend README and API/OpenAPI references as
well as the setup, mode, media and deployment guidance. CI additionally emits
`ci-acceptance.json`, binding its full source SHA, event/merge SHA, run ID and
both ZIP hashes. That receipt distinguishes an actual packaged-source Linux
build from a source-only packaging result.

Each archive is independently limited to **64 MiB compressed/uncompressed,
32 MiB per entry and 10,000 entries**. Preserve path, link, duplicate, credential,
exact-case and digest guards. Missing/mismatched media or notice fails; do not
drop files or raise caps.

### Release manifest schema 2

| Field | Meaning |
| --- | --- |
| `sourceRevision` / `backendContractRevision` | Actual reviewed frontend source / inspected consumed-contract pin `449f6b0660609af3c80946f618c5e73828a36768` |
| `deployedRevision` | `null`; packaging did not observe deployment |
| `application.mode` / allowed mutations | `DYNAMIC_WORKSPACE`; explicit connected interest, plus seeded-session switching only in server-demo |
| `demo.mode` / allowed mutations | `SYNTHETIC_DEMO_ONLY`; no backend mutations or service/session transport |
| File/size/hash inventories and `operator` | Actual artifact and separate handoff receipts, not runtime acceptance |
| `audio` | Exact paths/bytes/digests, measured properties, `THIRD_PARTY_NOT_MIT` and shared `audio.credits` notice digest |
| Engine requirements / `limits` / `AzureCalls` | Manifest-derived engines, unchanged budgets and `0` Azure calls |

Use matching revision/helper receipts. Respect `.gitattributes`, including
PowerShell CRLF, when comparing actual archive bytes with raw Git blobs.
Never reinterpret schema-1 historical manifests or rewrite earlier exports.

### Use a delivered release without repackaging

Keep the reviewed ZIPs unchanged. From their containing directory:

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

Extract the app into a new directory and copy operator contents there with
relative paths intact. Restore dependencies, configure an admitted dynamic mode,
then use `npm run build` / `npm run start`. This app ZIP excludes the Vite entry:
`build:demo` and release assembly require the full checkout.

For an already compiled demo extracted to sibling `sunsum-demo`, use the
restored app's existing Vite without downloading another tool:

```powershell
npx --no-install vite preview --outDir '..\sunsum-demo' `
  --host 127.0.0.1 --port 4183 --strictPort
```

Use HTTP, not `file://`. Look up further source docs through the manifest's
repository/revision, not moving main. Hashes supply neither credentials nor
deployment authority.

## Future deployment reference only

The retained host contract is Linux App Service source ZIP/Oryx, ordinary
`npm ci --include=dev && npm run build` and
`npm run start -- --hostname 0.0.0.0`. Existing-target settings, identity,
quota, TLS and approvals remain operator work. The
[approval example](code-approval.example.json) deliberately contains invalid
placeholders; a filled receipt alone is not authority.

Preserve the existing [operating guide](../../infrastructure/docs/app-service-postgres.md),
main-push automation and infrastructure guards. Any future authorized upload
must reconcile asynchronous status for the **matching deployment ID**.
A timeout or another deployment's success is not proof about this upload;
do not blindly replay, create a replacement host or change tiers/settings.
Deployment, migrations, seed/reset and cloud-workflow dispatch are not part
of this delivery.

## Troubleshooting

| Symptom | Safe interpretation |
| --- | --- |
| Dependency restore fails | Use reviewed lock entries and the approved feed; do not guess replacements or bypass policy |
| Unavailable/mixed mode | Check exact source/store/demo-auth/signing prerequisites; no fallback |
| Local fixture dev shows no connected access | Use explicit server-demo; do not weaken the guarded mock store |
| 401, seeded identity or role refusal | Use legitimate connected sign-in or respect the source mode; do not mint/borrow a session |
| Unknown interest result | Authorized GET reconciliation only; no inferred failure or automatic replay |
| Profile intake API exists but `/join` saves nothing | Expected scope; account-method/serializer/consent changes need explicit adoption |
| Project document GET exists but UI offers no download | UI originals are site-only; do not invent a project-doc list or route admission |
| Metadata exists but bytes return 404 | Registration and upload are separate; storage availability needs evidence |
| Parcel API returns three rows or `stale=false` | Not live-source/completeness proof; GIS is not enabled in this frontend |
| Media/credits mismatch | Restore the exact approved source/manifest/notice and rebuild; no substitution |
| ZIP guard rejects input | Review the mismatch; retain caps, required assets and safety checks |
| Pages cannot call `/api` | Expected: static has no session/API adapter |
