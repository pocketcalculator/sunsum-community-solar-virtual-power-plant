# Backend layer

The server-side boundary for the origination workflow, owned by WS2. The
service catalogue and API surface it is expected to grow into are described in
sections 9 and 10 of
[the technical design](../../docs/sunsum_technical_design_doc.md).

**This directory is a scaffold.** It establishes the structure and its enforced
import rules so that later work has an agreed place to land. No request
handling, persistence, identity, authorization or solar logic is implemented
here yet, and nothing in it is wired to a route.

## Responsibilities

| Directory   | Owns                                                                                                                                             | Must not                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `handlers/` | The transport edge: reading a request, validating the shape of its input, enforcing authorization, mapping a core result or failure onto a status code | Hold workflow rules, stage transitions or solar math                            |
| `core/`     | Workflow rules, stage transitions, visibility scoping and audit decisions, written as ordinary functions over plain values                        | Import `handlers/`, or reach for `next/server`, `next/headers` or `next/cache`  |

The split exists so that a workflow rule can be exercised by a test, a
scheduled job or the seeding CLI without constructing an HTTP request, and so
that authorization has one obvious place to live at the service boundary rather
than being spread through the rules it protects.

`index.ts` is the public entry point. Routes import `@/backend` and nothing
deeper, which keeps handler and core module paths free to move.

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
installed or configured by this scaffold, and
[the WS1 architecture note](../../docs/ws1/architecture.md) is explicit that the
WS2 topology — an in-process Next.js module or a separate service — remains
open. Persistence, the identity provider, the wire contract and the error model
are still to be agreed; add modules when accepted behavior needs them rather
than to fill in this diagram.
