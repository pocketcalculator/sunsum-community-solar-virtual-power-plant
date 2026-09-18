# Server-only PostgreSQL foundation

This is connection and migration **tooling**, not application persistence.
The application selects fixtures or the PostgreSQL-backed `BackendStore` through
`SUNSUM_STORE`; its [runtime database client](../../db/README.md) uses
`DATABASE_URL` and `SUNSUM_DB_AUTH`, not this module's `PG*` contract. The fixed
demo identities and browser-only `/join` flow remain unchanged. No Azure database,
principal, firewall rule, or business table is created by importing this module.

## One explicit configuration contract

Settings are server-only process environment variables. The CLI tools consume
the inherited environment; they do not automatically load a `.env` file.

| Variable | Local PostgreSQL | Azure App Service runtime |
| --- | --- | --- |
| `SUNSUM_DATABASE_AUTH` | `password` | `managed-identity` |
| `PGHOST` | Loopback host, supplied explicitly | Flexible Server FQDN |
| `PGPORT` | Assigned Docker host port or configured local port | `5432` |
| `PGDATABASE` | Configured local database name | Provisioned database name |
| `PGUSER` | Configured local username | Explicit SQL role mapped to the web identity |
| `PGPASSWORD` | Local-only password supplied through the environment | Must be absent |
| `PGSSLMODE` | `disable` | `verify-full` |

Every field is required except `PGPASSWORD` in Entra modes. Missing or invalid
configuration throws; no driver defaults, connection-URL parsing, or fallback
to fixtures are used. Password authentication is restricted to non-production
loopback (`localhost`, `127.0.0.1`, `::1`). Entra modes require the Azure public
cloud `*.postgres.database.azure.com` hostname and verified TLS. Global
`NODE_TLS_REJECT_UNAUTHORIZED=0` is rejected.

Do not put these values in `NEXT_PUBLIC_*`, browser code, source control, command
arguments containing credentials, or logs. The same contract is declared by the
[Azure templates and runbook](../../../../infrastructure/docs/app-service-postgres.md).
Local tools and Azure App Service supply this contract through the process
environment, not through browser configuration or committed credentials.

## Composition and injection

`createDatabase(environment, options)` validates configuration and constructs a
lazy `pg.Pool` plus the typed Drizzle client. `getDatabase()` lazily shares one
instance per server process, including Next.js hot reloads; `closeDatabase()`
drains that shared instance. Restart the server after changing configuration.
Scripts own their injected instance and always call `close()` in `finally`.

Future persistence adapters take `DatabaseDependencies["db"]` as a dependency
and implement a core interface such as `ProjectStore`. Construct and inject the
adapter at the backend composition boundary. Do not import drivers into core,
handlers, routes, or presentation; the existing architecture tests enforce
these additional boundaries. Each connection-facing module also imports
`server-only`. The canonical [schema](../../db/schema.ts) remains in `backend/db`
and is shared by the pool, Drizzle Kit and both migration entry points.

Environment configuration does **not** inject a ready-made Drizzle service into
Next.js. The application owns the pool and client lifetime.
No existing public route requests this dependency, so `npm run dev` and the
production build still work without a database.

## Driver and authentication decision

[`node-postgres`](https://node-postgres.com/features/connecting) supports an
asynchronous password callback for each new physical connection.
[`ManagedIdentityCredential`](https://learn.microsoft.com/en-us/javascript/api/@azure/identity/managedidentitycredential)
requests `https://ossrdbms-aad.database.windows.net/.default`. The Azure SDK owns
token caching/refresh; the pool is not constructed with one startup token that
later expires. Missing tokens and tokens expiring within 60 seconds are rejected.

The deployed application uses **only system-assigned managed identity**, not a
default credential chain that might select developer credentials. PostgreSQL
authenticates the token when connecting, not on every query. Pooled connections
rotate after five minutes; new physical connections invoke the callback again.
TLS checks both the certificate chain and hostname using Node's trust store.
Do not turn off verification to work around a trust-chain problem.

Operator commands can explicitly select `SUNSUM_DATABASE_AUTH=azure-cli`.
Only those commands pass `allowOperatorIdentity`; application construction
rejects this mode. An operator must already be signed in through Azure CLI and
mapped to a separately authorized PostgreSQL principal. This does not establish
application-user sign-in.

| Limit | Value |
| --- | --- |
| Pool size per process | 5 connections |
| Connection / token request timeout | 5,000 ms |
| Server statement timeout | 5,000 ms |
| Client query timeout | 10,000 ms |
| Idle-in-transaction timeout | 10,000 ms |
| Idle connection timeout | 30,000 ms |
| Maximum connection lifetime | 300 seconds |

These are small development defaults, not load-test-derived production sizing.
The Azure migration command uses one connection. Its statement timeout defaults
to 5,000 ms; an operator may explicitly set
`SUNSUM_MIGRATION_STATEMENT_TIMEOUT_MS` to an integer from 5,000 through 600,000
after reviewing the migration and lock duration. Its client query timeout is
the chosen statement timeout plus 5,000 ms. This variable is read only by the
migration command, never by the application or connectivity check. It bounds
each statement, not the entire migration run; no automatic retry is performed.
Background pool errors are logged with safe error codes,
never SQL text, parameters, passwords, or token values.

## Connectivity and migrations

With the appropriate environment already injected:

```sh
npm run db:check
```

This runs one bounded, read-only `SELECT 1` through Drizzle and closes the pool.
Failures exit nonzero. It creates no schema and saves no participant data. There
is deliberately no unauthenticated HTTP database diagnostic endpoint;
`GET /api/portfolio` remains a fixture demonstration, not a database health check.
CONNECT-only access plus `SELECT 1` proves connectivity, not authorization to
read or modify application tables.

For optional local validation, use PostgreSQL 17 (for example the official
`postgres:17.9` Docker image), a new disposable container, and a Docker-assigned
loopback host port. Supply the local password through the process environment,
not an argument or committed file. Wait for `pg_isready`, map that container's
connection settings to the contract above, run `db:check`, and stop only that
owned container afterward. Docker is optional; no orchestration framework or
database is required for the browser-only preview.

```sh
npm run db:generate
npm run db:migrate:azure -- --print-digest
npm run db:migrate:azure -- --apply --approval .azure/dev/migration-approval.json --expected-sha256 '<reviewed-approval-sha256>'
```

Generation reads main's version-controlled [schema](../../db/schema.ts) and
[migration journal](../../db/migrations/meta/_journal.json), which now contain
the eleven-table schema and append-only guards. No parallel migration tree
remains in this directory. Main's `npm run db:migrate`, `db:seed`, `db:reset`,
`db:verify`, and `db:studio` remain local-only, using their existing `DATABASE_URL`
contract; they must not be used for Azure. The Azure operator command uses the
same committed SQL through the explicit `PG*` and Entra contract above.

The reviewed approval JSON binds `operation=DatabaseMigration`, host, numeric
port, database, user, authentication mode, TLS mode, numeric statement timeout,
and a nonempty approval reference, plus `migrationsSha256` for the reviewed
journal and its SQL files. The approval file's exact-byte SHA-256 must come from review.
Values must match the captured environment before any client is constructed;
the digest is checked again before construction. See the
[approval example](../../../../infrastructure/docs/app-service-postgres.md#5-operator-connectivity-and-migrations).
`--print-digest` is read-only and requires no database settings. Record its value
during SQL review, not by recomputing it from edited files at apply time. Execution
uses an immutable in-memory copy parsed by Drizzle; source and approval drift are
checked immediately before running it. Drizzle retains transaction/history
handling through the same pool, without rereading the mutable migration folder.
The runbook specifies the digest format; keep the SQL and tooling revision with
the approval. This target/SQL binding does not establish operator permissions.

Review generated SQL, snapshots, locks, data compatibility, and least-privilege
grants before using `--apply`. Azure migrations require the separately granted
operator identity; the command requires `PGUSER=sunsum_migrator` and refuses
runtime managed identity, local passwords, administrator names and other roles
before constructing a client. Use the same designated role in bootstrap;
custom operator role names require a reviewed contract change. The role name
does not prove non-admin privileges or identity mapping: those remain verified
by the separate bootstrap and administrator review. Never run
migrations automatically at web startup or as part
of routine app deployment. See the [canonical database guide](../../db/README.md)
and [Azure permission window](../../../../infrastructure/docs/app-service-postgres.md#5-operator-connectivity-and-migrations).

Before pending SQL is applied, a read-only preflight checks database `CREATE`
and `USAGE, CREATE` on the canonical `public` schema. The pool pins `search_path`
to `public` so unqualified migrations do not drift into another schema.
Standard Drizzle requires that privilege even when its metadata schema exists.
The baseline remains CONNECT-only: an administrator must approve any temporary
operator-only grant, preserve pre-existing permissions, and verify cleanup on
both success and failure. The preflight does not grant or revoke anything.

An application rollback is **not** a database rollback. Prefer reviewed,
backward-compatible expand/contract changes; assess backups and a forward fix
before any destructive schema operation.

## Pinned dependencies

Drizzle ORM provides typed SQL, `pg` provides pooling and dynamic authentication,
and `@azure/identity` provides supported token acquisition. `server-only` protects
the Next.js boundary. Drizzle Kit generates reviewable migrations; `tsx` runs the
operator TypeScript entry points. Exact versions and integrity are in the root
manifest/lockfile. The CLI's `--conditions=react-server` is necessary to run the
real server-only dependency outside Next.js, not to expose it to a client.
