# Backend layer

The server-side boundary for the origination workflow, owned by WS2. The
service catalogue and API surface it is expected to grow into are described in
sections 9 and 10 of
[the technical design](../../docs/sunsum_technical_design_doc.md).

**`GET /portfolio` is the worked example.** It is implemented end to end and
runs against either an in-memory fixture or a real PostgreSQL database, chosen
by one environment variable, so that later endpoints have a pattern to copy;
see [Adding an endpoint](#adding-an-endpoint). Identity is still not
implemented.

## Layout

Two layers, and inside each one directory per service from
[section 9.2](../../docs/sunsum_technical_design_doc.md). The design document
already assigns every endpoint in section 10 to a service, so deciding where
code goes is a lookup rather than a judgement call.

```text
src/backend/
  index.ts              the only entry point a route may use, and the composition root
  composition.ts        picks the store implementation from the environment
  core/
    shared/             primitives with no domain meaning: Result, ok, failure
    identity/           S-IAM   who the caller is
    projects/           S-PROJ  project records, vocabulary, the store seam
    investors/          S-INV   portfolio, mandate matching, visibility rule
  handlers/
    shared/             JSON, the error envelope, failure-code to status
    identity/           S-IAM   resolving the caller at the transport edge
    investors/          S-INV   query parsing and status mapping
  db/                   schema, migrations, driver, store. Imports core; core never imports it
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
| **S-SITE**  | `sites/`       | `/sites/*`, `/me/sites`, `/submissions/*`, `/me/outstanding`                 | to do   |
| **S-ASSESS**| `assessments/` | `/sites/{id}/assessments/override`                                           | to do   |
| **S-PROJ**  | `projects/`    | `/pipeline`, `/projects/{id}`, `/projects/{id}/stage`, `.../visibility`      | partial |
| **S-INV**   | `investors/`   | `/portfolio`, `/investors/me/profile`                                        | done    |
| **S-ENG**   | `engagements/` | `/projects/{id}/engagements`, `/engagements/*`, funding needs, diligence     | to do   |
| **S-DOC**   | `documents/`   | `/sites/{id}/documents`, `/sites/{id}/acknowledgements`                      | to do   |
| **S-ACT**   | `activity/`    | `/projects/{id}/activity`                                                    | to do   |
| **S-VIEW**  | `views/`       | Composed reads: the site-owner dashboard, `/projects/{id}/deal-room`         | to do   |

S-VIA, the viability engine, is deliberately absent: the charter puts it in a
separate Python deployable, so it will be reached as a client from
`assessments/`, not added as a directory here.

Create a service directory the first time it has something in it, in both
layers, each with an `index.ts`. An empty directory is not worth the import.

## Responsibilities

| Directory   | Owns                                                                                                                                    | Must not                                                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `handlers/` | The transport edge: establishing who is calling, validating the request into typed values, and turning a `Result` into a status code     | Decide permission, or hold workflow rules, stage transitions or solar math      |
| `core/`     | Authorization, workflow rules, visibility scoping and the response payload, written as ordinary functions over plain values              | Import `handlers/`, or reach for `next/server`, `next/headers` or `next/cache` |

Handlers **authenticate**; core **authorizes**. A handler establishes identity
because that is a transport concern — a cookie, a header, a token. Core decides
what that identity may see, because a permission that lived in the handler
would be skipped the moment a scheduled job, the seeding CLI or a second route
called the same function. This is what "enforce authorization at service
boundaries, not only in the user interface" means here.

`index.ts` is the public entry point. Routes import `@/backend` and nothing
deeper, which keeps handler and core module paths free to move.

## The composition root

Neither `core/` nor `handlers/` may import `db/`. Something has to, or the
database would never be reached — so one module does, and only one:
`index.ts`, helped by `composition.ts`.

```text
composition.ts  selectProjectStore()  reads SUNSUM_STORE, returns a ProjectStore
index.ts        getPortfolioRoute = createPortfolioRoute(selectProjectStore())
```

Handlers export a **factory**, not a wired route:

```ts
export function createPortfolioRoute(store: ProjectStore = projectStore) { … }
```

The factory takes the store as an argument, so a test supplies a fixture
without touching the environment, and the composition root supplies the real
one exactly once at module load. `app/api/portfolio/route.ts` stays a one-line
re-export and never learns which store it got.

| `SUNSUM_STORE` | Store                        | Needs a database |
| -------------- | ---------------------------- | ---------------- |
| unset, `mock`  | `core/projects/mock-store.ts` | no              |
| `db`           | `db/project-store.ts`         | yes             |

Both return the same `PortfolioItem[]`, and
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
3. **Wire it** — in `src/backend/index.ts`, call the factory with the store from
   `selectProjectStore()`. That line is the only place the choice is made.
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

## Not decided here

[The technical design](../../docs/sunsum_technical_design_doc.md) proposes
Azure SQL or PostgreSQL, Blob Storage and Entra ID. None of that is selected,
installed or configured here, and
[the WS1 architecture note](../../docs/ws1/architecture.md) is explicit that the
WS2 topology — an in-process Next.js module or a separate service — remains
open.

Two seams exist specifically so those decisions can land without touching any
rule:

- **Persistence.** `core/projects/mock-store.ts` is an in-memory fixture behind
  the `ProjectStore` interface in `core/projects/store.ts`. The data is
  invented for the demo and is not real customer data. Replacing the
  implementation is the whole change; the interface is kept in its own file
  because it is the part that survives.

  A schema now exists in [`db/`](./db/README.md) and
  [ADR 0001](../../infrastructure/docs/adr-0001-database-and-persistence.md)
  proposes PostgreSQL with Drizzle, but **the ADR is still `Proposed` and
  nothing is wired up**: the running endpoint is still served by the fixture.
- **Identity.** `handlers/identity/viewer.ts` returns the same demo investor for
  every request. **It has no security value.** It reads nothing from the request
  on purpose, so it cannot be used to choose a role; a real session lookup drops
  into the same function.

Neither is production ready, and nothing here has been reviewed against a
deployment, a real data set or an identity provider.
