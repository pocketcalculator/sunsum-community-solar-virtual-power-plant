import {
  demoViabilityClient,
  type SiteRecord,
  type ViabilityAssessmentInput,
  type ViabilityAssessmentResult,
  type ViabilityClient,
  type ViabilityStatus,
} from "@/backend/core";

/**
 * The viability seam — the `Backend API -> Viability Service` arrow in §6.1.
 *
 * `core` owns the `ViabilityClient` interface and never learns that a second
 * service exists; this module speaks HTTP to it and translates. The split
 * matters because the two sides do not agree on vocabulary, units, or shape,
 * and every one of those disagreements is resolved here rather than leaking
 * into the domain.
 *
 * Mirrors `SUNSUM_STORE` and `SUNSUM_BLOB`: the demo fixture is the default so
 * a clean checkout, `npm test` and CI all work with no second service running,
 * and `SUNSUM_VIABILITY=http` points at a real one. An unrecognised value
 * throws rather than falling back, because a typo would otherwise present as a
 * working deployment that silently screens every site with fixture numbers.
 *
 * `createSite` and `submitSite` already wrap `assess` in try/catch and return
 * `service_unavailable` with nothing persisted, so the contract this module has
 * to honour is simply: return a well-formed result, or throw.
 */

export const VIABILITY_MODES = ["demo", "http"] as const;

export type ViabilityMode = (typeof VIABILITY_MODES)[number];

function isViabilityMode(value: string): value is ViabilityMode {
  return VIABILITY_MODES.some((mode) => mode === value);
}

export { isViabilityMode };

const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * The upstream's recommendation vocabulary, which is not ours.
 *
 * `satisfies` makes this total: if the service adds a recommendation, the build
 * fails here rather than defaulting a site into an answer nobody chose.
 *
 * `viable` deliberately maps *down* to `potentially_viable`. Our contract has
 * no "viable", and Feature C is explicit that this is a preliminary screening
 * and not an engineering, utility or financing approval — so promoting a
 * screening result into a stronger claim than our own UI is allowed to make
 * would be a misrepresentation, not a convenience.
 */
const STATUS_BY_RECOMMENDATION = {
  viable: "potentially_viable",
  potentially_viable: "potentially_viable",
  not_viable: "not_currently_eligible",
  insufficient_information: "more_information_required",
} as const satisfies Record<string, ViabilityStatus>;

type Recommendation = keyof typeof STATUS_BY_RECOMMENDATION;

function isRecommendation(value: unknown): value is Recommendation {
  return typeof value === "string" && value in STATUS_BY_RECOMMENDATION;
}

/**
 * Unit translation, in one place and in one direction.
 *
 * We store `approximate_area_sqm`; the service takes square feet for a roof and
 * acres for land. Both constants are exact by definition (the international
 * foot is 0.3048 m exactly), so the conversion introduces no error of its own.
 */
const SQFT_PER_SQM = 10.763910416709722;
const SQM_PER_ACRE = 4046.8564224;

export function squareMetresToSquareFeet(sqm: number): number {
  return sqm * SQFT_PER_SQM;
}

export function squareMetresToAcres(sqm: number): number {
  return sqm / SQM_PER_ACRE;
}

/** The subset of the upstream `SiteSubmission` we can honestly populate. */
interface SiteSubmissionPayload {
  site_id: string;
  street_address?: string;
  latitude?: number;
  longitude?: number;
  candidate_mount_type?: string;
  usable_roof_area_sqft?: number;
  usable_land_area_acres?: number;
  ownership_verified?: boolean;
  site_control_verified?: boolean;
  provenance: Record<string, string>;
}

/**
 * Builds the upstream request from a site record.
 *
 * Only fields the owner actually gave us are sent. Nothing is defaulted or
 * inferred: an absent field means "unknown", and the service's own
 * `missing_information` is how that comes back to the owner. Filling a gap with
 * a plausible number here would produce a screening result that looks
 * better-evidenced than it is.
 *
 * `electricityUsageKwhAnnual` is deliberately *not* mapped to the upstream's
 * `annual_production_kwh`. One is what the site consumes, the other is what an
 * array would generate; they are different quantities that happen to share a
 * unit, and conflating them would corrupt the financial screening downstream.
 */
export function toSiteSubmission(site: SiteRecord): SiteSubmissionPayload {
  const payload: SiteSubmissionPayload = { site_id: site.id, provenance: {} };

  if (site.addressRaw !== null) {
    payload.street_address = site.addressRaw.slice(0, 250);
    payload.provenance.street_address = "site_owner";
  }
  if (site.latitude !== null) payload.latitude = site.latitude;
  if (site.longitude !== null) payload.longitude = site.longitude;

  if (site.siteType !== null) {
    payload.candidate_mount_type = site.siteType === "rooftop" ? "rooftop" : "ground_mount";
    payload.provenance.candidate_mount_type = "site_owner";
  }

  if (site.approximateAreaSqm !== null && site.siteType !== null) {
    if (site.siteType === "rooftop") {
      payload.usable_roof_area_sqft = squareMetresToSquareFeet(site.approximateAreaSqm);
      payload.provenance.usable_roof_area_sqft = "site_owner";
    } else {
      payload.usable_land_area_acres = squareMetresToAcres(site.approximateAreaSqm);
      payload.provenance.usable_land_area_acres = "site_owner";
    }
  }

  if (site.ownershipStatus !== null) {
    const confirmed = site.ownershipStatus === "confirmed";
    payload.ownership_verified = confirmed;
    payload.site_control_verified = confirmed;
    payload.provenance.ownership_verified = "site_owner";
  }

  return payload;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Translates the upstream response into an `AssessmentRecord`'s worth of facts.
 *
 * The one judgement call is the size and generation *ranges*. The service
 * returns single point estimates, not bands. Rather than invent a spread around
 * them — which would fabricate a confidence interval nobody computed — both
 * bounds are set to the point value and a flag records that the upstream gave a
 * point estimate. A reader who sees low equal to high can tell that no range
 * was offered; a reader given an invented plus-or-minus band could not.
 */
export function toAssessmentResult(body: unknown): ViabilityAssessmentResult {
  const root = asRecord(body);
  const assessment = asRecord(root.assessment);

  const recommendation = assessment.recommendation ?? root.original_recommendation;
  if (!isRecommendation(recommendation)) {
    throw new Error(
      `Viability service returned an unknown recommendation: ${JSON.stringify(recommendation)}.`,
    );
  }

  const solar = asRecord(assessment.solar_estimate);
  const capacityKw = asFiniteNumber(solar.estimated_capacity_kw);
  const productionKwh = asFiniteNumber(solar.estimated_annual_production_kwh);

  const flags = [
    ...asStringArray(assessment.constraints_and_risks),
    ...asStringArray(solar.warnings),
  ];
  if (capacityKw !== null || productionKwh !== null) {
    flags.push("upstream_point_estimate_not_a_range");
  }

  const policyVersion = asNullableString(assessment.policy_version) ?? "unknown";

  return {
    rulesetVersion: `viability-service/${policyVersion}`,
    /**
     * `inputs_used` is what Feature C shows the owner as "the factors used", so
     * it carries the upstream's own account of its evidence and methodology
     * rather than a restatement of the request we sent.
     */
    inputsUsed: {
      assessment_id: asNullableString(root.id),
      policy_version: policyVersion,
      explanation: asNullableString(assessment.explanation),
      supporting_evidence: asStringArray(assessment.supporting_evidence),
      recommended_mount_type: asNullableString(assessment.recommended_mount_type),
      solar_methodology: asNullableString(solar.methodology),
      capacity_source: asNullableString(solar.capacity_source),
      production_source: asNullableString(solar.production_source),
      evidence_completeness_score: asFiniteNumber(assessment.evidence_completeness_score),
    },
    estimatedSystemSizeKwLow: capacityKw,
    estimatedSystemSizeKwHigh: capacityKw,
    estimatedAnnualGenerationKwhLow: productionKwh,
    estimatedAnnualGenerationKwhHigh: productionKwh,
    preliminaryProjectType: asNullableString(assessment.recommended_mount_type),
    viabilityStatus: STATUS_BY_RECOMMENDATION[recommendation],
    flags,
    missingInformation: asStringArray(assessment.missing_information),
  };
}

export interface HttpViabilityClientOptions {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

export class HttpViabilityClient implements ViabilityClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpViabilityClientOptions) {
    const baseUrl = options.baseUrl.trim();
    if (baseUrl === "") {
      throw new Error("SUNSUM_VIABILITY_URL is required when SUNSUM_VIABILITY=http.");
    }
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async assess({ site }: ViabilityAssessmentInput): Promise<ViabilityAssessmentResult> {
    const response = await this.fetchImpl(`${this.baseUrl}/assessments`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      /**
       * Keyed on the site *and* the revision being screened. A retry of the
       * same submission is idempotent, but re-submitting after the owner
       * supplies missing information is a genuinely new screening — assessments
       * are append-only (§5.2) and must not collapse into the earlier one.
       */
      body: JSON.stringify({
        idempotency_key: `${site.id}:${site.updatedAt}`,
        submitted_by: "SunSum backend",
        site: toSiteSubmission(site),
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Viability service responded ${response.status} ${response.statusText}.`);
    }

    return toAssessmentResult(await response.json());
  }
}

let configured: ViabilityClient | null = null;

export function selectedViabilityMode(): ViabilityMode {
  const mode = process.env.SUNSUM_VIABILITY ?? "demo";
  if (!isViabilityMode(mode)) {
    throw new Error(
      `SUNSUM_VIABILITY must be one of ${VIABILITY_MODES.join(", ")}; received ${JSON.stringify(mode)}.`,
    );
  }
  return mode;
}

export function viabilityClient(): ViabilityClient {
  if (configured === null) {
    const timeout = Number(process.env.SUNSUM_VIABILITY_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
    configured =
      selectedViabilityMode() === "http"
        ? new HttpViabilityClient({
            baseUrl: process.env.SUNSUM_VIABILITY_URL ?? "",
            timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
          })
        : demoViabilityClient;
  }

  return configured;
}

/** Test helper — drops the memoised client so the next call re-reads the env. */
export function resetViabilityClient(): void {
  configured = null;
}
