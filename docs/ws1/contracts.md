# WS1 contract and evidence register

**Status: source-backed read integration register.** This document is not a
parallel API specification or certification of a deployed environment.

The current frontend implements the selected WS2 **read** operations against
the schemas/handlers pinned in [connections.md](connections.md). Legitimate
participant sign-in, actual authorized records and remote deployment remain
separate acceptance evidence. The reader does not use demo-switch or implement
business-workflow writes. Conditional WS4/provider families stay out of reach
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
- Separate synthetic Sunroom and ephemeral, permission-scoped service reads;
  no connected workflow-write commands.
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
| Wire contract            | WS2 with WS4           | Versioned machine-readable inputs/outputs/errors and ownership                | Source-pinned selected reads; remote revision not confirmed |
| Screening                | WS4                    | Units, range shapes, rules/assumptions/version, and three outcome examples    | Stored authorized results only; separate candidate not admitted |
| Demo data                | WS2/WS4                | Approved synthetic examples and repeatable seed mechanism                    | Separate 50-record frontend demo; no backend seed action |
| Identity and permissions | WS2/WS3                | Actor/session semantics, object ownership, investor scope and document access | Signed-session source accepted; legitimate participant handoff required |
| Azure delivery           | WS3                    | Service/artifact/startup, access, configuration and budget                    | Historical F1 delivery; this release is package-first |
| UX                       | WS5                    | Shared design decision and review disposition                                 | Selected original styling with Sunroom structure |
| Core acceptance          | WS6 and service owners | Actual persisted/deployed three-role journey and adverse cases                | Beyond this frontend's live-read-only scope |

An unavailable handoff does not assert that another contributor has done no
work. Source acceptance, configuration, actual authorized reads and deployment
are independent facts; one must not silently mark the others complete.

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
- **Documents are a manifest, not bytes.** `content_url` is null whenever the
  caller has no route to the content, which is *always* for an investor —
  tier-1 content delivery is the §7.6 short-lived-SAS design and is not built.
  This also lets the export describe metadata without reading Blob bytes.
  Current remote storage availability must be observed separately.

Known limitation carried by the identity gate: every *protected* route now
requires a signed `sunsum_session` cookie and answers `401 unauthenticated`
without one, and cookie-authenticated writes are refused across sites, so the
limitation is no longer "no authentication". Two routes are deliberately
anonymous, because a client cannot present a cookie it does not yet have:
`POST /auth/demo-switch` issues the first one and `POST /auth/logout` clears
it. Both are origin-checked instead. What remains is that a session *starts*
without a credential — `POST /auth/demo-switch` hands out one of three seeded
identities to anyone who can reach it, gated only by `SUNSUM_DEMO_AUTH`. Roles
are read from the user row, never from caller-supplied input, so the disclosure
tiers are enforced; but this is still a demo sign-in, and WS3 owns replacing it
with a real identity provider.

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

The upstream is the preliminary-viability service, and its API is
`POST {SUNSUM_VIABILITY_URL}/assessments`. It does not share our vocabulary, so
`src/backend/viability` is the single place the two are reconciled. The
translation is worth recording here because each line of it is a place a demo
could show a homeowner a wrong number:

| Ours                        | Theirs                                     | Rule                                                        |
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

## Questions the canonical contract must resolve

- Draft versus submission requirements, consent, optional usage/equipment/files,
  validation feedback, and repeated-submit behavior.
- Explicit area/power/annual-energy units, range and missing-value representation,
  preliminary outcomes, factors, flags, and reviewer override/rationale.
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

For future changes beyond the source-pinned reads in this release:

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
