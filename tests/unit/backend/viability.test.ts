// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import {
  HttpViabilityClient,
  isViabilityMode,
  resetViabilityClient,
  selectedViabilityMode,
  squareMetresToAcres,
  squareMetresToSquareFeet,
  toAssessmentResult,
  toSiteSubmission,
  VIABILITY_MODES,
  viabilityClient,
} from "@/backend/viability";
import { demoViabilityClient, type SiteRecord } from "@/backend/core";
import { createSite } from "@/backend/core/sites";
import { createMemoryBackendStore } from "@/backend/core/store";
import type { Viewer } from "@/backend/core/identity";

/**
 * The `Backend API -> Viability Service` arrow from §6.1.
 *
 * These cover the translation rather than the transport: the two services
 * disagree about units, about vocabulary and about whether an estimate is a
 * point or a range, and each of those disagreements is a place a demo could
 * silently show a wrong number to a homeowner.
 */

const OWNER_ID = "7a1f4e58-6b2c-4d91-8e30-1c5a7b9d2f40";

function site(overrides: Partial<SiteRecord> = {}): SiteRecord {
  return {
    id: "8a2c4d10-5e6f-4b7a-8c9d-0e1f2a3b4c01",
    ownerUserId: OWNER_ID,
    addressRaw: "100 Auburn Ave NE, Atlanta, GA 30303",
    latitude: null,
    longitude: null,
    geocodeConfidence: null,
    siteType: "rooftop",
    ownershipStatus: "confirmed",
    approximateAreaSqm: 500,
    electricityUsageKwhAnnual: 42_000,
    electricityBillDocId: null,
    hasExistingSolar: false,
    consentGivenAt: "2026-09-18T00:00:00.000Z",
    submissionStatus: "submitted",
    createdAt: "2026-09-18T00:00:00.000Z",
    updatedAt: "2026-09-18T00:00:00.000Z",
    ...overrides,
  };
}

function upstreamBody(assessment: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "assessment-1",
    site_id: "site-1",
    site: {},
    provider_results: {},
    assessment,
    financial: null,
    original_recommendation: "potentially_viable",
    final_human_decision: null,
    review_status: "awaiting_review",
    created_at: "2026-09-18T00:00:00Z",
    updated_at: "2026-09-18T00:00:00Z",
  };
}

afterEach(() => {
  resetViabilityClient();
  delete process.env.SUNSUM_VIABILITY;
  delete process.env.SUNSUM_VIABILITY_URL;
  delete process.env.SUNSUM_VIABILITY_TIMEOUT_MS;
});

describe("unit translation", () => {
  /**
   * Both factors are exact by definition, so these are equalities rather than
   * approximations. A rounded constant here would put a systematic error into
   * every screening.
   */
  it("converts square metres to square feet exactly", () => {
    expect(squareMetresToSquareFeet(1)).toBeCloseTo(10.763910416709722, 12);
    expect(squareMetresToSquareFeet(500)).toBeCloseTo(5381.955208354861, 9);
  });

  it("converts square metres to acres exactly", () => {
    expect(squareMetresToAcres(4046.8564224)).toBe(1);
    expect(squareMetresToAcres(10_000)).toBeCloseTo(2.4710538146716534, 12);
  });
});

describe("request translation", () => {
  it("sends a rooftop area as square feet and never as acres", () => {
    const payload = toSiteSubmission(site({ siteType: "rooftop", approximateAreaSqm: 500 }));
    expect(payload.usable_roof_area_sqft).toBeCloseTo(5381.955208354861, 9);
    expect(payload.usable_land_area_acres).toBeUndefined();
    expect(payload.candidate_mount_type).toBe("rooftop");
  });

  it("sends a land area as acres and never as square feet", () => {
    const payload = toSiteSubmission(site({ siteType: "land", approximateAreaSqm: 10_000 }));
    expect(payload.usable_land_area_acres).toBeCloseTo(2.4710538146716534, 12);
    expect(payload.usable_roof_area_sqft).toBeUndefined();
    expect(payload.candidate_mount_type).toBe("ground_mount");
  });

  /**
   * The regression this exists to prevent: annual *consumption* and annual
   * *production* share a unit, and the upstream has a field for the latter. A
   * site that uses 42,000 kWh does not therefore generate 42,000 kWh, and
   * feeding consumption in as production would corrupt the financial screening
   * without ever looking wrong.
   */
  it("never reports electricity usage as generation", () => {
    const payload = toSiteSubmission(site({ electricityUsageKwhAnnual: 42_000 }));
    expect(JSON.stringify(payload)).not.toContain("42000");
    expect(payload).not.toHaveProperty("annual_production_kwh");
  });

  it("omits what the owner did not provide rather than defaulting it", () => {
    const payload = toSiteSubmission(
      site({
        addressRaw: null,
        siteType: null,
        ownershipStatus: null,
        approximateAreaSqm: null,
        latitude: null,
        longitude: null,
      }),
    );
    expect(payload).toEqual({ site_id: site().id, provenance: {} });
  });

  it("treats only a confirmed ownership status as verified", () => {
    expect(toSiteSubmission(site({ ownershipStatus: "confirmed" })).ownership_verified).toBe(true);
    expect(toSiteSubmission(site({ ownershipStatus: "pending" })).ownership_verified).toBe(false);
    expect(toSiteSubmission(site({ ownershipStatus: "unverified" })).ownership_verified).toBe(
      false,
    );
  });

  it("truncates an address to the length the upstream accepts", () => {
    const payload = toSiteSubmission(site({ addressRaw: "x".repeat(400) }));
    expect(payload.street_address).toHaveLength(250);
  });

  it("records where each field came from", () => {
    expect(toSiteSubmission(site()).provenance).toMatchObject({
      street_address: "site_owner",
      usable_roof_area_sqft: "site_owner",
      ownership_verified: "site_owner",
    });
  });
});

describe("response translation", () => {
  /**
   * The upstream has four recommendations and our contract has three. The
   * mapping is total, and `viable` deliberately lands on `potentially_viable`
   * because Feature C forbids presenting a screening as an approval.
   */
  it.each([
    ["viable", "potentially_viable"],
    ["potentially_viable", "potentially_viable"],
    ["not_viable", "not_currently_eligible"],
    ["insufficient_information", "more_information_required"],
  ])("maps %s to %s", (recommendation, expected) => {
    const result = toAssessmentResult(upstreamBody({ recommendation }));
    expect(result.viabilityStatus).toBe(expected);
  });

  it("refuses a recommendation it does not recognise instead of guessing", () => {
    expect(() => toAssessmentResult(upstreamBody({ recommendation: "probably_fine" }))).toThrow(
      /unknown recommendation/,
    );
  });

  it("falls back to the top-level recommendation when the inner one is absent", () => {
    const result = toAssessmentResult(upstreamBody({}));
    expect(result.viabilityStatus).toBe("potentially_viable");
  });

  /**
   * The upstream returns a point estimate. Both bounds carry it and a flag says
   * so, rather than inventing a band nobody computed.
   */
  it("fills both bounds from a point estimate and flags that it is not a range", () => {
    const result = toAssessmentResult(
      upstreamBody({
        recommendation: "potentially_viable",
        solar_estimate: {
          estimated_capacity_kw: 186.4,
          estimated_annual_production_kwh: 251_000,
          methodology: "illustrative_area_capacity_yield_v1",
          capacity_source: "illustrative_area_estimate",
          production_source: "illustrative_specific_yield_estimate",
          warnings: [],
        },
      }),
    );
    expect(result.estimatedSystemSizeKwLow).toBe(186.4);
    expect(result.estimatedSystemSizeKwHigh).toBe(186.4);
    expect(result.estimatedAnnualGenerationKwhLow).toBe(251_000);
    expect(result.estimatedAnnualGenerationKwhHigh).toBe(251_000);
    expect(result.flags).toContain("upstream_point_estimate_not_a_range");
  });

  it("reports no numbers at all when the upstream could not estimate", () => {
    const result = toAssessmentResult(upstreamBody({ recommendation: "insufficient_information" }));
    expect(result.estimatedSystemSizeKwLow).toBeNull();
    expect(result.estimatedSystemSizeKwHigh).toBeNull();
    expect(result.estimatedAnnualGenerationKwhLow).toBeNull();
    expect(result.estimatedAnnualGenerationKwhHigh).toBeNull();
    expect(result.flags).not.toContain("upstream_point_estimate_not_a_range");
  });

  it("carries risks and warnings through as flags", () => {
    const result = toAssessmentResult(
      upstreamBody({
        recommendation: "potentially_viable",
        constraints_and_risks: ["Shading above policy threshold."],
        solar_estimate: { estimated_capacity_kw: 10, warnings: ["Area was estimated."] },
      }),
    );
    expect(result.flags).toEqual(
      expect.arrayContaining(["Shading above policy threshold.", "Area was estimated."]),
    );
  });

  it("carries missing information through untouched", () => {
    const result = toAssessmentResult(
      upstreamBody({
        recommendation: "insufficient_information",
        missing_information: ["Usable roof area", "Ownership documentation"],
      }),
    );
    expect(result.missingInformation).toEqual(["Usable roof area", "Ownership documentation"]);
  });

  it("names the upstream and its policy version in the ruleset", () => {
    const result = toAssessmentResult(
      upstreamBody({ recommendation: "potentially_viable", policy_version: "v1.2" }),
    );
    expect(result.rulesetVersion).toBe("viability-service/v1.2");
  });

  /**
   * `inputs_used` is what Feature C shows the owner as "the factors used", so
   * it has to carry the upstream's own account of its reasoning.
   */
  it("records the upstream's own explanation as the factors used", () => {
    const result = toAssessmentResult(
      upstreamBody({
        recommendation: "potentially_viable",
        explanation: "Roof area and orientation support a community array.",
        supporting_evidence: ["Geocoded address", "Owner-reported roof area"],
        evidence_completeness_score: 0.6,
      }),
    );
    expect(result.inputsUsed).toMatchObject({
      explanation: "Roof area and orientation support a community array.",
      supporting_evidence: ["Geocoded address", "Owner-reported roof area"],
      evidence_completeness_score: 0.6,
    });
  });

  it("survives a malformed body rather than producing a half-built assessment", () => {
    expect(() => toAssessmentResult(null)).toThrow(/unknown recommendation/);
    expect(() => toAssessmentResult("not json")).toThrow(/unknown recommendation/);
    expect(() => toAssessmentResult({ assessment: [] })).toThrow(/unknown recommendation/);
  });
});

describe("http client", () => {
  function stubFetch(
    body: unknown,
    init: { status?: number; statusText?: string } = {},
  ): { calls: Array<{ url: string; init: RequestInit }>; impl: typeof fetch } {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const impl = (async (url: string | URL | Request, requestInit?: RequestInit) => {
      calls.push({ url: String(url), init: requestInit ?? {} });
      return new Response(JSON.stringify(body), {
        status: init.status ?? 201,
        statusText: init.statusText ?? "Created",
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
    return { calls, impl };
  }

  it("posts the site to the upstream's /assessments resource", async () => {
    const { calls, impl } = stubFetch(upstreamBody({ recommendation: "potentially_viable" }));
    const client = new HttpViabilityClient({ baseUrl: "http://viability:8000", fetchImpl: impl });

    await client.assess({ site: site() });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://viability:8000/assessments");
    expect(calls[0]?.init.method).toBe("POST");
  });

  it("ignores a trailing slash on the configured base URL", async () => {
    const { calls, impl } = stubFetch(upstreamBody({ recommendation: "potentially_viable" }));
    const client = new HttpViabilityClient({ baseUrl: "http://viability:8000//", fetchImpl: impl });

    await client.assess({ site: site() });

    expect(calls[0]?.url).toBe("http://viability:8000/assessments");
  });

  /**
   * Re-submitting after the owner fills a gap is a new screening, not a repeat
   * of the old one: assessments are append-only, so the key has to move when
   * the site does.
   */
  it("keys idempotency on the site revision, not the site alone", async () => {
    const { calls, impl } = stubFetch(upstreamBody({ recommendation: "potentially_viable" }));
    const client = new HttpViabilityClient({ baseUrl: "http://viability:8000", fetchImpl: impl });

    await client.assess({ site: site({ updatedAt: "2026-09-18T00:00:00.000Z" }) });
    await client.assess({ site: site({ updatedAt: "2026-09-18T12:00:00.000Z" }) });

    const keys = calls.map((call) => JSON.parse(String(call.init.body)).idempotency_key);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[0]).toContain(site().id);
  });

  it("throws on an upstream error so the workflow reports it unavailable", async () => {
    const { impl } = stubFetch({}, { status: 500, statusText: "Internal Server Error" });
    const client = new HttpViabilityClient({ baseUrl: "http://viability:8000", fetchImpl: impl });

    await expect(client.assess({ site: site() })).rejects.toThrow(/responded 500/);
  });

  it("refuses to be constructed without a URL", () => {
    expect(() => new HttpViabilityClient({ baseUrl: "   " })).toThrow(/SUNSUM_VIABILITY_URL/);
  });
});

describe("client selection", () => {
  it("defaults to the demo fixture so a clean checkout needs no second service", () => {
    expect(viabilityClient()).toBe(demoViabilityClient);
    expect(selectedViabilityMode()).toBe("demo");
  });

  it("selects the http client when configured", () => {
    process.env.SUNSUM_VIABILITY = "http";
    process.env.SUNSUM_VIABILITY_URL = "http://viability:8000";
    expect(viabilityClient()).toBeInstanceOf(HttpViabilityClient);
  });

  /**
   * A typo used to be indistinguishable from a working deployment that screened
   * every site with the same fixture numbers.
   */
  it("refuses a misspelled mode instead of falling back to the fixture", () => {
    process.env.SUNSUM_VIABILITY = "htpt";
    expect(() => viabilityClient()).toThrow(/demo, http/);
  });

  it("refuses http mode with no URL", () => {
    process.env.SUNSUM_VIABILITY = "http";
    expect(() => viabilityClient()).toThrow(/SUNSUM_VIABILITY_URL/);
  });

  it("names every supported mode", () => {
    for (const mode of VIABILITY_MODES) {
      expect(isViabilityMode(mode)).toBe(true);
    }
    expect(isViabilityMode("https")).toBe(false);
  });

  it("memoises the client until it is reset", () => {
    const first = viabilityClient();
    expect(viabilityClient()).toBe(first);
    resetViabilityClient();
    process.env.SUNSUM_VIABILITY = "http";
    process.env.SUNSUM_VIABILITY_URL = "http://viability:8000";
    expect(viabilityClient()).not.toBe(first);
  });
});

describe("failure reaches the caller as service_unavailable", () => {
  /**
   * The seam's whole contract with `core`: throw, and the site is not
   * persisted. Proven through the real workflow rather than asserted.
   */
  it("persists neither site nor assessment when the service is down", async () => {
    const store = createMemoryBackendStore();
    const viewer: Viewer = { userId: OWNER_ID, role: "site_owner" };
    const unavailable = {
      assess: () => Promise.reject(new Error("Viability service responded 503.")),
    };

    const result = await createSite(
      viewer,
      {
        addressRaw: "100 Auburn Ave NE, Atlanta, GA 30303",
        siteType: "rooftop",
        ownershipStatus: "confirmed",
        approximateAreaSqm: 500,
        electricityUsageKwhAnnual: 42_000,
        hasExistingSolar: false,
        consentGiven: true,
        submit: true,
      },
      store,
      unavailable,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.code).toBe("service_unavailable");
    expect((await store.listSites()).filter((row) => row.ownerUserId === OWNER_ID)).toHaveLength(
      0,
    );
  });
});
