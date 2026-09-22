# Key Issues

## API [API]
>
> Last reviewed: 2026-09-21 | Open: 2

Source-contract review of the live-read adapter, configuration, connection registry, and `/app` entry against WS2 commit `73695a052a6324434b36bebbdd0c834b455471b7`. Findings include untracked implementation files. These are source-backed failures, not claims about a deployed service.

### API-1 - Database target timestamps reject the entire owner collection

- Severity: HIGH
- Status: RESOLVED
- Resolved: 2026-09-21. The private project projection accepts validated date-only or timezone-bearing database timestamps without changing their precision. Owner snapshot/detail/export and invalid-date regression cases cover both forms.
- File: `src\features\live-read\projections.ts:65-84`; `src\features\live-read\values.ts:129-137`
- Problem: A legitimate non-null database-backed `target_date` makes owner reads fail as malformed.
- Why: `privateProject` applies the date-only guard, but `src\backend\db\backend-store.ts:83-85,281-285` serializes the database timestamp as an ISO date-time. Owner collection validation visits every project, so one scheduled project prevents the whole snapshot from loading; owner detail and export validation use the same projection.
- Reproduction: Supply an owned project's `target_date` as `2026-09-22T00:00:00.000Z`, as emitted by the database mapper, through the existing `getOwnerSites` composition. `readSnapshot()` returns `malformed/invalid_response` after `/api/me/sites`.
- Confidence: HIGH; reproduced with the unchanged WS2 composition and injected synthetic reads.
- Fix: Reconcile the documented date input with the actual database read form: accept and validate the ISO timestamp as well as the supported date/null forms, preserving the source's temporal meaning instead of rejecting the collection. Cover a non-null database-backed target date, not only null fixtures.

### API-2 - Export document parents are normalized incorrectly

- Severity: MEDIUM
- Status: RESOLVED
- Resolved: 2026-09-21. Export normalization verifies project linkage, removes contextual site IDs from project-only metadata and withholds original-byte references. Owner membership checks and genuine site-parent downloads remain enforced; coherent synthetic fixtures now respect the database single-parent constraint.
- File: `src\features\live-read\client.ts:548-556`; `src\features\live-read\projections.ts:639-655`
- Problem: A valid project-only document breaks an owner's export and produces an unusable original-byte reference in an operator's export.
- Why: The database permits exactly one document parent (`src\backend\db\schema.ts:350-362`), while the existing export fills a missing `site_id` from the containing site (`src\backend\core\export\index.ts:144-155,230,352`). The adapter compares this export fallback against the actual nullable parent for owners, but treats it as a real content-route parent for operators; the content resolver only admits site-parented documents (`src\backend\core\documents\index.ts:142-144`).
- Reproduction: Give an owned project a document with `site_id: null, project_id: P`. Using the unchanged WS2 owner/export compositions, owner `readExport()` returns `denied/scope_mismatch`; operator `readExport()` issues a download reference whose content read deterministically returns `404/not_found` before any Blob access.
- Confidence: HIGH; both role variants reproduced with the actual WS2 read functions and no storage access.
- Fix: Normalize the export fallback using the admitted single-parent contract and verified project/document membership. Preserve project-only metadata with `siteId: null` and `download: null`; retain owner scope checks and issue original references only for genuine site-parented documents. Apply the normalization to both roles.

### API-3 - Engagement recency disagrees with the service's disclosure contract

- Severity: MEDIUM
- Status: RESOLVED
- Resolved: 2026-09-21. Current engagement selection follows the emitted WS2 row order. Regression cases cover later updates to older withdrawals, tied timestamps, export release parity and a final service denial despite an eligible engagement.
- File: `src\features\live-read\projections.ts:387-406`; `src\features\live-read\client.ts:451-455,524-532`
- Problem: The client can lock a deal room that the pinned service authorizes, and omit its released documents from an export.
- Why: `eligibleProjects` chooses the row with the latest `state_changed_at`, whereas WS2 orders engagement rows by `created_at, id` (`src\backend\db\backend-store.ts:615-620`) and authorizes from the last matching row (`src\backend\core\views\index.ts:148-159`). Updating an older engagement is not the same as creating the latest engagement.
- Reproduction: For one project, return an older withdrawn row created September 18 and changed September 20, followed by an interested row created/changed September 19. The actual `getDealRoom` succeeds, but `readDetail()` returns `denied/forbidden_tier` without attempting the deal-room GET.
- Confidence: HIGH; the backend allowance and frontend refusal were reproduced against the same synthetic records.
- Fix: Follow the pinned service's per-project engagement ordering/current-row semantics rather than sorting by state-change time. Keep identity/onboarding checks, fail closed on unknown states, and leave final authorization to the existing deal-room GET; do not create interest.

### API-4 - A failed pipeline becomes a definite zero-project summary

- Severity: MEDIUM
- Status: RESOLVED
- Resolved: 2026-09-21. A failed pipeline yields a null project count; successful empty pipelines retain zero. Adapter and real-browser synthetic cases distinguish these outcomes.
- File: `src\features\live-read\client.ts:91-97,346-355`
- Problem: A partial operator snapshot reports `projectCount: 0` when the project collection was not available.
- Why: On pipeline failure the adapter falls back to submission summaries, which do not contain project linkage (`src\backend\core\sites\workflows.ts:104-108,248-260`). `localSummary` counts their null project IDs as zero rather than using the nullable summary field to preserve the unknown count.
- Reproduction: Let `/api/submissions` return an accepted site with an existing project and `/api/pipeline` return 503. The snapshot correctly says `partial`, but its summary is `{ recordCount: 1, projectCount: 0 }`.
- Confidence: HIGH; reproduced using the actual submission projection and a synthetic pipeline failure.
- Fix: Return `projectCount: null` when the pipeline section fails, while retaining the observed submission count, explicit section error, and partial records. A successful empty pipeline can still yield a real zero.

### API-5 - Serialized manifests lose their source and observation labels

- Severity: LOW
- Status: RESOLVED
- Resolved: 2026-09-21. JSON and CSV persist allowlisted source/revision/observation metadata separately from generation time; deployed revision remains null or blank and operation URLs are omitted.
- File: `src\features\live-read\export.ts:65-94,124-129`
- Problem: Downloaded JSON and CSV omit provenance that the normalized manifest already contains.
- Why: Neither encoding includes the WS2 source, adopted contract revision, retrieval time, or unknown deployed revision; provenance survives only on the in-memory `ReadDownload` wrapper. Once the Blob is saved, its `generatedAt` cannot substitute for the separate observation time or identify the source contract.
- Reproduction: Encode a manifest with contract revision `73695a052a6324434b36bebbdd0c834b455471b7` and retrieval time `2026-09-21T08:00:00.000Z`. Both saved encodings omit those values even though the returned wrapper contains them.
- Confidence: HIGH; inspected both encoded Blob texts.
- Fix: Include an allowlisted source/provenance object in JSON and equivalent scalar CSV metadata rows, keeping source generation, retrieval time, contract revision, and unknown deployment revision distinct. Preserve existing escaping and do not serialize raw service URLs or credentials.

### API-6 - Interest used cached project membership before dispatch

- Severity: MEDIUM
- Status: FIXED, awaiting current-revision CI
- Confidence: HIGH
- File: `src/features/live-read/client.ts`, `expressInterest`
- Problem: Fresh identity and engagement reads did not recheck whether the
  selected project still belonged to the current filtered portfolio.
- Correction: Retain the snapshot's copied query within its generation and
  repeat that exact portfolio GET before dispatch. Missing projects and failed
  preflight reads produce an explicit unsent result, never an unfiltered read.
- Regression: `live-interest-contract.test.ts` covers exact filters, mutation of
  the caller's original query array, stage/visibility removal and failed reads.
  The backend remains the final authority; this is not an atomic write guarantee.

### API-7 - Incomplete creation timestamps could confirm an invalid receipt

- Severity: MEDIUM
- Status: FIXED, awaiting current-revision CI
- Confidence: HIGH
- File: `src/features/live-read/client.ts`, 201 receipt validation
- Problem: The tolerant GET projection allowed missing/null timestamps through
  the new POST confirmation branch.
- Correction: Require both parsed creation and state-change timestamps for a
  confirmed 201. Invalid receipts retain the dispatched unknown outcome; GET
  projection compatibility is unchanged.
- Regression: `live-interest-contract.test.ts` covers each timestamp omitted,
  null and empty, empty reconciliation and no unacknowledged second POST.

### Cross-domain handoff

DEFERRED_TO:RELY (MEDIUM, confirmed) - A superseded denial can retire the newer read context. At `src\features\live-read\transport.ts:293-302`, cancellation while consuming a 403 body is replaced with the old HTTP denial; `src\features\live-read\client.ts:204-208` then retires the current generation without checking whether that group was superseded. Reproduction: stall detail A's 403 body, start permitted detail B, and hold B's identity response pending; both reads return A's denial and B is aborted. Preserve cancellation/stale outcomes for retired groups before applying global invalidation, while continuing to invalidate genuinely current 401/403 reads. No Reliability ID was assigned and no source fix was applied.

Resolved by the coordinator on 2026-09-21: transport preserves parent cancellation
while consuming an error body, and only the active current group can retire its
scope. The adapter regression cases cover superseded stalled 401/403 bodies and
preserve invalidation for current 401/403 bodies that fail during reading.

## Reliability [RELY]

> Last reviewed: 2026-09-21 | Open: 4

The first five findings came from an isolated source snapshot. The sixth was
reproduced while exercising the strengthened continuity harness. Corrections
preserve immediate cancellation, permission retirement and the mounted
collection; they do not add business writes or assert remote service access.

### RELY-1 - Same-record navigation could stop detail loading

- Severity: HIGH
- Status: RESOLVED
- File: `src/features/live-workspace/LiveWorkspace.tsx`
- Resolution: View/project/navigation generations now participate in detail
  loading, and identical active-view clicks are no-ops. The deep-link
  Documents/Activity regression exercises the formerly stalled transitions.

### RELY-2 - Canceled originals could restore a permanently pending control

- Severity: MEDIUM
- Status: RESOLVED
- File: `src/features/live-workspace/LiveWorkspace.tsx`
- Resolution: Navigation aborts the request and retires pending/error state
  together. Request identity and navigation generation reject late completions.
  Close/reopen and identical-context history cases both permit a fresh download.

### RELY-3 - Reports could save after same-view context navigation

- Severity: MEDIUM
- Status: RESOLVED
- File: `src/features/live-workspace/ReportsView.tsx`
- Resolution: Reports receives the immediate navigation-abort boundary and is
  remounted for each retired context. Export completion checks both request and
  navigation signals. Project clearing and identical/different-context history
  cases discard the old preview, pending state and late file save.

### RELY-4 - Project-only links lost selection on collection return

- Severity: MEDIUM
- Status: RESOLVED
- File: `src/features/live-workspace/LiveWorkspace.tsx`
- Resolution: Clearing the detail-only project parameter preserves the resolved
  permitted record as collection scope. No broader read supplies missing records.

### RELY-5 - Historical return navigation used the newest collection origin

- Severity: MEDIUM
- Status: RESOLVED
- File: `src/features/live-workspace/navigation.ts`
- Resolution: Each app-owned history entry retains its collection origin while
  preserving framework history metadata. History parsing admits only collection
  names; the current service role still determines the permitted view.

### RELY-6 - Browser-history return did not restore the collection focus

- Severity: MEDIUM
- Status: RESOLVED
- File: `src/features/live-workspace/LiveWorkspace.tsx`
- Resolution: Only a committed history return restores its retained visible
  collection control or the historical selected record. Superseded navigation
  focus frames are canceled alongside reads. Mounted regressions reproduce the
  original focus loss, cover a different more recently opened record, and
  distinguish an explicit identity refresh from another history return. The
  native-browser case also covers separate context/cancellation commits and
  passes at desktop, tablet and mobile sizes without changing its focus oracle.

The controller suite now exercises these cases together with mounted
identity/role replacement, visibility retirement, bounded focus refresh and
the real object-URL hook's navigation/unmount cleanup.

### RELY-7 - Session control remounts during read retirement

- Severity: MEDIUM
- Status: OPEN
- Confidence: HIGH
- Files: `src/features/live-workspace/LiveWorkspace.tsx`,
  `src/features/demo-auth/components/DemoRoleSwitcher.tsx`
- Problem: Starting a switch clears the snapshot and unmounts the initiating
  adapter. Its refusal disappears, and the sliding indicator is replaced.
- Required correction: Keep the shell and adapter mounted while scoped content
  retires. Cover pending/refused switching with the actual composed adapter,
  immediate record removal and persistent indicator node identity.

### RELY-8 - Late settlement restarts a disposed workspace

- Severity: MEDIUM
- Status: OPEN
- Confidence: HIGH
- File: `src/features/live-workspace/useWorkspaceReads.ts`
- Problem: A switch completing after whole-workspace unmount can start fresh
  reads; a later access failure can also replace the new page URL with `/app`.
- Required correction: Guard refresh/settlement by owner lifetime and use its
  current client. Preserve reconciliation after adapter-only retirement.

### RELY-9 - First history entry lacks collection context

- Severity: MEDIUM
- Status: OPEN
- Confidence: HIGH
- File: `src/features/live-workspace/LiveWorkspace.tsx`
- Problem: Without an initial control change, only the destination gets an
  opaque history key. Back can retain a later filter instead of the initial
  service query, selection and return focus.
- Required correction: Snapshot the confirmed actor's current entry before its
  first push, using replaceState without losing framework metadata.

### RELY-10 - Retired unmoved presses can activate through click

- Severity: MEDIUM
- Status: OPEN
- Confidence: HIGH
- File: `src/components/workspace/RoleControl.tsx`
- Problem: Epoch retirement suppresses the trailing click only after movement
  crossed the drag threshold; an unmoved retired press can still choose a role.
- Required correction: Cancel obsolete or canceled presses regardless of
  movement, covering down/epoch-change/up/click in both radio and button modes.

## Readability [READ]

> Last reviewed: 2026-09-21 | Open: 0

READ-1 through READ-3 are historical bounded maintenance simplifications.
The successor integration review adds READ-4 below; none changes authorization
or stakeholder story copy.

### READ-1 - Retired local CSS classes remain after control replacement

- Severity: LOW
- Status: RESOLVED
- Files: `src/features/design-lab/{ProjectCollection,Guidance,Lab,OwnerViews}.module.css`
- Resolution: Removed only the 22 importer-confirmed dead local classes and
  empty wrappers. Shared styles, the corrected mobile halo and dynamic variants
  remain. The complete actual-Pages-prefix browser run passes 120 cases with
  three intentional viewport skips, including responsive profile geometry.

### READ-2 - Public profile operations wrap the draft without adding state

- Severity: LOW
- Status: RESOLVED
- Files: `src/features/onboarding/model/steps.ts` and its form/review consumers.
- Resolution: The model operations and review component accept the existing
  draft directly. Validation, consent, focus and optional-learning draft
  continuity remain covered by the unchanged behavioral assertions.

### READ-3 - Operator submission labels and tones have duplicate owners

- Severity: LOW
- Status: RESOLVED
- Files: `src/features/design-lab/demoPresentation.ts`, `OperatorViews.tsx` and
  `ProjectDetail.tsx` in the same directory.
- Resolution: Both consumers share the unchanged six-entry submission map and
  tone helper. A focused assertion binds labels, filter order and tones; owner
  wording, screening and journey stages remain separate. All 67 scoped
  onboarding/operator/detail/presentation cases pass after both simplifications.

### READ-4 - Profile wording conflates local and service-backed demo identities

- Severity: MEDIUM
- Status: RESOLVED
- Confidence: HIGH
- File: `src/features/live-workspace/RoleViews.tsx:81`
- Problem: The shared profile said a "demo role" was not its service identity,
  although explicit server-demo intentionally uses a seeded service identity.
- Resolution: Qualified the disclaimer as "browser-local demo role." This keeps
  public answers and fictional local selection separate from authenticated
  service identity without another mode branch or any permission change.

## Testing [TEST]

> Last reviewed: 2026-09-21 | Open: 5

Coverage findings are not assertions of production transport vulnerabilities.
All service scenarios remain intercepted or mocked; none certifies real sign-in
or cloud deployment.

### TEST-9 - Lifetime suite was registered inside a running test

- Severity: HIGH
- Status: FIXED, awaiting current-revision CI
- Confidence: HIGH
- File: `tests/unit/demo-role-switcher.test.tsx`
- Correction: Hoisted the composed-lifetime suite out of the refusal callback,
  preserving both that refusal's assertions and all lifetime cases.

### TEST-10 - Static audio observer missed prefixed and foreign requests

- Severity: MEDIUM
- Status: FIXED, awaiting current-revision CI
- Confidence: HIGH
- Files: `tests/e2e/vibehub.spec.ts`,
  `tests/fixtures/static-network-guard.ts`
- Correction: Context-wide deny-by-default routing admits only exact generated
  local document/assets/native-media GETs, with independent request observation.
  Worker transport is blocked, sockets are refused, and intercepted browser
  canaries cover a prefixed POST, session read and foreign request. Pure policy
  cases cover both actual and deeper hosting prefixes.

### TEST-11 - Invalid archive fixtures could fail for unrelated missing media

- Severity: MEDIUM
- Status: FIXED, awaiting current-revision CI
- Confidence: HIGH
- File: `infrastructure/scripts/tests/deployment-safety.test.ps1`
- Correction: Copy the valid media-complete archive and change only the target
  name or collision. Require the specific path/casing refusal rather than any
  exception; the collision uses two independently allowed source paths.

### TEST-12 - Unused mock parameter blocked zero-warning lint

- Severity: MEDIUM
- Status: FIXED, awaiting current-revision CI
- Confidence: HIGH
- File: `tests/unit/demo-role-switcher.test.tsx`
- Correction: Removed the unused implementation parameter; request argument
  assertions and the zero-warning lint gate remain.

### TEST-13 - Final artifacts were not bound to the reviewed PR head

- Severity: MEDIUM
- Status: FIXED, awaiting current-revision CI
- Confidence: HIGH
- File: `.github/workflows/repo-health.yml`
- Correction: Application acceptance and packaging explicitly check out the
  full PR-head SHA (event SHA for non-PR runs). Packaging requires matching
  manifest/demo stamps and ZIP digests, and retains a CI receipt identifying
  source SHA, event/merge SHA, run and both ZIP hashes separately. Ordinary
  repository/infrastructure merge checks retain their original behavior.

### TEST-1 - Browser I/O guards did not enforce origin and role operations

- Severity: HIGH
- Status: RESOLVED
- File: `tests/e2e/connected-workspace.spec.ts`
- Resolution: An independent context observer and exact origin/role/operation
  allowlist cover every positive and negative scenario. Forbidden traffic cannot
  be hidden by a successful response override. All 75 connected browser cases
  pass with zero unexpected requests; harness regressions exercise violations.

### TEST-2 - Retirement was not exercised in a mounted workspace

- Severity: HIGH
- Status: RESOLVED
- File: `tests/unit/live-workspace.test.tsx`
- Resolution: Deferred old snapshots now resolve after a mounted identity/role
  replacement. Detail/original/export work is retired across hidden/visible
  transitions, focus refresh is bounded, and actual download-hook URL creation,
  anchor clicks, timer cancellation and revocation are observed.

### TEST-3 - Identical manifests could hide stale export bytes

- Severity: HIGH
- Status: RESOLVED
- File: `tests/e2e/connected-workspace.spec.ts`
- Resolution: Actual downloaded JSON and CSV contain release B identities and
  names, with no preview A values. Both formats refuse denied, expired,
  malformed and changed-identity rereads without saving or retaining preview A.
  These cases pass in all three browser viewports.

### TEST-4 - Store sentinels missed deletion and caught access

- Severity: MEDIUM
- Status: RESOLVED
- Files: `tests/e2e/{connected-workspace,unconfigured-workspace}.spec.ts`
- Resolution: Captured native storage methods and cross-document observations
  detect caught reads/writes/removals/clears without repairing state. Both
  seeded canaries remain byte-identical across 75 connected and 15 unconfigured/
  alias browser cases. Unit regressions include successful destructive calls.

### TEST-5 - Entry isolation omitted framework-composed layouts

- Severity: MEDIUM
- Status: RESOLVED
- File: `tests/unit/entry-mode-isolation.test.ts`
- Resolution: The dynamic graph includes applicable ancestor/segment layouts,
  templates and recovery entries. In-memory negative fixtures distinguish a
  forbidden runtime layout import from an allowed type-only import.

### TEST-6 - Public browser selectors and metadata expected retired copy

- Severity: MEDIUM
- Status: RESOLVED
- Files: `tests/e2e/{public-shell,theme}.spec.ts`
- Resolution: Assertions target the actual participation/theme controls and
  route-specific qualifications. The obsolete homepage description override was
  removed so it inherits the current mixed-mode description. All 117 dynamic
  public/unconfigured scenarios pass at desktop, tablet and mobile sizes.

### TEST-7 - Continuity never covered a filtered second-page selection

- Severity: MEDIUM
- Status: RESOLVED
- File: `tests/e2e/connected-workspace.spec.ts`
- Resolution: A coherent 65-row fixture narrows through counts 62, 61 and 60.
  The selected fourth record on the second 50-row page retains every filter,
  sort, layout, visible ID, selected state, URL context and open-button focus
  through detail, Documents, Reports and both return paths in all three
  viewports. The exposed history-focus defect is resolved as RELY-6 above.

### TEST-8 - Delivered demo and operator contents were not inspected

- Severity: MEDIUM
- Status: RESOLVED
- File: `tests/unit/release-packaging.test.ts`
- Resolution: The release fixture opens the produced ZIP, requires the exact
  nested entry set and byte hashes, recomputes the archive digest, and compares
  the complete operator kit and every manifest hash to the source. This checks
  the delivered files, not only the pre-package build directory.
