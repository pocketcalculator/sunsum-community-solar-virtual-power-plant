# API contracts

Workstream 2 (backend) -> workstream 1 (frontend) and workstream 4 (viability).

| File | What it is | Status |
| --- | --- | --- |
| `openapi.yaml` | **The MVP contract. Build against this.** Eight operations, the set agreed on the whiteboard of 15 Sep. | Derived from the design doc |
| `viability-openapi.yaml` | Internal S-VIA contract - `POST /assess`. Server-to-server only. | **Proposal** to WS4 |

Both are valid OpenAPI 3.0.3 and pass `redocly lint` with zero errors.

## The eight operations

| Role | Operation | Does |
| --- | --- | --- |
| Site owner | `POST /sites` | Create a draft site |
| Site owner | `GET /sites` | List my sites and their status |
| Site owner | `POST /submissions` | Submit a draft; triggers the viability assessment |
| Operator | `GET /submissions` | Review queue |
| Operator | `POST /projects` | Accept a submission and open the project |
| Operator | `GET /projects` | Pipeline board |
| Operator | `PATCH /projects/{projectId}` | Update a project |
| Investor | `GET /portfolio` | Browse investable projects |

The flow is linear: a site is created, submitted, assessed, accepted into a project, then surfaced to
investors.

```text
POST /sites -> POST /submissions -> [S-VIA POST /assess] -> GET /submissions
            -> POST /projects -> PATCH /projects/{id} -> GET /portfolio
```

## Where an identifier goes

One rule, applied consistently. Please follow it when adding endpoints.

- **Path** identifies a resource you are acting on: `PATCH /projects/{projectId}`.
- **Body** carries the data of a resource being created. `POST /submissions` and `POST /projects`
  take `site_id` in the body, because the submission and the project are what is being created - the
  site is an attribute of them, not the thing being addressed.
- **Query** filters a collection: `GET /portfolio?stage=...`.

The whiteboard's `PATCH /projects` is written here as `PATCH /projects/{projectId}`. A collection
cannot be coherently patched, and the path form gives per-resource authorisation, logging and a clean
`404` versus `422` split.

## Absent versus null

OpenAPI 3.0 cannot express a nullable `$ref` - `allOf: [$ref]` plus `nullable: true` is invalid and
most generators silently drop it. So:

- An **object or enum** that may be empty is **optional and omitted** -> `prop?: T`
- A **scalar** that may be empty is `nullable: true` -> `T | null`

Test `== null`. Do not depend on the difference.

## Two things the schema guarantees, not the implementation

- `PortfolioItem` has **no field** that could carry `address_raw`, `latitude`, `longitude`,
  `owner_user_id` or documents. Tier-0 investors cannot be leaked an exact location even by accident.
  This is why `GET /projects` is operator-only and investors use `GET /portfolio`.
- `Document` **omits `blob_path`**. A short-lived `download_url` is the only route to a file.

## Not in this MVP

Real gaps, listed so nobody assumes they were forgotten:

1. **Rejecting a submission.** `POST /projects` is the accept path only. Reject and
   request-more-information are specified in section 10 of the design doc as
   `POST /submissions/{id}/decision`.
2. **Login.** No `/auth/*` or `/me`. Identity is workstream 3's. A role-aware UI will very likely
   need `/me` on day one - it is a small addition, just ask.
3. **Detail views.** No `GET /sites/{siteId}` or `GET /projects/{projectId}`. The list endpoints
   return full records, so add these only if a deep link needs one.
4. **Documents, engagements, the deal room, diligence.** All specified in section 10 of the design
   doc, none in scope here.

## Open questions

| # | Question | Current assumption |
| --- | --- | --- |
| OQ-1 | Section 5.3 says `in_review`; section 6.2 and all prose say `screening` | `screening` (9 mentions to 1) - **confirm before hard-coding** |
| OQ-2 | Sections 7.5/10 say seven pipeline stages; 5.3 lists five | `PipelineColumn` has 7, `ProjectStage` keeps 5 |
| OQ-4 | snake_case or camelCase on the wire | snake_case, matching the design doc's column names |
| OQ-6 | Assessment vocabularies (`flags`, `missing_information`) | open strings - **WS4 to pin down** |

Error codes (400/401/403/404/409/422) are a proposal; the design doc does not specify them.

Two assumptions are inferred rather than read, and are flagged in the specs: stage transitions are
adjacent-only (hence `409` with `details.allowed`), and cookie sessions need CSRF protection.

## Using it

```bash
npx openapi-typescript docs/api/openapi.yaml -o src/types/api.d.ts
```

Generates 986 lines that pass `tsc --strict`, with one entry per `operationId`
(`createSite`, `listMySites`, `createSubmission`, `listSubmissions`, `createProject`,
`listProjects`, `updateProject`, `getPortfolio`).

For the backend scaffold: one handler per `operationId`, and the `Error` schema's stable `code` is the
error model that lets `core` stay transport-neutral.

## Provenance

`openapi.yaml` is **derived** - every operation traces to a row of section 10 of
`docs/sunsum_technical_design_doc.md`, and every enum value is verbatim from section 5.3. Nothing
was invented. Where the design doc and this file disagree, the design doc wins and this is the bug.

`viability-openapi.yaml` is **proposed**: the design doc names S-VIA and specifies its behaviour in
sections 7.3 and 9, but never gives it a wire shape. Section 7.3's negative verdicts are `200`
responses carrying a verdict, so there is deliberately no `422` - incomplete input is a result, not an
error.

Checked mechanically rather than by eye: operation coverage against section 10, enum values against
section 5.3, reference resolution, dead-schema detection, the tier-0 guarantee, and codegen through
`tsc --strict`.
