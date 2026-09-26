---
title: SunSum Community Solar Virtual Power Plant
description: Community-owned virtual power plant software for the Microsoft 2026 Global Hackathon
---

## Start here

This release has **two deliberately separate interfaces**. The connected
workspace reads approved existing services. The interactive demo uses
fictional browser-local records. Neither is a substitute for the other.

| I want to... | Start with | Credentials |
| --- | --- | --- |
| See the interactive Sunroom demo | [Open the Pages demo](https://nicolassalazar-pro.github.io/sunsum-ui-demo/) | None; use fictional inputs |
| Run the demo locally | `npm ci`, `npm run build:demo`, then `npm run preview:demo` | None |
| Read existing project data | [Connect the existing application](docs/ws1/connection-and-deployment-guide.md#connect-existing-reads), then open `/app` | An approved existing participant session |
| Hand the app to its Azure owner | [Create the source package](docs/ws1/connection-and-deployment-guide.md#package-without-azure) | None to package |
| Find an integration point | [Connection index](docs/ws1/connections.md) or search `SUNSUM-CONNECTION:` | No secrets are stored in the index |

Use **Node 22.22.2 or newer in the Node 22 line, and npm 10**. Run commands
from the repository root. The local static preview opens at
`http://127.0.0.1:4183`; its output is `build/vibehub`, not the Next application.
These commands assume a full repository checkout. If you received the release
ZIPs, follow [the delivered-artifact instructions](docs/ws1/connection-and-deployment-guide.md#use-a-delivered-release-without-repackaging):
the application ZIP builds Next, while the separate demo ZIP is already compiled.

**Authenticated, permission-controlled workflow writes are not implemented
in this frontend release.** Existing backend write APIs have not been removed.
Demo submission, review, interest and notes are local simulations, not real
service actions. An unavailable connection is **out of reach right now**;
that does not mean another team has not built it.

The original Linux App Service source-ZIP deployment model is retained.
Infrastructure configuration, repository permissions and a working homepage
do not prove application-publishing authority or working participant identity.
If access is out of reach, deliver the package: do not create a replacement
resource, use demo sign-in, or place credentials in frontend configuration.

## Overview

SunSum is a Microsoft 2026 Global Hackathon project building software for a
community-owned solar virtual power plant. The original hackathon charter
describes a deployed prototype demonstrating one complete solar-project
origination journey across three roles:

1. A site owner selects a rooftop or land parcel, submits a potential solar
   site, and receives a preliminary viability result.
2. A platform operator reviews the submission, accepts it, rejects it, or asks
   for more information, then moves an accepted site through the pipeline.
3. A financier or investor views the pilot portfolio, opens a project's deal
   room, and reviews the viability and submission data behind it.

All three roles can track a project's development stage.

## Goals

These are the wider project goals, not a claim that this live-read release
implements every workflow below.

- Deliver one application URL with site-owner, platform-operator, and investor
  experiences
- Complete one new site submission live during the demo
- Show a transparent preliminary viability result and an operator review
  workflow
- Seed at least three Atlanta pilot sites in the operator pipeline and investor
  portfolio
- Share a project-status timeline across all three roles
- Provide an investor portfolio with at least one open deal room
- Support basic authentication or a reliable role switch for the demo
- Deliver an architecture diagram, README, and demo video

## Project journey

SunSum uses the following shared pipeline vocabulary:

`Submitted -> Screening -> Pre-development -> Development -> Construction -> Commissioning -> Operations`

The core demo follows a Sweet Auburn property owner from rooftop submission to
a preliminary "potentially viable" result. An operator reviews and accepts the
site, moves the resulting project into development, and the site owner sees the
updated status. An investor then finds the project alongside the seeded pilot
sites and opens its deal room to review the underlying viability data.

## Workstreams

Seven workstreams coordinate delivery of the three-role journey:

| Workstream | Primary ownership |
| --- | --- |
| Full-stack / Front-end | Role interfaces, intake, dashboards, form validation, and API integration |
| Backend / Workflow | System-of-record services, permissions, stage transitions, decisions, documents, and audit history |
| Azure / DevOps | Environments, deployment, identity, storage, configuration protection, logging, and health checks |
| Data / Solar-modeling | Screening rules, Atlanta pilot data, geocoding, capacity and production estimates, and viability factors |
| UX/UI | Accessible role journeys, screen specifications, reusable components, and interface states |
| QA / Demo | Acceptance testing, accessibility and mobile validation, bug triage, and submission materials |
| Project Management / Technical PM Agent | Cross-team coordination, the GroundSwell operator workflow, templates, and PM-agent development |

## Named stretch: AI-assisted underwriting

After the complete three-role journey works, a Special Community Endowment
reviewer may request an AI-generated first-pass underwriting summary from a
project's deal room. The draft uses already-collected project and viability
data, presents a recommendation, risk flags, and the data used, and remains
clearly labeled as AI-assisted. A human reviewer can accept, edit, or reject the
draft; it never commits capital or represents a final credit decision.

## Out of scope

The hackathon prototype does not include live Georgia Power integration, grid
dispatch, device or inverter control, utility interconnection processing, PPA
or off-taker matching, automated investor underwriting, capital-stack
management, REC settlement or tokenization, contractor procurement, production
legal agreements, final engineering feasibility, or multi-country
configuration.

## Project status

The public site, Sunroom demo and connected read interface share the original
SunSum design language. Data, authority and workflow commands are separated.
The selected WS2 read contracts are implemented in a browser-safe adapter;
actual connectivity still depends on the existing host, legitimate session,
permitted records and service configuration.

Available routes:

| Route   | Purpose                                                          |
| ------- | ---------------------------------------------------------------- |
| `/` | Public introduction, participation paths, About, journey and FAQ |
| `/need`, `/opportunity`, `/impact` | Community-first editorial pages |
| `/join` | Fictional participation preview; no password or account creation |
| `/app` | Existing-service read workspace; never falls back to demo records |
| `/concepts`, `/concepts/sunroom`, `/concepts/gridline` | Compatibility aliases to `/app`; no Gridline interface |
| `/dashboard/site-owner` | Dynamic alias to `/app?view=sites`; the original illustration remains in the static demo |
| `/dashboard/investor`, `/dashboard/operator` | Session-read portfolio and pipeline workspaces merged from `main`; they fall back to their illustrative sample when no session is present |
| Pages root | Synthetic Sunroom; `#/` opens the public landing |

`/join` accepts an optional `?start=` parameter so the landing page can open the
flow with a guided answer already selected. Unrecognised values are ignored.

The demo keeps deliberate manual workflows, 50 fictional fresh-start records,
map/list selection, scoped HTML/CSV exports and existing saved-scenario recovery.
The original owner illustration has ten predefined mock locations and is not a
forecast, geocoder or live project dashboard. No real utility, funding or
device action occurs.

Public participation choices describe intent, not account permissions. The live
role comes from `GET /api/me` and the existing signed session; a role selector or
query parameter never grants it. Live errors, unavailable data and expired
sessions remain visible rather than showing fictional success.

Theme preferences use the existing nonsensitive browser setting and semantic
tokens. Assistance is deterministic, typed guidance: no live model generation,
microphone, speech-to-text, TTS or hidden tool action. Optional learning is
distinct from an authenticated workflow and from human project support.

The public `/join` flow saves nothing and creates no account. In contrast,
the **synthetic Sunroom demo does save its fictional workflow in this browser**.
Do not enter real personal information. Live read data is ephemeral and
identity-scoped; it is never stored in the synthetic workflow.

Document metadata, original bytes, generated demo drafts and summary exports
are different artifacts. Metadata can exist without downloadable bytes.
Investor access stays within the existing disclosure tier; reading a project
does not express interest, unlock a deal room or commit funding.

See the [connection index](docs/ws1/connections.md) for each read family and
[contract register](docs/ws1/contracts.md) for source/version evidence.

**Azure Database for PostgreSQL Flexible Server with Drizzle ORM is the
selected persistence stack**, with Drizzle Kit for schema and migrations.
The implemented [PostgreSQL store](src/backend/db/README.md) is selected by
`SUNSUM_STORE=db` and configured with `DATABASE_URL` and `SUNSUM_DB_AUTH`.
The default remains the in-memory fixture store. The separate
[connection and migration tooling](src/backend/infrastructure/database/README.md)
uses `PG*` and `SUNSUM_DATABASE_AUTH`; those settings do not configure the
application adapter. The [development deployment guide](infrastructure/docs/deployment.md)
describes the current infrastructure test stack separately from the
[earlier PostgreSQL-backed smoke app](infrastructure/docs/deployment.md#earlier-database-backed-smoke-app).
Creating infrastructure does not activate the application store, establish
authenticated participants or verify a working three-role journey.

The visual baseline remains provisional, informed by earlier SolarEase mockups
and the project's VPP flow board. Hosting the preview does not establish a
persisted or authenticated three-role MVP. See the
[technical design](docs/sunsum_technical_design_doc.md) and
[resource-provider registration table](infrastructure/docs/README.md) for the
selected services and remaining infrastructure prerequisites.

## Application structure

| Path | Contains |
| --- | --- |
| `app/` | Routes, root layout and the shared `globals.css` |
| `src/domain/` | Shared vocabulary: roles, journey stages, participant types, guided prompts |
| `src/features/participation/` | Landing page, public shell and entry paths |
| `src/features/assistant/` | Browser-only guidance drawer, local replies and future instruction placeholder |
| `src/features/onboarding/` | The create-profile flow, its step model and validation |
| `src/features/community-context/` | Authored public stories, optional learning and VPP relationship education |
| `src/features/live-read/` | Bounded existing-service readers, response guards and permitted projections |
| `src/features/live-workspace/` | Ephemeral, identity-scoped read UI and navigation/download lifetimes |
| `src/features/design-lab/` | Isolated fictional Sunroom workflows and their browser-local store |
| `src/components/workspace/` | Controlled presentation shared without sharing data authority |
| `src/components/ui/` | Domain-neutral controls and form primitives |
| `src/styles/` | Design tokens and shared layout helpers |
| `tests/` | Unit, component, boundary and browser tests |
| `docs/ws1/` | Architecture boundaries and the contract register |
| `infrastructure/` | Templates, diagrams, infrastructure decisions and provider prerequisites |
| `scripts/New-UiRelease.ps1` | Clean-revision application/demo bundles and the separate operator handoff |

Routes compose a feature's public entry point. Features never import each
other's internals, and the domain layer depends on nothing above it. These
boundaries are enforced by ESLint and asserted in `tests/unit/architecture.test.ts`.

The assistant feature is split so a later AI integration does not require a UI
rewrite:

| Path | Responsibility |
| --- | --- |
| `src/features/assistant/components/Assistant.tsx` | Deterministic guidance launcher, drawer and typed replies |
| `src/features/assistant/components/Assistant.module.css` | Responsive drawer and composer styles using shared design tokens |
| `src/features/assistant/model/responses.ts` | Temporary deterministic replies for common conversation and participation topics |
| `src/features/assistant/content/instructions.md` | Documented placeholder for future server-side model instructions |
| `src/features/assistant/index.ts` | Public feature exports |

When an AI service is introduced, its route must load `instructions.md` on the
server and keep model credentials, private prompts and participant information
out of the browser bundle. The local response function is the intended
replacement boundary. The current preview does not interpret files, capture audio or send
conversation content anywhere.

This replaces the earlier single-page template and its `app/api/submit` echo
route; both were scaffolding for this interface rather than product behaviour.

## Local development

Use Node.js 22.22.2 or newer within the Node 22 release line, and npm 10.
No credentials or environment file are needed for the public foundation.

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. For a production-build check:

```sh
npm run build
npm run start
```

The lockfile pins versions and integrity without embedding a contributor's
registry/proxy URLs. npm resolves those locked versions through the configured
registry. Do not add credentials or a private registry address to `.npmrc`.

## Infrastructure deployment

**This is background for the infrastructure workstream, not the live-read
release procedure.** To ship this interface use the
[existing-host code-only guide](docs/ws1/connection-and-deployment-guide.md).
Do not run infrastructure apply or create a paid test stack as a workaround
for missing code-publishing access.

Start with the [infrastructure deployment guide](infrastructure/docs/deployment.md#infrastructure-deployment).
The current **Bicep and Azure CLI** entry creates or updates a separate dev-test
stack in an existing resource group: a **paid B1/Basic Linux App Service plan**,
fixture-backed web app, private Standard LRS Blob Storage and a new Entra-only
PostgreSQL server with an empty database. PostgreSQL and Storage are separately
billable. Test names remain in use; this is not a data copy or application rollout.

With PowerShell 7.2+ and Bicep CLI installed, run from the repository root:

```powershell
pwsh -NoProfile -File infrastructure/scripts/Deploy-Infrastructure.ps1
```

This default command compiles and validates locally; it makes no Azure calls.
The public parameters contain redacted tenant/administrator values. Before
using `-Preview` or `-Apply`, follow the guide's
[identity setup](infrastructure/docs/deployment.md#local-identity-setup) and
[commands](infrastructure/docs/deployment.md#commands). The local identity backup
is not loaded automatically. Preview is read-only; apply requires explicit
authorization and uses the same workflow for creation, updates and unchanged reruns.

Infrastructure deployment does **not** upload application code, run migrations,
grant runtime database access or activate the PostgreSQL-backed application store.
The web app remains `SUNSUM_STORE=mock`. Application code deploys separately:
pushes to `main` that touch application sources run the
[automatic code-deployment workflow](infrastructure/docs/deployment.md#automatic-deployment-from-main),
and the same
[code-deployment entry](infrastructure/docs/deployment.md#application-code-deployment)
packages, uploads and builds the application manually without reapplying
infrastructure.
Both commands default to [one shared dev config](infrastructure/config/dev.json).
Use the same `-ConfigPath` for both when targeting a local config; infrastructure
validation rejects a web-app name that differs from the compiled Bicep parameters.
Code deployment does not inspect or change the plan SKU; legacy provisioning
retains its F1 guard. See the [operating guide](infrastructure/docs/app-service-postgres.md)
for separately authorized network approvals, SQL bootstrap, sign-in and Blob grants.
No container registry or orchestration framework is required.

The [database guide](src/backend/infrastructure/database/README.md) documents
the separate operator environment contract, managed identity, dependency injection,
`npm run db:check`, and reviewed Azure migrations using main's canonical
`src/backend/db` SQL. Existing local database commands remain local-only.
These do not make `/join` persistent
or the demo portfolio authenticated.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm audit --omit=dev --audit-level=high
npx --yes markdownlint-cli2@0.18.1 "**/*.md" "#node_modules"
npx --yes prettier@3.6.2 --check "**/*.{json,yml,yaml}"
```

The browser suite starts its own production server on port 3117; run the build
first. If that port is occupied, set `PLAYWRIGHT_PORT` to an unused port. It
does not attach to or stop an unrelated existing server. Linux CI also installs
Chromium's system dependencies with `npx playwright install --with-deps chromium`.

Browser screenshots and reports are generated under `test-results` and
`playwright-report`, which are not source files. npm owns the generated lockfile
format; authored JSON/YAML remains covered by Prettier.

These checks exercise local source and interface behavior. Mocked contract
responses do not establish a real participant session, live service access,
complete accessibility conformance or production readiness.

See [architecture and extension boundaries](docs/ws1/architecture.md) before
adding a feature. Proposals should begin as a GitHub issue so assumptions,
scope, ownership, and acceptance criteria are visible before implementation.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. By
participating, you agree to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

Report security concerns privately according to [SECURITY.md](SECURITY.md).

## License

This project is licensed under the [MIT License](LICENSE).
