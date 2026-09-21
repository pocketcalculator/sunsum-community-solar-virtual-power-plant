/**
 * The portfolio as the investor workspace renders it.
 *
 * A pure transform over the wire rows, in the same spirit as the site owner
 * dashboard's `fromOwnerSites`: the page performs the already-authorized read
 * and this file only changes shape. Nothing here can widen what the caller was
 * allowed to see, because it only ever reads fields the tier 0 payload carries.
 *
 * `GET /portfolio` publishes tier 0 — "neighbourhood location, capacity and
 * production ranges, project type, stage, viability. No exact address,
 * documents or owner identity." There is deliberately no field below that could
 * hold any of those, so this mapping cannot leak them even if edited carelessly.
 */

/**
 * The wire vocabularies, duplicated rather than imported.
 *
 * Importing them would pull `@/backend` into a browser bundle, which the module
 * boundary forbids. The API validates every one of these and answers
 * `invalid_query` for anything it does not recognise, so the two lists drifting
 * apart produces a visible refusal rather than a silently wrong filter.
 */
export const PROJECT_STAGES = [
  "pre_development",
  "development",
  "construction",
  "commissioning",
  "operations",
] as const;

export const VIABILITY_STATUSES = [
  "potentially_viable",
  "more_information_required",
  "not_currently_eligible",
] as const;

/**
 * The engagement states that mean "this investor is already in". Mirrors
 * `LIVE_STATES` in `core/engagements/workflows.ts`: expressing interest again
 * while one of these is live is refused with `409 conflict`, so the button has
 * to know the same list in order to not offer a click that cannot succeed.
 */
export const LIVE_ENGAGEMENT_STATES = [
  "interested",
  "committed",
  "underwriting",
  "approved",
  "funded",
] as const;

export interface PortfolioProject {
  readonly projectId: string;
  readonly name: string;
  readonly locality: string;
  readonly stage: string;
  readonly stageLabel: string;
  readonly siteType: string;
  readonly siteTypeLabel: string;
  readonly projectType: string | null;
  readonly viabilityStatus: string | null;
  readonly viabilityLabel: string | null;
  readonly capacityKwLow: number | null;
  readonly capacityKwHigh: number | null;
  readonly generationKwhLow: number | null;
  readonly generationKwhHigh: number | null;
  readonly openFundingNeedsCount: number;
}

export interface PortfolioView {
  readonly projects: readonly PortfolioProject[];
  readonly projectCount: number;
  readonly totalEstimatedCapacityKw: number;
  /** Whether the mandate filter was applied, so the view can offer to widen. */
  readonly mandateMatch: boolean;
}

/** Whether the rows came from the API or are the illustrative fallback. */
export type PortfolioDataSource = "live" | "sample";

export interface PortfolioFilters {
  readonly stages: readonly string[];
  readonly viability: string | null;
  readonly projectType: string | null;
  readonly mandateMatch: boolean;
}

export const DEFAULT_PORTFOLIO_FILTERS: PortfolioFilters = {
  stages: [],
  viability: null,
  projectType: null,
  /**
   * `mandate_match` defaults to true on the server, so the default here has to
   * agree. A client that assumed false would show "all projects" over a list
   * the server had already narrowed.
   */
  mandateMatch: true,
};

function text(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * A human label for a value the API expresses in snake_case.
 *
 * Generic rather than a lookup table, for the same reason the owner dashboard
 * does it this way: a value this workspace has not heard of should still render
 * as something readable rather than be dropped.
 */
export function humanize(value: string): string {
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * A capacity or generation range with its unit always attached.
 *
 * `null` means not yet estimated, which is not zero and must not render as it.
 * Both bounds equal collapses to a single figure rather than "120–120".
 */
export function formatRange(
  low: number | null,
  high: number | null,
  unit: string,
): string | null {
  if (low === null && high === null) return null;
  const format = (value: number) => value.toLocaleString("en-US");
  if (low !== null && high !== null) {
    return low === high
      ? `${format(low)} ${unit}`
      : `${format(low)}–${format(high)} ${unit}`;
  }
  const known = low ?? high;
  return known === null ? null : `${format(known)} ${unit}`;
}

export function toPortfolioProject(
  row: Record<string, unknown>,
): PortfolioProject {
  const stage = text(row, "stage") ?? "";
  const siteType = text(row, "site_type") ?? "";
  const viabilityStatus = text(row, "viability_status");

  return {
    projectId: text(row, "project_id") ?? "",
    name: text(row, "name") ?? "Unnamed project",
    locality: text(row, "locality") ?? "Location withheld",
    stage,
    stageLabel: stage === "" ? "Unknown" : humanize(stage),
    siteType,
    siteTypeLabel: siteType === "" ? "Unknown" : humanize(siteType),
    projectType: text(row, "preliminary_project_type"),
    viabilityStatus,
    viabilityLabel: viabilityStatus === null ? null : humanize(viabilityStatus),
    capacityKwLow: num(row, "estimated_system_size_kw_low"),
    capacityKwHigh: num(row, "estimated_system_size_kw_high"),
    generationKwhLow: num(row, "estimated_annual_generation_kwh_low"),
    generationKwhHigh: num(row, "estimated_annual_generation_kwh_high"),
    openFundingNeedsCount: num(row, "open_funding_needs_count") ?? 0,
  };
}

/**
 * The whole `GET /portfolio` body as a view, or `null` when it is not one.
 *
 * Returning `null` rather than an empty view keeps "the response was not what
 * we expected" distinguishable from "the investor matched no projects". Only
 * the first should fall back to the sample.
 */
export function toPortfolioView(payload: unknown): PortfolioView | null {
  if (typeof payload !== "object" || payload === null) return null;
  const body = payload as Record<string, unknown>;
  if (!Array.isArray(body.items)) return null;

  const projects = (body.items as Record<string, unknown>[]).map(
    toPortfolioProject,
  );

  return {
    projects,
    projectCount: num(body, "project_count") ?? projects.length,
    totalEstimatedCapacityKw: num(body, "total_estimated_capacity_kw") ?? 0,
    /** Absent is not false: the server applies the filter by default. */
    mandateMatch:
      typeof body.mandate_match === "boolean" ? body.mandate_match : true,
  };
}

/**
 * Which projects this investor already has a live engagement on.
 *
 * Read from `GET /me/engagements` so the button renders its engaged state
 * immediately, rather than offering a click the API will refuse with a 409.
 */
export function toEngagedProjectIds(payload: unknown): readonly string[] {
  if (!Array.isArray(payload)) return [];

  const live = new Set<string>(LIVE_ENGAGEMENT_STATES);
  const ids = new Set<string>();
  for (const entry of payload as Record<string, unknown>[]) {
    if (typeof entry !== "object" || entry === null) continue;
    const projectId = text(entry, "project_id");
    const state = text(entry, "state");
    if (projectId !== null && state !== null && live.has(state)) {
      ids.add(projectId);
    }
  }
  return [...ids];
}

/**
 * The query string for `GET /portfolio`.
 *
 * Parameter names are exact because the handler rejects anything it does not
 * recognise with `invalid_query` rather than ignoring it. `mandate_match` is
 * always sent, including when it matches the server default, so the request
 * states its intent rather than relying on agreement about a default.
 */
export function portfolioQueryString(filters: PortfolioFilters): string {
  const params = new URLSearchParams();
  params.set("mandate_match", filters.mandateMatch ? "true" : "false");
  for (const stage of filters.stages) params.append("stage", stage);
  if (filters.viability !== null) params.set("viability", filters.viability);
  if (filters.projectType !== null) {
    params.set("project_type", filters.projectType);
  }
  return params.toString();
}
