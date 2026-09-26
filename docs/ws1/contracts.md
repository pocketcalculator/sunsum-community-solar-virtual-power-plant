# WS1 contract and evidence register

**Source-backed contracts are not deployment or frontend-admission proof.**
This follow-up is locally reconciled with immutable upstream
`449f6b0660609af3c80946f618c5e73828a36768`, including merged PR71's final head
`5be551b`. The final PR71 change affects authentication-code handling, not the
role/provenance conclusions below.

The existing consumed contracts are pinned to that inspected upstream.
The frontend release revision and
artifact hashes are recorded separately. Do not silently relabel historical
exports/manifests, claim observed deployment or expand frontend operations.
The sole machine-readable connection registry remains
[`src/domain/connections.ts`](../../src/domain/connections.ts); this register
points to evidence, not a competing wire schema.

## Enabled frontend scope

The dynamic UI consumes its existing authorized identity, owner, operator,
investor, site-document and export reads. Its only business command is explicit
project-level `POST /api/projects/{id}/engagements` with `{}`.
The existing `POST /api/auth/demo-switch` adapter is enabled only in explicit
mock-backed `server-demo`. Static `preview` has no session/API transport.

Profile creation, contact-list reads, GIS reads, project-original reads,
document registration/uploads, assessment overrides and other business/provider
operations are **not enabled** merely because their backend routes exist.
The public `/join` flow remains fictional and unsaved.

## Merged service code and runtime evidence

| Source-backed capability | What exists | What is not established |
| --- | --- | --- |
| [PR27 session authentication](https://github.com/pocketcalculator/sunsum-community-solar-virtual-power-plant/pull/27) | Protected-route/session-auth implementation | Configured legitimate sign-in, participant mapping or a real authorized session |
| [PR41 assessment override](https://github.com/pocketcalculator/sunsum-community-solar-virtual-power-plant/pull/41) | Operator override in `src\backend\core\projects` and `src\backend\handlers\projects`, at `/api/sites/{id}/assessment/override` | Live WS4/model conformance or approval for a frontend override write |

Origin-checked anonymous session/intake routes do not make protected reads
anonymous. Seeded demo sign-in is not production identity, and disabling its
issuance does not turn an old demo cookie into a genuine participant.

## Implemented backend, not enabled frontend

| Backend surface | Source contract | Frontend status |
| --- | --- | --- |
| `POST /api/profiles` | Anonymous same-origin intake; rejects request password/caller role; derives nullable role | No frontend POST; no-save preview retained |
| Operator sign-up/contact-list read (PR69) | Protected access to participant intake records | No contact-list caller or new personal-data projection |
| PR70 project-document POST registration / PUT bytes | Metadata registration and raw-byte upload are separate operations | Neither write is admitted |
| `GET /api/projects/{projectId}/documents/{documentId}/content` | Existing project-original route; disclosure/engagement can permit eligible tier-one investors | No project-original UI read; current originals remain site-only |
| `GET /api/sites/candidate-parcels` (merged PR71) | Authenticated `site_owner` or `operator`; query-free collection without an owner filter | No GIS operation, renderer/provider call or broadened audit allowance |

There is **no GET project-document-list route**. Do not infer one from the
POST registration URL or use metadata to manufacture an original-content URL.

### Profile intake is not sign-in

A profile 201 returns intake metadata, not an authenticated account, session,
workspace grant or durable-database guarantee. Response `role_id` is server-derived
and may validly be null. The current fixture-backed dev store is intentionally
non-production and may lose records on process restart.

The public `ProfileDraft` no longer contains an account-method answer or password.
The backend requires `account_method`, so this is **not a simple snake_case
mapping**. Do not invent `email` or another sign-in choice to satisfy the DTO.
Any later save needs explicit admission, an intentional UX/answer mapping and
a reviewed serializer. Password and caller-supplied `role_id` remain rejected.

Preview-role mapping is distinct from backend derivation: for example,
`workforce-participant` previews with no role while backend charter mapping can
derive operator. Neither is authentication. Static no-save wording remains
correct; dynamic consent/success wording changes only with an actually admitted
and implemented save.

### Document metadata and bytes

PR70's project-original GET is implemented. Metadata may be registered before
bytes exist, so a permitted download may return 404. Stored content type,
attachment/nosniff delivery and original-read authorization are distinct from
metadata existence. Container access and memory-store contents require separate
operational evidence; no remote configuration repair is authorized here.

The UI's existing original route remains site-based and owner/operator scoped.
Backend investor project-content eligibility does not turn that site route into
an investor route. Project-only metadata cannot use a contextual `site_id` as
proof of a site-content capability.

The exporter still builds role-scoped JSON/CSV/document manifests, not file
bundles. Its legacy investor `content_url` remains null; it has not automatically
adopted the newer project-content path. Preserve server engagement/disclosure
checks and the independent export/original flags. No upload is needed or allowed
as an automatic response to missing bytes.

## Parcel and GIS contract

PR71 is merged. The backend admits `site_owner` **or** `operator`; investors
are refused, and there is **no per-owner parcel filtering**. Authorized viewers
receive the same configured candidate collection. An operator-only UI control
would not change that server policy.

The endpoint accepts no query parameters and returns `application/geo+json`
with `no-store`. It publishes Polygon/MultiPolygon XY geometry in EPSG:4326 and
five nullable string properties: `parcel_id`, `site_address`, `city`, `state`,
`postal_code`. Owner/valuation fields are withheld. Do not send bbox, layer,
where, fields, token, paging or map-pan arguments.

The backend parcel selector defaults to **three synthetic parcels**. It is
independent of the record store and workspace mode. Collection metadata
`fetched_at` and `stale` is not fixture/live provenance or an upstream dataset
revision; even 200 and `stale=false` do not prove ArcGIS access.
Do not infer source from IDs, feature count or dates.

Source inspection identifies cache authorization/cooldown and concurrent-failure
consistency concerns, incomplete/invalid-feature reporting limits and source-policy
decisions requiring review before frontend admission. These are not live
operating measurements. The process-local on-demand cache is not a finalized
refresh SLA or permission for frontend polling.

Candidate IDs are not site/project UUIDs; no authorized join is implied.
Selecting a parcel must not create a site, project or viability result.
Separate basemap/reference-layer caching, parcel display and repeated
new/changed-site enrichment. This bulk GET does not implement the full latter
workflow or invoke/persist WS4 assessment.

Parcel/admin/account credentials and parcel-access tokens remain backend-side.
A separate basemap-only, referrer-restricted browser key is optional, not
provisioned or authorized for use here. Actual product/tenant privileges and
licensing require owner review; a legacy token test does not establish that
ArcGIS lacks secure authentication. Basemap caching is not an assumed mirror right.

Private geometry/properties must not enter source, fixtures or bundles.
Format/hash receipts are not publication authority; parcel appraisals are not
investment data. EPSG:4326 is a contract requirement, not a claim of a CRS member
read from private input. See the [editing/authentication boundary](connection-and-deployment-guide.md#backend-geojson-map-boundary).

## Mode, authority and action lifetime

`server-demo` requires explicit mock store, exact `SUNSUM_DEMO_AUTH=enabled`,
configured test signing and same-origin `/api`. Connected mode requires explicit
db-backed configuration, demo auth off, legitimate sign-in/mapping admission
and fresh service identity. Known seeded identities are excluded. Current dev
infrastructure stays fixture-only; a suggested db-mode switch is not authority
to weaken its guard.

Read, export, original and interest admission are separate. One deliberate
interest click sends at most one POST after current investor/project/onboarding
and identity/engagement checks. `{}` is project-level interest, not a
funding-need-specific engagement or a capital commitment.

| Result | Interpretation |
| --- | --- |
| Matching 201 | Confirmed nonbinding creation; refresh authoritative engagements |
| Expected 409 | Existing engagement, not another creation or an automatic retry |
| Pre-dispatch cancellation | Not sent |
| Refusal | Respect auth/role/onboarding/origin/record scope; no demo recovery |
| Lost/aborted post-dispatch response, 5xx or invalid success receipt | Outcome unknown; bounded GET reconciliation only |

An empty/failed reconciliation does not prove failure. Any deliberate new attempt
acknowledges the unresolved one and repeats preflight. Actor/config changes
retire old UI/receipts; no command queue or replay follows navigation.
GET provenance remains separate from mutation receipts.

## Viability and model agreement

The existing [`src/backend/viability`](../../src/backend/viability) HTTP translator
already feeds [`core/sites`](../../src/backend/core/sites) workflows. Its local
request/response schemas and configured `{SUNSUM_VIABILITY_URL}/assessments`
target are implementation facts, **not proof the actual WS4 tool agreed or conforms**.

| Application value | Existing local mapping boundary |
| --- | --- |
| Area in square metres | Convert by site type to upstream square feet/acres |
| Upstream `viable` | Surface no stronger than preliminary `potentially_viable` |
| Point estimates | Preserve the source limitation when presented as ranges |
| Missing inputs | Remain missing; consumption is not generation |

Geometry/address and incomplete zoning/land-class inputs do not form a complete
viability dataset. The model owner's required field/layer list and backend/model/
frontend agreement remain necessary. Reuse the existing translator; do not
invent a second DTO or silently supply missing values. Demo viability values
and merged override code do not certify a live model.

## Audio and release evidence

The three approved clips use the single schema-1
[public manifest](../../src/features/participation/content/pageAudioAssets.json),
with measured metadata and no private provenance. Both archives contain exact
matching bytes and the canonical `AUDIO-CREDITS.txt` notice; third-party recordings
are not MIT code. See [media credits](media-credits.md).

Schema-2 release metadata distinguishes the reviewed frontend source, consumed
backend pin, mode-specific allowed mutations, per-file/operator/media hashes and
unknown deployed revision. Packaging makes zero Azure calls. Historical artifacts
are not rewritten. Use the [package guide](connection-and-deployment-guide.md#package-without-azure)
and separate owner approval for any later deployment.
