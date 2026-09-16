# WS1 contract and evidence register

**Status: proposal, not an accepted API specification.**

The public foundation needs no backend or credentials. The landing page and the
create-profile flow are public descriptions and a local form, not authenticated
workspaces, populated pilot dashboards, or successful-looking substitutes for
unavailable services. Creating a profile assembles answers in the browser and
sends nothing.

## Selected local scope

- Next.js App Router and TypeScript, using the existing root npm/CI layout.
- Public landing, three participation paths, project-journey explanation, FAQ,
  and a create-profile flow that saves nothing.
- Provisional semantic UI and scoped styles, with no data/control operations.
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
| Wire contract            | WS2 with WS4           | Versioned machine-readable inputs/outputs/errors and ownership                | Published, awaiting WS1 acceptance |
| Screening                | WS4                    | Units, range shapes, rules/assumptions/version, and three outcome examples    | Pending handoff            |
| Demo data                | WS2/WS4                | Approved synthetic Atlanta examples and repeatable seed mechanism             | Published, awaiting WS1 acceptance |
| Identity and permissions | WS2/WS3                | Actor/session semantics, object ownership, investor scope and document access | Published, awaiting WS1 acceptance |
| Azure delivery           | WS3                    | Service/artifact/startup, access, configuration and budget                    | App Service F1 preview verified; backend integration pending |
| UX                       | WS5                    | Shared design decision and review disposition                                 | Provisional local baseline |
| Core acceptance          | WS6 and service owners | Actual persisted/deployed three-role journey and adverse cases                | Blocked on integration     |

Pending means no accepted artifact is present in this contribution. It does not
assert that another contributor has done no work.

"Published, awaiting WS1 acceptance" means WS2 has produced the artifact named
below and it is reviewable in this repository. WS2 cannot mark a gate accepted
on WS1's behalf; flipping these rows to accepted is WS1's call.

### WS2 artifacts offered against these gates

| Gate                     | Artifact                                                           | Version |
| ------------------------ | ------------------------------------------------------------------ | ------- |
| Wire contract            | `docs/api/openapi.yaml` (21 operations) with `docs/api/README.md`   | 0.1.0   |
| Demo data                | `src/backend/core/store` seed — five Atlanta/Chattanooga pilot sites, deterministic on process start | 0.1.0   |
| Identity and permissions | `src/backend/README.md` role/disclosure model; `src/backend/handlers/identity` demo principals | 0.1.0   |

Known limitation carried by the identity gate: the MVP resolves a fixed demo
principal per role and performs no authentication. Roles are chosen by route,
never by caller-supplied input, so the disclosure tiers are still enforced —
but this is a demo-role switch, not sign-in, and WS3 owns replacing it.

Vocabulary translation between the WS1 charter ids (`site-owner`, `operator`,
`financier`, and the seven journey stage ids) and the backend wire vocabulary
(`site_owner`, `operator`, `investor`, five project stages) is the backend's
responsibility and lives in `src/backend/handlers/shared/vocabulary.ts` and
`journeyStageId` in `src/backend/core/views`. WS1 vocabulary is not renamed.

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

## Adoption and retirement

When WS2/WS4 publish the canonical artifact:

1. Record its location, version and accepting owners here.
2. Agree shared import, generated types, or runtime conformance checks.
3. Replace provisional wire assumptions and their fixtures before calling a
   screen integrated. Preserve useful presentation tests without treating them
   as proof of service behavior.
4. Keep wire schemas/errors in the agreed contract boundary; keep feature state
   and derived view models within the owning modules.
5. Prove one persisted record across owner submission, screening, operator
   acceptance, owner status and a permitted investor detail, including a denial
   or error path, before completing broad feature lanes.

This register deliberately declares no speculative endpoint URLs, JSON schema,
identity vendor, database migration, or fallback service. Missing services must
remain visibly unavailable rather than returning fake success.
