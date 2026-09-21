# WS1 frontend foundation

## Scope and evidence

This release extends the original public foundation with the Sunroom demo
and a separate existing-service read interface. It does not implement the
connected business-workflow writes or establish a deployed three-role MVP.
See the [connection index](connections.md) and
[operator guide](connection-and-deployment-guide.md) for current entry paths.

The revised MVP Team Charter, dated September 14, 2026, identifies Site Owner,
Platform Operator, and Financier/Investor experiences and the seven project
stages. Its Features A-G define the wider workflow. The original foundation
covered the public introduction and fictional profile flow; this increment
adds the separate demo workspace and selected existing-service reads. The
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
  -> live-workspace -> live-read (existing authorized GET operations)
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
- `features/participation` owns the landing page and the three entry paths.
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

Examples enforced by the actual root ESLint configuration:

| Import                                           | Result                        |
| ------------------------------------------------ | ----------------------------- |
| App route -> `@/features/onboarding`             | Allowed public interface      |
| Feature -> `@/domain/userTypes`                  | Allowed shared vocabulary     |
| Participation feature -> `@/features/onboarding` | Rejected cross-feature import |
| App route -> `@/features/participation/paths`    | Rejected private deep import  |
| Shared UI -> `@/domain/roles`                    | Rejected upward dependency    |
| Domain -> `@/components/ui/Badge`                | Rejected upward dependency    |
| Shared UI -> `node:sqlite` or `next/headers`     | Rejected server dependency    |

Relative-path alternatives are covered too. Architecture tests call
`ESLint.lintText` against the real project configuration and an in-memory source
string; there is no second rule set or broken fixture on disk.

## Extension without coupling

Add modules when accepted behavior needs them, not to fill a directory diagram.
Public shell selection now lives in the app-owned `(public)` route-group
layout; `/app` has its own workspace chrome. Do not add
route-aware private/public conditionals to the participation shell. Preserve
public URLs, not-found recovery, and one main/skip target during that change.

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

The Next `/app` entry reaches browser-safe read adapters and live presentation,
never `design-lab/store`, its reducer, demo sign-in or the old fixture dashboard.
The static entry reaches the synthetic feature, never the live transport or
server modules. Both reuse pure role/collection presentation under
`src/components/workspace`; those components do not own credentials, workflow
state or services.

`SUNSUM_PUBLIC_DATA_MODE=connected` admits only a configured attempt. The
server projects safe eligibility flags after checking the existing store,
demo-auth setting, session-configuration presence and explicit owner
sign-in/mapping handoff. Service `GET /api/me` remains the authority. No
browser role or configuration flag grants access.

Live state is ephemeral and identity/project scoped. Canceled, malformed,
unauthenticated or denied reads cannot seed the synthetic store. Profile
drafts in the demo may be retained in memory across optional learning without
introducing new durable storage. Existing synthetic v1/v2 migrations and
corrupt-save recovery remain intact.

The static build explicitly rejects connected configuration and injects only
its synthetic constants. Runtime import-graph tests complement lint boundaries;
neither is a claim of a sandbox against arbitrary future code.

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
boundary assertions remain fast and exercise the actual rules. Existing
backend identity, persistence and document suites remain unchanged. Frontend
mocked reads complement them; they do not certify a remote participant session.

## Delivery boundary

Ordinary `next build` and `next start` remain the dynamic application's hosting
contract. WS3 previously recorded source ZIP deployment and remote build on
Linux App Service F1; this is historical evidence, not a deployment of this
increment. The
[infrastructure foundation](../../infrastructure/README.md) prepares separate
server-only Drizzle connections and Bicep/Azure CLI code delivery.
This UI release does not provision a database or connect an identity provider.
The source package, synthetic Pages bundle, authorized reads and conditional
cloud deployment have separate acceptance evidence.

No credentials or private data belong in public runtime configuration. Future
server-only exports must remain separate from client-safe public feature entries.
