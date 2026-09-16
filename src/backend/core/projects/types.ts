/**
 * Project vocabulary, as it appears on the wire.
 *
 * These enums are the ones in the agreed API contract and design document
 * section 5.3. They are deliberately separate from `@/domain/journey`, which is
 * the seven-step public *display* ribbon using kebab-case ids: this is the
 * five-value `projects.stage` column using snake_case, and a submitted site
 * only gains one once an operator accepts it.
 *
 * Each enum ships with a type guard because every value that arrives from a
 * query string, a request body or a seed file has to be validated before it is
 * treated as one of these.
 */

export const PROJECT_STAGES = [
  "pre_development",
  "development",
  "construction",
  "commissioning",
  "operations",
] as const;

export type ProjectStage = (typeof PROJECT_STAGES)[number];

export function isProjectStage(value: string): value is ProjectStage {
  return PROJECT_STAGES.some((stage) => stage === value);
}

/**
 * The stages capital is raised against — **not** `PROJECT_STAGES`.
 *
 * The two lists share three values and then diverge. An investor funds
 * `permanent` capital, which is not a project stage; a project reaches
 * `commissioning` and `operations`, which nothing is raised against. Treating
 * them as one enumeration makes a `permanent` mandate unrepresentable, which is
 * the defect review found in `Viewer.fundingStageFocus`.
 *
 * It lives beside `PROJECT_STAGES` so that the difference is visible at the
 * point someone reaches for the wrong one, and in `core` rather than in `db`
 * because the matcher has to be able to import it.
 */
export const FUNDING_STAGES = [
  "pre_development",
  "development",
  "construction",
  "permanent",
] as const;

export type FundingStage = (typeof FUNDING_STAGES)[number];

export function isFundingStage(value: string): value is FundingStage {
  return FUNDING_STAGES.some((stage) => stage === value);
}

/**
 * Which funding stage a project at a given project stage raises against.
 *
 * Comparing a mandate to a project needs this mapping, never an equality test.
 * `commissioning` and `operations` map to `permanent` because a built asset
 * raises permanent capital rather than construction finance — an inference from
 * section 7.8 that is recorded as an open question on ADR 0001.
 */
export const FUNDING_STAGE_BY_PROJECT_STAGE = {
  pre_development: "pre_development",
  development: "development",
  construction: "construction",
  commissioning: "permanent",
  operations: "permanent",
} as const satisfies Record<ProjectStage, FundingStage>;

export function fundingStageForProject(stage: ProjectStage): FundingStage {
  return FUNDING_STAGE_BY_PROJECT_STAGE[stage];
}

export const VIABILITY_STATUSES = [
  "potentially_viable",
  "more_information_required",
  "not_currently_eligible",
] as const;

export type ViabilityStatus = (typeof VIABILITY_STATUSES)[number];

export function isViabilityStatus(value: string): value is ViabilityStatus {
  return VIABILITY_STATUSES.some((status) => status === value);
}

export const SITE_TYPES = ["rooftop", "land"] as const;

export type SiteType = (typeof SITE_TYPES)[number];

export function isSiteType(value: string): value is SiteType {
  return SITE_TYPES.some((siteType) => siteType === value);
}

/**
 * A project as the backend holds it.
 *
 * This is the internal record, not a payload. It intentionally carries the
 * tier-restricted site details — exact address, coordinates and the owner's
 * identity — because that is what a real row looks like. Everything that leaves
 * the backend is projected from this into a narrower, tier-appropriate shape,
 * so the projection is the only place those fields can escape.
 *
 * Capacity is kilowatts (kW) and generation is kilowatt-hours per year (kWh).
 * `null` means not yet estimated, which is different from zero.
 */
export interface ProjectRecord {
  id: string;
  siteId: string;
  name: string;
  stage: ProjectStage;

  /** Operator-controlled, default false. Nothing reaches an investor without it. */
  visibleToInvestors: boolean;

  /** Tier-restricted. Never present in a tier 0 payload. */
  siteAddressRaw: string;
  siteLatitude: number;
  siteLongitude: number;
  ownerUserId: string;

  /** Neighbourhood-level only, safe at tier 0. */
  locality: string;
  /** Coarse region used for investor mandate matching, for example "GA". */
  region: string;

  siteType: SiteType;
  preliminaryProjectType: string | null;
  viabilityStatus: ViabilityStatus;

  estimatedSystemSizeKwLow: number | null;
  estimatedSystemSizeKwHigh: number | null;
  estimatedAnnualGenerationKwhLow: number | null;
  estimatedAnnualGenerationKwhHigh: number | null;

  /** Midpoint capacity carried on the project itself, in kW. */
  estimatedCapacityKw: number | null;

  /** Funding needs still open, which is what a mandate match looks at. */
  openFundingNeedsCount: number;
  assignedOperatorUserId?: string | null;
  nextAction?: string | null;
  targetDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
}
