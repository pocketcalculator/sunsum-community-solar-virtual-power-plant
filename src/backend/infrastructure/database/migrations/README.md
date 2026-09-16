# Versioned migrations

The schema and Drizzle Kit journal are initialized, but there are **zero business
tables and zero SQL migrations**. Connectivity is tested with `SELECT 1`; it must
not be misrepresented as a saved origination journey.

Generate future migrations from the schema with `npm run db:generate`. Commit
the generated SQL, journal, and snapshots together after review. Never fabricate
a journal entry to mark unapplied SQL as applied, edit an applied migration, or
use `drizzle-kit push` against a shared environment.

The explicit Azure bootstrap owns creation and permissions for the `sunsum`
application schema and `drizzle` migration metadata schema. When introducing
`pgSchema("sunsum")` into the first domain schema, reconcile any generated
`CREATE SCHEMA` with that existing namespace (for example, reviewed
`CREATE SCHEMA IF NOT EXISTS`) without changing its operator ownership.
Grant runtime access only to the specific tables/operations needed by the
implemented use case, not automatically to every future table.

`npm run db:migrate -- --apply` uses the same validated pool and dynamic token
provider as the connectivity tool, but refuses runtime managed identity.
Migrations are a separately authorized operator action, not a web startup task.
The read-only permission preflight fails before schema changes if the operator
lacks database `CREATE`, which standard Drizzle needs even for an existing
metadata schema. Follow the administrator-approved temporary permission window
in the [runbook](../../../../../infrastructure/docs/app-service-postgres.md):
preserve permissions that already existed, revoke only the grant introduced by
that window, and verify cleanup after either success or failure. Runtime must
never receive that grant; the migration tool does not self-grant.

No-op output means there were no versioned SQL files to apply; it does not
certify a remote schema or its permissions.

Schema/data rollback is distinct from reverting a web ZIP. Review backward
compatibility, backups, and a forward repair before changing shared data.
