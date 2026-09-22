---
title: SunSum Community Solar Virtual Power Plant
description: Community-owned virtual power plant software for the Microsoft 2026 Global Hackathon
---

## Start here

SunSum combines public community-solar stories with one role-specific Sunroom
workspace. Choose the data experience deliberately: a failed service connection
never becomes fictional success.

| Experience | Start | Data and authority |
| --- | --- | --- |
| Static synthetic demo | [Local quick start](docs/ws1/connection-and-deployment-guide.md#static-synthetic-quick-start) or [published demo](https://nicolassalazar-pro.github.io/sunsum-ui-demo/) | Fictional browser-local workflows; no session/API transport |
| Developer/demo mode | [Explicit server-demo setup](docs/ws1/connection-and-deployment-guide.md#server-demo-quick-start), then `/app` | Mock store, configured test signing and deliberate seeded-session switching |
| Connected workspace | [Approved connected setup](docs/ws1/connection-and-deployment-guide.md#connected-quick-start), then `/app` | Database-backed configuration, legitimate sign-in/mapping and current service authorization |

Use **Node 22.22.2+ within major 22 and npm 10**, following `package.json` and
the committed lockfile. From a full checkout, restore with `npm ci`.
The [guide](docs/ws1/connection-and-deployment-guide.md) contains complete,
credential-free examples; the application ZIP and compiled static ZIP have
[separate use instructions](docs/ws1/connection-and-deployment-guide.md#use-a-delivered-release-without-repackaging).

The current dev target is intentionally fixture-backed and infrastructure-guarded.
Use explicit server-demo locally; do not switch dev to `SUNSUM_STORE=db` as a
GIS/UI fix. Connected setup is for a separately approved environment.

## Frontend scope

The dynamic workspace uses existing authorized GETs and **one deliberate business
command: `POST /api/projects/{id}/engagements` with `{}`**. Interest is nonbinding:
it neither commits nor transfers funds. Only explicit `server-demo` also mounts
the existing `POST /api/auth/demo-switch` adapter.

| Enabled in this frontend | Not enabled merely because backend APIs exist |
| --- | --- |
| Owner sites/outstanding requests; operator submissions/pipeline; investor portfolio/profile/engagement/deal-room reads | Participant-profile submission and operator sign-up/contact-list reads |
| Separately admitted site-original downloads for permitted owner/operator roles, plus normalized exports | Project-original downloads, registration or byte uploads; no GET project-document-list endpoint exists |
| Scoped investor interest after fresh identity, onboarding, portfolio and engagement checks | Candidate-parcel/GIS reads, provider calls, screening/override, review/stage changes or financial execution |

The public `/join` flow is a **no-save preview**, not an account or session.
Its `ProfileDraft` no longer collects an account method or password; a future
save needs an explicit UX/contract decision, not a mechanical snake_case
conversion or invented sign-in choice. Backend intake 201 and nullable derived
roles do not grant workspace access. Preview-role mapping is not authorization.

In contrast, synthetic Sunroom saves its fictional workflow in this browser.
Fresh scenarios have 50 fictional records; existing saved scenarios are preserved.
Do not enter real personal information. Service data remains ephemeral and
actor-scoped, separate from demo storage. Unknown/denied/expired results stay
visible; never restore sample-on-service-failure loaders.

Original bytes, document metadata, generated demo drafts and summary exports
are distinct. Interest confirmation may enable an eligible deal-room read, not
a new document route. A post-dispatch timeout/network loss has **unknown outcome**:
reconcile with authorized GETs, never automatic replay or an assumed rollback.

See the [connection index](docs/ws1/connections.md) for the ten families and
the [contract register](docs/ws1/contracts.md) for implemented backend
capabilities versus frontend admission.

## Routes and controls

| Route | Purpose |
| --- | --- |
| Dynamic `/`, `/need`, `/opportunity`, `/impact` | Public landing and canonical community-first stories |
| `/join` | Fictional, unsaved participation preview; optional bounded `?start=` guidance |
| `/app` | Shared dynamic workspace; role comes from the existing service |
| `/dashboard/site-owner`, `/dashboard/operator`, `/dashboard/investor` | Authorized aliases to the appropriate `/app` view, not sign-in or role grants |
| Dynamic `/concepts`, `/concepts/sunroom`, `/concepts/gridline` | Compatibility aliases to `/app`; no Gridline interface |
| Static bare root and `#/` | Public landing |
| Static `#/concepts/sunroom` (`#/app` alias) | Explicit fictional Sunroom workspace |
| Static `#/dashboard/site-owner` | Original labeled illustration, separate from Sunroom |

The landing's **Open Sunroom workspace** action uses `/app`; static routing
canonicalizes it to `#/concepts/sunroom`. Static role control sits beside the
theme toggle in the compact topbar. Owner, operator and investor experiences
are role-specific views within the shared workspace; filters alone are not the UI.

Dynamic source labels are **Connected workspace**, **Developer/demo mode** and
**Connection unavailable**. They describe admission/configuration, not deployment
proof. Connected mode refuses known seeded identities, even old signed demo
cookies. Source selection never comes from a query string or browser role choice.

Assistance remains deterministic guidance, with no live model, microphone,
speech recognition or TTS. The broader project journey remains:
`Submitted -> Screening -> Pre-development -> Development -> Construction -> Commissioning -> Operations`.
Its full persisted three-role MVP and named stretches are broader than this
frontend's enabled operations; see the [technical design](docs/sunsum_technical_design_doc.md).
No utility/grid dispatch, device control, capital commitment or final engineering
determination is performed here.

## Where to edit

| Change | Primary location |
| --- | --- |
| Authored story copy | `src\features\community-context\content\stories.ts` |
| Public chrome/routes/audio composition | `app\(public)\` and `src\features\participation\components\PublicShell.tsx`; root layout stays neutral |
| Shared role visuals/interaction | `src\components\workspace\RoleControl.tsx` and its CSS module |
| Explicit mock-session adapter | `src\features\demo-auth\components\DemoRoleSwitcher.tsx`; compose through `app\app\WorkspaceEntry.tsx` |
| Source-mode admission | `src\domain\live-configuration.ts` and server entry `app\app\configuration.ts` |
| Accepted methods/roles/capabilities | **Only** `src\domain\connections.ts`; [human index](docs/ws1/connections.md) |
| Typed client | Public `src\features\live-read\index.ts`; modern `createWorkspaceClient`, legacy interest-disabled `createLiveReadClient` |
| Filters and interest lifetime | `src\domain\workspace-filters.ts`, `src\features\live-read\client.ts`, `src\features\live-workspace\useProjectInterest.ts` |
| Workspace views | `src\features\live-workspace\WorkspaceShell.tsx` and role/detail views |
| Fictional state and static routing | `src\features\design-lab\DesignLab.tsx`, its `routing.ts`, and `static\main.tsx` |
| Dynamic route normalization | `src\domain\workspace-routes.ts` |
| Unadmitted map seam | `MAPS-LOCATION` in the registry; `MapLimit.tsx` / `CollectionView.tsx` in `live-workspace` |
| Audio metadata/bytes | `src\features\participation\content\pageAudioAssets.json` and the three `public\audio\*.mp3` files |
| Deterministic guidance | `src\features\assistant\`; public exports and server-only future model boundary stay separate |

Routes compose public feature entries; features do not import each other's
internals. The [architecture](docs/ws1/architecture.md) records narrow public-entry
exceptions. `DemoLearning.tsx` and `ComparisonView.tsx` exceptions are
file-specific, not permission for all `design-lab` siblings.

## Public audio

Need, Opportunity and Impact use the three supplied, publication-approved
clips. Play/Pause and Mute/Unmute are independent; leaving a topic stops it.
There is no autoplay, loop/restart or remote music provider, and media failure
does not hide the narrative.

The [canonical manifest](src/features/participation/content/pageAudioAssets.json)
contains public titles/attributions and measured bytes, SHA-256 and audio
properties. Both ZIPs must match it exactly. The [portable notice](docs/ws1/audio-credits.txt)
travels byte-identically in both ZIP roots as `AUDIO-CREDITS.txt`; packagers
neither download nor substitute media. Follow the [replacement procedure](docs/ws1/media-credits.md).
Private source provenance never belongs in a bundle.

## Source and delivery

Source review is in [**PR72**](https://github.com/pocketcalculator/sunsum-community-solar-virtual-power-plant/pull/72),
a follow-up to externally merged
[PR62](https://github.com/pocketcalculator/sunsum-community-solar-virtual-power-plant/pull/62),
locally reconciled with immutable upstream
[`449f6b0660609af3c80946f618c5e73828a36768`](https://github.com/pocketcalculator/sunsum-community-solar-virtual-power-plant/commit/449f6b0660609af3c80946f618c5e73828a36768).
The consumed contracts are pinned to that inspected revision; release metadata
identifies the actual follow-up source. Source pins, configured stores and deployed revisions are different
facts. No source-main push/merge or Azure deployment was performed by this work.

Use [package-only delivery](docs/ws1/connection-and-deployment-guide.md#package-without-azure):
separate `sunsum-app-source.zip`, `sunsum-synthetic-demo.zip`, operator material
and a schema-2 release manifest. Preserve historical releases and matching
helper/hash receipts. Backend API availability does not expand the approved
frontend operations.

PR71 is merged, but its parcel API is **not enabled by this UI**. It admits
`site_owner` or `operator` without an owner filter, defaults to three synthetic
parcels, and supplies no fixture/live source field. Project-original APIs and
profile/contact APIs are also backend capabilities, not automatically enabled
UI features. See [capabilities and caveats](docs/ws1/contracts.md).

## Development and operations references

| Command | Effect |
| --- | --- |
| `npm ci` | Restore the committed lockfile using the configured approved registry |
| `npm run dev` | Run Next development server; mode and service admission still apply |
| `npm run build` / `npm run start` | Build/serve the dynamic application |
| `npm run build:demo` / `npm run preview:demo` | Build/serve the transport-free static demo on port 4183 |
| `npm run lint` / `npm run typecheck` / `npm test` | Existing source and unit checks |
| `npm run test:e2e` | Existing browser suites; production build/browser prerequisites apply |
| `pwsh -NoProfile -File .\scripts\New-UiRelease.ps1 -OutputDirectory '<new-output-directory>'` | Assemble revision-bound local artifacts from a clean reviewed source and matching static build |

Exact versions belong in the manifest/lockfile. Keep source-reviewed,
feed-compatible lock entries; do not blindly regenerate them, bypass the feed
or interpret pinning as blanket vulnerability remediation. Local/mock results
do not prove real sign-in, provider access or production readiness.

Infrastructure is a separate workstream. The [deployment guide](infrastructure/docs/deployment.md)
describes the paid B1/Basic fixture-backed dev-test stack, private Blob Storage
and separately billable PostgreSQL. Code deployment is separate from provisioning,
migrations and runtime grants. Preserve automatic main-push deployment and the
legacy infrastructure guards; do not dispatch them to deliver this UI.
For any later authorized code deployment, use matching-deployment-ID asynchronous
status reconciliation, not blind retry after timeout.

Application persistence uses `DATABASE_URL`/`SUNSUM_DB_AUTH`; separate operator
tooling uses `PG*`/`SUNSUM_DATABASE_AUTH`. Blob selection is independent and
source-supported, not proof of configured accounts/containers/bytes. See the
[operator guide](docs/ws1/connection-and-deployment-guide.md) and
[existing infrastructure reference](infrastructure/docs/app-service-postgres.md).

## Contributing and license

Read [CONTRIBUTING.md](CONTRIBUTING.md), follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md),
and report security concerns privately under [SECURITY.md](SECURITY.md).

Project code is [MIT licensed](LICENSE). The recordings are third-party media,
not MIT code; rights remain with their owners. Publication clearance for the
selected excerpts is a user attestation, not copyright transfer or independent
legal certification. Their terms and attributions are in
[audio-credits.txt](docs/ws1/audio-credits.txt).
