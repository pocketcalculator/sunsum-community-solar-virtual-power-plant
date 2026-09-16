import type { Viewer } from "../identity";
import { isSiteType, type SiteType, type ViabilityStatus } from "../projects";
import { failure, ok, type Result } from "../shared";
import { demoBackendStore, type BackendStore } from "../store";
import type {
  AssessmentRecord,
  MissingField,
  SiteCreateInput,
  SiteRecord,
  SubmissionStatus,
  UserRecord,
  ViabilityClient,
} from "./types";

export interface SitePayload {
  readonly id: string;
  readonly owner_user_id: string;
  readonly address_raw: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly geocode_confidence: number | null;
  readonly site_type: SiteType | null;
  readonly ownership_status: SiteRecord["ownershipStatus"];
  readonly approximate_area_sqm: number | null;
  readonly electricity_usage_kwh_annual: number | null;
  readonly electricity_bill_doc_id: string | null;
  readonly has_existing_solar: boolean | null;
  readonly consent_given_at: string | null;
  readonly submission_status: SubmissionStatus;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface AssessmentPayload {
  readonly id: string;
  readonly site_id: string;
  readonly ruleset_version: string;
  readonly inputs_used: Readonly<Record<string, unknown>>;
  readonly estimated_system_size_kw_low: number | null;
  readonly estimated_system_size_kw_high: number | null;
  readonly estimated_annual_generation_kwh_low: number | null;
  readonly estimated_annual_generation_kwh_high: number | null;
  readonly preliminary_project_type: string | null;
  readonly viability_status: ViabilityStatus;
  readonly flags: readonly string[];
  readonly missing_information: readonly string[];
  readonly is_override: boolean;
  readonly override_reason: string | null;
  readonly overridden_by_user_id: string | null;
  readonly created_at: string;
}

export interface CreateSiteResponse {
  readonly site: SitePayload;
  readonly missing_fields: readonly MissingField[];
  readonly assessment?: AssessmentPayload;
}

export interface SubmissionQuery {
  readonly statuses: readonly SubmissionStatus[];
  readonly siteType: SiteType | null;
  readonly viability: ViabilityStatus | null;
  readonly location: string | null;
}

export interface SubmissionSummary {
  readonly site: SitePayload;
  readonly assessment?: AssessmentPayload;
  readonly owner?: UserPayload;
}

export interface UserPayload {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: UserRecord["role"];
  readonly created_at: string;
}

export const demoViabilityClient: ViabilityClient = {
  assess: ({ site }) =>
    Promise.resolve({
      rulesetVersion: "demo-fixture-v1",
      inputsUsed: {
        demo_only: true,
        address_provided: site.addressRaw !== null,
        site_type: site.siteType,
      },
      estimatedSystemSizeKwLow: 100,
      estimatedSystemSizeKwHigh: 140,
      estimatedAnnualGenerationKwhLow: 135000,
      estimatedAnnualGenerationKwhHigh: 189000,
      preliminaryProjectType: "demo_only_fixture",
      viabilityStatus: "potentially_viable",
      flags: ["demo_only_fixture"],
      missingInformation: [],
    }),
};

export async function createSite(
  viewer: Viewer,
  input: SiteCreateInput,
  store: BackendStore = demoBackendStore,
  viabilityClient: ViabilityClient = demoViabilityClient,
): Promise<Result<CreateSiteResponse>> {
  if (viewer.role !== "site_owner") {
    return failure("forbidden_role", "Only a site owner can create a site.");
  }

  const now = new Date().toISOString();
  const site: SiteRecord = {
    id: store.nextId("site"),
    ownerUserId: viewer.userId,
    addressRaw: input.addressRaw ?? null,
    latitude: null,
    longitude: null,
    geocodeConfidence: null,
    siteType: input.siteType ?? null,
    ownershipStatus: input.ownershipStatus ?? null,
    approximateAreaSqm: input.approximateAreaSqm ?? null,
    electricityUsageKwhAnnual: input.electricityUsageKwhAnnual ?? null,
    electricityBillDocId: input.electricityBillDocId ?? null,
    hasExistingSolar: input.hasExistingSolar ?? null,
    consentGivenAt: input.consentGiven === true ? now : null,
    submissionStatus: input.submit ? "submitted" : "draft",
    createdAt: now,
    updatedAt: now,
  };
  const missingFields = getMissingFields(site);

  if (input.submit && missingFields.length > 0) {
    return failure("validation_failed", "The site is not ready to submit.", {
      missing_fields: missingFields,
    });
  }

  if (!input.submit) {
    await store.addSite(site);
    return ok({ site: toSitePayload(site), missing_fields: missingFields });
  }

  let result;
  try {
    result = await viabilityClient.assess({ site });
  } catch {
    return failure(
      "service_unavailable",
      "The viability service is unavailable. The site was not submitted.",
    );
  }

  const assessment: AssessmentRecord = {
    ...result,
    id: store.nextId("assessment"),
    siteId: site.id,
    isOverride: false,
    overrideReason: null,
    overriddenByUserId: null,
    createdAt: now,
  };

  await store.transaction(async (transaction) => {
    await transaction.addSite(site);
    await transaction.addAssessment(assessment);
  });

  return ok({
    site: toSitePayload(site),
    missing_fields: [],
    assessment: toAssessmentPayload(assessment),
  });
}

export async function listSubmissions(
  viewer: Viewer,
  query: SubmissionQuery,
  store: BackendStore = demoBackendStore,
): Promise<Result<readonly SubmissionSummary[]>> {
  if (viewer.role !== "operator") {
    return failure("forbidden_role", "Only an operator can read submissions.");
  }

  const sites = await store.listSites();
  const summaries = await Promise.all(
    sites
      .filter((site) => site.submissionStatus !== "draft")
      .filter(
        (site) =>
          query.statuses.length === 0 ||
          query.statuses.includes(site.submissionStatus),
      )
      .filter((site) => query.siteType === null || site.siteType === query.siteType)
      .filter(
        (site) =>
          query.location === null ||
          (site.addressRaw ?? "")
            .toLocaleLowerCase()
            .includes(query.location.toLocaleLowerCase()),
      )
      .map(async (site) => {
        const assessments = await store.listAssessments(site.id);
        const assessment = assessments.at(-1);
        const owner = await store.getUser(site.ownerUserId);
        return { site, assessment, owner };
      }),
  );

  return ok(
    summaries
      .filter(
        ({ assessment }) =>
          query.viability === null ||
          assessment?.viabilityStatus === query.viability,
      )
      .map(({ site, assessment, owner }) => ({
        site: toSitePayload(site),
        ...(assessment === undefined
          ? {}
          : { assessment: toAssessmentPayload(assessment) }),
        ...(owner === null ? {} : { owner: toUserPayload(owner) }),
      })),
  );
}

export function getMissingFields(site: SiteRecord): readonly MissingField[] {
  const missing: MissingField[] = [];
  if (!site.addressRaw?.trim()) {
    missing.push({ field: "address_raw", message: "Address is required." });
  }
  if (site.siteType === null) {
    missing.push({ field: "site_type", message: "Site type is required." });
  }
  if (site.ownershipStatus === null) {
    missing.push({
      field: "ownership_status",
      message: "Ownership status is required.",
    });
  }
  if (site.approximateAreaSqm === null) {
    missing.push({
      field: "approximate_area_sqm",
      message: "Approximate usable area is required.",
    });
  }
  if (
    site.electricityUsageKwhAnnual === null &&
    site.electricityBillDocId === null
  ) {
    missing.push({
      field: "electricity_usage_kwh_annual",
      message: "Electricity usage or a bill document is required.",
    });
  }
  if (site.hasExistingSolar === null) {
    missing.push({
      field: "has_existing_solar",
      message: "Existing solar status is required.",
    });
  }
  if (site.consentGivenAt === null) {
    missing.push({ field: "consent_given", message: "Consent is required." });
  }
  return missing;
}

export function toSitePayload(site: SiteRecord): SitePayload {
  return {
    id: site.id,
    owner_user_id: site.ownerUserId,
    address_raw: site.addressRaw,
    latitude: site.latitude,
    longitude: site.longitude,
    geocode_confidence: site.geocodeConfidence,
    site_type: site.siteType,
    ownership_status: site.ownershipStatus,
    approximate_area_sqm: site.approximateAreaSqm,
    electricity_usage_kwh_annual: site.electricityUsageKwhAnnual,
    electricity_bill_doc_id: site.electricityBillDocId,
    has_existing_solar: site.hasExistingSolar,
    consent_given_at: site.consentGivenAt,
    submission_status: site.submissionStatus,
    created_at: site.createdAt,
    updated_at: site.updatedAt,
  };
}

export function toAssessmentPayload(
  assessment: AssessmentRecord,
): AssessmentPayload {
  return {
    id: assessment.id,
    site_id: assessment.siteId,
    ruleset_version: assessment.rulesetVersion,
    inputs_used: assessment.inputsUsed,
    estimated_system_size_kw_low: assessment.estimatedSystemSizeKwLow,
    estimated_system_size_kw_high: assessment.estimatedSystemSizeKwHigh,
    estimated_annual_generation_kwh_low:
      assessment.estimatedAnnualGenerationKwhLow,
    estimated_annual_generation_kwh_high:
      assessment.estimatedAnnualGenerationKwhHigh,
    preliminary_project_type: assessment.preliminaryProjectType,
    viability_status: assessment.viabilityStatus,
    flags: assessment.flags,
    missing_information: assessment.missingInformation,
    is_override: assessment.isOverride,
    override_reason: assessment.overrideReason,
    overridden_by_user_id: assessment.overriddenByUserId,
    created_at: assessment.createdAt,
  };
}

function toUserPayload(user: UserRecord): UserPayload {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    created_at: user.createdAt,
  };
}

export function isSiteCreateType(value: string): value is SiteType {
  return isSiteType(value);
}
