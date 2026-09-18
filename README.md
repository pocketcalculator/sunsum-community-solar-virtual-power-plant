---
title: SunSum Community Solar Virtual Power Plant
description: Community-owned virtual power plant software for the Microsoft 2026 Global Hackathon
---

## Overview

SunSum is a Microsoft 2026 Global Hackathon project building software for a
community-owned solar virtual power plant. By Friday, September 18, the project
aims to deliver a deployed prototype demonstrating one complete solar-project
origination journey across three roles:

1. A site owner selects a rooftop or land parcel, submits a potential solar
   site, and receives a preliminary viability result.
2. A platform operator reviews the submission, accepts it, rejects it, or asks
   for more information, then moves an accepted site through the pipeline.
3. A financier or investor views the pilot portfolio, opens a project's deal
   room, and reviews the viability and submission data behind it.

All three roles can track a project's development stage.

## Goals

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

This contribution introduces the **WS1 public frontend foundation** plus the
**New User / Create Profile** workflow, built with Next.js and TypeScript. It is
not the complete hackathon MVP.

Available routes:

| Route   | Purpose                                                          |
| ------- | ---------------------------------------------------------------- |
| `/`     | Value proposition, the three ways to take part, journey, and FAQ |
| `/join` | The guided create-profile workflow                               |
| `GET /api/portfolio` | Selected fixture or PostgreSQL store with a fixed demo investor |
| `/dashboard/site-owner` | Interactive site-owner dashboard design prototype |

`/join` accepts an optional `?start=` parameter so the landing page can open the
flow with a guided answer already selected. Unrecognised values are ignored.

`/dashboard/site-owner` implements the supplied location-selection, ROI
comparison, and allocation-card mockup using the existing Sunsum design tokens.
Its locations and financial figures are illustrative design data only. The
simulation control aggregates explicit mock return values for the selected
predefined locations; it is not a financial forecast or an accepted screening
model. A user can filter and select the supplied map locations or enter an
address as a local draft. Custom addresses remain marked as pending validation,
are excluded from the mock calculation, and receive no fabricated map
coordinate because no geocoder is connected.

The selector and comparison strip are generated from the same location
collection. The prototype includes ten predefined sites; the selection list
scrolls vertically and the comparison cards scroll horizontally as the
collection grows. Newly entered draft addresses immediately receive a pending
comparison card, keeping both views synchronized.

The comparison strip is also the per-location breakdown of the latest ROI
simulation. Cards included in that run are highlighted, their individual and
community return values add exactly to the headline totals, and changed
selections show a prompt to rerun before the comparison status changes.

The shared header offers light, dark, and system theme modes. The selected mode
is stored in the browser and all application surfaces consume the same semantic
design tokens.

The secondary header navigation exposes the three role workspaces: Site Owner,
Investor, and Platform Operator. Its labels, role IDs, and destinations are
defined in `src/features/participation/components/PublicShell.tsx` in the
`ROLE_NAV` collection. To connect a button to a new page, create the route under
`app/` and update that item's `href` in `ROLE_NAV`.

All role buttons are intentionally visible while authentication and participant
data are unavailable. When identity is connected, resolve the signed-in user's
authorized `ParticipantRoleId` values at the server boundary in
`app/layout.tsx`, then pass them to `PublicShell` through its `visibleRoleIds`
prop. Do not infer access from a hidden button: each role page and API must also
enforce the same authorization at its service boundary.

The public header also includes an **AI assistant** preview. It opens a
right-side guidance drawer with the same rooftop, land and funding entry paths,
plus deterministic replies for basic greetings and questions. This preview does
not call an AI model or any remote service. Speech-to-text uses the browser's
speech-recognition capability when available. A person can choose a local file
and remove it from the composer, but the application only displays its name: it
does not read, upload or retain the file.

**Nothing is saved.** The flow validates every answer and shows the assembled
profile back to you, but no account is created, no request leaves the browser,
and no value is persisted. The wire format is not settled yet, so the summary is
a local review rather than a preview of a request. The three federated sign-in
options are shown as unavailable because no identity provider is connected. A
password is validated in the browser, is never written into the profile draft or
the summary, and is discarded when the flow finishes; a browser password manager
may still offer to remember it, as on any sign-up form.

Site submission, screening, persistence, operator decisions, private documents,
and investor authorization require the backend and domain handoffs described in
[the contract register](docs/ws1/contracts.md).

**Azure Database for PostgreSQL Flexible Server with Drizzle ORM is the
selected persistence stack**, with Drizzle Kit for schema and migrations.
The implemented [PostgreSQL store](src/backend/db/README.md) is selected by
`SUNSUM_STORE=db` and configured with `DATABASE_URL` and `SUNSUM_DB_AUTH`.
The default remains the in-memory fixture store. The separate
[connection and migration tooling](src/backend/infrastructure/database/README.md)
uses `PG*` and `SUNSUM_DATABASE_AUTH`; those settings do not configure the
application adapter. The [development deployment guide](infrastructure/docs/deployment.md)
records an Azure PostgreSQL-backed deployment. That evidence is separate from
the public frontend smoke test and does not establish authenticated participants
or verify every prepared provisioning path.

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
| `src/components/ui/` | Domain-neutral controls and form primitives |
| `src/styles/` | Design tokens and shared layout helpers |
| `tests/` | Unit, component, boundary and browser tests |
| `docs/ws1/` | Architecture boundaries and the contract register |
| `infrastructure/` | Templates, diagrams, infrastructure decisions and provider prerequisites |

Routes compose a feature's public entry point. Features never import each
other's internals, and the domain layer depends on nothing above it. These
boundaries are enforced by ESLint and asserted in `tests/unit/architecture.test.ts`.

The assistant feature is split so a later AI integration does not require a UI
rewrite:

| Path | Responsibility |
| --- | --- |
| `src/features/assistant/components/Assistant.tsx` | Launcher, drawer, conversation, local file picker and speech-to-text controls |
| `src/features/assistant/components/Assistant.module.css` | Responsive drawer and composer styles using shared design tokens |
| `src/features/assistant/model/responses.ts` | Temporary deterministic replies for common conversation and participation topics |
| `src/features/assistant/content/instructions.md` | Documented placeholder for future server-side model instructions |
| `src/features/assistant/index.ts` | Public feature exports |

When an AI service is introduced, its route must load `instructions.md` on the
server and keep model credentials, private prompts and participant information
out of the browser bundle. The local response function is the intended
replacement boundary. The current preview does not interpret selected files or
send conversation content anywhere.

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

### Infrastructure preparation

The [infrastructure runbook](infrastructure/docs/app-service-postgres.md)
uses **Bicep and Azure CLI** for F1 Linux App Service code deployment and
separately billable PostgreSQL and Standard LRS private Blob containers.
Approved internal/guest sign-in and container-scoped Blob grants are separate
administrator-gated steps. No container registry or new orchestration framework
is required. Templates and local checks do not authorize or establish cloud
provisioning. Python viability and deployed logging/health configuration remain
pending, as do user-to-business-role mapping and document upload/download services.

The [database guide](src/backend/infrastructure/database/README.md) documents
the shared environment contract, managed identity, dependency injection,
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

These checks exercise the public foundation. They do not establish a working
three-role backend, complete accessibility conformance, hosted CI success, or
production readiness.

See [architecture and extension boundaries](docs/ws1/architecture.md) before
adding a feature. Proposals should begin as a GitHub issue so assumptions,
scope, ownership, and acceptance criteria are visible before implementation.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. By
participating, you agree to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

Report security concerns privately according to [SECURITY.md](SECURITY.md).

## License

This project is licensed under the [MIT License](LICENSE).
