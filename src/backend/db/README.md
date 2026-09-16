# Persistence

The database schema for the eleven tables in
[section 5.2](../../../docs/sunsum_technical_design_doc.md) of the technical
design, and nothing that decides anything.

**Nothing imports this yet.** The running `GET /portfolio` endpoint is still
backed by `core/projects/mock-store.ts`. The schema lands first, on its own, so
the table definitions can be reviewed as tables rather than as a side effect of
a behaviour change. Wiring a store implementation to them is a separate step.

Read [ADR 0001](../../../infrastructure/docs/adr-0001-database-and-persistence.md)
first. The choices here that look arbitrary are not, and the reasoning is
recorded there rather than repeated in every file.

## Why this sits beside `core` and `handlers`

The dependency runs one way: `db` imports domain vocabulary from `core`, and
`core` never imports `db`.

That is what keeps `ProjectStore` an interface a domain owns rather than a shape
the database dictates. Reverse it and the schema starts deciding what the rules
can express — the table becomes the model, and every rule ends up phrased in
terms of columns. It is enforced in the root `eslint.config.mjs` and asserted in
`tests/unit/architecture.test.ts`, alongside the existing service boundaries.

A store implementation, when one is written, belongs here: it imports the
interface from `core/<service>` and the tables from `./schema`, and is handed to
core as an argument. Core stays callable with a fixture.

## Files

| File                     | What it is                                                              |
| ------------------------ | ----------------------------------------------------------------------- |
| `schema.ts`              | The eleven tables, their constraints and their indexes                  |
| `enums.ts`               | The section 5.3 enumerations that no service directory owns yet         |
| `migrations/`            | Generated SQL. The committed artifact that actually runs                |
| `seed.sql`               | Idempotent demo data, with the charter's criteria asserted at the end   |
| `verify-constraints.sql` | Adversarial checks proving each constraint rejects what it should       |

## Vocabulary lives in the domain, not here

`schema.ts` imports `ROLES` from `core/identity` and `PROJECT_STAGES`,
`VIABILITY_STATUSES` and `SITE_TYPES` from `core/projects` rather than restating
them. Each list is `as const`, so one array produces both the TypeScript union
and the `CHECK` constraint: a value cannot reach the database without reaching
the type system, or the reverse.

`enums.ts` holds the rest only because S-SITE and S-ENG do not exist yet. When
they do, those lists move into `core/sites/` and `core/engagements/` and the
schema keeps working, because it imports the array rather than copying the
values.

### Two stage enumerations, not one

`PROJECT_STAGES` and `FUNDING_STAGES` overlap on their first three values and
then diverge. An investor funds `permanent` capital, which is not a project
stage; a project reaches `commissioning` and `operations`, which nothing funds.

Review of the portfolio endpoint found `fundingStageFocus` typed as
`ProjectStage[]`, which makes a `permanent` mandate unrepresentable. Comparing
the two needs the explicit `FUNDING_STAGE_BY_PROJECT_STAGE` mapping, never an
equality test.

## Working with it

```bash
# Start a local server
docker run -d --name sunsum-pg \
  -e POSTGRES_USER=sunsum -e POSTGRES_PASSWORD=sunsum -e POSTGRES_DB=sunsum \
  -p 55432:5432 postgres:16-alpine

export DATABASE_URL=postgres://sunsum:sunsum@localhost:55432/sunsum

npm run db:generate   # schema.ts -> a new migration
npm run db:migrate    # apply pending migrations
npm run db:studio     # browse the data

psql "$DATABASE_URL" -f src/backend/db/seed.sql               # demo data, repeatable
psql "$DATABASE_URL" -f src/backend/db/verify-constraints.sql # prove the constraints bite
```

PostgreSQL 15 or later is required: `investor_engagements` relies on
`UNIQUE NULLS NOT DISTINCT`, which does not exist before 15.

`drizzle-kit` is a development dependency. Nothing at runtime imports it or
`drizzle.config.ts`.

### Review the generated SQL

`migrations/*.sql` is the real artifact — it is what runs against the database,
and it is what keeps the decision reversible if the team later prefers a
different tool. Read it in review like any other code. The `migrations/meta/`
directory is `drizzle-kit`'s bookkeeping and is excluded from formatting checks
because regenerating it would break them again.

## Seeding is also a test

`seed.sql` upserts on stable identifiers, so it is safe to re-run and doubles as
the demo reset. Its five projects mirror `core/projects/mock-store.ts` exactly,
so swapping the mock for a real store should not change a single response.

It ends with assertions that raise rather than return: at least three
investor-visible Atlanta pilots (criterion S3), and the deliberately unpublished
Grove Park project still hidden. Loading data that quietly fails the demo
criteria is the failure worth catching.

The addresses and people are invented. Nothing in it is real customer data.

## What is verified, and what is not

Verified against PostgreSQL 16 locally: the migration applies to an empty
database; all nineteen constraint probes reject what they should; the seed
produces identical row counts on a second run.

Not verified: nothing has run against a hosted database, no connection pooling
or migration-on-deploy path exists, and no store implementation uses these
tables. CI has no database, so none of the above runs there — it is a local
check, and the commands are written down so the result can be reproduced rather
than taken on trust.
