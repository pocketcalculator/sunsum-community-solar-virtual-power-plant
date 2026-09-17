# Backend layer

The server-side boundary for the origination workflow, owned by WS2. The
service catalogue and API surface it is expected to grow into are described in
sections 9 and 10 of
[the technical design](../../docs/sunsum_technical_design_doc.md).

**`GET /portfolio` is the worked example.** The agreed owner, operator and
investor workflow endpoints now follow the same handler/core split. Persistence
and identity are still demo seams: one shared in-memory state makes mutations
visible across endpoints, and each route uses a fixed role-specific identity.

> [!WARNING]
> **Do not expose these privileged demo routes as a production API.** They do
> not authenticate requests: each route always resolves to a fixed demo owner,
> operator, or investor. The core authorization checks and role-specific route
> wiring must remain in place, but production exposure additionally requires
> authenticated request-to-viewer resolution plus CSRF protection for
> cookie-based sessions or appropriate bearer-token protection.

## Layout

Two layers, and inside each one directory per service from
[section 9.2](../../docs/sunsum_technical_design_doc.md). The design document
already assigns every endpoint in section 10 to a service, so deciding where
code goes is a lookup rather than a judgement call.

```text
src/backend/
  index.ts              the only entry point a route may use
  core/
    shared/             primitives with no domain meaning: Result, ok, failure
    identity/           S-IAM   who the caller is
    projects/           S-PROJ  project records, transitions and visibility
    sites/              S-SITE  intake, assessments and submission queue
    engagements/        S-ENG   interest and disclosure tier
    views/              S-VIEW  owner dashboard and deal room
    store/              shared in-memory persistence seam
    investors/          S-INV   portfolio, mandate matching, visibility rule
  handlers/
    shared/             JSON, the error envelope, failure-code to status
    identity/           S-IAM   resolving the caller at the transport edge
    investors/          S-INV   query parsing and status mapping
    sites/              S-SITE  site body and submission query parsing
    projects/           S-PROJ  decision, stage and visibility bodies
    engagements/        S-ENG   interest and operator engagement reads
    views/              S-VIEW  composed reads
  db/                   the schema. Imports core; core never imports it
```

Each directory's `index.ts` is its public face. A sibling imports
`../projects`, never `../projects/types` — enforced, see
[Enforced boundaries](#enforced-boundaries). That is the rule that decides
whether roughly thirty-five endpoints stay a set of services or become a mesh.

`shared/` is for what genuinely has no domain meaning, and the traffic is
one-way: it must not import a service. Something that needs one is not shared,
it is misplaced.

### Where a new endpoint goes

| Service     | Directory      | Endpoints                                                                    | Status  |
| ----------- | -------------- | ---------------------------------------------------------------------------- | ------- |
| **S-IAM**   | `identity/`    | `/auth/*`, `/me`                                                             | seam    |
| **S-SITE**  | `sites/`       | `/sites/*`, `/me/sites`, `/submissions/*`, `/me/outstanding`                 | done    |
| **S-ASSESS**| `assessments/` | `/sites/{id}/assessments/override`                                           | to do   |
| **S-PROJ**  | `projects/`    | `/pipeline`, `/projects/{id}`, `/projects/{id}/stage`, `.../visibility`      | done    |
| **S-INV**   | `investors/`   | `/portfolio`, `/investors/me/profile`                                        | done    |
| **S-ENG**   | `engagements/` | `/projects/{id}/engagements`, `/me/engagements`, funding needs; engagement state and diligence later | partial |
| **S-DOC**   | `documents/`   | `/sites/{id}/documents`, `/sites/{id}/acknowledgements`                      | partial |
| **S-ACT**   | `activity/`    | `/projects/{id}/activity`                                                    | partial |
| **S-VIEW**  | `views/`       | Composed reads: the site-owner dashboard, `/projects/{id}/deal-room`         | partial |

S-VIA, the viability engine, is deliberately absent: the charter puts it in a
separate Python deployable, so it will be reached as a client from
`assessments/`, not added as a directory here.

Create a service directory the first time it has something in it, in both
layers, each with an `index.ts`. An empty directory is not worth the import.

## Responsibilities

| Directory   | Owns                                                                                                                                    | Must not                                                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `handlers/` | The transport edge: selecting the fixed demo principal, validating the request into typed values, and turning a `Result` into a status code | Decide permission, accept caller-selectable roles, or hold workflow rules, stage transitions or solar math |
| `core/`     | Authorization, workflow rules, visibility scoping and the response payload, written as ordinary functions over plain values              | Import `handlers/`, or reach for `next/server`, `next/headers` or `next/cache` |

Core **authorizes**. In this MVP, handlers do **not authenticate**; each route
selects its fixed role-specific demo principal and never accepts a
caller-supplied role. Replacing that seam with authenticated request-to-viewer
resolution is future WS3 work. Core still decides what the resolved identity
may see, because a permission that lived only in the handler would be skipped
the moment a scheduled job, seeding CLI or second route called the same
function. This is what "enforce authorization at service boundaries, not only
in the user interface" means here.

`index.ts` is the public entry point. Routes import `@/backend` and nothing
deeper, which keeps handler and core module paths free to move.

## Adding an endpoint

Follow `GET /portfolio`. Pick the service directory from
[the table above](#where-a-new-endpoint-goes) first; everything else assumes it.

1. **Core** — add a module under `core/<service>/` exporting the payload types
   and one function taking `(viewer, validatedQuery, store)` and returning
   `Result<Payload>`. Authorize first, before reading anything. Project
   internal records into the payload with an explicit field list, never a
   spread, so a new column cannot publish itself. Export it from the
   directory's `index.ts`.
2. **Handler** — add a module under `handlers/<service>/` that validates the
   request into typed values, calls core, and maps the result with
   `jsonResponse` or `failureResponse`. Reject unknown input rather than
   ignoring it: a silently dropped filter shows the caller more than they asked
   for. Export it from the directory's `index.ts`.
3. **Route** — add `app/api/<path>/route.ts` as a one-line re-export of the
   wired handler from `@/backend`.
4. **Tests** — cover the authorization paths, the visibility rule, the failure
   statuses, and that the payload does not carry anything the caller's tier
   forbids.

Reading another service's data is a normal import of its barrel — as
`core/investors` imports `../projects`. Keep it to the barrel and those
dependencies stay countable when persistence arrives.

Failure codes are declared once in `core/shared/result.ts` and mapped to
statuses once in `handlers/shared/http.ts`, where the mapping is a total
`Record`, so a new code cannot be added without choosing its status.

### Conventions

- Payload properties are `snake_case`, matching the wire contract. Everything
  internal is `camelCase`. The projection function is the only place they meet.
- UI charter role ids and backend wire roles intentionally differ; translate
  them only with the boundary adapter exported from `@/backend`.
- Do not overload lifecycle fields. Composed owner views expose
  `submission_status`, `project_stage`, and `journey_stage_id` separately.
- Physical quantities carry their unit in the name: `_kw` for capacity,
  `_kwh` for annual generation. `null` means "not yet estimated", never zero.
- Core returns `Result` rather than throwing for outcomes a caller is expected
  to handle, and never returns a status code.

## Enforced boundaries

These are lint rules in the root `eslint.config.mjs`, asserted against the real
configuration by `tests/unit/architecture.test.ts`. They are static import and
re-export rules, not a security sandbox, and they say nothing about dynamic or
transitive imports.

| Import                                              | Result                            |
| --------------------------------------------------- | --------------------------------- |
| Route -> `@/backend`                                | Allowed public entry point        |
| Route -> `@/backend/core` or `@/backend/handlers/x` | Rejected private deep import      |
| `handlers/` -> `@/backend/core`                     | Allowed downward dependency       |
| `core/investors` -> `../projects`                   | Allowed service public face       |
| `core/investors` -> `../projects/types`             | Rejected service internals        |
| `handlers/investors` -> `../../core/investors`      | Allowed service public face       |
| `handlers/investors` -> `../../core/investors/x`    | Rejected service internals        |
| `core/shared` -> `../investors`                     | Rejected shared must stay domain-free |
| `core/` -> `../handlers` or `@/backend/handlers`    | Rejected upward dependency        |
| `core/` or `handlers/` -> `@/backend/db`            | Rejected persistence must not invert |
| `db/` -> `@/backend/core/projects`                  | Allowed schema uses domain vocabulary |
| `core/` -> `next/server`, `next/headers`            | Rejected transport dependency     |
| Backend -> `@/domain/roles`                         | Allowed shared vocabulary         |
| Backend -> `@/features/...` or `@/components/...`   | Rejected upward dependency        |
| Shared UI, domain or a feature -> `@/backend`       | Rejected server dependency        |

The last row matters most: it keeps server-side code out of the browser bundle,
and it is the reason the backend is reached through a route rather than
imported by a component.

Unlike presentation code, the backend may use Node built-ins. That is the point
of the separate boundary.

## Selected persistence and remaining integration

[The technical design](../../docs/sunsum_technical_design_doc.md) selects
**Azure Database for PostgreSQL Flexible Server with Drizzle ORM** for
persistence and private Blob Storage for document files. Drizzle Kit is the
selected schema/migration tooling. The database schema has since landed (see
below) and the storage account is provisioned, but neither is wired to the
running endpoints: the API is still served entirely from the in-memory store.
The proposed Entra integration and the broader WS2 deployment topology also
remain separate from this scaffold.

Three seams allow those integrations without changing the workflow rules:

- **Persistence.** `core/store/index.ts` provides the shared in-memory demo
  implementation behind `BackendStore`; `createMemoryBackendStore` gives tests
  isolated state and `resetDemoBackendStore` resets route-level state. Its
  serialized transactions discard the working copy when the callback throws or
  returns a failed `Result`, preventing partial mutations on domain failures.

  A schema now exists in [`db/`](./db/README.md) and
  [ADR 0001](../../infrastructure/docs/adr-0001-database-and-persistence.md)
  records the decision, but **nothing is wired up yet**: the running endpoints
  are still served by the in-memory store. Adopting it means adding a
  Drizzle-backed implementation behind `BackendStore`, not moving persistence
  into the handlers.
- **Identity.** `handlers/identity/viewer.ts` exposes fixed demo owner, operator
  and investor resolvers. **They have no security value.** They read nothing
  from the request, so a caller cannot choose a role. Before production, replace
  them with authenticated request-to-viewer resolution and add CSRF protection
  for cookie sessions or suitable bearer-token protection.
- **Document storage.** `core/documents/storage.ts` decides where a document
  lives; `blob/index.ts` is the only module that talks to Azure, selected by
  `SUNSUM_BLOB` exactly as `SUNSUM_STORE` selects persistence. See
  [Document blob storage](#document-blob-storage).

Neither the persistence nor the identity seam is production ready. The App
Service smoke test exercises the in-memory-backed API, not a real database,
data set, or identity provider.

## Document blob storage

Document *metadata* is a row; the file itself is a blob. The split follows the
same shape as the persistence seam, so the demo runs with no Azure account and
no credentials.

| Layer | Module | Knows about Azure |
| --- | --- | --- |
| Where a blob lives | `core/documents/storage.ts` | no |
| Moving bytes | `blob/index.ts` | yes, lazily |

Keeping the layout in `core` means it is unit-testable without mocking an SDK,
and that both implementations of the client necessarily agree on the path.

### Blob path layout

```text
{container}/owners/{ownerId}/{sites|projects}/{parentId}/{docType}/{documentId}/{filename}
```

The owner id leads the blob name so every document belonging to one site owner
sits under a single prefix, across all of their sites and projects. That is what
makes "everything this owner has" a prefix listing rather than a scan, and it is
the unit a future per-owner SAS or lifecycle rule would be scoped to.

The parent scope is the **site** id for anything uploaded during intake, and the
project id only for documents created against a project. A project is created
*from* a site at acceptance, so the site id is the one identifier that exists for
the whole life of the record — documents arrive during intake, before any project
does, and `blob_path` is immutable once written. Anchoring intake documents on a
project id would either strand them under a prefix the project never uses or
force copying every blob at acceptance.

The document id is its own segment rather than a filename prefix, so two
uploads of the same filename cannot collide and a blob can be located from its
record without re-deriving a timestamp.

`documents.blob_path` stores this **fully qualified**, including the container.
Deriving the container from `disclosure_class` at read time would instead make
the record wrong the moment a document is re-disclosed and copied.

### One container per disclosure class

`owner-private` and `investor-tier-1`, mapped by `DOCUMENT_CONTAINERS`.

`core` already enforces disclosure on every read, so this is not the access
check — it is a coarser boundary underneath it. A credential scoped to
`investor-tier-1` cannot name a blob in `owner-private` at all, so an
authorization bug in the application cannot by itself expose an owner's
electricity bill. This is only safe because a document's class is fixed at
upload: `addSiteDocument` is the only writer and there is no re-classification
path.

The disclosure split stays at the *container* level rather than becoming another
folder under the owner prefix. Azure containers cannot nest — a "folder" is only
a prefix in the blob name — so demoting it would turn a boundary a credential
cannot cross into a naming convention, and the owner grouping above is delivered
inside each container instead.

### Untrusted input in a path

`original_filename` and `doc_type` are caller-supplied and both become path
segments. `safeFilename` drops any directory part before sanitising — only the
leaf is meaningful, and keeping the rest would let the caller choose the
prefix — and `safeSegment` removes `..` and separators rather than escaping
them. `tests/unit/backend/document-storage.test.ts` asserts a crafted
`../../../etc/passwd` cannot escape its prefix.

### Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `SUNSUM_BLOB` | `memory` | `memory` keeps blobs in-process; `azurite` uses the local emulator; `azure` uses the account below. |
| `AZURE_STORAGE_CONNECTION_STRING` | the published Azurite credential | Only read when `SUNSUM_BLOB=azurite`. |
| `AZURE_STORAGE_ACCOUNT_NAME` | — | Required when `SUNSUM_BLOB=azure`. |

An unrecognised `SUNSUM_BLOB` throws rather than falling back to `memory`. A
typo would otherwise look exactly like a working deployment whose uploads vanish
on restart, which is the failure this seam exists to make impossible.

In `azure` mode there is no connection string and no account key, because the
account has shared-key access disabled: the credential is `az login` locally and
the app's managed identity when deployed.

The account, its containers and the access it still needs are described in
[`infrastructure/docs/blob-storage.md`](../../infrastructure/docs/blob-storage.md).
**The deployed account is not reachable yet** — see the blockers recorded there.
That is why `azurite` exists: it is what makes the Azure SDK path runnable and
verifiable today.

### Running the emulator locally

Two ways, same emulator pinned to the same version:

```bash
npm run blob:up                      # the npm dev dependency, no Docker; state in ./.azurite
docker compose up -d --wait azurite  # the same pinned image, if the database is already up that way
```

Then point the app at it:

```bash
SUNSUM_BLOB=azurite npm run dev
```

The first start takes up to a minute to begin listening while Azurite
initialises its metadata store; a port check straight after the command will be
refused until it finishes. Never delete the state directory or volume while
Azurite is running — that corrupts the LokiJS store underneath and produces
failures that look like code defects. Stop it first.

In `azurite` mode the client creates the two containers on first use. That
bootstrap is emulator-only on purpose: in Azure the containers are Bicep's to
create, and an application that can create containers is an application holding
more rights than it needs.

`tests/integration/blob-azurite.test.ts` exercises the real Blob REST API
against it — upload, download, overwrite, missing-blob and the container split.
It probes the port first and skips cleanly when the emulator is not running, so
a clean checkout with no Docker still passes.

### Transferring the bytes

`PUT` and `GET /sites/{id}/documents/{documentId}/content` are the only callers
of `documentBlobClient()`. They are deliberately separate from registration:
`POST /sites/{id}/documents` is contracted to carry document *metadata* only,
and that contract is frozen, so content was added alongside it rather than
folded into it.

- The blob location comes from the stored `blob_path`, never from the request,
  so an uploader cannot choose where its bytes land or overwrite another
  document's blob.
- The request's `Content-Type` is **ignored**. The record already carries a type
  validated against the allow-list at registration; honouring the upload's own
  header would let a caller register `application/pdf` and then serve back
  something the browser will execute.
- The uploaded length must equal the registered `size_bytes`. Storing different
  bytes would leave the record describing something that is not there, and every
  consumer reads the record.
- Reads set `Content-Disposition: attachment` with an RFC 5987 encoded filename
  and `X-Content-Type-Options: nosniff`, so a document is never rendered in the
  origin.
- A registered document with nothing uploaded returns `not_found` rather than an
  error. It is a normal state — registration and upload are two steps — and it
  is what an owner's outstanding-items list is reading.

Investor access to document *content* is not wired: `core` admits only the site
owner and operators. Investors see tier-1 document *metadata* through the deal
room, which is the §7.6 short-lived-SAS design and needs data-plane access the
subscription has not granted.

`tests/unit/backend/document-content.test.ts` covers the round trip, the size
and empty-body rejections, cross-owner and cross-site refusal, the ignored
request content type and the response headers.

### Reconciling with the database schema

The schema landed on `main` in #19 and this branch has merged it. The two lines
of work merged textually clean — including the funding-stage vocabulary, which
was declared in both trees and so was exported twice without git noticing —
so every mismatch below would have merged green and failed at runtime rather
than being caught by the merge. #19 resolved its side; the rest were resolved
here:

| Concern | Resolution |
| --- | --- |
| Screening status token | #19 uses `screening`, matching this code and `src/domain/journey.ts`. |
| Draft sites with null address/type/ownership | #19 made those columns nullable while `submission_status = 'draft'`, so saving an incomplete draft works as written. |
| `amount_requested` | #19 relaxed to `IS NULL OR > 0`. An amountless feasibility need inserts cleanly. |
| `amount_committed` | Fixed here: was written as `null` against a `NOT NULL DEFAULT '0'` column, and a column default does not apply to an explicitly inserted null. Now `0`, typed `number` rather than `number \| null` — nothing committed is zero, not unknown. |
| Funding-need stage | Fixed here: typed `FundingStage` and written through `fundingStageForProject`, so `commissioning`/`operations` can no longer reach a column whose CHECK rejects them. |
| `activity_single_parent_check` | Fixed here: activity rows carry exactly one parent, enforced by a discriminated `ActivityParent` rather than two independently nullable ids. Submission events are parented to the site, project events to the project, and both `listActivity` and `listSiteActivity` join across the boundary so no view lost history. |
| Documents with two parents | Fixed here, in the seed and in `addSiteDocument`. A site upload is parented to the site; the demo project document to the project. `listDocuments` already matched either side. |
| `documents.disclosure_class` | #19 added the column, `NOT NULL DEFAULT 'owner_private'` — it fails closed, and it is what the deal-room filter reads. |

The investor mandate is typed `FundingStage[]` and matched against open funding
needs rather than `project.stage`. Reinstating `ProjectStage[]` would silently
restore a filter that never matches, because `permanent` is not a project stage
and `commissioning`/`operations` are not funded stages.

This branch's `core/projects/funding.ts` mirror has been deleted: the
vocabulary now comes from `core/projects/types.ts`, which is what `db/enums.ts`
re-exports, so there is one declaration rather than two that merge silently.
`tests/unit/backend/workflows.test.ts` asserts the single-parent and
funding-need invariants against those shared constants, so a future write that
the CHECK constraints would reject fails in unit tests instead of at insert
time.
