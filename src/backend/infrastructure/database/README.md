# Server-only PostgreSQL foundation

This is connection and migration **tooling**, not application persistence.
`ProjectStore` still uses explicit synthetic fixtures; the demo investor and the
browser-only `/join` flow are unchanged. No Azure database, principal, firewall
rule, or business table is created by importing this module.

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
`server-only`. Only the schema-only module is loaded independently by Drizzle
Kit.

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
Longer migrations require an explicit timeout and operational review rather
than an unbounded pool. Background pool errors are logged with safe error codes,
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
npm run db:migrate -- --apply
```

Generation is offline and reads the version-controlled
[`schema.ts`](schema.ts). It is intentionally empty; the
[migration journal](migrations/meta/_journal.json) contains no SQL migrations.
The migration command explicitly reports that no work was applied in this case.

Review generated SQL, snapshots, locks, data compatibility, and least-privilege
grants before using `--apply`. Azure migrations require the separately granted
operator identity; the command refuses runtime managed identity. Never run
migrations automatically at web startup or as part
of routine app deployment. See the [migration notes](migrations/README.md).

Before pending SQL is applied, a read-only preflight checks database `CREATE`.
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
