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
- Ordinary local production build/start; Azure service selection stays with WS3.

The revised September 14, 2026 charter remains the MVP scope authority.
[pocketcalculator/sunsum-community-solar-virtual-power-plant#3](https://github.com/pocketcalculator/sunsum-community-solar-virtual-power-plant/issues/3),
updated September 14, 2026, proposes Aspire, Azure SQL, private Blob, Entra,
Container Apps and optional Fabric alongside Next.js. Those proposals do not
establish service availability, a schema, team approval, or a dependency for
this increment.

## External acceptance gates

| Gate                     | Owner                  | Required evidence                                                             | Status                     |
| ------------------------ | ---------------------- | ----------------------------------------------------------------------------- | -------------------------- |
| Wire contract            | WS2 with WS4           | Versioned machine-readable inputs/outputs/errors and ownership                | Pending handoff            |
| Screening                | WS4                    | Units, range shapes, rules/assumptions/version, and three outcome examples    | Pending handoff            |
| Demo data                | WS2/WS4                | Approved synthetic Atlanta examples and repeatable seed mechanism             | Pending handoff            |
| Identity and permissions | WS2/WS3                | Actor/session semantics, object ownership, investor scope and document access | Pending handoff            |
| Azure delivery           | WS3                    | Selected service/artifact/startup, access, configuration and budget           | Pending handoff            |
| UX                       | WS5                    | Shared design decision and review disposition                                 | Provisional local baseline |
| Core acceptance          | WS6 and service owners | Actual persisted/deployed three-role journey and adverse cases                | Blocked on integration     |

Pending means no accepted artifact is present in this contribution. It does not
assert that another contributor has done no work.

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
