---
title: SunSum Community Solar Virtual Power Plant
description: Community-owned virtual power plant software for the Microsoft 2026 Global Hackathon
---

## Upstream reconciliation hold

The repository maintainer merged [PR62](https://github.com/pocketcalculator/sunsum-community-solar-virtual-power-plant/pull/62)
at **2026-09-21 21:12:03 UTC**. The upstream head observed afterward is
[`f77ee120d9101034696af990eecb0e59aeb0545c`](https://github.com/pocketcalculator/sunsum-community-solar-virtual-power-plant/commit/f77ee120d9101034696af990eecb0e59aeb0545c).
The integration coordinator did not initiate that merge, push main or deploy Azure.
This work is a follow-up to externally merged PR62, not an attempt to keep it
open or reverse its merge. Backend pin changes await immutable contract review.

Upstream now also includes PR66, PR67 profiles, PR69 operator sign-up-list reads,
PR70 project-document APIs, Vite 8.3.0, `@types/node` 26.6.1 and `azure/login`
3.1.0. The earlier infrastructure-only-delta assumption is superseded.
**Publication is held pending reconciliation direction and re-frozen current-main
contracts.** Preserve this integration worktree; the desired UI/audio/interest
amendments remain, but no newer operation, dependency or workflow is adopted
automatically. The documentation below describes the retained worktree, not
confirmed parity with upstream or a deployed service.

## Start here

SunSum has **three explicit data experiences**, delivered as a Next application
and a separate static demo. A failed or unconfigured service never becomes
fictional success.

| I want to... | Start with | Credentials |
| --- | --- | --- |
| See the interactive Sunroom demo | [Open the Sunroom workspace](https://nicolassalazar-pro.github.io/sunsum-ui-demo/#/concepts/sunroom) | None; use fictional inputs |
| Run the static synthetic demo | [Static quick start](docs/ws1/connection-and-deployment-guide.md#static-synthetic-quick-start) | None; no service or session transport |
| Exercise the existing APIs with fictional records | [Server-demo quick start](docs/ws1/connection-and-deployment-guide.md#server-demo-quick-start) | No service credentials; explicit mock store and local demo-session signing |
| Use permitted existing project data | [Connected quick start](docs/ws1/connection-and-deployment-guide.md#connected-quick-start), then `/app` | Existing approved sign-in, participant mapping and current authorized identity |
| Hand the app to its Azure owner | [Create the source package](docs/ws1/connection-and-deployment-guide.md#package-without-azure) | None to package |
| Find an integration point | [Connection index](docs/ws1/connections.md) or search `SUNSUM-CONNECTION:` | No secrets are stored in the index |

Use **Node 22.22.2 or newer in the Node 22 line, and npm 10**. Run commands
from the repository root. The local static preview opens at
`http://127.0.0.1:4183`; its output is `build/vibehub`, not the Next application.
These commands assume a full repository checkout. If you received the release
ZIPs, follow [the delivered-artifact instructions](docs/ws1/connection-and-deployment-guide.md#use-a-delivered-release-without-repackaging):
the application ZIP builds Next, while the separate demo ZIP is already compiled.

The dynamic workspace reuses current GETs and admits **one deliberate business
command: `POST /api/projects/{id}/engagements` with `{}`**. It records nonbinding
project interest; it neither commits nor transfers funds. Only explicit
mock-backed `server-demo` also mounts the existing
`POST /api/auth/demo-switch` adapter. No other frontend business/session writes
are added. The static demo's submission, review, interest and notes remain
browser-local simulations.

`SUNSUM_PUBLIC_DATA_MODE=server-demo` requires `SUNSUM_STORE=mock`,
`SUNSUM_DEMO_AUTH=enabled` (not `true`), configured signing and same-origin
`/api`. Connected mode requires the database store, demo auth disabled and
legitimate sign-in admission. Selecting a mode or role is not a grant.
The current infrastructure-controlled dev target intentionally remains
fixture-backed. Do not switch it to `SUNSUM_STORE=db` as a GIS/UI fix;
the connected setup is for a separately approved database-backed environment.
The `/app` source labels are **Connected workspace** (`connected`),
**Developer/demo mode** (`server-demo`) and **Connection unavailable**
(`unavailable`); the labels do not change the configuration values.
An unavailable connection is **out of reach right now**, not evidence that its
owner has not implemented it.

Inspected contract lineage:
[`db0c6a5`](https://github.com/pocketcalculator/sunsum-community-solar-virtual-power-plant/commit/db0c6a5d6e39fe7cf079dab27e9616189945cf6c).
That is the original inspected application/API lineage, **not current main**
or proof of a deployed service or successful participant session. New upstream
contracts require reconciliation before publication. No main push/merge,
cloud-workflow dispatch or Azure deployment is authorized by this handoff.

The original Linux App Service source-ZIP deployment model is retained.
Infrastructure configuration, repository permissions and a working homepage
do not prove application-publishing authority or working participant identity.
If connected access is out of reach, deliver the package: do not create a
replacement resource, switch to demo sign-in or put credentials in frontend
configuration.

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

These are the wider project goals, not a claim that this scoped integration
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

The public site, Sunroom demo and dynamic workspace share the original
SunSum design language. Data, authority and workflow commands are separated.
The selected WS2 reads and scoped interest use one browser-safe service client;
actual connectivity still depends on the existing host, legitimate session,
permitted records and service configuration.
Session authentication (PR27) is implemented; operator override (PR41) is
source-verified, not just merged. Neither proves configured production sign-in or real WS4/model
results. See the [source/runtime distinction](docs/ws1/contracts.md#merged-service-code-and-runtime-evidence).
New upstream [profile/document handoffs](docs/ws1/contracts.md#new-upstream-handoffs-awaiting-admission)
do not automatically enable profile creation or uploads in this UI. Eligible
tier-one project-document downloads are a service capability requiring separate
frontend reconciliation, not proof of operational storage.
Profile 201 is an intake receipt, not an account/session/grant, and a null
derived role is valid. Project-original GET is implemented upstream but may
return 404 without separately uploaded bytes; no upload write is added here.

Available routes:

| Route   | Purpose                                                          |
| ------- | ---------------------------------------------------------------- |
| `/` | Public introduction, participation paths, About, journey and FAQ |
| `/need`, `/opportunity`, `/impact` | Community-first stories with deliberate playback of the three approved clips |
| `/join` | Fictional participation preview; no password or account creation |
| `/app` | Explicit connected or mock-backed server-demo workspace; never a failed-live fallback |
| `/concepts`, `/concepts/sunroom`, `/concepts/gridline` | Compatibility aliases to `/app`; no Gridline interface |
| `/dashboard/site-owner` | Dynamic alias to `/app?view=sites`; the original illustration remains in the static demo |
| `/dashboard/operator`, `/dashboard/investor` | Authorized-view aliases to `/app`, not role changes or sign-in |
| Pages bare root and `#/` | Public landing |
| Static `#/concepts/sunroom` (`#/app` alias) | Explicit fictional Sunroom workspace, reached through the landing's "Open Sunroom workspace" action |

The role-specific interfaces are our shared `/app` workspace plus authorized
dashboard aliases: owner sites/requests, operator submissions/pipeline, and
investor portfolio/engagement/detail. Filters support those views; filters alone
are not the role UI. Do not copy legacy dashboards or their sample-on-failure
loaders into the integrated experience.

`/join` accepts an optional `?start=` parameter so the landing page can open the
flow with a guided answer already selected. Unrecognised values are ignored.

The demo keeps deliberate manual workflows, 50 fictional fresh-start records,
map/list selection, scoped HTML/CSV exports and existing saved-scenario recovery.
The original owner illustration has ten predefined mock locations and is not a
forecast, geocoder or live project dashboard. No real utility, funding or
device action occurs.

Public participation choices describe intent, not account permissions. The live
role comes from `GET /api/me` and the existing signed session. Connected mode
has a service-confirmed role indicator, not seeded sign-in. Server-demo's
explicit session switch retires old reads/actions and refreshes identity.
Known seeded identities are not admitted as connected participants. Errors,
unavailable data and expired sessions never become fictional success.

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
does not express interest, unlock a deal room or commit funding. The deliberate
interest command requires fresh investor/project/onboarding checks. An ambiguous
post-dispatch outcome stays **unknown** and reconciles through authorized GETs,
never automatic replay; an empty reconciliation is not proof of failure.

See the [connection index](docs/ws1/connections.md) for each connection family and
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
| `src/features/participation/` | Landing page, public shell, approved audio/player and entry paths |
| `src/features/assistant/` | Browser-only guidance drawer, local replies and future instruction placeholder |
| `src/features/onboarding/` | The create-profile flow, its step model and validation |
| `src/features/community-context/` | Authored public stories, optional learning and VPP relationship education |
| `src/features/live-read/` | Bounded service client, GET projections and the narrow interest command |
| `src/features/live-workspace/` | Identity/query/interest lifetimes, permitted presentation and navigation/download state |
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
Sibling-feature composition is deny-by-default apart from the
[named public-entry exceptions](docs/ws1/architecture.md#implemented-responsibility-boundaries).
The synthetic `DemoLearning.tsx` and `ComparisonView.tsx` exceptions are
file-specific, not permission for all `design-lab` siblings.

### Where to edit

| Change | Primary location |
| --- | --- |
| Authored Need/Opportunity/Impact copy | `src\features\community-context\content\stories.ts` |
| Public routes/chrome/audio composition | `app\(public)\` and `src\features\participation\components\PublicShell.tsx`; root layout stays neutral |
| Shared role visuals and interaction | `src\components\workspace\RoleControl.tsx` and its CSS module |
| Explicit mock-session switching | `src\features\demo-auth\components\DemoRoleSwitcher.tsx`; compose through `app\app\WorkspaceEntry.tsx` |
| Source-mode admission | `src\domain\live-configuration.ts`; server entry `app\app\configuration.ts` |
| Accepted methods/roles/capabilities | **Only** `src\domain\connections.ts`; see its [human index](docs/ws1/connections.md) |
| Typed workspace client / compatibility reader | Public `src\features\live-read\index.ts`: `createWorkspaceClient`; `createLiveReadClient` retains read-only compatibility and forces interest off |
| Wire filters and interest lifetime | `src\domain\workspace-filters.ts`, `src\features\live-read\client.ts`, `src\features\live-workspace\useProjectInterest.ts` |
| Service workspace presentation | `src\features\live-workspace\WorkspaceShell.tsx` and role/detail views |
| Fictional workflow and separate routes | `src\features\design-lab\DesignLab.tsx`, its `routing.ts`, and `static\main.tsx` |
| Dynamic route normalization | `src\domain\workspace-routes.ts` |
| Backend GeoJSON map handoff (endpoint not yet admitted) | `SUNSUM-CONNECTION:MAPS-LOCATION` in the sole registry; current unavailable presentation is `src\features\live-workspace\MapLimit.tsx`, composed by `CollectionView.tsx` |
| Clip metadata and exact bytes | `src\features\participation\content\pageAudioAssets.json` and `public\audio\{need,opportunity,impact}.mp3` |

Future GIS integration needs repeated site-specific lookup/enrichment for newly
submitted or changed sites feeding WS4 assessment, not just a fixed parcel
overlay. Basemap/reference-layer caching, parcel display and site enrichment
are separate concerns. PR71 is **OPEN** at `c6549bd`, proposing operator-only
`GET /api/sites/candidate-parcels` with no query parameters and default demo
GeoJSON. It is not merged/live/admitted; immutable contract review remains.
Its freshness metadata does not identify fixture versus live source.
Parcel credentials/tokens remain
backend-only. A separate basemap-only, referrer-restricted browser key is an
optional distinction, **not authorized key use or a provider call here**.
Geometry/address are not complete viability inputs; the WS4 required field/layer
list and actual tool conformance remain unconfirmed. Cadence is unspecified,
and caching remains subject to provider terms, not a mirror right.
See the [map handoff](docs/ws1/connection-and-deployment-guide.md#backend-geojson-map-boundary);
private parcels are not public demo or release assets.

### Public audio

The three topic pages use the supplied, publication-approved clips. Play/Pause
and Mute/Unmute are independent; navigation stops playback. There is no autoplay,
loop/restart, microphone or remote music provider. A media failure leaves the
story readable. Static URLs stay under the actual hosting prefix.

The [public media manifest](src/features/participation/content/pageAudioAssets.json)
contains measured byte counts, SHA-256 and audio properties, not mailbox or
attachment evidence. Both ZIPs must match it exactly; packagers neither download
nor replace missing media. Read [media credits and replacement steps](docs/ws1/media-credits.md)
before changing a clip. **These third-party recordings are not MIT-licensed code.**
The [portable notice](docs/ws1/audio-credits.txt), with the manifest's current
public attributions, must travel byte-identically in both ZIPs as
`AUDIO-CREDITS.txt`; the code-only static `LICENSE.txt` is not an audio license.

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
This retained worktree restores three transitive lock entries from predecessor
`42e2551` for approved-feed reproducibility and keeps its pre-reconciliation
direct-dependency manifest. It is not byte-for-byte current main; newer upstream
dependency changes remain under review, with no blanket vulnerability-remediation
claim. See the
[reproducibility note](docs/ws1/connection-and-deployment-guide.md#dependency-reproducibility).

## Infrastructure deployment

**This is background for the infrastructure workstream, not this integration's
release procedure.** To hand off this interface use the
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

Project code is licensed under the [MIT License](LICENSE). The three supplied
third-party audio excerpts are excluded from that license; their rights remain
with their owners. The user's publication-clearance attestation covers the
selected website, repository and bundle copies, not a transfer of copyright or
an independent legal certification. See [media credits](docs/ws1/media-credits.md).
The distributable terms and attributions are in [audio-credits.txt](docs/ws1/audio-credits.txt).
