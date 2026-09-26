# SunSum connection index

The sole machine-readable registry is
[`src/domain/connections.ts`](../../src/domain/connections.ts), re-exported by
the public [`live-read` entry](../../src/features/live-read/index.ts).
It owns accepted operations, roles, disclosure, configuration names and bounds.
This document is an index, not another endpoint/schema registry.

The follow-up is locally reconciled with immutable upstream
`449f6b0660609af3c80946f618c5e73828a36768`, the inspected consumed-contract pin.
Source implementation, enabled
frontend calls, configured stores and observed deployment are separate facts.
No new operation is admitted merely by updating a source pin.

## Frontend connection families

Dynamic modes share one bounded service client. Static preview has no service
or session adapter. An unavailable family does not mean its backend code is absent.

| Search ID | Frontend caller / scope | Boundary |
| --- | --- | --- |
| `SUNSUM-CONNECTION:WS2-IDENTITY` | Existing `GET /api/me`; all admitted roles | Fresh signed identity; connected rejects known seeded principals |
| `SUNSUM-CONNECTION:WS2-OWNER` | Owner sites and outstanding requests | Caller-owned records, existing stored assessment/document metadata |
| `SUNSUM-CONNECTION:WS2-OPERATOR` | Submissions/pipeline/detail, project engagements/funding | Existing operator projections only; no contact-list read, review or stage command |
| `SUNSUM-CONNECTION:WS2-INVESTOR` | Portfolio/profile/engagement/funding/deal-room reads and explicit interest | Current investor/project/onboarding scope; no automatic interest or private operator fill-in |
| `SUNSUM-CONNECTION:WS2-DOCUMENTS-EXPORT` | Separately admitted site-original downloads and normalized export | UI originals remain site-only for owner/operator; project-original GET and all uploads are not enabled |
| `SUNSUM-CONNECTION:WS4-ASSESSMENT-READ` | Stored permitted assessment fields | No direct WS4 reader or claimed real-model verification |
| `SUNSUM-CONNECTION:WS2-TO-WS4-SCREENING` | Stored authorized results | No new screening, rescreening or override command |
| `SUNSUM-CONNECTION:MAPS-LOCATION` | No frontend GIS operation | Backend parcel GET exists; `site_owner`/operator access without owner filtering is not frontend admission |
| `SUNSUM-CONNECTION:AI-IMAGE-EVIDENCE` | Stored observations/context only | No upload, inference, correction or provider call |
| `SUNSUM-CONNECTION:FINANCE-GIS-EXTERNAL-DATA` | Stored permitted funding/context projections | No private ingestion or new calculations; parcel appraisals are not investment data |

Activity, notifications, utility status and guidance use only existing documented
fields. Do not invent generic project/notification endpoints or turn unknown
counts into empty success. See the [backend-versus-frontend matrix](contracts.md#implemented-backend-not-enabled-frontend)
for profile/contact, project-document and parcel capabilities.

## Source modes and mutations

| Mode | Admission | Backend mutations enabled in the UI |
| --- | --- | --- |
| Static `SYNTHETIC_DEMO_ONLY` | Environment `preview`, no API base | None; fictional commands remain local |
| `server-demo` | Explicit `mock`, exact demo auth `enabled`, configured test signing, same-origin `/api` | Deliberate mock-store project interest and the existing seeded-session switch |
| `connected` | Explicit `db`, demo auth off, configured signing, legitimate sign-in/mapping and current service identity | Deliberate project-level interest only |
| `unavailable` | Missing/invalid/mixed configuration | None; never fall back to another mode |

The command is `POST /api/projects/{id}/engagements` with `{}`. It records
nonbinding interest, not a capital commitment. The compatibility flag
`SUNSUM_LIVE_READ_AUTH_APPROVED` is admission evidence, not authentication.
`canAttemptInterest` is derived, not a generic write grant or new environment
variable. Export and original-download approvals remain independent.

## Queries, provenance and outcomes

Investor wire queries use repeated `stage`, `viability`, exact `project_type`
and explicit `mandate_match` (default on). Operator queries use repeated
`status`, `type`, `viability` and applied raw-address `location`. Local paging,
sorting and cards/list do not become unsupported server parameters.

Only the current actor/query may publish rows, counts or loading state. Keep
sensitive queries/records out of URLs/history/storage; counts describe loaded
permitted records, not a complete account total. Preserve date-only precision,
service engagement ordering and project-versus-funding-need distinctions.

Matching 201 confirms interest; 409 is existing engagement. Pre-dispatch
cancellation is not sent. Network loss, timeout/abort after dispatch, 5xx or an
invalid success receipt means **unknown outcome**. Reconcile with authorized
GETs; empty/failed reads do not prove failure or trigger replay. Any deliberate
new attempt acknowledges uncertainty and repeats preflight.

Read/export provenance carries configured mode/store, contract revision and
retrieval time with deployed revision unknown. POST receipts are separate.
Project-only metadata does not gain a site-original capability from a contextual
site ID, and export links do not automatically adopt PR70's project-content route.

## GIS and storage boundaries

Merged PR71 implements query-free `GET /api/sites/candidate-parcels` for
`site_owner` **or** `operator`; there is no owner filter. It defaults to three
synthetic parcels and returns no source-mode/provenance field.
`fetched_at`/`stale`, a 200 or a database-configured workspace cannot certify
live GIS. Cache authorization/failure behavior, completeness and source-policy
assumptions still need review before frontend admission; no live provider
validation is claimed.

The canonical map entry, public typed client and `MapLimit.tsx` /
`CollectionView.tsx` are the editing seam, not permission to add a transport.
Keep candidates separate from submitted sites/projects unless an authorized
join exists. Geometry/address is not a complete viability input set.

Parcel credentials/tokens stay backend-side. A separate basemap-only,
referrer-restricted browser key is optional and not provisioned/authorized here.
Cache reference layers only as licensing permits; no default frontend polling
or assumed mirror right. Private geometry/properties and appraisal data do not
belong in source, fixtures or bundles. See the [detailed handoff](connection-and-deployment-guide.md#backend-geojson-map-boundary).

The current dev record store intentionally remains `mock`. Blob configuration
is independent: the source supports `SUNSUM_BLOB=azure` with
`AZURE_STORAGE_ACCOUNT_NAME`, but that proves no deployed configuration,
container, permission or bytes. No cloud configuration repair is part of this UI.

## Operator handoff

Provide connection ID, source/contract and frontend revisions, admitted mode,
identity/disclosure scope, bounds/freshness and actual authorized observations.
Use safe configuration names, never secret values or private records.
`SUNSUM-DEPLOYMENT:<GATE-ID>` locates separate target/artifact guards; repository
access is not deployment authority. Use the [practical guide](connection-and-deployment-guide.md)
for starts, package commands and failure handling.
