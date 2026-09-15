# WS1 frontend foundation

## Scope and evidence

This increment implements a public landing page and the **New User / Create
Profile** workflow. It is a locally reviewable foundation, not the persisted,
deployed three-role MVP.

The revised MVP Team Charter, dated September 14, 2026, identifies Site Owner,
Platform Operator, and Financier/Investor experiences and the seven project
stages. Its Features A-G define the wider workflow; this contribution covers
Feature A and the profile-creation half of the origination journey. The
project's VPP flow board supplies the guided landing dialogue, the sign-in
sequence, the individual-versus-organisation split and the participant
taxonomy. The earlier SolarEase dashboard informs visual hierarchy only, not
financial or AI feature scope. Private source documents and screenshots are not
included in this repository.

Next.js, TypeScript, and Azure are the contributor's selected direction.
[pocketcalculator/sunsum-community-solar-virtual-power-plant#3](https://github.com/pocketcalculator/sunsum-community-solar-virtual-power-plant/issues/3)
proposes additional platform components; it is not evidence that they are
installed, approved, or required by this foundation.

## Implemented responsibility boundaries

```text
src/app routes and layout
  -> feature public interfaces (participation, onboarding)
    -> src/domain shared vocabulary
    -> src/components/ui primitives
    -> feature-local components, model and scoped styles

src/domain   roles, journey stages, participant taxonomy, guided intents
src/styles   tokens + minimal app globals, not business policy
```

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

**No credential enters the profile draft.** The password is validated in the
sign-in step and held only in that component's state, so it cannot reach the
draft, the review summary, anything serialised from it, or any log. It is
discarded when the flow finishes.

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
Before the first route needing different or authenticated chrome, move public
shell selection into an app-owned public route-group layout. Do not add
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

The WS2 workflow boundary may be a separately owned in-process Next.js module or
a separate service. That topology is not selected here. WS1 must not introduce
competing persistence, authorization, solar calculations, or device controls.

## Visual baseline

The shared visual direction is provisional until the UX handoff. It emphasizes
readable dark surfaces, clear headings, compact explanations, consistent
participation paths, and a visible next action. Illustration is decorative,
not telemetry or a representation of a real pilot.

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
boundary assertions remain fast and exercise the actual rules. Full service,
identity, persistence, and document tests belong to later integrated work.

## Delivery boundary

Ordinary `next build` and `next start` are the only hosting contract implemented.
No AppHost, container, Azure resources, standalone ZIP packaging, or production
secret configuration is supplied. WS3 must select and verify that contract
before deployment work is accepted.

No credentials or private data belong in public runtime configuration. Future
server-only exports must remain separate from client-safe public feature entries.
