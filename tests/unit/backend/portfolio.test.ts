// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  getPortfolio,
  DEFAULT_PORTFOLIO_QUERY,
  type PortfolioQuery,
  type PortfolioResponse,
} from "@/backend/core/investors";
import type { InvestorProfile, Viewer } from "@/backend/core/identity";
import type { ProjectRecord, ProjectStore, FundingStage } from "@/backend/core/projects";
import {
  handleGetPortfolio,
  parsePortfolioQuery,
} from "@/backend/handlers/investors";

const onboardedInvestor: InvestorProfile = {
  id: "inv-1",
  organizationName: "Test Endowment",
  fundingStageFocus: [],
  geographies: [],
  onboardingCompletedAt: "2026-09-01T00:00:00.000Z",
};

const investor: Viewer = {
  role: "investor",
  userId: "u-inv-1",
  investor: onboardedInvestor,
};

const operator: Viewer = { role: "operator", userId: "u-op-1" };
const siteOwner: Viewer = { role: "site_owner", userId: "u-so-1" };

function project(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: "p-1",
    siteId: "s-1",
    name: "Test project",
    stage: "pre_development",
    visibleToInvestors: true,
    siteAddressRaw: "148 Auburn Ave NE, Atlanta, GA 30303",
    siteLatitude: 33.7554,
    siteLongitude: -84.3766,
    ownerUserId: "u-owner-1",
    locality: "Sweet Auburn, Atlanta",
    region: "GA",
    siteType: "rooftop",
    preliminaryProjectType: "community_rooftop",
    viabilityStatus: "potentially_viable",
    estimatedSystemSizeKwLow: 180,
    estimatedSystemSizeKwHigh: 240,
    estimatedAnnualGenerationKwhLow: 243000,
    estimatedAnnualGenerationKwhHigh: 324000,
    estimatedCapacityKw: 210,
    openFundingNeedsCount: 1,
    ...overrides,
  };
}

function storeOf(...projects: readonly ProjectRecord[]): ProjectStore {
  return { listProjects: () => Promise.resolve(projects) };
}

function query(overrides: Partial<PortfolioQuery> = {}): PortfolioQuery {
  return { ...DEFAULT_PORTFOLIO_QUERY, ...overrides };
}

function investorFunding(...stages: readonly FundingStage[]): Viewer {
  return {
    role: "investor",
    userId: "u-inv-mandate",
    investor: { ...onboardedInvestor, fundingStageFocus: stages, geographies: ["GA"] },
  };
}

async function expectPortfolio(
  viewer: Viewer,
  q: PortfolioQuery,
  store: ProjectStore,
): Promise<PortfolioResponse> {
  const result = await getPortfolio(viewer, q, store);
  if (!result.ok) {
    throw new Error(`expected success, got ${result.failure.code}`);
  }
  return result.value;
}

describe("portfolio authorization", () => {
  it.each([
    ["an operator", operator],
    ["a site owner", siteOwner],
  ])("refuses %s with forbidden_role", async (_label, viewer) => {
    const result = await getPortfolio(viewer, query(), storeOf(project()));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("forbidden_role");
  });

  it("refuses an investor who has not finished onboarding", async () => {
    const pending: Viewer = {
      role: "investor",
      userId: "u-inv-2",
      investor: { ...onboardedInvestor, onboardingCompletedAt: null },
    };

    const result = await getPortfolio(pending, query(), storeOf(project()));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("forbidden_tier");
  });

  it("decides permission before reading any project", async () => {
    let reads = 0;
    const counting: ProjectStore = {
      listProjects: () => {
        reads += 1;
        return Promise.resolve([project()]);
      },
    };

    await getPortfolio(operator, query(), counting);

    expect(reads).toBe(0);
  });
});

describe("investor visibility", () => {
  it("never returns a project the operator has not published", async () => {
    const store = storeOf(
      project({ id: "visible", visibleToInvestors: true }),
      project({ id: "hidden", visibleToInvestors: false }),
    );

    const portfolio = await expectPortfolio(
      investor,
      query({ mandateMatch: false }),
      store,
    );

    expect(portfolio.items.map((item) => item.project_id)).toEqual(["visible"]);
  });

  it("keeps a hidden project out even when the query asks for its stage", async () => {
    const store = storeOf(
      project({ id: "hidden", visibleToInvestors: false, stage: "operations" }),
    );

    const portfolio = await expectPortfolio(
      investor,
      query({ mandateMatch: false, stages: ["operations"] }),
      store,
    );

    expect(portfolio.items).toEqual([]);
    expect(portfolio.project_count).toBe(0);
  });
});

describe("tier 0 disclosure", () => {
  it("publishes no exact address, coordinates or owner identity", async () => {
    const store = storeOf(project());

    const portfolio = await expectPortfolio(
      investor,
      query({ mandateMatch: false }),
      store,
    );

    const serialized = JSON.stringify(portfolio);

    expect(serialized).not.toContain("148 Auburn Ave NE");
    expect(serialized).not.toContain("u-owner-1");
    expect(serialized).not.toContain("33.7554");
    expect(serialized).not.toContain("-84.3766");
  });

  it("exposes exactly the agreed tier 0 fields", async () => {
    const store = storeOf(project());

    const portfolio = await expectPortfolio(
      investor,
      query({ mandateMatch: false }),
      store,
    );

    expect(Object.keys(portfolio.items[0] ?? {}).sort()).toEqual(
      [
        "estimated_annual_generation_kwh_high",
        "estimated_annual_generation_kwh_low",
        "estimated_system_size_kw_high",
        "estimated_system_size_kw_low",
        "locality",
        "name",
        "open_funding_needs_count",
        "preliminary_project_type",
        "project_id",
        "site_type",
        "stage",
        "viability_status",
      ].sort(),
    );
  });
});

describe("mandate matching", () => {
  it("excludes a project with nothing left to fund", async () => {
    const store = storeOf(
      project({ id: "open", openFundingNeedsCount: 2 }),
      project({ id: "closed", openFundingNeedsCount: 0 }),
    );

    const portfolio = await expectPortfolio(investor, query(), store);

    expect(portfolio.items.map((item) => item.project_id)).toEqual(["open"]);
    expect(portfolio.mandate_match).toBe(true);
  });

  it("respects stage focus and region", async () => {
    const focused: Viewer = {
      role: "investor",
      userId: "u-inv-3",
      investor: {
        ...onboardedInvestor,
        fundingStageFocus: ["development"],
        geographies: ["GA"],
      },
    };

    const store = storeOf(
      project({ id: "match", stage: "development", region: "GA" }),
      project({ id: "wrong-stage", stage: "operations", region: "GA" }),
      project({ id: "wrong-region", stage: "development", region: "TN" }),
    );

    const portfolio = await expectPortfolio(focused, query(), store);

    expect(portfolio.items.map((item) => item.project_id)).toEqual(["match"]);
  });

  /**
   * The mapping, not an equality test. `permanent` is a funding stage with no
   * project stage of the same name, so an endowment funding built assets was
   * unrepresentable while `fundingStageFocus` was typed `ProjectStage[]`.
   * These fail if the matcher goes back to comparing the two enumerations.
   */
  it.each(["commissioning", "operations"] as const)(
    "matches a permanent mandate against a project in %s",
    async (stage) => {
      const endowment = investorFunding("permanent");
      const store = storeOf(project({ id: "built", stage, region: "GA" }));

      const portfolio = await expectPortfolio(endowment, query(), store);

      expect(portfolio.items.map((item) => item.project_id)).toEqual(["built"]);
    },
  );

  it("does not match a construction mandate against a built asset", async () => {
    const store = storeOf(project({ stage: "operations", region: "GA" }));

    const portfolio = await expectPortfolio(
      investorFunding("construction"),
      query(),
      store,
    );

    expect(portfolio.items).toEqual([]);
  });

  it("does not match a permanent mandate against an unbuilt project", async () => {
    const store = storeOf(project({ stage: "pre_development", region: "GA" }));

    const portfolio = await expectPortfolio(
      investorFunding("permanent"),
      query(),
      store,
    );

    expect(portfolio.items).toEqual([]);
  });

  it("treats an unanswered onboarding question as no preference", async () => {
    const store = storeOf(project({ stage: "operations", region: "TN" }));

    const portfolio = await expectPortfolio(investor, query(), store);

    expect(portfolio.items).toHaveLength(1);
  });

  it("widens to every visible project when the investor opts out", async () => {
    const store = storeOf(
      project({ id: "open", openFundingNeedsCount: 1 }),
      project({ id: "closed", openFundingNeedsCount: 0 }),
    );

    const portfolio = await expectPortfolio(
      investor,
      query({ mandateMatch: false }),
      store,
    );

    expect(portfolio.items).toHaveLength(2);
    expect(portfolio.mandate_match).toBe(false);
  });
});

describe("aggregates", () => {
  it("counts and totals only the projects returned", async () => {
    const store = storeOf(
      project({ id: "a", estimatedCapacityKw: 210 }),
      project({ id: "b", estimatedCapacityKw: 112.5 }),
      project({ id: "hidden", visibleToInvestors: false, estimatedCapacityKw: 999 }),
    );

    const portfolio = await expectPortfolio(
      investor,
      query({ mandateMatch: false }),
      store,
    );

    expect(portfolio.project_count).toBe(2);
    expect(portfolio.total_estimated_capacity_kw).toBe(322.5);
  });

  it("does not leak floating point noise into the total", async () => {
    const store = storeOf(
      project({ id: "a", estimatedCapacityKw: 0.1 }),
      project({ id: "b", estimatedCapacityKw: 0.2 }),
    );

    const portfolio = await expectPortfolio(
      investor,
      query({ mandateMatch: false }),
      store,
    );

    expect(portfolio.total_estimated_capacity_kw).toBe(0.3);
  });

  it("treats a project with no estimate as contributing nothing", async () => {
    const store = storeOf(
      project({ id: "a", estimatedCapacityKw: 210 }),
      project({ id: "b", estimatedCapacityKw: null }),
    );

    const portfolio = await expectPortfolio(
      investor,
      query({ mandateMatch: false }),
      store,
    );

    expect(portfolio.project_count).toBe(2);
    expect(portfolio.total_estimated_capacity_kw).toBe(210);
  });
});

describe("query validation", () => {
  it("defaults to a mandate match", () => {
    const result = parsePortfolioQuery(new URLSearchParams());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(DEFAULT_PORTFOLIO_QUERY);
  });

  it("reads repeated stage parameters", () => {
    const result = parsePortfolioQuery(
      new URLSearchParams("stage=development&stage=construction"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stages).toEqual(["development", "construction"]);
  });

  it.each([
    ["stage=not_a_stage", "stage"],
    ["viability=maybe", "viability"],
    ["mandate_match=yes", "mandate_match"],
  ])("rejects %s rather than ignoring it", (queryString, parameter) => {
    const result = parsePortfolioQuery(new URLSearchParams(queryString));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("invalid_query");
    expect(result.failure.details).toMatchObject({ parameter });
  });
});

describe("the HTTP surface", () => {
  function get(queryString = ""): Request {
    return new Request(`https://sunsum.test/api/portfolio${queryString}`);
  }

  it("answers 200 with a no-store JSON body", async () => {
    const response = await handleGetPortfolio(get(), investor);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = (await response.json()) as PortfolioResponse;
    expect(body.project_count).toBe(body.items.length);
  });

  it("maps forbidden_role onto 403", async () => {
    const response = await handleGetPortfolio(get(), operator);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "forbidden_role" });
  });

  it("maps invalid_query onto 400 before authorizing", async () => {
    const response = await handleGetPortfolio(get("?stage=nope"), operator);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid_query" });
  });

  it("serves at least three seeded Atlanta pilot sites through the default store", async () => {
    const response = await handleGetPortfolio(get("?mandate_match=false"), investor);
    const body = (await response.json()) as PortfolioResponse;

    const atlanta = body.items.filter((item) =>
      item.locality.includes("Atlanta"),
    );

    expect(atlanta.length).toBeGreaterThanOrEqual(3);
  });

  it("omits the unpublished seeded project", async () => {
    const response = await handleGetPortfolio(get("?mandate_match=false"), investor);
    const body = (await response.json()) as PortfolioResponse;

    expect(body.items.map((item) => item.name)).not.toContain(
      "Grove Park warehouse roof",
    );
  });
});
