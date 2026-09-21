# SunSum connection index

Use this index to find an integration, **not to infer that it is operating**.
The sole machine-readable registry is
[`src/domain/connections.ts`](../../src/domain/connections.ts), re-exported by
the public [`live-read` entry](../../src/features/live-read/index.ts).
That registry owns exact accepted methods, role scope, disclosure, configuration
names, freshness and handoff status. Do not create another endpoint/schema list.

The retained integration's original inspected application/API contract lineage is
[`db0c6a5d6e39`](https://github.com/pocketcalculator/sunsum-community-solar-virtual-power-plant/commit/db0c6a5d6e39fe7cf079dab27e9616189945cf6c),
including that base's frontend API integration, **not current-main parity**. Pin the
[OpenAPI source](../api/openapi.yaml) and actual handlers, not just their differing
0.1.0/0.1.1 labels. This is **inspected source evidence, not deployed-service
proof**. A release records its own source revision; deployed revision remains
unknown until independently observed. Mock responses and packaged bytes do not
certify real participant access.

The maintainer has merged PR62, and the observed upstream head is now
`f77ee120d9101034696af990eecb0e59aeb0545c`, including newer profile, operator
sign-up-list and project-document APIs. This register describes retained
admission only: no new operations are adopted here until coordinator
reconciliation and re-freezing. [Publication is held](../../README.md#upstream-reconciliation-hold).

## Connection families and callers

All network-enabled rows use the one service client from `/app`. `connected`
and `server-demo` use the same current GET contracts under different explicit
admission. Static Sunroom has no service/session caller.

| Search ID | Caller / role | Responsibility | Admission and ordinary unavailable behavior |
| --- | --- | --- | --- |
| `SUNSUM-CONNECTION:WS2-IDENTITY` | Workspace identity; all three roles | `GET /api/me` establishes current service identity | Fresh signed session; connected rejects known seeded principals. 401 retires actor scope, never demo fallback |
| `SUNSUM-CONNECTION:WS2-OWNER` | Owner sites/outstanding views | Caller-owned site and request GETs, stored assessment/document metadata | Site-owner service scope; real empty results differ from unavailable/error |
| `SUNSUM-CONNECTION:WS2-OPERATOR` | Pipeline, submissions and detail; operator | Existing list/detail, engagement and funding GETs | Operator authorization and verified project/site scope; no generic project GET or review/stage writes |
| `SUNSUM-CONNECTION:WS2-INVESTOR` | Portfolio, profile, project interest/detail; investor | Existing profile/portfolio/engagement/funding/deal-room GETs and explicit project-interest POST | Fresh identity, onboarding, project visibility and engagement scope; no automatic interest or operator-data fill-in |
| `SUNSUM-CONNECTION:WS2-DOCUMENTS-EXPORT` | Original download / reports; service-permitted roles | Retained site-original and export reads; PR70 project-content adoption pending | PR70 may serve tier-one investors by disclosure/engagement; independent original/export admission remains, with no new upload mutation |
| `SUNSUM-CONNECTION:WS4-ASSESSMENT-READ` | Stored assessment presentation | No direct candidate-service transport | Hold for per-record authorization, accepted deployed schema and ID linkage |
| `SUNSUM-CONNECTION:WS2-TO-WS4-SCREENING` | Stored authorized result presentation | No new screening/rescreening request | New screening persists state; separate workflow approval required |
| `SUNSUM-CONNECTION:MAPS-LOCATION` | Operator parcel context and future site enrichment | OPEN PR71 at `c6549bd`: proposed no-query `GET /api/sites/candidate-parcels`, default demo GeoJSON; not merged/live/admitted | Immutable review of operator scope and nullable snake_case contract remains; parcel credentials stay backend; basemap-only key remains separate/unapproved |
| `SUNSUM-CONNECTION:AI-IMAGE-EVIDENCE` | Stored observations and human-review context | No upload, inference or correction | Consent, provider/retention contract and human review required before integration |
| `SUNSUM-CONNECTION:FINANCE-GIS-EXTERNAL-DATA` | Stored funding/context projections | No private ingestion, calculation or provider transport | Preserve nullable units/vintage/assumptions; parcel appraisals are not investment data; no invented yields or financial execution |

Activity, notifications, utility status and guidance project only documented
fields within these ten families. There is no invented notifications, utility
or generic project endpoint. Unavailable history/counts are not successful
empty results.

Session authentication in PR27 is implemented, and PR41's operator override is
source-verified in the existing projects core/handlers, not merely merged.
Neither is an absent feature. Their [runtime gates](contracts.md#merged-service-code-and-runtime-evidence)
still require configured sign-in and real WS4/model evidence; neither merge
silently grants another frontend mutation.

The [new upstream handoffs](contracts.md#new-upstream-handoffs-awaiting-admission)
also describe anonymous, origin-checked `POST /api/profiles` and PR70 document
operations. They do not authorize profile creation, POST-register or PUT-bytes
from this UI. A profile 201 is an intake receipt, not an account/session/grant
or durable-database proof; a null derived role is valid. PR70's implemented
project-original GET may return 404 without separately uploaded bytes.
Container or memory-byte availability still needs operational evidence.

## Source mode is not authority

| Experience | Exact entry/admission | Mutations reachable from this UI |
| --- | --- | --- |
| `SYNTHETIC_DEMO_ONLY` | Static `preview`, no API base; independent fictional store | None over service/session transport; demo commands are local |
| `server-demo` | Explicit mode, `SUNSUM_STORE=mock`, `SUNSUM_DEMO_AUTH=enabled`, configured signing, same-origin `/api` | Deliberate project interest against mock records; existing demo-switch adapter |
| `connected` | Explicit mode, `SUNSUM_STORE=db`, demo auth disabled, legitimate sign-in/mapping admission and fresh service identity | Deliberate project-level interest only |
| `unavailable` | Invalid, absent or mixed configuration | None; never silently select another mode |

`canAttemptReads`, `canAttemptInterest`, original-download and export flags admit
attempts, not identities or grants. The compatibility name
`SUNSUM_LIVE_READ_AUTH_APPROVED` records the legitimate sign-in/mapping handoff;
it is neither an authenticator nor a blanket read-only guarantee.
`OUT_OF_REACH_RIGHT_NOW` describes the available handoff/configuration/access,
not whether another team has built the service.

The only business command is `POST /api/projects/{id}/engagements` with `{}`.
It records nonbinding project interest, not money movement or commitment.
`POST /api/auth/demo-switch` is separate session issuance, mounted only in
server-demo through the existing adapter. No other backend mutations are
automatically adopted because their routes exist.

## Queries, provenance and uncertain outcomes

Investor queries use repeated `stage`, `viability`, exact `project_type` and
explicit `mandate_match=true/false`; mandate matching defaults on. Operator
pipeline/submissions use repeated `status`, `type=rooftop/land`, `viability`
and deliberately applied `location` against raw address. Page size 25/50/100,
sorting, list/cards and labeled local facets remain client-side. Journey ribbon
IDs are not project stages; project type is not site type. Never send `site_type`
or unsupported paging parameters.

Only the current actor/query request may publish rows, counts, errors or clear
loading. Counts describe loaded permitted records, not a certified account
total. A failed query is not unfiltered data, samples or an empty success.
Keep sensitive address queries and records out of URLs, history and browser
storage; preserve same-actor navigation with bounded in-memory context.

Keep source revision, configured store, GET observation time, nullable record
timestamps and deployed revision distinct. Preserve date-only versus timestamp
precision. A project-only document does not gain a site-content route because
an export supplies a contextual site ID. Existing service creation/ID ordering,
not a later update to an old engagement, determines its emitted last row.
Project-level duplicate interest is distinct from funding-need-specific rows.

A matching 201 receipt confirms the command; 409 describes existing engagement.
Before-dispatch cancellation is not sent. Timeout/network loss/abort after
dispatch, 5xx or invalid receipts leave an **unknown** outcome. Bounded
authorized GET reconciliation must never replay the command or treat an
empty/failed GET as proof of failure. Identity changes retire old UI/receipts.
Exports carry GET provenance, not invented mutation evidence.

The separately referenced WS4 candidate
[`0c1c6d4bbbc1`](https://github.com/pocketcalculator/sunsum-community-solar-virtual-power-plant/commit/0c1c6d4bbbc15ec91cb8d0a59daa6e5094ff5301)
is not a verified production service. Its broad GETs cannot be exposed through
a shared privileged proxy. WS2's existing screening client posts to
`{SUNSUM_VIABILITY_URL}/assessments`; that is not an admitted frontend action.

## Backend GeoJSON handoff

Future GIS integration must support repeated site-scoped lookup/enrichment for
newly submitted or changed sites feeding WS4 assessment, not merely render a
fixed parcel overlay. Separate basemap/reference-layer cache, parcel overlay
and site-specific enrichment; a display payload is not the assessment-output DTO.

Parcel GeoJSON `FeatureCollection`, EPSG:4326, comes from **our backend**.
Parcel/admin/account credentials and parcel-access tokens must not reach the
browser. A separate basemap-only, referrer-restricted key is an optional browser
credential, not parcel access; no key or basemap/provider call is authorized now.
Backend owners must compare supported feature-service/
item-scoped API keys, server OAuth app credentials and user OAuth against the
actual product/version/tenant. Legacy `generateToken` findings are not a blanket
verdict on ArcGIS authentication; see the [official options in the guide](connection-and-deployment-guide.md#backend-geojson-map-boundary).

PR71 is **OPEN** at `c6549bd4267acd7c4e5f079677aa491228453a57`. Its proposed
operator-only `GET /api/sites/candidate-parcels` refuses a nonempty query string
and has the [nullable snake_case GeoJSON contract](contracts.md#new-upstream-handoffs-awaiting-admission).
It is not merged/live/admitted; further immutable core/driver review remains.
Default demo fixtures and `fetched_at`/`stale` metadata do not identify a live
source. Neither 200, `stale=false` nor a core database-mode flag proves ArcGIS
access. Do not add a proxy/backend or use credentials to force that conclusion.

The existing `src\backend\viability` translator feeds `core\sites` workflows
with local request/response schemas. Actual WS4 tool agreement/conformance
still needs backend/model/frontend confirmation; do not treat local types as
live viability proof. Geometry/address and incomplete zoning/land-class coverage
are not complete viability inputs; the WS4/model required field/layer list
remains outstanding. A hybrid cache with
change-driven or agreed scheduled refresh is a proposal. Cadence is unknown:
no default frontend polling or claim of implemented provider integration.
Cache basemaps/reference layers only as provider terms/licensing permit, not
as an assumed mirror right.
Private parcel evidence is not permission to publish real polygons, embed them
in browser fixtures or add them to a release. Static demonstration data remains
synthetic and transport-free.

Keep operation/admission metadata in the same `MAPS-LOCATION` registry entry
when the supplied contract passes code/permission/provenance review. The current
unavailable map presentation is `src\features\live-workspace\MapLimit.tsx`,
composed by `CollectionView.tsx`; it leaves the permitted collection useful.
Parent-coordinated bounded frontend work can use that seam after the
endpoint/data-shape assessment without introducing provider credentials.

## Operator handoff

Provide the connection ID, accepted source/deployed revisions, configured source
mode, identity/record/disclosure scope, freshness/limits and last actual
authorized observation. Use configuration **names**, never credentials or
private records. `SUNSUM-DEPLOYMENT:<GATE-ID>` locates existing target/artifact
guards; source access is not publishing authority.

See [the practical guide](connection-and-deployment-guide.md) for three starts,
exact command effects, media replacement, package-only delivery and failures.
