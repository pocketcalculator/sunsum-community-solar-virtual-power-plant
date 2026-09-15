# SunSum API contracts — WS2 handover

Two contracts live here. Together they are the artefact WS1's gate table calls
**"Wire contract — WS2 with WS4 — Pending handoff."**

| File | Audience | Kind |
|---|---|---|
| **`openapi.yaml`** | WS1 (frontend) | *Derived* — every operation is a row of design doc §10 |
| **`viability-openapi.yaml`** | WS4 (viability engine) | *Proposed* — the doc names S-VIA but never shapes it |

**If you are on WS1, you only need `openapi.yaml`.** §4.1 puts the API between
the browser and the engine; the frontend never calls S-VIA.

## `openapi.yaml` at a glance

| | |
|---|---|
| Source of truth | `docs/sunsum_technical_design_doc.md` §5.2, §5.3, §7, §8.2, §10 |
| Operations | **34**, across 31 paths — every row of §10, nothing more |
| Schemas | 68, including all 15 §5.3 enums verbatim |
| Base path | `/api` (in `servers`; §10 paths are reproduced unchanged) |

---

## Read it

```bash
npx @redocly/cli preview-docs docs/api/openapi.yaml
```

## Generate TypeScript types

```bash
npx openapi-typescript@7 docs/api/openapi.yaml -o src/types/api.d.ts
```

Verified: generates 3,141 lines and passes `tsc --noEmit --strict` cleanly.

```ts
import type { components, paths } from '@/types/api';

type Site = components['schemas']['Site'];
type Dashboard = components['schemas']['OwnerDashboardItem'];
type Decision = paths['/submissions/{siteId}/decision']['post'];
```

## Validate after any edit

```bash
npx @redocly/cli lint docs/api/openapi.yaml
npx @redocly/cli lint docs/api/viability-openapi.yaml
```

---

## Six things worth knowing before you build against it

### 1. Payloads are `snake_case`

They match the §5.2 field lists character for character, so a field name in the
spec is the same string in the database and in the design doc. If WS1 would
rather have camelCase, that is a generator flag, not a spec rewrite — say so and
we will add it. Do not hand-translate.

### 2. "Absent" is how optional references are expressed, never `null`

OpenAPI 3.0 cannot express a nullable `$ref`. Objects and enums that may have no
value are **omitted from the payload** and generate as `prop?: T`. Plain scalars
use `nullable: true` and generate as `T | null`.

```ts
dashboard.project        // Project | undefined  — absent until accepted
dashboard.site.address_raw   // string | null    — present but empty
```

Test with `== null` or optional chaining; do not branch on which one it is.

### 3. Three composed endpoints do the heavy lifting

Do not stitch these client-side — the composition is deliberate, and §7.4 makes
it a requirement.

| Endpoint | Returns |
|---|---|
| `GET /me/sites` | site + latest assessment + project + stage + outstanding + documents + acknowledgements + contact |
| `GET /pipeline` | all seven board columns + project count + aggregate capacity |
| `GET /projects/{id}/deal-room` | panels already ordered by profile and already filtered by tier |

For the deal room in particular: **a panel the caller may not see is absent from
the array, not present and empty.** Render `panels` in the order given. The
server has already applied §7.7; the client must not re-derive it.

### 4. Identifiers are named for their entity

§10 writes every path parameter as `{id}`. The spec names them `{siteId}`,
`{projectId}`, `{engagementId}`, `{requestId}` so generated clients read clearly.
**The wire path is byte-identical** — only the generated argument name changes.

One consequence worth stating: a *submission* is a *site*.  §6.2 keys the
operator queue on `sites.submission_status`, so `GET /submissions/{siteId}` and
`POST /submissions/{siteId}/decision` both take a **site** id, not a separate
submission id.

### 5. Errors carry a stable `code` — branch on that, never on `message`

`403` covers four genuinely different situations, and the UI should say different
things for each:

| `code` | Meaning |
|---|---|
| `forbidden_role` | wrong role for this endpoint |
| `forbidden_owner` | right role, but not your record |
| `forbidden_tier` | right role, but you need to express interest first (§7.7) |
| `forbidden_visibility` | the project is not investor-visible |

A hidden project returns **404**, not 403, so the API never confirms that an
invisible project exists.

### 6. Some operations return `501` on purpose

§7.8 ships parts of the model as contract-only: the schema and the wire shape are
frozen so nothing has to be renamed later, but there is no implementation and no
UI in the MVP. These return **501**:

- `POST /engagements/{id}/state` for anything past `interested`
- `POST /projects/{id}/funding-needs` (funding needs are seeded read-only)
- all three diligence endpoints

**Built in the MVP:** everything else, and `POST /projects/{id}/engagements`
is the one engagement write that works end to end.

---

## Contradictions in the design doc that had to be resolved

The doc disagrees with itself in three places. Each is one line to change if the
team prefers the other reading — **please confirm OQ-1 and OQ-2 before WS1
hard-codes against them.**

| # | The conflict | What the spec does | Confidence |
|---|---|---|---|
| **OQ-1** | §5.3 lists `in_review`; §6.2's table, the state diagram and all prose say `screening` — 9 mentions to 1 | Uses **`screening`** | High — the state machine is the behavioural spec, and §5.3 looks like the stale one |
| **OQ-2** | §7.5 and §10 both say the board spans "seven stages"; §5.3 enumerates only five `projects.stage` values | Adds a separate **`PipelineColumn`** enum with 7 values = `submitted`, `screening` + the 5 project stages. `ProjectStage` still has 5 | Medium — §6.2 says the board "unions both into one ordered view", which gives exactly 7, but the doc never lists them |
| **OQ-3** | §5.3 lists `accepted` in `submission_status`; §6.2's board table omits it | **Keeps `accepted`** | High — §7.5's accept transaction writes it |

## Deliberately left open

These are not oversights. Closing them needs a decision from someone else.

| # | Open | Who decides |
|---|---|---|
| **OQ-4** | `snake_case` vs camelCase on the wire | WS1 + WS2 |
| **OQ-5** | §8.1 *Authentication* is an empty heading. A session cookie is modelled because §10 and `users.password_hash` imply one. Real Entra wiring changes none of these paths | WS2 + WS3 |
| **OQ-6** | `flags`, `missing_information`, `inputs_used` and `preliminary_project_type` are free-form. WS1's "Screening" gate — units, range shapes, ruleset version — is still pending from WS4. Inventing a vocabulary here would be guessing. **`viability-openapi.yaml` is the concrete ask** | **WS4** |
| **OQ-7** | Investor picklist *values* (`investment_objectives`, `impact_priorities`, `decision_criteria`, `geographies`). §7.7 mandates picklists but never lists the options, and they drive portfolio filters | WS5 + WS1 |
| **OQ-8** | `documents.doc_type` and `activity.action` vocabularies. The document checklist is config-driven per §7.6 | WS2 |

---

## Two things this spec assumes that the design doc does not say

Flagging them because they are load-bearing and were inferred, not read.

**Stage transitions are adjacent-only.** §6.2's diagram is linear
(`pre_development → development → construction → commissioning → operations`)
and defines no skip or reverse edge, so `POST /projects/{id}/stage` rejects
anything else with `409` and returns the legal targets in `details.allowed`.
If the demo needs to jump straight to `operations`, that is a deliberate contract
change — tell us rather than working around it.

**Cookie sessions need CSRF protection.** The credential is a cookie, so the
browser attaches it to cross-site requests automatically, and every `POST`/`PATCH`
here is state-changing. `SameSite=Lax` does not cover every variant. State-changing
requests must carry an anti-forgery token; endpoints return `403
csrf_token_invalid` without one. A bearer token would remove the requirement
entirely — worth revisiting when WS3 settles §8.1.

---

## Out of scope for the frontend contract — but now specified

The viability engine (`sumsum-viability` / S-VIA, WS4, Python) is deliberately
**not** in `openapi.yaml`. Per §4.1 the web app never calls it — `sumsum-api`
does, server-side, during `POST /sites/{siteId}/submit`. WS1 can ignore it.

It now has its own contract: **`viability-openapi.yaml`**, the other half of the
same gate.

That file is a different kind of artefact and is labelled as such. `openapi.yaml`
is *derived* — every operation is a §10 row. The design doc names S-VIA in four
places but never gives it a request or response shape, so the viability spec is
**WS2 proposing one to WS4**. It invents no output that §5.2 does not already
persist, but WS4 owns the service and should push back where it is wrong.

Three things it pins down that are easy to get wrong:

- **Incomplete input is a result, not an error.** §7.3 returns
  `more_information_required` for unknown area, pending ownership, missing consent
  or absent usage data. Those are `200` responses carrying a verdict. There is
  deliberately **no `422`** — only a malformed body gets a `400`.
- **Geocoding happens inside S-VIA** (§9.2 — it is "an adapter inside S-VIA, not
  a service"). The caller sends `address_raw` and gets `geocode` back, because
  `sites.latitude`, `sites.longitude` and `sites.geocode_confidence` are persisted
  by the API but produced by the engine.
- **The request carries facts, not identifiers.** §9.1 requires S-VIA to stay
  "stateless and independently testable by Workstream 4", so there is no
  `site_id` — nothing can be looked up, and a WS4 unit test is a function call
  over a fixture.

`ViabilityStatus`, `SiteType` and `OwnershipStatus` are duplicated across the two
files by necessity and checked to be identical. They must not drift.

---

## How this lands in `src/backend/`

The backend scaffold on this branch lists four things as still to be agreed:
*"persistence, the identity provider, the wire contract and the error model."*
This spec closes the **wire contract** and the **error model**. Persistence and
identity are untouched and still open.

It maps onto the existing layering without changing any of it:

| Scaffold layer | What the spec gives it |
|---|---|
| `handlers/` — *"reading a request, validating the shape of its input, enforcing authorization, mapping a core result or failure onto a status code"* | One handler per `operationId` — **34** of them. The request/response schemas are the input-shape validation; the per-operation response lists are the status-code mapping; the §8.2 role notes on each operation are the authorization rule |
| `core/` — *"workflow rules, stage transitions, visibility scoping and audit decisions, as ordinary functions over plain values"* | The rules the contract depends on but deliberately does not encode: the §7.5 accept transaction, adjacent-only stage transitions, §7.7 tier and profile composition, the §7.2 missing-field computation |

The `Error` schema is the error model: a stable `code` the handler layer maps
failures onto, so `core` can return a plain result and stay transport-neutral.

Two boundaries worth preserving as this gets implemented, because the contract
already assumes them:

- **Tier and profile composition belongs in `core`, not in the client.**
  `GET /projects/{id}/deal-room` returns panels already ordered and already
  filtered. A panel the caller may not see is absent from the array.
- **`Document.download_url` is minted per read.** `blob_path` is deliberately
  absent from the schema, so a short-lived SAS is the only way a file reaches a
  client.

`operationId` is the natural handler name, and the enums are the natural shared
vocabulary — they already match `@/domain` in spirit, which the lint rules
permit the backend to import.

---

## Provenance

Every operation traces to a row of §10; every enum value is copied from §5.3.
Checked mechanically, not by eye.

**`openapi.yaml`**

- 34/34 §10 operations present
- 0 invented operations
- 34 unique `operationId`s
- 15/15 enums match §5.3 exactly, with OQ-1 as the single documented divergence
- 289 internal `$ref`s resolve; 0 unreferenced schemas
- `PortfolioItem` (tier 0) structurally cannot carry an exact address, owner
  identity or documents; `Document` never exposes `blob_path`
- every authenticated operation declares `401`
- `redocly lint` passes with 0 errors and 0 warnings
- `openapi-typescript` emits 3,141 lines that pass `tsc --noEmit --strict`

**`viability-openapi.yaml`**

- `ViabilityStatus`, `SiteType` and `OwnershipStatus` are byte-identical to
  `openapi.yaml` — no drift between the two contracts
- every output field maps to an `assessments` column in §5.2, plus `geocode`,
  which the caller writes onto `sites`
- none of the six API-owned columns (`id`, `site_id`, `created_at`,
  `is_override`, `override_reason`, `overridden_by_user_id`) appear in the
  engine's output
- `AssessRequest` carries no site, project or user id — statelessness per §9.1
- all five §7.3 charter outputs present; `ruleset_version` is required
- the four "absence is a verdict" inputs are optional, so
  `more_information_required` is reachable
- `/assess` declares no `422`, so incomplete input is classified and not rejected
- all three §7.3 verdict conditions reproduced verbatim
- `redocly lint` passes with 0 errors

> ⚠️ The design doc is still on the unmerged **PR #5** branch, not on `main`.
> Both contracts depend on it. If PR #5 changes before merge, re-run the checks
> above.
