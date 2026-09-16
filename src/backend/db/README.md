# Persistence

The database schema for the eleven tables in
[section 5.2](../../../docs/sunsum_technical_design_doc.md) of the technical
design, and the tooling to create, seed and verify it on a laptop.

**Nothing reads these tables yet.** The running API is still served by the
in-memory fixtures in `core/projects/mock-store.ts`. Wiring a store to this
schema is a separate change; this one is the schema and the means to trust it.

Read [ADR 0001](../../../infrastructure/docs/adr-0001-database-and-persistence.md)
first. The choices here that look arbitrary are not, and the reasoning is
recorded there rather than repeated in every file.

## Run it locally

```bash
cp .env.example .env.local

npm run db:up        # PostgreSQL 16 in Docker, on port 55432
npm run db:migrate   # create the schema
npm run db:seed      # load the demo data
npm run db:verify    # prove the constraints reject what they should
```

The whole cycle from nothing takes about ten seconds, and `db:verify` exits
non-zero if any guarantee has been lost.

| Command               | What it does                                    |
| --------------------- | ----------------------------------------------- |
| `npm run db:up`       | Start PostgreSQL and wait for it to be healthy  |
| `npm run db:down`     | Stop it and delete the volume                   |
| `npm run db:generate` | `schema.ts` to a new migration                  |
| `npm run db:migrate`  | Apply pending migrations                        |
| `npm run db:seed`     | Load demo data (additive, idempotent)           |
| `npm run db:reset`    | Empty every table                               |
| `npm run db:verify`   | Run the adversarial constraint probes           |
| `npm run db:studio`   | Browse the data in a browser                    |

`scripts/db.mjs` runs the SQL through the `pg` driver the application already
depends on, so `psql` does not need to be installed. It loads `.env.local`,
which a plain Node process does not do for itself, and it refuses to run against
a host that is not `localhost` — `db:reset` truncates every table, and migrating
a deployed database is a deployment step, not an npm script.

Every `db:*` command goes through it, `db:studio` included. That is not
tidiness: `db:studio` used to call `drizzle-kit` directly, which meant nothing
loaded `.env.local` and `drizzle.config.ts` fell back to a hardcoded
`localhost:5432`. On a machine with PostgreSQL already installed, that is
somebody else's database, connected to silently. The fallback is now read from
`.env.example`, so the worst case is a connection refused rather than the wrong
data.

## Three ways to look at the data

| | |
| --- | --- |
| `npm run db:studio` | A browser GUI at <https://local.drizzle.studio>. The page is a front end for a server on your own machine; the data does not leave it. |
| `docker exec -it sunsum-postgres psql -U sunsum -d sunsum` | `psql` inside the container. `\dt` lists tables, `\d projects` describes one. |
| pgAdmin, DBeaver, TablePlus, the VS Code extension | Host `localhost`, port **55432**, database `sunsum`, user `sunsum`, password `devpassword`. |

PostgreSQL 15 or later is required.

## Why this sits beside `core` and `handlers`

The dependency runs one way: `db` imports domain vocabulary from `core`, and
`core` never imports `db`.

That is what keeps `ProjectStore` an interface a domain owns rather than a shape
the database dictates. Reverse it and the schema starts deciding what the rules
can express — the table becomes the model, and every rule ends up phrased in
terms of columns. It is enforced in the root `eslint.config.mjs` and asserted in
`tests/unit/architecture.test.ts`, alongside the existing service boundaries.

## Files

| File                     | What it is                                                             |
| ------------------------ | ---------------------------------------------------------------------- |
| `schema.ts`              | The eleven tables, their constraints and their indexes                  |
| `enums.ts`               | The section 5.3 enumerations that no service directory owns yet         |
| `migrations/`            | Generated SQL, plus one hand-written migration. The artifact that runs  |
| `seed.sql`               | Demo data, with the charter's criteria asserted at the end              |
| `reset.sql`              | Empties every table so the seed can rebuild from nothing                |
| `verify-constraints.sql` | Adversarial probes proving each constraint rejects what it should       |

## Vocabulary lives in the domain, not here

`schema.ts` imports `ROLES` from `core/identity` and `PROJECT_STAGES`,
`VIABILITY_STATUSES`, `SITE_TYPES` and `FUNDING_STAGES` from `core/projects`
rather than restating them. Each list is `as const`, so one array produces both
the TypeScript union and the `CHECK` constraint: a value cannot reach the
database without reaching the type system, or the reverse.

`enums.ts` holds the rest only because S-SITE and S-ENG do not exist yet. When
they do, those lists move into `core/sites/` and `core/engagements/` and the
schema keeps working, because it imports the array rather than copying the
values.

### Two stage enumerations, not one

`PROJECT_STAGES` and `FUNDING_STAGES` overlap on their first three values and
then diverge. An investor funds `permanent` capital, which is not a project
stage; a project reaches `commissioning` and `operations`, which nothing is
raised against.

Review found `fundingStageFocus` typed as `ProjectStage[]`, which makes a
`permanent` mandate unrepresentable. Both lists now live in `core/projects`,
along with `FUNDING_STAGE_BY_PROJECT_STAGE`, which is the mapping any
mandate comparison must go through rather than testing equality. Changing the
matcher to use it is part of wiring the store up, not of defining the schema.

An earlier version of this file declared the mapping _here_, which could not
work: `core` is forbidden from importing `db`, so nothing that needed the
mapping could reach it.

### `investor_type` and the sign-up form

`INVESTOR_TYPES` and the finance group of `src/domain/userTypes.ts` are the same
seven funder profiles in two spellings — snake_case in the database, kebab-case
on the form. `USER_TYPE_BY_INVESTOR_TYPE` connects them, typed
`satisfies Record<InvestorType, UserTypeId>` so one direction fails the build;
`tests/unit/backend/investor-types.test.ts` covers the other.

## Seeding, resetting, and the difference

`seed.sql` upserts on stable identifiers, so it is safe to re-run — but it is
**additive, not a reset**. `ON CONFLICT DO UPDATE` never deletes, so a row
removed from the file, or typed in by hand during a demo, survives every re-run.
`reset.sql` is the missing half; run it first when the database must contain
exactly what the seed describes.

`reset.sql` uses `TRUNCATE` rather than `DELETE` because the append-only
triggers on `assessments` and `activity` are row-level and do not fire for
`TRUNCATE`. Blocking edits to the audit trail is the guarantee; making the
tables impossible to rebuild is not.

The seed's five projects mirror `core/projects/mock-store.ts` exactly, and its
principal identifiers are PR #12's `demo-principals.ts` constants, so the
owner-scoped endpoints resolve against rows that exist.

It ends with assertions that raise rather than return: at least three
investor-visible Atlanta pilots (criterion S3), the deliberately unpublished
Grove Park project still hidden, the demo owner holding some but not all sites,
a draft site that is legitimately incomplete, an unclassified document that
defaulted to `owner_private`, and every project sitting on an accepted site.
Loading data that quietly fails the demo criteria is the failure worth catching.

The addresses and people are invented. Nothing in it is real customer data.

## Verification that can fail

`verify-constraints.sql` runs 42 adversarial probes: each asserts the database
rejects something the application must never store, or accepts something it must
always store.

The first version printed `FAIL` as query output and psql still exited 0, which
meant a broken constraint looked exactly like a healthy one. Results now go into
a table and a final block raises, so the exit status carries the answer. This was
tested by deliberately dropping a constraint and confirming the run fails.

A probe that passes for the wrong reason is worse than no probe: the append-only
check originally used an invalid enum value, so the `CHECK` constraint rejected
the update and the trigger was never exercised.

The whole file runs in one transaction that always ends in `ROLLBACK`. The
probes insert deliberately malformed rows and a valid graph to hang them off,
and none of it survives — so `db:verify` is safe to run repeatedly against your
seeded development database rather than only against a scratch one. A verifier
that dirties the database it verifies can only be run once.

### Review the generated SQL

`migrations/*.sql` is the real artifact — it is what runs against the database,
and it is what keeps the decision reversible if the team later prefers a
different tool. Read it in review like any other code.

`0001_append_only_guards.sql` is hand-written: Drizzle's schema builder has no
trigger construct, and `drizzle-kit generate` rewrites `0000` from `schema.ts`,
so anything added there by hand would be lost. The `migrations/meta/` directory
is `drizzle-kit`'s bookkeeping and is excluded from formatting checks because
regenerating it would break them again.

## What is verified, and what is not

Verified against PostgreSQL 16 in Docker: the migrations apply to an empty
database; all 42 constraint probes reject what they should, and the probe file
fails loudly when a constraint is removed or a trigger is disabled; the seed
produces identical row counts on a second run; and `reset.sql` empties the
append-only tables.

Not verified: nothing reads these tables yet, nothing has run against a hosted
database, and there is no migration-on-deploy path. CI has no database, so the
probes do not run there — that is a real gap.
