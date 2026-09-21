# WS1 contract and evidence register

**Status: source-backed scoped integration register.** This document is not a
parallel API specification or certification of a deployed environment.

This is the retained worktree's contract register, not current-main parity.
The maintainer has merged PR62; upstream now includes additional profile,
operator sign-up-list and project-document APIs. [Publication is held](../../README.md#upstream-reconciliation-hold)
pending coordinator reconciliation and re-frozen contracts. No new operation
or permission is adopted merely because it exists upstream.

The current frontend implements the selected WS2 **GET** operations against
the schemas/handlers pinned in [connections.md](connections.md). Legitimate
participant sign-in, actual authorized records and remote deployment remain
separate acceptance evidence. The only admitted frontend business mutation is
explicit project-level interest: `POST /api/projects/{id}/engagements` with `{}`.
The existing demo-switch adapter is present only in explicitly admitted
mock-backed `server-demo`; never in connected or static mode.
Conditional WS4/provider families stay out of reach
until their existing authorization/linkage contracts are supplied.

The broader historical gate register below records workstream responsibilities;
it must not be interpreted as proof of current remote readiness or absence.
Use the [connection/deployment guide](connection-and-deployment-guide.md)
for this release's actual admission and delivery path.

The public foundation needs no backend or credentials. The landing page and the
create-profile flow are public descriptions and a local form, not authenticated
workspaces, populated pilot dashboards, or successful-looking substitutes for
unavailable services. Creating a profile assembles answers in the browser and
sends nothing.

## Selected local scope

- Next.js App Router and TypeScript, using the existing root npm/CI layout.
- Public landing/story pages, participation, education and a no-save
  fictional profile flow without password capture.
- Separate synthetic Sunroom and ephemeral, permission-scoped dynamic modes;
  the explicit nonbinding-interest command does not expand other write scope.
- Ordinary local production build/start; WS3 owns Azure delivery and service configuration.

The revised September 14, 2026 charter remains the MVP scope authority.
The September 16 database decision in the
[technical design](../sunsum_technical_design_doc.md) selects **Azure Database
for PostgreSQL Flexible Server with Drizzle ORM and Drizzle Kit**, and the
web preview uses Linux App Service code deployment.
Private Blob Storage, Entra integration, and optional Fabric remain integration
work. These decisions do not supply a database schema, configure those
services, or make them dependencies of the current browser-only profile flow.

## External acceptance gates

| Gate                     | Owner                  | Required evidence                                                             | Status                     |
| ------------------------ | ---------------------- | ----------------------------------------------------------------------------- | -------------------------- |
| Wire contract            | WS2 with WS4           | Versioned machine-readable inputs/outputs/errors and ownership                | Source-pinned reads and project interest; remote revision not confirmed |
| Screening                | WS4                    | Units, range shapes, rules/assumptions/version, and three outcome examples    | Stored authorized results only; separate candidate not admitted |
| Demo data                | WS2/WS4                | Approved synthetic examples and repeatable seed mechanism                    | Separate 50-record frontend demo; no backend seed action |
| Identity and permissions | WS2/WS3                | Actor/session semantics, object ownership, investor scope and document access | Signed-session source accepted; legitimate participant handoff required |
| Azure delivery           | WS3                    | Service/artifact/startup, access, configuration and budget                    | Historical F1 delivery; this release is package-first |
| UX                       | WS5                    | Shared design decision and review disposition                                 | Selected original styling with Sunroom structure |
| Core acceptance          | WS6 and service owners | Actual persisted/deployed three-role journey and adverse cases                | Beyond this frontend's scoped read/interest integration |

An unavailable handoff does not assert that another contributor has done no
work. Source acceptance, configuration, actual authorized reads and deployment
are independent facts; one must not silently mark the others complete.

### Merged service code and runtime evidence

| Verified merged change | What that establishes | What remains separate |
| --- | --- | --- |
| [PR27: refuse anonymous requests / session authentication](https://github.com/pocketcalculator/sunsum-community-solar-virtual-power-plant/pull/27) | Shipped protected-route/session-auth code | Configured legitimate sign-in, participant mapping and current authorized runtime identity |
| [PR41: assessment override](https://github.com/pocketcalculator/sunsum-community-solar-virtual-power-plant/pull/41) | Source-verified operator-override implementation | Real WS4/model conformance, cross-team DTO agreement and any separately approved frontend override workflow |

PR41 was verified in source, not only by merge status: the implementation lives
in [`src/backend/core/projects`](../../src/backend/core/projects) and
[`src/backend/handlers/projects`](../../src/backend/handlers/projects), with the
singular route `/api/sites/{id}/assessment/override`. This is existing backend
functionality, not another mutation adopted by this frontend.

Do not describe these capabilities as absent simply because runtime setup or
model evidence is missing. Conversely, merged code does not prove a configured
sign-in path, working provider connection or live viability result. The current
frontend's scoped-interest permission does not adopt the override write.

### New upstream handoffs awaiting admission

These supplied contracts are not automatic additions to the frontend's accepted
operations. Keep the [publication/reconciliation hold](../../README.md#upstream-reconciliation-hold)
and the single machine-readable connection registry.

| Supplied service contract | Current evidence / boundary | Frontend admission |
| --- | --- | --- |
| PR71, **OPEN** at `c6549bd4267acd7c4e5f079677aa491228453a57`: operator-only `GET /api/sites/candidate-parcels` | Proposed no-query GeoJSON; nullable response properties are `parcel_id`, `site_address`, `city`, `state`, `postal_code`; owner names/valuations withheld | Not merged/live/admitted. Immutable core/driver, authorization and provenance review remains separate |
| Merged `POST /api/profiles` | Anonymous, origin-checked intake; request `password` and `role_id` rejected; a 201 returns intake metadata with server-derived `role_id`, which may validly be null | A 201 is not an account, session, grant or durable-database proof. No frontend POST is silently added; static no-save copy remains correct |
| PR70: `GET /api/projects/{projectId}/documents/{documentId}/content` | Project-original service route implemented; eligible tier-one investors remain subject to disclosure/engagement checks; metadata may exist while missing bytes produce 404 | Reconcile authorized reads with independent original-read gates. POST-register and PUT-bytes are separate, unapproved frontend mutations |

The inspected PR71 proposal returns `application/geo+json` with `no-store`,
Polygon/MultiPolygon geometry and XY longitude/latitude in EPSG:4326. It refuses
a nonempty query string: do not send bbox, filters, field lists, tokens, paging
or map-pan parameters. Collection metadata `fetched_at` and `stale` conveys
freshness, **not fixture/live provenance**; neither 200 nor `stale=false` proves
ArcGIS access. Source labeling needs trusted parcel-source configuration or an
agreed contract amendment. Candidate parcels stay separate from submitted
sites/projects unless an authorized join is supplied; selection creates none.

Container access and memory-store contents require separate operational evidence.
An API implementation or storage setting is not proof that document bytes are
available, and this handoff authorizes no remote storage/configuration write.
The current dev target intentionally uses fixtures; an AI-suggested switch to
`SUNSUM_STORE=db` is not authority to override the infrastructure guard. Its
profile 201 receipts must not be presented as authenticated or durable accounts.

### Current operation and source-mode boundary

`src\domain\connections.ts` is the single machine-readable register. The
integration's original inspected application/API lineage is
`db0c6a5d6e39fe7cf079dab27e9616189945cf6c`, not current main or a claim about a deployed service.
The successor's source revision, actual data mode, GET observations, mutation
receipts and deployed revision are distinct evidence.
The backend pin remains unchanged until immutable contract review and source
reconciliation are complete; an open PR or newer branch head is not sufficient.

Static `SYNTHETIC_DEMO_ONLY` never reaches session or service transport.
`server-demo` requires `SUNSUM_PUBLIC_DATA_MODE=server-demo`, `SUNSUM_STORE=mock`,
`SUNSUM_DEMO_AUTH=enabled`, configured session signing and same-origin `/api`.
Connected operation requires explicit db mode, demo auth disabled, approved
legitimate sign-in/mapping and fresh service identity; known seeded principals
are not legitimate connected admission. Invalid/mixed configuration is
unavailable, not a fallback selector. Read/export/original gates stay separate.

One interest click dispatches at most one POST after investor, onboarding,
fresh-identity and visible-project/engagement checks. `{}` is **project-level**
interest, not a funding-need-specific engagement or capital commitment. A
matching 201 receipt confirms creation; 409 is existing-engagement state,
not a second creation. Authorization/onboarding/origin/not-found refusals do
not justify weakening protections or entering demo mode.

Cancellation before dispatch is not sent. Network loss, timeout/abort after
dispatch, 5xx or an invalid success receipt means **outcome unknown**. Bounded
authorized engagement GETs may reconcile it; an empty or failed GET does not
prove failure. There is no automatic replay, browser command queue or replay
on navigation/identity change. Any deliberate new attempt warns about the
unresolved one and repeats preflight. GET provenance never becomes a mutation
receipt.

Submission, withdrawal, profile/mandate/notes saving, uploads, review,
assignment, stage changes, publishing, screening/provider calls and financial
execution remain outside this frontend integration. Existing backend APIs for
other clients are preserved. `/join` remains fictional and unsaved.

The three approved MP3s are a separate public-media contract, not service data
or MIT-licensed code. Both archives bind their exact bytes to the same
schema-1 [public manifest](../../src/features/participation/content/pageAudioAssets.json).
Release manifest **schema 2** explicitly changes mode/allowed-mutation semantics;
historical manifests are not reinterpreted or rewritten. See the
[package guide](connection-and-deployment-guide.md#package-without-azure) and
[media credits](media-credits.md).

### Backend GeoJSON map gate

The future workload includes repeated GIS lookup/enrichment for each newly
submitted or changed site feeding WS4 assessment; a fixed parcel overlay alone
does not meet it. Keep basemap/reference-layer cache, parcel overlay and
site-specific enrichment separate. Basemap caching requires provider licensing
permission, not an assumed mirror right.

Parcel data stays behind a backend-delivered GeoJSON `FeatureCollection`
boundary in EPSG:4326. Parcel/admin/account credentials and parcel-access tokens
must not reach the browser, even short-lived/referer-bound ones. A **separate
basemap-only, referrer-restricted key** is an optional browser credential, not
parcel access; no key use or basemap/provider call is authorized now.
The backend owner must assess
product/tenant-supported scoped keys, app OAuth or user OAuth without treating
legacy `generateToken` tests as proof that secure ArcGIS authentication is absent.

The open PR71 proposal supplies the no-query candidate-parcels GET described
above, superseding the earlier missing-endpoint handoff. Admission review remains pending;
default demo fixtures do not establish a live parcel-provider connection.
Geometry/address alone are incomplete viability inputs, and zoning/land-class
coverage must not be assumed. The WS4/model owner's required field/layer list
is still needed; do not invent missing values or a viability DTO.

Refresh cadence remains unspecified. The existing
viability translator has local input/output schemas, but those do not prove
the actual WS4 tool agreed to or conforms to them. Backend, model/WS4 and
frontend owners must confirm that contract before claiming real integration;
do not invent fields or viability readiness. Hybrid caching with
change-driven or agreed scheduled refresh is a proposal, with no default
frontend polling and no claim of implemented provider integration.
Retain the single `MAPS-LOCATION` registry entry for the eventual accepted
operation, scope and provenance. See the
[editing/handoff seam](connection-and-deployment-guide.md#backend-geojson-map-boundary).

The source-private parcel evidence does not authorize public data release,
credential use, a replacement proxy/backend, new writes or Azure operations.
Future bounded frontend fixtures must be fictional, not copies of real parcels.

### WS2 artifacts offered against these gates

| Gate                     | Artifact                                                           | Version |
| ------------------------ | ------------------------------------------------------------------ | ------- |
| Wire contract            | `docs/api/openapi.yaml` with `docs/api/README.md`   | Labels differ; pin source commit and schemas |
| Demo data                | `src/backend/core/store` seed — five Atlanta/Chattanooga pilot sites, deterministic on process start | 0.1.0   |
| Identity and permissions | `src/backend/README.md` role/disclosure model; `src/backend/handlers/identity` session resolution | 0.1.0   |
| Export                   | `GET /export` — role-aware JSON or CSV download, composed from the reads each role already has | 0.1.1   |

The wire contract moves to 0.1.1 with `GET /export`. It is an addition, not a
change: no existing operation, field or status was altered, so a client written
against 0.1.0 is unaffected.

`GET /export` answers WS1's auto-export requirement. Two properties are worth
carrying into the canonical contract rather than rediscovering later:

- **It composes, it does not re-query.** The bundle is built from
  `getOwnerSites`, `getPortfolio` with `getDealRoom`, and `getPipeline` with
  `getSubmissionDetail`. A change to a disclosure tier therefore reaches the
  export automatically, and the export cannot become a second, weaker copy of
  the visibility rules.
- **Documents are a manifest, not bytes.** In the adopted contract,
  `content_url` is null when the caller has no content route; this frontend
  does not admit investor original downloads. Exported metadata is not Blob
  delivery. Do not turn that retained boundary into a claim that current main
  lacks document APIs: PR70's implemented project-original GET may serve eligible
  tier-one investors under disclosure/engagement checks and may return 404 when
  bytes were not uploaded. That is distinct from this retained
  frontend's download admission and grants no new POST-register or PUT-bytes
  permission. Container/memory-byte availability must be observed independently.

Known limitation carried by the identity gate: every *protected* route now
requires a signed `sunsum_session` cookie and answers `401 unauthenticated`
without one, and cookie-authenticated writes are refused across sites, so the
limitation is no longer "no authentication". The adopted base has deliberately
anonymous session routes, because a client cannot present a cookie it does not yet have:
`POST /auth/demo-switch` issues the first one and `POST /auth/logout` clears
it. Both are origin-checked instead. The newer anonymous, origin-checked
`POST /api/profiles` is a separate intake contract, not a session grant or an
automatically adopted frontend write. The remaining demo-path limitation is
credential-free seeded sign-in: `POST /auth/demo-switch` hands out one of three seeded
identities to anyone who can reach it, gated only by `SUNSUM_DEMO_AUTH`. Roles
are read from the user row, never from caller-supplied input, so the disclosure
tiers are enforced; but this is still a demo sign-in, and WS3 owns replacing it
with a real identity provider. For this frontend, seeded-session issuance is
admitted only with the exact `enabled` sentinel and the explicitly selected
mock store; setting `true` or `1` does not enable that experience. Disabling
issuance does not convert an old demo cookie into a genuine participant.

Vocabulary translation between the WS1 charter ids (`site-owner`, `operator`,
`financier`, and the seven journey stage ids) and the backend wire vocabulary
(`site_owner`, `operator`, `investor`, five project stages) is the backend's
responsibility and lives in `src/backend/handlers/shared/vocabulary.ts` and
`journeyStageId` in `src/backend/core/journey`. WS1 vocabulary is not renamed.

The two vocabularies are translated at different points, because only one of
them travels on the wire as a raw token:

- **Journey stages are already translated for you.** Every response that places
  something on the ribbon carries `journey_stage_id` in WS1's own kebab-case
  ids, alongside the raw `submission_status` / `project_stage`. Render from
  `journey_stage_id`; no adapter call is needed.
- **Roles are not.** `GET /api/me` returns the service role, and composed
  user/contact records may also carry a wire role. The browser-safe read
  adapter translates `site_owner` to the workspace's `site-owner`; investor
  remains `investor` within that workspace. The public charter's `financier`
  intent is a different vocabulary, not a grant. Browser presentation must
  not import `@/backend` to perform a translation. Existing backend vocabulary
  tests still cover its independent public-charter adapter.

## The viability service boundary

`POST /assess` in §6.1 is a call the backend *makes*, not an endpoint it serves.
The web app never sees it: `POST /sites` and `POST /sites/{id}/submit` are the
public operations, and the screening happens inside them.

The implemented HTTP translator in
[`src/backend/viability`](../../src/backend/viability) already feeds
[`src/backend/core/sites`](../../src/backend/core/sites) workflows. Its configured
upstream request is `POST {SUNSUM_VIABILITY_URL}/assessments`; this is distinct
from the singular site-override route above. The translator defines local
request/response schemas and the mappings below. These source expectations
are **not proof that the actual WS4 tool agreed to or conforms to them**.

| Application vocabulary     | Translator's local upstream vocabulary     | Implemented mapping                                         |
| --------------------------- | ------------------------------------------ | ----------------------------------------------------------- |
| `approximate_area_sqm`      | `usable_roof_area_sqft` / `usable_land_area_acres` | Exact conversion, chosen by `site_type`             |
| `viability_status` (3)      | `recommendation` (4)                       | `viable` maps **down** to `potentially_viable`               |
| size / generation **ranges** | single point estimates                     | Both bounds take the point; a flag records it was not a range |
| `missing_information`       | `missing_information`                      | Passed through unchanged                                     |

Three properties this boundary holds to, which any replacement upstream must
also hold to:

- **Nothing is invented to fill a gap.** A field the owner did not provide is
  absent from the request, not defaulted, and returns as `missing_information`.
- **Consumption is never sent as generation.** The upstream has an
  `annual_production_kwh` field and we hold `electricity_usage_kwh_annual`.
  They share a unit and mean opposite things; conflating them would corrupt the
  financial screening while looking entirely plausible.
- **A screening is never promoted into an approval.** Feature C says this is a
  preliminary screening and not an engineering, utility or financing
  determination, so the upstream's `viable` cannot surface as a stronger claim
  than our own UI is permitted to make.

An unreachable service returns `503 service_unavailable` and persists neither
the site nor an assessment, rather than recording a screening that never ran.
`SUNSUM_VIABILITY=demo`, the default, uses an in-process fixture so the journey
is demonstrable with no second deployment — but it returns the same illustrative
numbers for every site, and is not a screening.

Real WS4/model agreement and conformance remain a backend/model/frontend
handoff. Reuse the existing translator boundary and agree any GIS enrichment
or DTO changes; neither that local code nor PR41's override makes fixture
results real.

## Questions the canonical contract must resolve

- Draft versus submission requirements, consent, optional usage/equipment/files,
  validation feedback, and repeated-submit behavior.
- Explicit area/power/annual-energy units, range and missing-value representation,
  preliminary outcomes, factors, flags, and integration with the existing PR41
  override contract; do not invent a new WS4 output DTO.
- Submission disposition versus project stage, permitted transitions,
  site-to-project conversion, assignment, next action and target date.
- Session expiry, actor changes, role/object permissions, and per-role activity
  projections. Internal notes must not leak through a shared timeline.
- Operator-controlled investor visibility and approved-stage constraints.
  Permissions must apply to direct record and document requests.
- File types/limits, upload/download grants, required-document rules,
  acknowledgement actor/time/status, and visibility revocation behavior.
- Error shapes, request correlation, pagination/filtering, unit-compatible
  summaries, concurrency/idempotency, and authoritative refresh after writes.
- Hosting-appropriate response security headers, including CSP, referrer policy,
  content-type protection, and HSTS where HTTPS deployment requires it. Do not
  treat a local public preview as an approved production security configuration.

Do not fill these gaps with invented tariffs, eligibility thresholds, source-data
defaults, or a UI-only policy.

## Wider workflow adoption

For future changes beyond the source-pinned reads and scoped interest in this release:

1. Record its location, version and accepting owners here.
2. Agree shared import, generated types, or runtime conformance checks.
3. Replace provisional wire assumptions and their fixtures before calling a
   screen integrated. Preserve useful presentation tests without treating them
   as proof of service behavior.
4. Keep wire schemas/errors in the agreed contract boundary; keep feature state
   and derived view models within the owning modules.
5. Under separate write authority, prove one persisted record across owner submission, screening, operator
   acceptance, owner status and a permitted investor detail, including a denial
   or error path, before completing broad feature lanes.

This register declares no speculative endpoint URLs, JSON schema,
identity vendor, database migration, or fallback service. Missing services must
remain visibly unavailable rather than returning fake success.
