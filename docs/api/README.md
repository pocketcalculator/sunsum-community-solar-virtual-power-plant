# API contracts

`openapi.yaml` is the backend contract WS2 has published for adoption, version
0.1.0. It is not yet an accepted artifact: `docs/ws1/contracts.md` records it
against the wire-contract gate as *published, awaiting WS1 acceptance*, and WS2
cannot mark that gate accepted on WS1's behalf. `viability-openapi.yaml` remains
the proposed internal S-VIA contract.

## Implemented operations

| Role | Operation |
| --- | --- |
| Site owner | `POST /sites`, `PATCH /sites/{id}`, `POST /sites/{id}/submit`, `GET /me/sites`, `GET /me/outstanding` |
| Site owner / Operator | `POST /sites/{id}/documents`, `PUT` / `GET /sites/{id}/documents/{documentId}/content` |
| Operator | `GET /submissions`, `GET /submissions/{id}`, `POST /submissions/{id}/decision` |
| Operator | `GET /pipeline`, `PATCH /projects/{id}`, `POST /projects/{id}/stage`, `PATCH /projects/{id}/visibility` |
| Operator | `GET /projects/{id}/engagements` |
| Operator | `GET /profiles` |
| Investor | `GET /investors/me/profile`, `POST /investors/me/profile`, `GET /portfolio` |
| Investor | `POST /projects/{id}/engagements`, `GET /me/engagements`, `GET /projects/{id}/funding-needs`, `GET /projects/{id}/deal-room` |
| Anonymous | `POST /auth/demo-switch`, `POST /auth/logout`, `POST /profiles` |
| Any signed-in role | `GET /me` |

## Section 10 paths not in the MVP slice

`/sites/{id}/acknowledgements`, `/sites/{id}/assessments/override`, `/engagements/{id}/state`, `/engagements/{id}`, `/projects/{id}/funding-needs` `POST`, `/engagements/{id}/diligence-requests`, `/diligence-requests/{id}/assign`, `/diligence-requests/{id}/resolve`, and `/projects/{id}/activity` are not in the MVP slice.

Wire properties use `snake_case`. Role ids crossing between the UI charter
vocabulary and backend wire vocabulary go through the `@/backend` adapter.
Handlers reject unknown input; core services authorize and enforce workflow
rules.

> **Sessions, but demo sign-in.** Every implemented route except
> `POST /auth/demo-switch`, `POST /auth/logout` and `POST /profiles` resolves
> its caller
> from a signed `sunsum_session` cookie and answers `401 unauthenticated` when
> there is none. The first two start and end a session, so requiring one would
> be circular. `POST /profiles` is the `/join` sign-up form, which by
> definition is used by someone who has no account, so it authenticates nobody
> and instead checks `Sec-Fetch-Site`/`Origin` directly. What it writes is a
> `participant_profiles` row — a pre-account record that grants no access, is
> never read by the authorization path, and carries no credential. `GET
> /profiles` on the same path is operator-only: the write is open, so the read
> is where the role check lives. The role is
> read from the user row on each request, not from
> the token, so a caller cannot select their own role and a role changed in the
> database takes effect immediately.
>
> What is *not* authentication is how a session starts. `POST /auth/demo-switch`
> hands out one of three **seeded** identities so the three roles can be shown
> without an identity provider; it verifies no credential, so anyone who can
> reach it can become any of the three demo users. It is therefore opt-in per
> deployment (`SUNSUM_DEMO_AUTH=enabled`) and is the one endpoint a real
> identity provider replaces. Cookies are `HttpOnly`, `SameSite=Lax`, and
> `Secure` in production. `SameSite=Lax` is only a partial CSRF mitigation:
> it is scoped to the *site*, not the origin, so a sibling origin under the
> same registrable domain still has the cookie attached to a forged write, and
> it does not stop a cross-site POST from *starting* a session in the first
> place. Cookie-authenticated writes are therefore also checked against
> `Sec-Fetch-Site`, falling back to `Origin`; a cross-site write is refused
> with `403` and `code: forbidden_origin`.

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

Document registration and document content are separate operations:
`POST /sites/{id}/documents` records metadata, and
`PUT`/`GET /sites/{id}/documents/{documentId}/content` moves the bytes. The blob
location comes from the stored record rather than the request, the upload's
`Content-Type` is ignored in favour of the type validated at registration, and
the uploaded length must match the registered `size_bytes`. A registered
document with nothing uploaded reads as `404`, which is a normal state. Content
access is limited to the site owner and operators — investor content delivery is
the §7.6 short-lived-SAS design and is not implemented, so tier 1 exposes
document *metadata* only.

`request_info` transitions a submission to `info_requested`, records the owner's outstanding item, and the owner can resubmit through `POST /sites/{id}/submit`.

Owner dashboard items keep `submission_status`, `project_stage`, and
`journey_stage_id` separate. `journey_stage_id` uses the exact seven literals in
`src/domain/journey.ts` and is `null` for off-ribbon submission states.

For the demo's live submit-to-portfolio storyline, accepting a submission
creates one amountless open feasibility-study need. Until structured locality
and region inputs are implemented, accepted projects use safe generic location
text and an unknown region does not exclude them from a geography-focused
mandate.
