# WS1 frontend foundation

## Scope and evidence

This release has a transport-free synthetic Sunroom, an explicit mock-backed
server demo and a legitimate connected workspace. The dynamic modes reuse the
same service client for existing reads and one deliberate nonbinding-interest
command; other frontend business writes remain excluded. None of this
establishes a deployed three-role MVP.
See the [connection index](connections.md) and
[operator guide](connection-and-deployment-guide.md) for current entry paths.

The revised MVP Team Charter, dated September 14, 2026, identifies Site Owner,
Platform Operator, and Financier/Investor experiences and the seven project
stages. Its Features A-G define the wider workflow. The original foundation
covered the public introduction and fictional profile flow; this increment
adds the separate demo workspace and selected existing-service integration. The
project's VPP flow board supplies the guided landing dialogue, the sign-in
sequence, the individual-versus-organisation split and the participant
taxonomy. The earlier SolarEase dashboard informs visual hierarchy only, not
financial or AI feature scope. Private source documents and screenshots are not
included in this repository.

Next.js and TypeScript remain the frontend stack. The
[technical design](../sunsum_technical_design_doc.md) selects Azure Database
for PostgreSQL Flexible Server with Drizzle ORM and Drizzle Kit for server-side
persistence, and Linux App Service for web hosting. The preview has been
smoke-tested on F1. The implemented `PostgresBackendStore` is selected through
`SUNSUM_STORE=db` and uses `DATABASE_URL`/`SUNSUM_DB_AUTH`; the default fixture mode
still needs no database. The separate `PG*` connection and migration tooling is
not that application adapter. The [development deployment guide](../../infrastructure/docs/deployment.md)
records an Azure database-backed deployment, while provisioning a new environment
and authenticating real participants remain separate work. The browser-only
profile flow still saves nothing and requires no database credentials.

## Implemented responsibility boundaries

```text
src/domain shared vocabulary  (no dependencies above it)
app routes and layout
  -> public feature interfaces (participation, onboarding, community-context)
  -> app/app/WorkspaceEntry (client compositor; server-approved configuration)
    -> live-workspace -> live-read (authorized GETs + scoped interest POST)
    -> demo-auth public adapter (server-demo only)
    -> src/domain shared vocabulary
    -> src/components/ui primitives
    -> src/components/workspace controlled presentation
    -> feature-local components, model and scoped styles
static entry -> design-lab (synthetic store) + public feature interfaces

src/domain   roles, journey stages, participant taxonomy, guided intents
src/styles   tokens + minimal app globals, not business policy
```

Routes live in `app/` at the repository root, the location the project
scaffold established. Everything they compose lives under `src/`, reached
through the `@/*` alias, which maps only to `src`. Routes are therefore not
importable through the alias at all.

- Routes select and compose public feature interfaces. They own no business
  state, persistence or screening rules. `/join` validates its `?start=`
  parameter before handing it to the feature.
- `src/domain` is pure shared vocabulary. It imports nothing from routes,
  features, UI or services, so two features can share it without depending on
  each other.
- `features/participation` owns the landing page, public shell, three entry paths
  and the shared page-audio player/manifest. `community-context` owns authored
  stories and receives the player as a slot, not a deep sibling import.
  `features/onboarding` owns the create-profile flow: draft shape, validation,
  step machine and step components.
- `components/ui` contains only domain-neutral, browser-safe primitives that
  are actually used, including the shared form controls. It cannot import
  routes, features, domain vocabulary, service modules, Node built-ins or
  server-only framework APIs.
- CSS modules keep feature styles local. Semantic tokens provide the shared
  surface, typography, spacing, focus, and feedback language.
- Participant type is a display and routing concept, not an authentication or
  authorization policy.

**No credential enters the profile draft.** The fictional public flow does
not request a password or claim to create an account/code. Its no-save
behavior is different from the synthetic workspace's explicit local storage.

Both features' presentation and public entry points share the same static
Node/server-import restrictions as shared UI. The complete `node:` namespace is
rejected, including prefix-only APIs such as `node:sqlite`. App-owned recovery
pages may compose shared UI directly. These are tested static import/re-export
rules, not a security sandbox or proof of arbitrary future dynamic or
transitive import graphs.

The retained worktree's sibling-feature boundary remains strict. The only added
cross-feature composition exceptions target **public entries**, with these
exact consumer scopes:

| Consumer | Permitted public entry | Scope |
| --- | --- | --- |
| `src\features\live-workspace\` | `@/features/live-read`, `@/features/community-context` | Workspace orchestration only |
| `src\features\participation\`, `src\features\onboarding\` | `@/features/community-context` | Public learning/story composition |
| `src\features\design-lab\DemoLearning.tsx` | `@/features/community-context` | This file only |
| `src\features\design-lab\ComparisonView.tsx` | `@/features/site-owner-dashboard` | This file only |

Neither synthetic exception permits other `design-lab` files to import sibling
features. `ComparisonView` consumes the existing constants re-exported by the
site-owner dashboard's public entry instead of its former deep `mockDashboard`
import; the behavior and calculations are unchanged. None of these exceptions
permits private/deep feature imports, backend/driver imports or server-only APIs.

Positive and negative examples enforced by the root ESLint configuration:

| Import                                           | Result                        |
| ------------------------------------------------ | ----------------------------- |
| App route -> `@/features/onboarding`             | Allowed public interface      |
| Feature -> `@/domain/userTypes`                  | Allowed shared vocabulary     |
| Participation feature -> `@/features/onboarding` | Rejected cross-feature import |
| `DemoLearning.tsx` -> public `community-context` | Allowed file-specific composition |
| `ComparisonView.tsx` -> public `site-owner-dashboard` | Allowed file-specific composition |
| Another `design-lab` file -> either sibling above | Rejected; no directory-wide exception |
| `ComparisonView.tsx` -> private `mockDashboard` | Rejected private deep import |
| `DemoLearning.tsx` -> private story module | Rejected private deep import |
| App route -> `@/features/participation/paths`    | Rejected private deep import  |
| Shared UI -> `@/domain/roles`                    | Rejected upward dependency    |
| Domain -> `@/components/ui/Badge`                | Rejected upward dependency    |
| Shared UI -> `node:sqlite` or `next/headers`     | Rejected server dependency    |

Relative-path alternatives are covered too. Architecture tests call
`ESLint.lintText` against the real project configuration and an in-memory source
string, including file-specific positive/negative probes; there is no second
rule set or broken fixture on disk.

## Extension without coupling

Add modules when accepted behavior needs them, not to fill a directory diagram.
Public shell selection now lives in the app-owned `(public)` route-group
layout; `/app` has its own workspace chrome. Do not add
route-aware private/public conditionals to the participation shell. Preserve
public URLs, not-found recovery, and one main/skip target during that change.
The root layout stays neutral. The public group owns one audio provider and
injects the existing demo-session control only in admitted `server-demo`.

Owner, operator and investor pages are role-specific collection/detail/action
views within the shared `/app` workspace, reached through authorized dashboard
aliases. Filters are controls within those views, not a substitute for the UI.
Do not restore the legacy parallel dashboards or sample-on-failed-read behavior.

For the later MVP, distinguish cross-role assessment/project/document capability
views from intake/operator/investor workflows:

```text
app composition -> workflow public APIs
workflows -> capability public APIs + shared UI + agreed contracts
capabilities -> shared UI + agreed contracts/interfaces
shared UI/contracts -> no app or workflow imports
```

Workflows should not import one another's implementation. Assign each shared
runtime provider before a dependent feature is marked integrated. Introduce
cycle enforcement when additional real modules make it necessary; the initial
lint boundary is not a claim that every future dependency is already covered.

Keep one canonical machine-readable wire contract, agreed with WS2/WS4. The
contract register is a pointer and evidence log, not a parallel schema. Feature
view models and local state belong inside their features. Do not put workflow
rules into UI configuration, duplicate DTOs across roles, or accumulate unrelated
helpers in a generic utilities file.

The selected WS2 boundary is the existing same-origin Next route handlers.
WS1 introduces no competing persistence, authorization, solar calculation,
device control or intermediary proxy.

### Runtime mode boundary

`app\app\configuration.ts` reads server configuration through the pure
`src\domain\live-configuration.ts` resolver. `/app` and the public layout use
that same entry. Only public-safe mode/source/capability evidence reaches the
browser; signing/database values do not.
Its `source` values (`database-configured`, `mock-configured`, `not-confirmed`)
describe configuration, not observed deployment or authenticated participants.

| Mode | Admission | Session control |
| --- | --- | --- |
| Static `SYNTHETIC_DEMO_ONLY` | Vite `preview`; no API base or service imports | Fictional local role switching |
| `server-demo` | Explicit mock store, `SUNSUM_DEMO_AUTH=enabled`, configured signing, same-origin `/api` | Existing `DemoRoleSwitcher` adapter issues seeded demo sessions |
| `connected` | Explicit db store, demo auth disabled, configured signing, legitimate participant sign-in/mapping admission | Service-confirmed role only; seeded principals rejected |
| `unavailable` | Invalid/missing/mixed configuration | Honest unavailable state; never another data mode |

The dynamic source labels are **Connected workspace** (`connected`),
**Developer/demo mode** (`server-demo`) and **Connection unavailable**
(`unavailable`). The static entry does not inherit that service header.

`app\app\WorkspaceEntry.tsx` composes the session adapter via the frozen
`WorkspaceRoleControlBinding`. `LiveWorkspace` supplies the current role,
disabled state and start/settled lifetime callbacks; `WorkspaceShell` receives
optional `roleControl?: ReactNode` and `sourceMode` props while retaining its
existing required props. `sourceMode` accepts the three dynamic modes above;
omission defaults the presentation to `connected`, not service admission or
session switching. The public layout retains its
`demoControl` seam. Shared `RoleControl` stays pure presentation, with no
transport, backend or `next/navigation` dependency.

The dynamic workspace never reaches `design-lab/store`, its reducer or the
old fixture dashboard. The static entry never reaches live/session transport
or server modules. The narrow `live-workspace` orchestration exceptions use
only the public `live-read` and `community-context` entries, not private
feature internals.

The current dev infrastructure intentionally fixes `SUNSUM_STORE=mock`.
Do not change that guard to follow an AI-suggested GIS setup checklist.
Connected mode describes a separately approved environment, not an instruction
to turn fixture dev into a database deployment. The Blob selector is independent:
the source adapter defaults to memory and supports `SUNSUM_BLOB=azure` with
`AZURE_STORAGE_ACCOUNT_NAME`; source support is not observed cloud configuration.

Service `GET /api/me` remains the identity/role authority. `canAttemptInterest`
admits a narrow attempt, not a generic write grant. Read, export and original
download gates remain independent. Demo-session switching retires outstanding
reads/actions and refreshes identity; `router.refresh()` alone is insufficient.

The public `live-read` entry exposes `createWorkspaceClient` for scoped reads
and interest. The compatibility `createLiveReadClient` uses the same
implementation but forces interest off for legacy callers; do not create a
second transport to bypass that boundary. Both factories return `ReadResult`,
which callers must handle before using the client. Static consumers import neither.

Service state is ephemeral and actor/query/project scoped. An interest receipt
is separate from GET provenance. Post-dispatch uncertainty is retained and
reconciled with authorized reads, never automatic command replay. Canceled,
malformed, unauthenticated or denied reads cannot seed the synthetic store. Profile
drafts in the demo may be retained in memory across optional learning without
introducing new durable storage. Existing synthetic v1/v2 migrations and
corrupt-save recovery remain intact.

The static build explicitly rejects both dynamic modes/API configuration and injects only
its synthetic constants. Runtime import-graph tests complement lint boundaries;
neither is a claim of a sandbox against arbitrary future code.
`SYNTHETIC_DEMO_ONLY` is an artifact description, not a replacement for the
retained static environment spelling `SUNSUM_PUBLIC_DATA_MODE=preview`.
Static bare root and `#/` open the public landing; the fictional workspace has
the explicit `#/concepts/sunroom` entry, with `#/app` canonicalizing to it.
The landing's "Open Sunroom workspace" action uses `/app` without changing
Next's separate dynamic entry. The legacy static owner illustration retains
its separate hash route.

Static `DesignLab` places its single `RoleControl` immediately beside
`ThemeToggle` in the topbar's `data-header-appearance-row`, not the context bar.
Keep that compact pair together at narrow widths while other chrome reflows;
reuse the shared slider/drag/reduced-motion behavior, not another role control.

### Media boundary

One public-safe `pageAudioAssets.json` maps the three topic clips and their
measured properties. The Next routes and static compositor supply the existing
`PageAudioPlayer` to `PublicStoryPage`. One provider owns active/pending audio;
leaving a topic stops it and stale play promises cannot restart it.

Next resolves the root-served `/audio/...` paths; the static compositor supplies
its physical hosting base for `audio/...`, separately from hash navigation.
Keep `import.meta.env` out of shared Next-compatible code. There is no autoplay,
new media dependency or remote-song transport. See [media credits](media-credits.md)
for third-party licensing and exact-byte replacement. One public-safe
`docs\ws1\audio-credits.txt` supplies `AUDIO-CREDITS.txt` in both artifact roots;
packaging matches its bytes and the canonical manifest's titles/attributions.
This notice is not another media manifest.

### Backend GeoJSON map boundary

Future GIS work supports repeated lookup/enrichment for newly submitted or
changed sites feeding WS4 assessment, not merely a fixed parcel display.
Separate basemap/reference-layer caching, the parcel overlay and site-specific
enrichment; they have different rights, disclosure and freshness needs.

Parcel data remains backend-delivered GeoJSON `FeatureCollection` in EPSG:4326.
No parcel/admin/account credentials or parcel-access tokens reach the browser,
including short-lived/referer-bound tokens. A separate basemap-only,
referrer-restricted browser key is optional and conveys no parcel access;
no key or basemap/provider call is authorized now. Backend owners must evaluate
scoped API keys versus app/user OAuth against the actual ArcGIS product/tenant;
legacy `generateToken` results are not a blanket security-capability verdict.
See the [authentication options](connection-and-deployment-guide.md#backend-geojson-map-boundary).

PR71 is **OPEN** at `c6549bd`, proposing operator-only, no-query
`GET /api/sites/candidate-parcels` with default demo fixtures and the
[nullable snake_case property contract](contracts.md#new-upstream-handoffs-awaiting-admission).
It is not merged/live/admitted. `fetched_at`/`stale` is freshness metadata, not
a fixture/live source indicator. Keep candidate parcels separate from submitted
sites/projects unless an actual authorized join is provided.
`SUNSUM-CONNECTION:MAPS-LOCATION` remains the single admission/operation entry;
do not invent a map route, proxy, data grant or replacement backend. Current
presentation is `live-workspace\MapLimit.tsx` within `CollectionView.tsx`.
The existing `src\backend\viability` HTTP translator already feeds
`src\backend\core\sites` workflows. Its local input/output schema does not
establish actual WS4-tool agreement or conformance; backend/model/frontend must
confirm that handoff. GeoJSON display is not assessment or real viability proof.
Geometry/address and incomplete zoning/land-class coverage cannot substitute
for the model owner's required field/layer list.
Any bounded frontend fixtures remain fictional, not source-private parcels.

A hybrid cache with change-driven lookup or an agreed schedule is a proposal,
not an implemented refresh policy. Cadence remains unknown, with no default
frontend polling. Cache basemaps/reference layers only as provider terms and
licensing permit; do not assume a right to mirror them.

## Visual baseline

The selected direction is the original SunSum styling with Sunroom structure:
semantic light/dark surfaces, compact explanations and a visible next action.
Operator work leads, with pipeline facts below. A full-width map area sits
above the compact collection and adjacent desktop guidance. A fictional
diagram is never telemetry or a representation of permitted live geography.

Review keyboard/focus behavior, long text, narrow layouts, and reduced motion
alongside screenshots. A working screenshot or automated smoke test is not
evidence of complete usability or accessibility compliance.

Responsive grid minima are capped by available width rather than hiding
overflow. Tests exercise enlarged root text and the authored ordered-list role;
they are not a native Safari/VoiceOver audit. The "nothing is saved" wording is
stated where a person can act on it — on the flow, on the consent gate, and at
the end — rather than once at the top of the page.

Existing surfaces, states, branding and artwork consume semantic color tokens.
A source-contract test rejects direct palette/RGB use outside the token file.
The standalone favicon deliberately contains its own fixed dark-baseline colors
because it cannot inherit the page's CSS; revisit it with any approved rebrand.

An accepted WS5 design/component decision is the replacement trigger for this
provisional baseline. Adapt shared semantic components and tokens first; avoid
leaking library-specific APIs into every feature.

## Tooling decisions

| Dependency group                     | Reason                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------- |
| Next.js, React, React DOM            | App Router pages, routing, rendering, and UI                           |
| TypeScript and matching types        | Strict source checking and route typing                                |
| ESLint and Next configuration        | Framework rules and actual-module import boundaries                    |
| Vitest, Vite, jsdom, Testing Library | Focused contract/component checks in a browser-like test environment   |
| Playwright                           | Production-server public navigation, responsive smoke, and screenshots |

Exact application and test dependency versions live in the manifest/lockfile.
The pre-existing Markdown/JSON formatter versions remain explicit in the
repository workflow and README; moving those tools into the manifest is a
separate maintainer decision. Vitest and its Vite
peer are explicitly aligned; do not bypass peer or engine checks when upgrading.
`npm ci` is the reproducibility gate. The project registry is not hardcoded.

ESLint configuration loading has a separate bounded test setup budget; individual
boundary assertions remain fast and exercise the actual rules. Preserve backend
identity, persistence and document coverage during upstream reconciliation.
Frontend mocked reads complement it; they do not certify a remote participant session.

## Delivery boundary

Ordinary `next build` and `next start` remain the dynamic application's hosting
contract. WS3 previously recorded source ZIP deployment and remote build on
Linux App Service F1; this is historical evidence, not a deployment of this
increment. The
[infrastructure foundation](../../infrastructure/README.md) prepares separate
server-only Drizzle connections and Bicep/Azure CLI code delivery.
This UI release does not provision a database or connect an identity provider.
The source package, synthetic Pages bundle, authorized operations and
conditional cloud deployment have separate acceptance evidence. The inspected
source lineage is `db0c6a5d6e39fe7cf079dab27e9616189945cf6c`, not current main;
neither it nor a package hash is a deployed revision. The maintainer has merged
PR62 and upstream now includes additional API/dependency changes.
[Publication is held](../../README.md#upstream-reconciliation-hold) until the
coordinator reconciles those deltas and re-freezes contracts. Preserve current
source and infrastructure guards; no main push/merge, Azure deployment or
cloud-workflow dispatch is authorized by this workstream.

No credentials or private data belong in public runtime configuration. Future
server-only exports must remain separate from client-safe public feature entries.
