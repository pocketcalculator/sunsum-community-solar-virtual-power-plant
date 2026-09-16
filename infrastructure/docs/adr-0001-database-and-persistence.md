---
title: "ADR 0001: Database engine and persistence layer"
description: Choosing the transactional store and the TypeScript persistence layer for the Sunsum origination workflow
---

## Status

**Proposed.** Owned by WS2. Nothing in this record is installed or provisioned
by adopting it; it selects a direction and records why. Superseding it later is
expected to be cheap, and the "Reversibility" section says how cheap.

## Context

The workflow currently runs on mock data. `src/backend/core/projects/store.ts`
defines a `ProjectStore` interface and `mock-store.ts` implements it with five
invented projects held in memory. That was deliberate — it let the API pattern
land before persistence was chosen — but it caps us at criterion **S3**
("seed script run on empty DB yields at least three projects in both views")
and blocks **S4** and **S6**, both of which require a submission and an operator
decision to survive a page load.

### The design document does not agree with itself

This is the first thing to settle, because three parts of
[the technical design](../../docs/sunsum_technical_design_doc.md) point in two
directions:

| Where | What it says | Implies |
| --- | --- | --- |
| §3, Backend row | "SQL Server-compatible client" | Azure SQL |
| §3, Database row | "Azure SQL Database / PostgreSQL" | Undecided |
| §4, architecture diagram | `[(PostgreSQL ...)]` | PostgreSQL |

§12 (Deployment CI/CD) is an empty heading, and
[the WS1 note](../../docs/ws1/architecture.md) states that "ordinary
`next build` and `next start` are the only hosting contract implemented" and
that WS3 must select the hosting contract before deployment work is accepted.
So this record chooses an engine and a persistence layer. **It does not choose
hosting, and it does not provision anything.**

### Constraints this has to respect

- The charter is demo-driven. S1 through S8 are all verified by a person
  clicking through a deployed URL on demo day.
- Five workstreams work in parallel. WS1, WS4 and WS5 need to run the app
  without becoming database administrators.
- The repository has three production dependencies. Adding a persistence layer
  is a visible increase and should be justified per package.
- CI runs `npm ci`, lint, typecheck, unit tests, build and Playwright on every
  pull request. Unit tests currently need no services and that should survive.

## Decision drivers

1. **The domain model is JSON-heavy.** §5.2 specifies **ten JSON columns across
   three tables**: `assessments` (`inputs_used`, `flags`,
   `missing_information`), `investors` (`funding_stage_focus`, `geographies`,
   `investment_objectives`, `impact_priorities`, `decision_criteria`,
   `visible_portfolio_scope`) and `investor_engagements` (`commitment_terms`).
2. **Mandate matching reads those columns.** §7.7 and criterion S8 require the
   portfolio to be mandate-matched by default. `matchesMandate()` in
   `core/investors/portfolio.ts` does this in memory over five rows today; with
   real data it becomes a predicate the database has to evaluate.
3. **Local developer friction is a schedule cost**, multiplied by everyone who
   is not WS2.
4. **Demo-day reliability.** A cold start or a paused database on the first
   request is an S1 failure in front of an audience.
5. **Analytics is not a demo requirement.** Fabric mirroring appears in §3 under
   Analytics, but no success criterion mentions reporting.

## Engine options

### Option A: PostgreSQL (Azure Database for PostgreSQL Flexible Server)

- `jsonb` stores the ten JSON columns natively, and a GIN index makes mandate
  predicates such as `geographies @> '["GA"]'` an indexed containment test
  rather than a scan.
- Matches the §4 architecture diagram.
- Local development is a single container that every workstream can run.
- `UNIQUE NULLS NOT DISTINCT` (PostgreSQL 15+) expresses the engagement
  uniqueness rule directly — see "Consequences for the schema" below.
- Fabric mirroring for Flexible Server reached general availability in April
  2026, including JSON and JSONB support, so the analytics path in §3 stays
  open.
- **Constraint discovered while writing this record:** Fabric mirroring does
  **not** support the Burstable compute tier, and mirrors at most 1,000 tables
  from PostgreSQL 14–18. The cheapest tier suitable for the hackathon is
  therefore not the tier that can mirror. Because analytics is not a success
  criterion, this is a later scale-up, not a migration — but it should be a
  conscious trade rather than a surprise.

### Option B: Azure SQL Database

- §3's Backend row ("SQL Server-compatible client") is the only explicit
  statement about the client library anywhere in the design, and it points here.
- Fabric mirroring is the more mature integration, with longer-standing support
  for private networking and failover.
- JSON is workable through `OPENJSON` and `JSON_VALUE`, but indexing a JSON path
  requires a computed column per path. With ten JSON columns feeding mandate
  matching, that is real additional schema surface.
- A unique index treats `NULL`s as equal, which happens to give the engagement
  rule the behaviour §5.2 describes without extra work — the opposite of
  PostgreSQL's default. This cuts in Azure SQL's favour and is worth naming.
- The serverless tier's auto-pause is attractive for cost and a hazard for
  demos: the first request after a pause pays a resume delay. If this option is
  chosen, auto-pause must be disabled before demo day.
- Local development means a SQL Server container, which is materially heavier
  than PostgreSQL for the workstreams that do not care about the database.

### Engine recommendation

**Option A, PostgreSQL.**

The MVP argument is drivers 1 and 2: two-thirds of the tables carry JSON, and
the one query the investor experience is built around reads those columns. But
the MVP is the weakest reason, because the MVP is eleven tables and will be
finished in days. The decision worth making is which engine this is still on in
two years.

#### The out-of-scope list is the roadmap

§2.2 defers live utility integration, grid dispatch, **real-time inverter
integration**, interconnection processing and REC settlement. None of that is
rejected — the product is called a virtual power plant, and every one of those
items is what a virtual power plant does once it stops being an origination
tool. They are deferred scope, and they are overwhelmingly time-series: meter
reads, generation curves, dispatch signals.

PostgreSQL absorbs that without an architecture change. TimescaleDB 2.23 and
native partitioning are available on Azure Database for PostgreSQL Flexible
Server today. Telemetry on Azure SQL means a second store, and a second store
means the first real distributed-systems problem this project would have.

#### Equity targeting is a geospatial problem

`sites` already carries latitude, longitude and a geocode confidence. The
investor model carries `impact_priorities`, and the investor types include
`energy_equity_fund`, `cdfi_cde`, `nmtc` and `special_community_endowment`.

Every one of those designations is decided by where a site falls on a map:
census tract, disadvantaged-community status, New Markets eligibility, utility
service territory. That is point-in-polygon work, not arithmetic on a
coordinate pair. PostGIS 3.6 is a supported extension on Flexible Server, is
what the entire GIS tool ecosystem speaks, and is how the shapefiles those
designations are published as get loaded at all. Azure SQL has spatial types,
but they are not PostGIS, and the data will not arrive in a form they prefer.

Nothing in the MVP needs this. The first investor who asks "which of these are
in a disadvantaged community?" does.

#### Who inherits this matters

A community-owned solar platform plausibly ends up open-sourced, donated to a
nonprofit or CDFI, or run by a municipality. PostgreSQL runs on every cloud, on
a laptop, and on managed platforms a two-person community organization can
afford. Azure SQL commits whoever inherits it to Azure and to SQL Server
licensing permanently. For software whose stated purpose is community
ownership, that is a design constraint, not only an operational one.

#### The strongest argument the other way

Azure SQL has **ledger tables**: cryptographically verifiable, tamper-evident
history. Three tables here are append-only by design — `assessments`,
`activity` and `acknowledgements` — and `acknowledgements` records a person
typing their name to signify agreement. If SunSum ever carries binding
commitments rather than §2.2's simulated signatures, verifiable audit stops
being a nice property.

This is a real advantage and PostgreSQL has no equivalent. It is outweighed
because binding commitments are explicitly out of scope, real signatures would
come from a third-party e-signature provider with its own audit trail, and
append-only enforcement is achievable in PostgreSQL with permissions and
triggers. It should be revisited if the product moves toward holding funds.

#### What this does not rest on

Not cost. The monthly difference is negligible and should not decide an
architecture. Not the hackathon demo. Not the current eleven tables, which port
either way.

## Persistence layer options

The engine choice does not settle how TypeScript talks to it.

| Option | For | Against |
| --- | --- | --- |
| **Drizzle ORM** | Schema is ordinary TypeScript, so the existing `as const` enum arrays can be the single source for the union type *and* the CHECK constraint. Migrations are plain reviewable `.sql`. No code generation step or engine binary in CI. Small dependency footprint. | Smaller ecosystem. Less hand-holding for contributors who do not know SQL. |
| **Prisma** | Best-in-class developer experience, introspection and Studio. Strong migration ergonomics for a mixed-experience team. | Adds a generate step and platform engine binaries to `npm ci` and CI. Schema lives in its own DSL, so the enum values would be declared in a third place. Heaviest option for a three-dependency repository. |
| **Raw `pg` with hand-written SQL** | Total control, smallest dependency surface, no abstraction to learn. | Every row mapping is hand-written and untyped at the boundary; migrations and drift become our problem. Most boilerplate per endpoint, and we have roughly thirty-five endpoints to go. |

### Persistence recommendation

**Drizzle.** The deciding argument is single-sourcing: §5.3 defines fifteen
enumerations, `src/backend/core/projects/types.ts` already declares several of
them as `as const` arrays with type guards, and Drizzle lets the same array
produce the column's CHECK constraint. Prisma would make that a third
declaration to keep in step. Plain `.sql` migration output also matches how this
repository reviews change — as evidence in a pull request.

If the team's SQL confidence is low, Prisma is the better answer and the schema
translates directly; this is a preference, not a correctness argument.

## Consequences for the schema

Adopting PostgreSQL makes seven modelling decisions explicit. They are recorded
here because they are the parts most likely to be got wrong quietly.

1. **Engagement uniqueness does not work as written.** §5.2 requires "one live
   engagement per investor per opportunity, unique on (`investor_id`,
   `project_id`, `funding_need_id`)", but `funding_need_id` is nullable and
   PostgreSQL treats `NULL`s as distinct in a unique index. A plain unique
   constraint therefore permits unlimited duplicate whole-project engagements.
   Use `UNIQUE NULLS NOT DISTINCT`, or two partial unique indexes split on
   `funding_need_id IS NULL`.
2. **Investor funding stages are not project stages.** §5.3 gives
   `investors.funding_stage_focus` the values `pre_development`, `development`,
   `construction`, `permanent`, while `projects.stage` is `pre_development`,
   `development`, `construction`, `commissioning`, `operations`. They overlap on
   three values and differ on three more. They are two enumerations and must be
   modelled as two, with an explicit mapping wherever they are compared.
   `funding_needs.stage` has **no enumerated values in §5.3 at all**; it is
   modelled here as the funding-stage enumeration, because mandate matching
   compares it against `funding_stage_focus`. This should be confirmed.
3. **Money is `numeric`, never a float.** `ticket_size_min`, `ticket_size_max`,
   `amount_requested`, `amount_committed` and `committed_amount` are currency.
   Binary floating point has already produced a visible rounding artefact in the
   portfolio capacity aggregate.
4. **Enumerations are `text` with a CHECK constraint, not native PostgreSQL
   enum types.** A value cannot be removed from a PostgreSQL enum, and adding
   one has transactional restrictions. A CHECK constraint is altered in a normal
   migration, and its value list can come from the TypeScript array.
5. **`documents` and `activity` each reference both a site and a project**, both
   nullable. Without a CHECK requiring exactly one parent, orphan rows attach to
   nothing and silently disappear from both timelines.
6. **`assessments` and `activity` are append-only.** An operator override
   inserts a new assessment rather than updating one, so every read of "the
   current assessment" is "the latest row for this site" and needs an index on
   `(site_id, created_at DESC)`. No update path should exist in code.
7. **Timestamps are `timestamptz`**, and `projects.visible_to_investors`
   defaults to `false` **in the database**, not only in application code. It is
   the flag that decides whether a project reaches an investor at all.

## Consequences for the application

- Persistence lands behind the store interfaces, one per service, following
  `ProjectStore`. Nothing above the store changes when the implementation does.
- Unit tests keep using in-memory fakes, so CI needs no database for them.
  Integration tests get a PostgreSQL service container and stay separate.
- A connection pool must be a `globalThis` singleton. Next.js hot reload
  otherwise creates a new pool per reload and exhausts a small server's
  connection limit during ordinary development.
- **A demo identity resolver plus a real database is the dangerous
  combination.** `handlers/identity/viewer.ts` returns an onboarded investor for
  every request, which is harmless against five fake projects and is not
  harmless against a populated database. Review of the portfolio pull request
  raised this twice. Failing closed outside an explicit demo mode is a
  prerequisite for connecting a real store, and is tracked separately from this
  record.

## Reversibility

The engine decision is contained by the store interfaces: swapping engines means
rewriting store implementations and the migrations, not the workflow rules,
handlers, routes or tests above them. The persistence-layer decision is smaller
still — the generated SQL is ordinary DDL and transfers to Prisma or to raw
`pg` with minor dialect edits.

What would be expensive to reverse is spreading SQL through handlers or core
rules. The import boundary in `eslint.config.mjs` already prevents the shape of
that mistake, and store interfaces keep the rest of it out.

## The two decisions are not independent

Choosing Azure SQL does not mean rewriting the schema against the same tool. It
means **losing the tool**. Drizzle ships PostgreSQL, MySQL, SQLite, SingleStore
and Gel dialects; there is no SQL Server dialect. Azure SQL therefore forces
Prisma or a raw `mssql` client as well.

What survives either way is the design — eleven tables, their columns,
relationships, indexes and the intent behind all twenty-nine constraints. That
lives in §5.2 and in this record, not in a tool.

What would have to be rewritten:

| | PostgreSQL today | Azure SQL equivalent |
| --- | --- | --- |
| Query layer | Drizzle | Prisma or raw `mssql` |
| JSON columns | `jsonb`, indexable | `nvarchar(max)` with `ISJSON` |
| Identifiers | `uuid` / `gen_random_uuid()` | `uniqueidentifier` / `NEWID()` |
| Timestamps | `timestamptz` | `datetimeoffset` |
| Booleans, text | `boolean`, `text` | `bit`, `nvarchar(max)` |
| "Exactly one parent" checks | `(x IS NOT NULL)::int + ...` | `CASE WHEN ... THEN 1 ELSE 0 END` |
| "Is a JSON array" checks | `jsonb_typeof(x) = 'array'` | `ISJSON` only; weaker |
| Case-insensitive email | Index on `lower(email)` | Computed column plus index |
| Idempotent seed | `ON CONFLICT DO UPDATE` | `MERGE` |
| Seed assertions | `DO $$ ... RAISE $$` | `IF ... THROW` |

One thing gets simpler: SQL Server treats NULLs as equal in a unique
constraint, so the duplicate-engagement problem that needs
`UNIQUE NULLS NOT DISTINCT` here would not arise.

One thing gets worse beyond the table: Prisma keeps its own schema language, so
the `as const` vocabulary arrays in `core/` could no longer generate the
database constraints. The single-source property — a stage cannot reach the
database without reaching TypeScript — is a Drizzle property, not a portable
one.

Estimated cost of the switch: roughly a day, and best spent now rather than
after a store implementation and several endpoints depend on it.

## Hosting

An Azure subscription is available, which settles open question 1. It does not
change the engine recommendation, because Azure Database for PostgreSQL
Flexible Server is a first-party Azure service exactly as Azure SQL Database is.
Neither resource provider is registered in the subscription today; both are a
free, self-service registration away. A subscription unblocks hosting, not
engine choice.

It does surface one honest argument for Azure SQL that was invisible while
hosting was hypothetical:

| | Azure SQL Database | PostgreSQL Flexible Server |
| --- | --- | --- |
| Free tier | Permanent, any subscription. 10 databases, 100,000 vCore-seconds and 32 GB each per month | B1ms free for 12 months, **new accounts only** |
| On an existing subscription | Still free | Roughly 13–15 USD per month for B1ms |
| Idle behaviour | Serverless, auto-pauses by default | Always on |

So on the subscription this team already has, Azure SQL is free indefinitely and
PostgreSQL is not. That is a real cost difference and it is recorded here rather
than argued away.

It does not change the recommendation, because cost is not what the
recommendation rests on — see
[the engine recommendation](#engine-recommendation), which turns on deferred
telemetry scope, geospatial equity targeting and who can run this in five years.
A difference of this size should not decide an architecture in either direction.

One operational note does matter for the demo rather than the decision: **the
free Azure SQL offer auto-pauses when idle**, which is the state any database
will be in when a live demo begins. Whichever engine is chosen, the demo should
not be the first request after a night of inactivity.

## Open questions

1. ~~Does the team have an Azure subscription available, and who owns it?~~
   **Answered: yes.** See [Hosting](#hosting) below. Which subscription the
   hackathon should use is still open — the one the CLI defaults to is a
   general corporate subscription, not a project one.
2. Confirm `funding_needs.stage` uses the funding-stage enumeration. §5.3 does
   not define its values.
3. Does any success criterion actually require Fabric mirroring during the
   hackathon? If not, Burstable is the right tier and mirroring waits.
4. Are demo accounts seeded users with `password_hash`, or Entra ID identities?
   §3 says Entra ID; §5.2 keeps a nullable `password_hash` "for the demo-role
   switch". Both cannot be the only mechanism.
5. §5.2's `sites` table has no `locality` or `region` column, but the merged
   `GET /portfolio` filters on region and `ProjectRecord` carries both fields.
   The schema adds them as geocoder output beside the coordinates; confirm that
   is where they belong, rather than on `projects`.
6. §5.3 does not enumerate `assessments.preliminary_project_type` or
   `investors.deal_room_profile`, so neither carries a `CHECK`. An unconstrained
   column is honest until the list exists; a guessed one rejects valid data.

## Verification

Claims in this record that could be tested were tested, against PostgreSQL 16 in
a local container. None of it has run against a hosted database, and CI has no
database, so none of it runs there.

| Claim                                              | How it was checked                                         |
| -------------------------------------------------- | ---------------------------------------------------------- |
| The schema is valid PostgreSQL                     | Generated migration applied to an empty database, exit 0    |
| The circular `sites` / `documents` reference works | `drizzle-kit` emits foreign keys as deferred `ALTER TABLE`  |
| Every constraint rejects what it should            | 19 adversarial probes, all passing, in `verify-constraints.sql` |
| Duplicate whole-project engagements are impossible | A second `funding_need_id IS NULL` row is rejected          |
| A project cannot default to investor-visible       | Row inserted without the column reads back `false`          |
| Money is not floating point                        | `information_schema` reports `numeric`                      |
| Timestamps are timezone-aware                      | No `timestamp without time zone` column exists              |
| The seed is idempotent                             | Run twice; identical row counts, assertions passing both times |

The `drizzle-kit` dependency tree carries four moderate advisories
(`esbuild`, GHSA-67mh-4wv8-2f99). They affect a running esbuild development
server, which this repository never starts. `drizzle-kit` is a development
dependency, and CI audits with `--omit=dev --audit-level=high`, which reports
zero vulnerabilities. The only fix offered is a downgrade to `drizzle-kit@0.18.1`,
a breaking change.
