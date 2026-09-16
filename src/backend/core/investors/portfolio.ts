/**
 * `GET /portfolio` — the investor's tier 0 view.
 *
 * This module is the reference for how a read endpoint is built. It owns three
 * things and nothing else:
 *
 * 1. **Authorization.** Who may call this at all, checked here rather than in
 *    the handler so that any future caller is subject to the same rule.
 * 2. **Selection.** Which projects this viewer is entitled to see, and which of
 *    those the query asked for.
 * 3. **Projection.** Turning internal records into the agreed payload, dropping
 *    everything the viewer's tier does not permit.
 *
 * It knows nothing about HTTP. It takes an already-validated query and an
 * already-established viewer, and returns a `Result`. The handler turns the
 * failure code into a status.
 *
 * Payload properties are snake_case because that is the wire contract.
 * Everything internal stays camelCase, and the projection below is the single
 * place the two meet.
 */

import type { InvestorProfile, Viewer } from "../identity";
import {
  type ProjectRecord,
  type ProjectStage,
  type ProjectStore,
  type SiteType,
  type ViabilityStatus,
} from "../projects";
import { failure, ok, type Result } from "../shared";
import { demoBackendStore } from "../store";

/**
 * One project at disclosure tier 0.
 *
 * Tier 0 is "neighbourhood location, capacity and production ranges, project
 * type, stage, viability. No exact address, documents or owner identity."
 *
 * That restriction is structural: there is no field here that could carry the
 * exact address, the coordinates, the owner or a document, so tier 0 cannot
 * leak them even if the projection below is edited carelessly. Widening this
 * interface is the moment to re-read section 7.7.
 */
export interface PortfolioItem {
  readonly project_id: string;
  readonly name: string;
  readonly locality: string;
  readonly stage: ProjectStage;
  readonly site_type: SiteType;
  readonly preliminary_project_type: string | null;
  readonly viability_status: ViabilityStatus;
  readonly estimated_system_size_kw_low: number | null;
  readonly estimated_system_size_kw_high: number | null;
  readonly estimated_annual_generation_kwh_low: number | null;
  readonly estimated_annual_generation_kwh_high: number | null;
  readonly open_funding_needs_count: number;
}

export interface PortfolioResponse {
  readonly items: readonly PortfolioItem[];
  readonly project_count: number;
  /** Aggregate of `estimated_capacity_kw` across `items`, in kilowatts. */
  readonly total_estimated_capacity_kw: number;
  /** Whether the mandate filter was applied, so the client can offer to widen. */
  readonly mandate_match: boolean;
}

/**
 * The query after the handler has validated it. Every field is resolved: the
 * default for `mandateMatch` has been applied and unknown enum values have
 * already been rejected, so core never re-parses a string.
 */
export interface PortfolioQuery {
  readonly mandateMatch: boolean;
  readonly stages: readonly ProjectStage[];
  readonly viability: ViabilityStatus | null;
  readonly projectType: string | null;
}

export const DEFAULT_PORTFOLIO_QUERY: PortfolioQuery = {
  mandateMatch: true,
  stages: [],
  viability: null,
  projectType: null,
};

export async function getPortfolio(
  viewer: Viewer,
  query: PortfolioQuery,
  store: ProjectStore = demoBackendStore,
): Promise<Result<PortfolioResponse>> {
  /**
   * Authorization first, before any data is read. The union narrows on `role`,
   * so the investor profile below is available without a cast.
   */
  if (viewer.role !== "investor") {
    return failure(
      "forbidden_role",
      "Only an investor can read the portfolio.",
    );
  }

  if (viewer.investor.onboardingCompletedAt === null) {
    return failure(
      "forbidden_tier",
      "Complete investor onboarding to see the portfolio.",
    );
  }

  const projects = await store.listProjects();

  const entitled = projects.filter(isVisibleToInvestors);
  const matching = query.mandateMatch
    ? entitled.filter((project) => matchesMandate(project, viewer.investor))
    : entitled;
  const selected = matching.filter((project) => matchesQuery(project, query));

  return ok({
    items: selected.map(toPortfolioItem),
    project_count: selected.length,
    total_estimated_capacity_kw: totalCapacityKw(selected),
    mandate_match: query.mandateMatch,
  });
}

/**
 * The investor-visibility rule, in one place.
 *
 * Only the operator sets this flag and it defaults to false, so an unpublished
 * project is invisible to every investor. Every investor-facing read must start
 * here.
 */
function isVisibleToInvestors(project: ProjectRecord): boolean {
  return project.visibleToInvestors;
}

/**
 * The default mandate match: projects this investor could actually fund today.
 *
 * All three clauses must hold. An empty list in the profile means the investor
 * expressed no preference, which widens rather than excludes — an unanswered
 * onboarding question must not silently empty someone's portfolio.
 */
function matchesMandate(
  project: ProjectRecord,
  investor: InvestorProfile,
): boolean {
  const fundsThisStage =
    investor.fundingStageFocus.length === 0 ||
    investor.fundingStageFocus.includes(project.stage);

  const fundsThisRegion =
    investor.geographies.length === 0 ||
    project.region === "" ||
    investor.geographies.includes(project.region);

  /** "Mandate match against open funding needs" — nothing open, nothing to fund. */
  const hasSomethingToFund = project.openFundingNeedsCount > 0;

  return fundsThisStage && fundsThisRegion && hasSomethingToFund;
}

/** The explicit filters an investor set on the request. */
function matchesQuery(project: ProjectRecord, query: PortfolioQuery): boolean {
  if (query.stages.length > 0 && !query.stages.includes(project.stage)) {
    return false;
  }

  if (query.viability !== null && project.viabilityStatus !== query.viability) {
    return false;
  }

  if (
    query.projectType !== null &&
    project.preliminaryProjectType !== query.projectType
  ) {
    return false;
  }

  return true;
}

/**
 * The tier 0 projection.
 *
 * Written as an explicit field list rather than a spread, so that adding a
 * column to `ProjectRecord` can never publish it by accident.
 */
function toPortfolioItem(project: ProjectRecord): PortfolioItem {
  return {
    project_id: project.id,
    name: project.name,
    locality: project.locality,
    stage: project.stage,
    site_type: project.siteType,
    preliminary_project_type: project.preliminaryProjectType,
    viability_status: project.viabilityStatus,
    estimated_system_size_kw_low: project.estimatedSystemSizeKwLow,
    estimated_system_size_kw_high: project.estimatedSystemSizeKwHigh,
    estimated_annual_generation_kwh_low: project.estimatedAnnualGenerationKwhLow,
    estimated_annual_generation_kwh_high:
      project.estimatedAnnualGenerationKwhHigh,
    open_funding_needs_count: project.openFundingNeedsCount,
  };
}

/**
 * Sum of estimated capacity in kW, rounded to two decimal places.
 *
 * Adding binary floats accumulates representation error, so an unrounded total
 * can surface as 1234.5600000000002 in the payload. Two decimal places is well
 * inside the precision of an estimate whose own inputs are a range. A project
 * with no estimate yet contributes nothing rather than being treated as zero
 * capacity.
 */
function totalCapacityKw(projects: readonly ProjectRecord[]): number {
  const total = projects.reduce(
    (sum, project) => sum + (project.estimatedCapacityKw ?? 0),
    0,
  );

  return Math.round(total * 100) / 100;
}
