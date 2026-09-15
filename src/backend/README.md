# Backend layer

The server-side boundary for the origination workflow, owned by WS2. The
service catalogue and API surface it is expected to grow into are described in
sections 9 and 10 of
[the technical design](../../docs/sunsum_technical_design_doc.md).

**`GET /portfolio` is the worked example.** It is implemented end to end against
mock data so that later endpoints have a pattern to copy; see
[Adding an endpoint](#adding-an-endpoint). Persistence and identity are still
not implemented, and the project store is an in-memory fixture.

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

## Adding an endpoint

Follow `GET /portfolio`:

1. **Core** — add a module under `core/` exporting the payload types and one
   function taking `(viewer, validatedQuery, store)` and returning
   `Result<Payload>`. Authorize first, before reading anything. Project
   internal records into the payload with an explicit field list, never a
   spread, so a new column cannot publish itself.
2. **Handler** — add a module under `handlers/` that validates the request into
   typed values, calls core, and maps the result with `jsonResponse` or
   `failureResponse`. Reject unknown input rather than ignoring it: a silently
   dropped filter shows the caller more than they asked for.
3. **Route** — add `app/api/<path>/route.ts` as a one-line re-export of the
   wired handler from `@/backend`.
4. **Tests** — cover the authorization paths, the visibility rule, the failure
   statuses, and that the payload does not carry anything the caller's tier
   forbids.

Failure codes are declared once in `core/result.ts` and mapped to statuses once
in `handlers/http.ts`, where the mapping is a total `Record`, so a new code
cannot be added without choosing its status.

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
| `core/` -> `../handlers` or `@/backend/handlers`    | Rejected upward dependency        |
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

- **Persistence.** `core/mock/projects.ts` is an in-memory fixture behind a
  `ProjectStore` interface. The data is invented for the demo and is not real
  customer data. Replacing the implementation is the whole change.
- **Identity.** `handlers/viewer.ts` returns the same demo investor for every
  request. **It has no security value.** It reads nothing from the request on
  purpose, so it cannot be used to choose a role; a real session lookup drops
  into the same function.

Neither is production ready, and nothing here has been reviewed against a
deployment, a real data set or an identity provider.
