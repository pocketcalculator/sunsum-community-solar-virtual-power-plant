import {
  ROLE_LABELS, VIABILITY_LABELS, latestAssessment, needsReconfirmation,
  roleSites, sourceRevision, stageName, visibleDocuments, visibleDrafts,
  type Assessment, type DemoDraft, type LabState, type Role, type Site,
} from "./model";

export const REPORT_SCHEMA_VERSION = "sunroom-local-reports-v1";
export const SYNTHETIC_BASIS = "Synthetic browser preview. Not verified site data, a financial forecast or a legal document.";
export const DRAFT_TEMPLATES: Record<DemoDraft["kind"], { title: string; version: string }> = {
  project_brief: { title: "Project briefing", version: "sunroom-project-brief-v1" },
  assessment_report: { title: "Assessment report", version: "sunroom-assessment-report-v1" },
};

export type ReportFormat = "html" | "csv";
export type ReportScope = { kind: "selected"; siteId: string } | { kind: "all_permitted" };
export interface LocalReportFile {
  filename: string;
  mimeType: "text/html;charset=utf-8" | "text/csv;charset=utf-8";
  content: string;
}

interface DocumentMetadata {
  id: string;
  name: string;
  kind: string;
  sizeBytes: number;
  version: number | null;
  review: string;
  recordedAt: string;
  audience: string;
}

interface ProjectSummary {
  id: string;
  name: string;
  locality: string;
  region: string;
  type: string;
  submissionStatus: string;
  stage: string;
  sourceRevision: string;
  assessmentId: string | null;
  assessmentVersion: string | null;
  assessmentAt: string | null;
  screening: string;
  capacityMinKw: number | null;
  capacityMaxKw: number | null;
  generationMinKwhPerYear: number | null;
  generationMaxKwhPerYear: number | null;
  documents: DocumentMetadata[];
}

export interface PortfolioSnapshot {
  schemaVersion: string;
  basis: string;
  role: Role;
  scope: ReportScope;
  scopeLabel: string;
  snapshotAt: string;
  projects: ProjectSummary[];
}

export class ReportExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportExportError";
  }
}

const UNKNOWN = "Unknown";
const SOURCE_UNKNOWN = "Unknown - original source value not recorded";
const NO_BYTES = "Metadata only; original file bytes are unavailable and are not included.";
const NON_EXECUTING = "Non-executing demo draft. Human review is a preview annotation, not a signature, project approval or legal execution. Approved legal templates are unavailable.";
const CORRECTABLE_FIELDS = new Set([
  "project_name", "locality", "project_type", "owner_goals",
  "owner_name", "owner_email", "site_address", "usable_area_m2", "annual_usage_kwh",
]);

export function isCorrectableDraftField(key: string) {
  return CORRECTABLE_FIELDS.has(key);
}

export function draftSnapshotAt(draft: DemoDraft) {
  return draft.sourceFields.find((field) => field.key === "source_snapshot_at")?.sourceValue ?? UNKNOWN;
}

export function draftReviewLabel(draft: DemoDraft, stale: boolean) {
  if (stale) return "Source changed - review required";
  return draft.review === "reviewed" ? "Human-reviewed demo draft" : "Unreviewed demo draft";
}

function timestamp(value: string) {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new ReportExportError("The snapshot needs a valid timestamp with a time zone. Prepare it again.");
  }
  return new Date(value).toISOString();
}

function permittedSite(state: LabState, role: Role, siteId: string) {
  const site = roleSites(state, role).find((entry) => entry.id === siteId);
  if (!site) throw new ReportExportError("The selected project is not available to this demo role. Choose a permitted project.");
  return site;
}

function draftingRole(role: Role) {
  if (role === "investor") {
    throw new ReportExportError("Investor exports contain permitted summaries and diligence metadata only. Draft fields are not available.");
  }
}

function savedDraft(state: LabState, role: Role, draftId: string) {
  draftingRole(role);
  const draft = visibleDrafts(state, role).find((entry) => entry.id === draftId);
  if (!draft) throw new ReportExportError("This saved draft is not available to this demo role. Reopen a permitted draft.");
  return draft;
}

function quantity(value: number | null, unit: string): string {
  if (value === null) return UNKNOWN;
  if (!Number.isFinite(value) || value < 0) {
    throw new ReportExportError(`A source quantity in ${unit} is invalid. Correct the project source before preparing a report.`);
  }
  return String(value);
}

function range(value: [number, number] | null | undefined, unit: string): [number, number] | null {
  if (value == null) return null;
  quantity(value[0], unit);
  quantity(value[1], unit);
  if (value[1] < value[0]) throw new ReportExportError(`The source ${unit} range is reversed. Correct the source before exporting.`);
  return [value[0], value[1]];
}

function rangeText(value: [number, number] | null | undefined, unit: string) {
  const checked = range(value, unit);
  return checked ? `${checked[0]} to ${checked[1]} ${unit}` : `${UNKNOWN} (${unit})`;
}

function assessmentText(assessment: Assessment | undefined) {
  if (!assessment) return "Unknown - no assessment recorded.";
  return [
    VIABILITY_LABELS[assessment.result], `Record: ${assessment.id}`,
    `Version: ${assessment.version}`, `Recorded at: ${assessment.createdAt}`,
    `Capacity: ${rangeText(assessment.capacity, "kW")}`,
    `Annual generation: ${rangeText(assessment.generation, "kWh/year")}`,
    assessment.overrideReason ? "Manually selected synthetic result." : "Synthetic screening record.",
  ].join(" | ");
}

function projectStage(site: Site) {
  if (site.stage !== null) return stageName(site.stage);
  if (site.status === "accepted") return "Awaiting project setup";
  return site.status === "draft" ? "Draft" : "No project stage";
}

function sourceFields(state: LabState, site: Site, role: Role, kind: DemoDraft["kind"], at: string): DemoDraft["sourceFields"] {
  const field = (key: string, label: string, value: string) => ({ key, label, value, sourceValue: value });
  const decision = site.decisions?.at(-1);
  const decisionLabels = { accept: "Accepted for project setup (demo)", reject: "Not accepted (demo)", request_info: "More information requested (demo)" };
  const fields = [
    field("source_snapshot_at", "Source snapshot (UTC)", at),
    field("project_name", "Project name", site.name),
    field("locality", "Locality / region", `${site.locality} / ${site.region}`),
    field("project_type", "Site type", site.type === "land" ? "Land" : "Rooftop"),
  ];
  if (kind === "project_brief") fields.push(
    field("owner_goals", "Owner goals", site.ownerGoals?.length ? site.ownerGoals.join("; ") : "Not recorded"),
    field("owner_name", "Owner contact name", site.contactName || UNKNOWN),
    field("owner_email", "Owner contact email", site.contactEmail || UNKNOWN),
    field("site_address", "Site address", site.address || UNKNOWN),
    field("usable_area_m2", "Usable area (m2)", quantity(site.area, "m2")),
    field("annual_usage_kwh", "Annual electricity use (kWh/year)", quantity(site.usage, "kWh/year")),
  );
  fields.push(
    field("source_basis", "Data basis", SYNTHETIC_BASIS),
    field("source_project_state", "Project source state", `${site.status} / ${projectStage(site)}`),
    field("source_original_assessment", "Original assessment", assessmentText(site.assessments[0])),
    field("source_current_assessment", "Current assessment", assessmentText(latestAssessment(site))),
    field("source_human_decision", "Recorded human decision", decision
      ? `${decisionLabels[decision.decision]} | Recorded at: ${decision.at} | Assessment: ${decision.assessmentId ?? UNKNOWN} | Evidence revision: ${decision.evidenceRevision}`
      : "Unknown - no human decision recorded. Submission status is not a substitute."),
    field("source_reconfirmation", "Human decision alignment", needsReconfirmation(site)
      ? "Reconfirmation required after a change to assessment or evidence."
      : decision ? "No outstanding reconfirmation is recorded in the synthetic source." : "Unknown - no decision to compare."),
    field("source_provider", "Provider / model provenance", "No connected provider or AI service. Assessment versions describe synthetic records, not a validated model."),
    field("source_last_attempt", "Last attempt / retained result", site.assessmentError
      ? "An example rerun failed. The last successful assessment is retained; no provider was called."
      : "No failed attempt recorded in this snapshot."),
    field("source_evidence", "Evidence basis", `Evidence revision: ${site.evidenceRevision ?? UNKNOWN}. ${visibleDocuments(state, site, role).length} permitted document metadata records. ${NO_BYTES}`),
    field("source_unknowns", "Unverified assessment criteria", "Grid interconnection: unknown. Site control: unverified. Environmental review: unknown. Solar offtake: unknown. No approved technical thresholds supplied."),
  );
  return fields;
}

export function createDemoDraft(
  state: LabState, role: Role, siteId: string, kind: DemoDraft["kind"], id: string, at: string,
): DemoDraft {
  draftingRole(role);
  const site = permittedSite(state, role, siteId);
  const snapshotAt = timestamp(at);
  if (!id.trim() || state.drafts?.some((draft) => draft.id === id)) {
    throw new ReportExportError("A new draft needs its own unused identifier. Create the draft again.");
  }
  const template = DRAFT_TEMPLATES[kind];
  return {
    id, siteId, kind, title: `${site.name || "Selected project"} - ${template.title.toLowerCase()}`,
    content: kind === "project_brief"
      ? "Purpose\nUse this working briefing to organize a conversation about the selected fictional project.\n\nReview focus\nCheck the prefilled fields and record any corrections or open questions here. Corrections belong to this draft and do not change the submitted project.\n\nNext conversation\nIdentify the evidence and people needed for a real feasibility review. Owner benefit, project payback and investor return are not calculated.\n\nBoundary\nThis original demo briefing creates no lease, commitment, authorization or obligation."
      : "Review scope\nCompare the original screening record, the current record and the separately recorded human decision in the source snapshot.\n\nReviewer observations\nRecord what you checked, corrections to this narrative and remaining questions. Unknown evidence is not a negative finding. A screening label is not a success probability.\n\nReview boundary\nReviewing this report does not accept a project, resolve technical unknowns, fund work or authorize delivery. No provider or AI service was called.",
    templateVersion: template.version,
    sourceFields: sourceFields(state, site, role, kind, snapshotAt),
    sourceRevision: sourceRevision(site), authorRole: role, createdAt: snapshotAt, updatedAt: snapshotAt,
    review: "draft", reviewedAt: null, reviewerRole: null,
  };
}

export function createRefreshedDraft(
  state: LabState, role: Role, draftId: string, newDraftId: string, at: string,
): DemoDraft {
  const previous = savedDraft(state, role, draftId);
  if (previous.templateVersion !== DRAFT_TEMPLATES[previous.kind].version) {
    throw new ReportExportError("This saved template version is unavailable. Its content is preserved; automatic refreshed prefill is not available.");
  }
  const fresh = createDemoDraft(state, role, previous.siteId, previous.kind, newDraftId, at);
  return {
    ...fresh, title: previous.title, content: previous.content,
    sourceFields: [
      ...fresh.sourceFields.map((field) => {
        const old = previous.sourceFields.find((entry) => entry.key === field.key);
        const corrected = old && (old.sourceValue === undefined || old.value !== old.sourceValue);
        return isCorrectableDraftField(field.key) && old && corrected ? { ...field, value: old.value } : field;
      }),
      { key: "source_previous_draft", label: "Previous saved draft", value: previous.id, sourceValue: previous.id },
    ],
  };
}

function projectSummary(state: LabState, site: Site, role: Role): ProjectSummary {
  const assessment = latestAssessment(site);
  const capacity = range(assessment?.capacity, "kW");
  const generation = range(assessment?.generation, "kWh/year");
  // Deliberate allowlist: never spread a Site, draft, decision or private note into an export.
  return {
    id: site.id, name: site.name, locality: site.locality, region: site.region,
    type: site.type, submissionStatus: site.status, stage: projectStage(site),
    sourceRevision: sourceRevision(site),
    assessmentId: assessment?.id ?? null, assessmentVersion: assessment?.version ?? null,
    assessmentAt: assessment?.createdAt ?? null,
    screening: assessment ? VIABILITY_LABELS[assessment.result] : "Unknown - not screened",
    capacityMinKw: capacity?.[0] ?? null, capacityMaxKw: capacity?.[1] ?? null,
    generationMinKwhPerYear: generation?.[0] ?? null, generationMaxKwhPerYear: generation?.[1] ?? null,
    documents: visibleDocuments(state, site, role).map((doc) => ({
      id: doc.id, name: doc.name, kind: doc.kind, sizeBytes: doc.size,
      version: doc.version ?? null, review: doc.review ?? "unreviewed", recordedAt: doc.createdAt,
      audience: doc.disclosure,
    })),
  };
}

export function createPortfolioSnapshot(
  state: LabState, role: Role, scope: ReportScope, at: string,
): PortfolioSnapshot {
  const sites = scope.kind === "selected" ? [permittedSite(state, role, scope.siteId)] : roleSites(state, role);
  if (!sites.length) throw new ReportExportError("There are no permitted projects to export in this scope.");
  const projects = [...sites].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    .map((site) => projectSummary(state, site, role));
  return {
    schemaVersion: REPORT_SCHEMA_VERSION, basis: SYNTHETIC_BASIS, role,
    scope: scope.kind === "selected" ? { kind: "selected", siteId: scope.siteId } : { kind: "all_permitted" },
    scopeLabel: scope.kind === "selected" ? "Selected project" : "All permitted projects",
    snapshotAt: timestamp(at), projects,
  };
}

export function portfolioSnapshotIssue(
  state: LabState, role: Role, snapshot: PortfolioSnapshot,
): { message: string; hidePreview: boolean } | null {
  const permitted = roleSites(state, role);
  if (role !== snapshot.role || snapshot.projects.some((project) => {
    const site = permitted.find((entry) => entry.id === project.id);
    return !site || project.documents.some((document) =>
      !visibleDocuments(state, site, role).some((entry) => entry.id === document.id));
  })) {
    return { message: "Project or document access changed. The old preview is hidden; prepare a new permitted summary.", hidePreview: true };
  }
  try {
    const current = createPortfolioSnapshot(state, role, snapshot.scope, snapshot.snapshotAt);
    // Both operands are allowlisted DTOs, not the underlying omniscient preview state.
    if (JSON.stringify(current) !== JSON.stringify(snapshot)) {
      return { message: "The source or permitted scope changed. Refresh the summary snapshot before downloading.", hidePreview: false };
    }
  } catch (error) {
    if (!(error instanceof ReportExportError)) throw error;
    return { message: error.message, hidePreview: true };
  }
  return null;
}

function html(value: string | number | null) {
  return String(value ?? UNKNOWN).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function csvCell(value: string | number | null) {
  const text = String(value ?? UNKNOWN);
  // Spreadsheet readers can ignore whitespace, control and format characters before a formula.
  const safe = /^[\s\p{Cc}\p{Cf}]*[=+\-@]/u.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function csv(rows: (string | number | null)[][]) {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function metadata(entries: [string, string | number | null][]) {
  return `<dl>${entries.map(([label, value]) => `<dt>${html(label)}</dt><dd>${html(value)}</dd>`).join("")}</dl>`;
}

function htmlPage(title: string, body: string) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${html(title)}</title><style>
:root{color-scheme:light;--lab-text:#101a2c;--lab-bg:#f4f7fc;--lab-surface:#fff;--lab-line:#c8d2e4;--lab-accent:#f4b63f;--lab-positive:#176144}
*{box-sizing:border-box}body{margin:0;background:var(--lab-bg);color:var(--lab-text);font:16px/1.6 system-ui,sans-serif}
main{max-width:80rem;margin:auto;padding:2rem}h1{line-height:1.2}h2{margin-top:2rem}
.notice{padding:1rem;border-left:4px solid var(--lab-accent);background:var(--lab-surface)}
dl{display:grid;grid-template-columns:minmax(10rem,1fr) 3fr;gap:.5rem 1rem}dt{font-weight:600}dd{margin:0;overflow-wrap:anywhere}
.table{overflow-x:auto}table{border-collapse:collapse;width:100%;background:var(--lab-surface)}th,td{padding:.75rem;text-align:left;vertical-align:top;border-bottom:1px solid var(--lab-line);overflow-wrap:anywhere}th{font-weight:600}
.body{white-space:pre-wrap;overflow-wrap:anywhere}.review{color:var(--lab-positive);font-weight:600}li{overflow-wrap:anywhere}
@media(max-width:40rem){main{padding:1rem}dl{grid-template-columns:1fr}dd{margin-bottom:.75rem}}
@media print{body{background:var(--lab-surface)}main{padding:0}thead{display:table-header-group}tr{break-inside:avoid}.table{overflow:visible}}
</style></head><body><main><p>SunSum / local synthetic preview</p><h1>${html(title)}</h1>
<p class="notice">${html(SYNTHETIC_BASIS)}</p>${body}
<footer><p>Generated locally. No recipient delivery, legal signing or connected AI service. HTML and CSV are not Word or editable PDF.</p></footer>
</main></body></html>`;
}

function safeFilenamePart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "snapshot";
}

function file(kind: string, scope: string, role: Role, at: string, format: ReportFormat, content: string): LocalReportFile {
  return {
    filename: `sunroom-${safeFilenamePart(kind)}-${safeFilenamePart(scope)}-${role}-${safeFilenamePart(at)}.${format}`,
    mimeType: format === "html" ? "text/html;charset=utf-8" : "text/csv;charset=utf-8",
    content,
  };
}

function documentDescription(document: DocumentMetadata) {
  return `${document.name} | id: ${document.id} | kind: ${document.kind} | audience: ${document.audience} | size (metadata bytes): ${document.sizeBytes} | version: ${document.version ?? UNKNOWN} | review: ${document.review} | recorded at: ${document.recordedAt}`;
}

export function exportPortfolio(
  state: LabState, role: Role, snapshot: PortfolioSnapshot, format: ReportFormat,
): LocalReportFile {
  const issue = portfolioSnapshotIssue(state, role, snapshot);
  if (issue) throw new ReportExportError(issue.message);
  const scopeId = snapshot.scope.kind === "selected" ? snapshot.scope.siteId : "all-permitted";
  const title = `${snapshot.scopeLabel} - portfolio summary`;
  let content: string;
  if (format === "csv") {
    content = csv([
      ["schema_version", "artifact", "basis", "scope", "demo_role", "snapshot_utc",
        "project_id", "project_name", "locality", "region", "site_type", "submission_status", "project_stage",
        "source_revision", "assessment_id", "assessment_version", "assessment_recorded_at", "current_screening",
        "capacity_min_kw", "capacity_max_kw", "annual_generation_min_kwh", "annual_generation_max_kwh",
        "permitted_document_metadata_count", "permitted_document_metadata", "original_document_bytes", "financial_outputs"],
      ...snapshot.projects.map((project) => [
        snapshot.schemaVersion, "portfolio_summary", snapshot.basis, snapshot.scopeLabel, role, snapshot.snapshotAt,
        project.id, project.name, project.locality, project.region, project.type, project.submissionStatus, project.stage,
        project.sourceRevision, project.assessmentId, project.assessmentVersion, project.assessmentAt, project.screening,
        project.capacityMinKw, project.capacityMaxKw, project.generationMinKwhPerYear, project.generationMaxKwhPerYear,
        project.documents.length, project.documents.map(documentDescription).join("\n"), NO_BYTES, "Not calculated",
      ]),
    ]);
  } else {
    content = htmlPage(title, `${metadata([
      ["Scope", snapshot.scopeLabel], ["Scope rule", "No filters from another screen are applied."],
      ["Demo role", ROLE_LABELS[role]], ["Snapshot (UTC)", snapshot.snapshotAt],
      ["Schema / source version", snapshot.schemaVersion], ["Project count", snapshot.projects.length],
      ["Financial outputs", "Not calculated. No owner-benefit, payback or investor-return model is included."],
      ["Redaction", "Owner contact details, exact addresses, private notes and all draft fields are excluded."],
    ])}<div class="table"><table><caption>Permitted project summary; power in kW, annual energy in kWh/year</caption>
<thead><tr><th scope="col">Project / source</th><th scope="col">Locality / type</th><th scope="col">State</th><th scope="col">Screening / provenance</th><th scope="col">Capacity (kW)</th><th scope="col">Annual generation (kWh/year)</th></tr></thead>
<tbody>${snapshot.projects.map((project) => `<tr><td>${html(project.name)}<br>${html(project.id)}<br>${html(project.sourceRevision)}</td>
<td>${html(project.locality)} / ${html(project.region)}<br>${html(project.type)}</td><td>${html(project.submissionStatus)} / ${html(project.stage)}</td>
<td>${html(project.screening)}<br>Record: ${html(project.assessmentId)}<br>Version: ${html(project.assessmentVersion)}<br>Recorded at: ${html(project.assessmentAt)}</td>
<td>${html(project.capacityMinKw)} to ${html(project.capacityMaxKw)}</td><td>${html(project.generationMinKwhPerYear)} to ${html(project.generationMaxKwhPerYear)}</td></tr>`).join("")}</tbody></table></div>
<h2>Permitted document metadata</h2><p>${html(NO_BYTES)} Metadata review is not a review of file contents.</p>
${snapshot.projects.map((project) => `<section><h3>${html(project.name)}</h3>${project.documents.length
  ? `<ul>${project.documents.map((document) => `<li>${html(documentDescription(document))}</li>`).join("")}</ul>`
  : "<p>No document metadata is available in this role scope.</p>"}</section>`).join("")}`);
  }
  return file("portfolio-summary", scopeId, role, snapshot.snapshotAt, format, content);
}

export function exportDraft(state: LabState, role: Role, draftId: string, format: ReportFormat): LocalReportFile {
  const draft = savedDraft(state, role, draftId);
  const site = permittedSite(state, role, draft.siteId);
  if (!draft.title.trim() || !draft.content.trim()) {
    throw new ReportExportError("The saved draft needs a title and body before it can be exported.");
  }
  const stale = draft.sourceRevision !== sourceRevision(site);
  const reviewLabel = draftReviewLabel(draft, stale);
  const snapshotAt = draftSnapshotAt(draft);
  const entries: [string, string | number | null][] = [
    ["Artifact", DRAFT_TEMPLATES[draft.kind].title], ["Scope", "Selected project"],
    ["Project ID", draft.siteId], ["Draft ID", draft.id], ["Demo reader role", ROLE_LABELS[role]],
    ["Original author (demo role)", ROLE_LABELS[draft.authorRole]], ["Template version", draft.templateVersion],
    ["Export schema version", REPORT_SCHEMA_VERSION], ["Stored source revision", draft.sourceRevision],
    ["Current source revision", sourceRevision(site)], ["Source snapshot (UTC)", snapshotAt],
    ["Draft saved at", draft.updatedAt], ["Review state", reviewLabel],
    ["Recorded review at", draft.reviewedAt], ["Recorded reviewer (demo role)", draft.reviewerRole ? ROLE_LABELS[draft.reviewerRole] : null],
    ["Review scope", "The saved snapshot only. Not a project decision or legal approval."],
  ];
  const content = format === "html"
    ? htmlPage(draft.title, `<p class="notice">${html(NON_EXECUTING)}</p><p class="${!stale && draft.review === "reviewed" ? "review" : "notice"}">${html(reviewLabel)}</p>
${stale ? "<p class=\"notice\">This stored source is stale. Any previous human review is historical, not a review of the current project. Prepare a refreshed copy deliberately.</p>" : ""}
${metadata(entries)}<h2>Saved draft narrative</h2><div class="body">${html(draft.content)}</div>
<h2>Fields and retained source snapshot</h2><p>Corrections affect this draft only, not the project source.</p>
<div class="table"><table><thead><tr><th scope="col">Field</th><th scope="col">Draft value</th><th scope="col">Stored source value</th></tr></thead><tbody>
${draft.sourceFields.map((field) => `<tr><th scope="row">${html(field.label)}</th><td class="body">${html(field.value)}</td><td class="body">${html(field.sourceValue ?? SOURCE_UNKNOWN)}</td></tr>`).join("")}
</tbody></table></div><p>Approved legal templates are unavailable. This is an original non-executing demo template, not a lease or agreement.</p>`)
    : csv([
      ["schema_version", "artifact", "basis", "scope", "demo_reader_role", "project_id", "draft_id",
        "template_version", "source_revision", "current_source_revision", "source_snapshot_utc", "draft_saved_at",
        "review_state", "recorded_review_at", "reviewer_demo_role", "author_demo_role",
        "field_key", "field_label", "draft_value", "stored_source_value"],
      ...[
        { key: "draft_title", label: "Draft title", value: draft.title, sourceValue: "Not a source field" },
        { key: "draft_body", label: "Draft narrative", value: draft.content, sourceValue: "Original editable demo content; not extracted evidence" },
        { key: "draft_boundary", label: "Review and legal boundary", value: NON_EXECUTING, sourceValue: "Not a source field" },
        ...draft.sourceFields,
      ].map((field) => [
        REPORT_SCHEMA_VERSION, draft.kind, SYNTHETIC_BASIS, "Selected project", role, draft.siteId, draft.id,
        draft.templateVersion, draft.sourceRevision, sourceRevision(site), snapshotAt, draft.updatedAt,
        reviewLabel, draft.reviewedAt, draft.reviewerRole ?? null, draft.authorRole,
        field.key, field.label, field.value, field.sourceValue ?? SOURCE_UNKNOWN,
      ]),
    ]);
  return file(draft.kind === "project_brief" ? "project-briefing" : "assessment-report", draft.id, role, draft.updatedAt, format, content);
}

export function initiateReportDownload(artifact: LocalReportFile): () => void {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function" || typeof URL.revokeObjectURL !== "function") {
    throw new ReportExportError("Local downloads are unavailable in this browser. Your saved draft and preview are unchanged.");
  }
  const blob = new Blob([artifact.content], { type: artifact.mimeType });
  let url: string;
  try {
    url = URL.createObjectURL(blob);
  } catch (error) {
    if (!(error instanceof DOMException)) throw error;
    throw new ReportExportError("The browser could not create the local file. Your saved draft and preview are unchanged.");
  }
  const anchor = document.createElement("a");
  try {
    anchor.href = url;
    anchor.download = artifact.filename;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
  } catch (error) {
    URL.revokeObjectURL(url);
    if (!(error instanceof DOMException)) throw error;
    throw new ReportExportError("The browser blocked the download. Your saved draft and preview are unchanged.");
  } finally {
    anchor.remove();
  }
  // Keep the URL alive until the view closes or starts its next download; no simulated progress timer.
  return () => URL.revokeObjectURL(url);
}
