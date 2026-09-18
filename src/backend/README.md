# Backend layer

The server-side boundary for the origination workflow, owned by WS2. The
service catalogue and API surface it is expected to grow into are described in
sections 9 and 10 of
[the technical design](../../docs/sunsum_technical_design_doc.md).

**`GET /portfolio` is the worked example.** The agreed owner, operator and
investor workflow endpoints now follow the same handler/core split. It runs
against either an in-memory fixture or a real PostgreSQL database, chosen by
one environment variable, so that later endpoints have a pattern to copy; see
[Adding an endpoint](#adding-an-endpoint). Identity is resolved per request
from a signed `sunsum_session` cookie; only how a session *starts* is still a
demo seam.

> [!WARNING]
> **Requests are authenticated; sign-in is not.** Every implemented route
> except `POST /auth/demo-switch` and `POST /auth/logout` resolves its caller
> from a signed, `HttpOnly` `sunsum_session` cookie and answers
> `401 unauthenticated` without one. Writes are additionally checked against
> `Sec-Fetch-Site`, falling back to `Origin`, and a cross-site write is refused
> `403 forbidden_origin`.
>
> What is not production-ready is the sign-in endpoint. `POST /auth/demo-switch`
> hands out one of three **seeded** identities and verifies no credential, so
> anyone who can reach it can become any demo user. It is opt-in per deployment
> (`SUNSUM_DEMO_AUTH=enabled`) and is the one endpoint a real identity provider
> replaces. Until it does, do not expose this API to untrusted callers.

## Layout

Two layers, and inside each one directory per service from
[section 9.2](../../docs/sunsum_technical_design_doc.md). The design document
already assigns every endpoint in section 10 to a service, so deciding where
code goes is a lookup rather than a judgement call.

```text
src/backend/
  index.ts              the only entry point a route may use
  composition.ts        the composition root — picks the store from the environment
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
  db/                   schema, migrations, driver, store. Imports core; core never imports it
  infrastructure/
    database/           server-only PostgreSQL/Drizzle connection and tooling seam
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
| `handlers/` | The transport edge: authenticating the caller from the session cookie, refusing cross-site writes, validating the request into typed values, and turning a `Result` into a status code | Decide permission, accept caller-selectable roles, or hold workflow rules, stage transitions or solar math |
| `core/`     | Authorization, workflow rules, visibility scoping and the response payload, written as ordinary functions over plain values              | Import `handlers/`, or reach for `next/server`, `next/headers` or `next/cache` |

Handlers **authenticate**; core **authorizes**. A handler resolves the viewer
from the signed session cookie and never accepts a caller-supplied role — the
role is read from the user row on each request, so a stale cookie cannot claim
a role its owner was never granted. Core then decides what that resolved
identity may see, because a permission that lived only in the handler would be
skipped the moment a scheduled job, seeding CLI or second route called the same
function. This is what "enforce authorization at service boundaries, not only
in the user interface" means here.

The remaining demo seam is how a session *starts*, not whether one is required:
`POST /auth/demo-switch` issues a cookie for a seeded identity without checking
a credential. Replacing it with a real identity provider is the future work.

`index.ts` is the public entry point. Routes import `@/backend` and nothing
deeper, which keeps handler and core module paths free to move.

## The composition root

Neither `core/` nor `handlers/` may import `db/`. Something has to, or the
database would never be reached — so one module does, and only one:
`composition.ts`, imported by `index.ts`.

```text
composition.ts  installSelectedStore()  reads SUNSUM_STORE, points core's seam at a BackendStore
index.ts        re-exports the routes, having imported composition.ts first
```

Handlers export a **factory**, not a wired route:

```ts
export function createPortfolioRoute(store: BackendStore = demoBackendStore) { … }
```

The factory takes the store as an argument, so a test supplies a fixture
without touching the environment. The default is `core`'s store seam rather
than a concrete store, so a handler never learns which implementation it got —
`installSelectedStore()` decides that once, at module load, and every handler
follows.

| `SUNSUM_STORE` | Store                     | Needs a database |
| -------------- | ------------------------- | ---------------- |
| unset, `mock`  | `core/store/index.ts`     | no               |
| `db`           | `db/backend-store.ts`     | yes              |

Both return the same payloads, and
`tests/integration/store-parity.test.ts` asserts it against a live database.
See [`db/README.md`](./db/README.md) for how to run one.

This is the only exception to the persistence rule, and it is deliberate: the
choice of implementation is made once, at the top, where it is visible — not
by an import buried in a rule.

## Adding an endpoint

Follow `GET /portfolio`. Pick the service directory from
[the table above](#where-a-new-endpoint-goes) first; everything else assumes it.

1. **Core** — add a module under `core/<service>/` exporting the payload types
   and one function taking `(viewer, validatedQuery, store)` and returning
   `Result<Payload>`. Authorize first, before reading anything. Project
   internal records into the payload with an explicit field list, never a
   spread, so a new column cannot publish itself. Export it from the
   directory's `index.ts`.
2. **Handler** — add a module under `handlers/<service>/` exporting a
   `create<Name>Route(store?)` factory that validates the request into typed
   values, calls core, and maps the result with `jsonResponse` or
   `failureResponse`. Reject unknown input rather than ignoring it: a silently
   dropped filter shows the caller more than they asked for. Export it from the
   directory's `index.ts`.
3. **Wire it** — in `src/backend/index.ts`, call the factory with no argument.
   It picks up `core`'s store seam, which `composition.ts` has already pointed
   at the selected implementation.
4. **Route** — add `app/api/<path>/route.ts` as a one-line re-export of the
   wired handler from `@/backend`.
5. **Tests** — cover the authorization paths, the visibility rule, the failure
   statuses, and that the payload does not carry anything the caller's tier
   forbids. Pass a fixture store to the factory rather than setting
   `SUNSUM_STORE`.

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
persistence and private Blob Storage for document files. Drizzle Kit is the selected schema/migration tooling.
[The connection foundation](infrastructure/database/README.md) now provides
validated server-only configuration, a pooled `pg`/Drizzle client, managed-identity
token refresh and a read-only connectivity command. It reuses the canonical
`db/` schema and migrations from main rather than maintaining a second schema.
The `db/` directory also provides the PostgreSQL-backed `BackendStore` selected
by the composition root. Application-user mapping remains separate from
database access and Azure provisioning.

Two seams allow those integrations without changing the workflow rules:

- **Persistence.** `core/store/index.ts` provides the shared in-memory demo
  implementation behind `BackendStore`; `createMemoryBackendStore` gives tests
  isolated state and `resetDemoBackendStore` resets route-level state. Its
  serialized transactions discard the working copy when the callback throws or
  returns a failed `Result`, preventing partial mutations on domain failures.

  A schema now exists in [`db/`](./db/README.md) and
  [ADR 0001](../../infrastructure/docs/adr-0001-database-and-persistence.md)
  records the decision. `composition.ts` selects the Drizzle-backed
  `BackendStore` with `SUNSUM_STORE=db`; the default remains the explicit
  in-memory fixture. Persistence stays outside the handlers.
- **Identity.** `handlers/identity/viewer.ts` exposes fixed demo owner, operator
  and investor resolvers. **They have no security value.** They read nothing
  from the request, so a caller cannot choose a role. Before production, replace
  them with authenticated request-to-viewer resolution and add CSRF protection
  for cookie sessions or suitable bearer-token protection.

Neither is production ready. The App Service smoke test exercises the existing
fixture-backed API, not a real database, data set, or identity provider.

Infrastructure clients must not be constructed in `core/`, `handlers/`, routes,
or presentation. The composition boundary supplies dependencies to adapters
behind core interfaces; ESLint and the boundary tests enforce this separation.
Database configuration is never a `NEXT_PUBLIC_*` value.

The application `db/` client must not import the separate
`infrastructure/database` operator client. ESLint rejects this direction,
including re-exports, so the `DATABASE_URL`/`SUNSUM_DB_AUTH` application contract
does not silently adopt `PG*`/`SUNSUM_DATABASE_AUTH` configuration. The composition
and operator boundaries remain allowed to construct their own dependencies;
operator tooling may import `db/schema` to reuse tables without importing the
application client or store.

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
