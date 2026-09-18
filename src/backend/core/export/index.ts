/**
 * Exporting what the caller can already see.
 *
 * The ask is "let users download their documents and projects". The rule that
 * makes that safe is that **an export is never its own read**: every row below
 * comes back from the same core use-case the role's own dashboard calls, so the
 * export cannot widen what a role can see. Adding a query here that reached
 * into the store directly would create a second authorization surface, and the
 * first mistake in it would be a silent disclosure rather than a failing test.
 *
 * That is why each branch is a little repetitive — `getOwnerSites`,
 * `getPortfolio` plus `getDealRoom`, `getPipeline` plus `getSubmissionDetail`.
 * The repetition is the point: it keeps the tier and ownership checks in the
 * one place that already tests them.
 *
 * Documents are exported as a **manifest, not as bytes**. Blob content lives
 * behind `GET /sites/{id}/documents/{documentId}/content`, and streaming it
 * into a bundle would make the export fail whenever object storage is
 * unreachable — which, on the deployed environment, it currently is. A manifest
 * degrades to a list of links instead of failing the whole download, and a
 * caller that wants bytes already has an endpoint for them.
 */

import type { Role, Viewer } from "../identity";
import { DEFAULT_PORTFOLIO_QUERY, getPortfolio } from "../investors";
import { getPipeline } from "../projects";
import { ok, type Result } from "../shared";
import { getSubmissionDetail } from "../sites";
import { demoBackendStore, type BackendStore } from "../store";
import { getDealRoom, getOwnerSites } from "../views";

export const EXPORT_FORMATS = ["json", "csv"] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export function isExportFormat(value: string): value is ExportFormat {
  return EXPORT_FORMATS.some((format) => format === value);
}

/**
 * One project or submission, flattened.
 *
 * Flat on purpose: this is the shape a spreadsheet can hold, and the CSV and
 * the JSON carry the same rows so the two downloads cannot disagree. Every
 * field is nullable because the three roles see different slices — an investor
 * has no `submission_status`, a not-yet-accepted submission has no
 * `project_id` — and an empty column is more honest than an invented default.
 */
export interface ExportProjectRow {
  readonly site_id: string | null;
  readonly project_id: string | null;
  readonly name: string;
  readonly address: string | null;
  readonly locality: string | null;
  readonly site_type: string | null;
  readonly submission_status: string | null;
  readonly project_stage: string | null;
  readonly journey_stage_id: string | null;
  readonly viability_status: string | null;
  readonly estimated_system_size_kw_low: number | null;
  readonly estimated_system_size_kw_high: number | null;
  readonly estimated_annual_generation_kwh_low: number | null;
  readonly estimated_annual_generation_kwh_high: number | null;
  readonly updated_at: string | null;
}

/**
 * One document, as metadata plus where to fetch it.
 *
 * `content_url` is a relative path rather than an absolute one: the backend
 * does not know the public origin it is served under — App Service sits behind
 * a proxy that rewrites host and scheme — and guessing it would produce links
 * that work in one environment and not the next.
 */
export interface ExportDocumentRow {
  readonly id: string;
  readonly site_id: string | null;
  readonly project_id: string | null;
  readonly original_filename: string;
  readonly content_type: string | null;
  readonly size_bytes: number | null;
  readonly doc_type: string | null;
  readonly created_at: string | null;
  readonly content_url: string | null;
}

export interface ExportBundle {
  readonly generated_at: string;
  readonly role: Role;
  readonly user_id: string;
  readonly scope: string;
  readonly project_count: number;
  readonly document_count: number;
  readonly projects: readonly ExportProjectRow[];
  readonly documents: readonly ExportDocumentRow[];
}

/** Everything the bundle carries except the caller and the clock. */
type ExportContent = Omit<ExportBundle, "generated_at" | "role" | "user_id">;

const DEFAULT_SUBMISSION_QUERY = {
  statuses: [],
  siteType: null,
  viability: null,
  location: null,
} as const;

/** Reads a property off an unknown record without asserting its type. */
function field(source: unknown, key: string): unknown {
  return typeof source === "object" && source !== null
    ? (source as Record<string, unknown>)[key]
    : undefined;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The document's content endpoint, when one can exist.
 *
 * A document attached only to a project has no site-scoped route to link to, so
 * it exports with a null URL rather than a URL that would 404.
 */
function contentUrl(
  siteId: string | null,
  documentId: string | null,
): string | null {
  if (siteId === null || documentId === null) return null;
  return `/api/sites/${siteId}/documents/${documentId}/content`;
}

function toDocumentRow(
  raw: unknown,
  fallbackSiteId: string | null,
): ExportDocumentRow | null {
  const id = text(field(raw, "id"));
  if (id === null) return null;

  const siteId = text(field(raw, "site_id")) ?? fallbackSiteId;

  return {
    id,
    site_id: siteId,
    project_id: text(field(raw, "project_id")),
    original_filename: text(field(raw, "original_filename")) ?? id,
    content_type: text(field(raw, "content_type")),
    size_bytes: num(field(raw, "size_bytes")),
    doc_type: text(field(raw, "doc_type")),
    created_at: text(field(raw, "created_at")),
    content_url: contentUrl(siteId, id),
  };
}

/** Drops documents seen twice, which happens when a site and its project both list one. */
function dedupeDocuments(
  rows: readonly ExportDocumentRow[],
): readonly ExportDocumentRow[] {
  const seen = new Set<string>();
  const unique: ExportDocumentRow[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    unique.push(row);
  }
  return unique;
}

function collectDocuments(
  raw: unknown,
  fallbackSiteId: string | null,
  into: ExportDocumentRow[],
): void {
  if (!Array.isArray(raw)) return;
  for (const document of raw) {
    const row = toDocumentRow(document, fallbackSiteId);
    if (row !== null) into.push(row);
  }
}

async function buildOwnerExport(
  viewer: Viewer,
  store: BackendStore,
): Promise<Result<ExportContent>> {
  const sites = await getOwnerSites(viewer, store);
  if (!sites.ok) return sites;

  const projects: ExportProjectRow[] = [];
  const documents: ExportDocumentRow[] = [];

  for (const entry of sites.value) {
    const site = field(entry, "site");
    const project = field(entry, "project");
    const assessment = field(entry, "assessment");
    const siteId = text(field(site, "id"));

    projects.push({
      site_id: siteId,
      project_id: text(field(project, "id")),
      name:
        text(field(project, "name")) ??
        text(field(site, "address_raw")) ??
        "Untitled site",
      address: text(field(site, "address_raw")),
      locality: text(field(project, "locality")),
      site_type: text(field(site, "site_type")),
      submission_status: text(field(entry, "submission_status")),
      project_stage: text(field(entry, "project_stage")),
      journey_stage_id: text(field(entry, "journey_stage_id")),
      viability_status: text(field(assessment, "viability_status")),
      estimated_system_size_kw_low: num(
        field(assessment, "estimated_system_size_kw_low"),
      ),
      estimated_system_size_kw_high: num(
        field(assessment, "estimated_system_size_kw_high"),
      ),
      estimated_annual_generation_kwh_low: num(
        field(assessment, "estimated_annual_generation_kwh_low"),
      ),
      estimated_annual_generation_kwh_high: num(
        field(assessment, "estimated_annual_generation_kwh_high"),
      ),
      updated_at: text(field(site, "updated_at")),
    });

    collectDocuments(field(entry, "documents"), siteId, documents);
  }

  const unique = dedupeDocuments(documents);

  return ok({
    scope: "Sites you submitted, and the documents attached to them.",
    project_count: projects.length,
    document_count: unique.length,
    projects,
    documents: unique,
  });
}

async function buildInvestorExport(
  viewer: Viewer,
  store: BackendStore,
): Promise<Result<ExportContent>> {
  const portfolio = await getPortfolio(viewer, DEFAULT_PORTFOLIO_QUERY, store);
  if (!portfolio.ok) return portfolio;

  const projects: ExportProjectRow[] = portfolio.value.items.map((item) => ({
    site_id: null,
    project_id: text(field(item, "project_id")),
    name: text(field(item, "name")) ?? "Untitled project",
    address: null,
    locality: text(field(item, "locality")),
    site_type: text(field(item, "site_type")),
    submission_status: null,
    project_stage: text(field(item, "stage")),
    journey_stage_id: text(field(item, "journey_stage_id")),
    viability_status: text(field(item, "viability_status")),
    estimated_system_size_kw_low: num(field(item, "estimated_system_size_kw_low")),
    estimated_system_size_kw_high: num(
      field(item, "estimated_system_size_kw_high"),
    ),
    estimated_annual_generation_kwh_low: num(
      field(item, "estimated_annual_generation_kwh_low"),
    ),
    estimated_annual_generation_kwh_high: num(
      field(item, "estimated_annual_generation_kwh_high"),
    ),
    updated_at: null,
  }));

  /**
   * Documents come from each deal room rather than from the store, so the tier
   * rules that decide what an investor may see are applied unchanged. A project
   * whose deal room refuses this investor contributes nothing instead of
   * failing the export — a partial download is the useful answer here.
   *
   * The site id is deliberately not recovered for these rows. The deal-room
   * payload omits it, and `resolveSiteDocument` refuses every role but the
   * owner and the operator, so an investor has no endpoint that would serve
   * these bytes. Exporting a `content_url` here would advertise a link that
   * answers `403`, which is worse than admitting there is nowhere to fetch it.
   */
  const documents: ExportDocumentRow[] = [];
  for (const row of projects) {
    if (row.project_id === null) continue;
    const dealRoom = await getDealRoom(viewer, row.project_id, store);
    if (!dealRoom.ok) continue;
    collectDocuments(field(dealRoom.value, "documents"), null, documents);
  }

  const unique = dedupeDocuments(documents);

  return ok({
    scope:
      "Projects published to investors, and the deal-room documents your tier unlocks.",
    project_count: projects.length,
    document_count: unique.length,
    projects,
    documents: unique,
  });
}

async function buildOperatorExport(
  viewer: Viewer,
  store: BackendStore,
): Promise<Result<ExportContent>> {
  const pipeline = await getPipeline(viewer, DEFAULT_SUBMISSION_QUERY, store);
  if (!pipeline.ok) return pipeline;

  const projects: ExportProjectRow[] = [];
  const documents: ExportDocumentRow[] = [];

  for (const column of pipeline.value.columns) {
    for (const card of column.items) {
      projects.push({
        site_id: card.site_id,
        project_id: card.project_id,
        name: card.display_name,
        address: card.address_raw,
        locality: null,
        site_type: card.site_type,
        submission_status: card.submission_status,
        project_stage: card.project_stage,
        journey_stage_id: card.journey_stage_id,
        viability_status: card.viability_status,
        estimated_system_size_kw_low: null,
        estimated_system_size_kw_high: null,
        estimated_annual_generation_kwh_low: null,
        estimated_annual_generation_kwh_high: null,
        updated_at: card.updated_at,
      });
    }
  }

  /**
   * One detail read per distinct site. `getSubmissionDetail` is the operator's
   * own endpoint and refuses drafts, so a draft contributes no documents rather
   * than being special-cased here.
   */
  const siteIds = new Set(
    projects
      .map((row) => row.site_id)
      .filter((id): id is string => id !== null),
  );
  for (const siteId of siteIds) {
    const detail = await getSubmissionDetail(viewer, siteId, store);
    if (!detail.ok) continue;
    collectDocuments(detail.value.documents, siteId, documents);
  }

  const unique = dedupeDocuments(documents);

  return ok({
    scope: "Every submission in the pipeline, and the documents attached to them.",
    project_count: projects.length,
    document_count: unique.length,
    projects,
    documents: unique,
  });
}

/**
 * Assembles the caller's export.
 *
 * `now` is a parameter so a test can assert the timestamp rather than match a
 * regular expression against whatever the clock said.
 */
export async function buildExport(
  viewer: Viewer,
  store: BackendStore = demoBackendStore,
  now: Date = new Date(),
): Promise<Result<ExportBundle>> {
  const built =
    viewer.role === "site_owner"
      ? await buildOwnerExport(viewer, store)
      : viewer.role === "investor"
        ? await buildInvestorExport(viewer, store)
        : await buildOperatorExport(viewer, store);

  if (!built.ok) return built;

  return ok({
    generated_at: now.toISOString(),
    role: viewer.role,
    user_id: viewer.userId,
    ...built.value,
  });
}

export const PROJECT_CSV_COLUMNS = [
  "site_id",
  "project_id",
  "name",
  "address",
  "locality",
  "site_type",
  "submission_status",
  "project_stage",
  "journey_stage_id",
  "viability_status",
  "estimated_system_size_kw_low",
  "estimated_system_size_kw_high",
  "estimated_annual_generation_kwh_low",
  "estimated_annual_generation_kwh_high",
  "updated_at",
] as const satisfies readonly (keyof ExportProjectRow)[];

export const DOCUMENT_CSV_COLUMNS = [
  "id",
  "site_id",
  "project_id",
  "original_filename",
  "content_type",
  "size_bytes",
  "doc_type",
  "created_at",
  "content_url",
] as const satisfies readonly (keyof ExportDocumentRow)[];

/**
 * Escapes one CSV field.
 *
 * Quoting is unconditional rather than "only when it contains a comma". A
 * conditional rule has to be right about every separator, newline and quote in
 * caller-supplied text — addresses and filenames here — and always quoting is
 * both valid RFC 4180 and impossible to get wrong. `null` becomes an empty
 * quoted field, which is how a spreadsheet reads "no value"; the string "null"
 * would read as data.
 */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return '""';
  return `"${String(value).replaceAll('"', '""')}"`;
}

function csvRows(
  columns: readonly string[],
  rows: readonly Record<string, unknown>[],
): string[] {
  return [
    columns.map(csvField).join(","),
    ...rows.map((row) => columns.map((column) => csvField(row[column])).join(",")),
  ];
}

/**
 * Renders the bundle as CSV.
 *
 * Two tables in one file, separated by a blank line and a `#` caption. A single
 * download was the request, projects and documents do not share a column set,
 * and every spreadsheet imports this without a plugin. `\r\n` because RFC 4180
 * specifies it and Excel on Windows is the likeliest consumer.
 */
export function toCsv(bundle: ExportBundle): string {
  const lines = [
    "# SunSum Solar export",
    `# generated_at,${bundle.generated_at}`,
    `# role,${bundle.role}`,
    `# scope,${bundle.scope}`,
    "",
    "# projects",
    ...csvRows(
      PROJECT_CSV_COLUMNS,
      bundle.projects as unknown as readonly Record<string, unknown>[],
    ),
    "",
    "# documents",
    ...csvRows(
      DOCUMENT_CSV_COLUMNS,
      bundle.documents as unknown as readonly Record<string, unknown>[],
    ),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

/**
 * The download filename.
 *
 * Dated, role-scoped and ASCII-only, so repeated exports do not overwrite each
 * other in a downloads folder and nothing has to be escaped on the way out.
 */
export function exportFilename(
  bundle: ExportBundle,
  format: ExportFormat,
): string {
  const day = bundle.generated_at.slice(0, 10);
  return `sunsum-export-${bundle.role.replaceAll("_", "-")}-${day}.${format}`;
}
