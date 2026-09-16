# API contracts

`openapi.yaml` is the agreed backend contract. `viability-openapi.yaml` remains
the proposed internal S-VIA contract.

## Implemented operations

| Role | Operation |
| --- | --- |
| Site owner | `POST /sites`, `GET /me/sites` |
| Operator | `GET /submissions`, `POST /submissions/{id}/decision` |
| Operator | `POST /projects/{id}/stage`, `PATCH /projects/{id}/visibility` |
| Operator | `GET /projects/{id}/engagements` |
| Investor | `GET /portfolio`, `POST /projects/{id}/engagements` |
| Investor | `GET /projects/{id}/deal-room` |

Wire properties use `snake_case`. Handlers reject unknown input; core services
authorize and enforce workflow rules.

> **Demo identity only — not authentication.** Every implemented route currently
> runs under a fixed, role-specific demo principal selected by server code. No
> route reads a caller identity or role from a cookie, bearer token, header,
> query parameter, or request body. This deliberately preserves PR #10's demo
> seam and prevents caller-selectable roles, but it does not authenticate anyone.
> Real authenticated request-viewer resolution is WS3/outside this contract.
> Cookie-session CSRF protection or bearer-token protection is likewise future
> work, not an implemented MVP guarantee.

The in-memory store is shared across routes so accepted projects can become
visible in `GET /portfolio`. It is a demo persistence seam, not production
storage. The default viability client returns explicitly demo-only fixture
data; tests and future deployments inject a real client.

The eventual database must enforce the workflow uniqueness rules, not rely
only on service checks: `projects.site_id` must be unique, and a filtered/partial
unique constraint must allow at most one live engagement for each
`(investor_id, project_id, funding_need_id)` opportunity (including a null
funding need). The in-memory store serializes transactions and applies the same
checks inside their isolated working copies.

Investor visibility is operator-controlled and defaults to false. Neither tier
0 nor tier 1 contains exact address, coordinates, or owner identity. Tier 1
requires a live engagement, uses coarse locality (or `Location withheld`), and
returns only documents explicitly classified `investor_tier_1`; owner-private
documents, raw blob paths, raw assessment inputs, and override notes remain
omitted. Its timeline contains shared
project stage/status events plus the current investor's own interest event,
without other investors' activity or internal free-text notes.

In this scoped implementation, `request_info` transitions a submission to
`info_requested` and records the owner's outstanding item. Owner resubmission
and the rest of that loop are not implemented.

For the demo's live submit-to-portfolio storyline, accepting a submission
creates one amountless open feasibility-study need. Until structured locality
and region inputs are implemented, accepted projects use safe generic location
text and an unknown region does not exclude them from a geography-focused
mandate.
