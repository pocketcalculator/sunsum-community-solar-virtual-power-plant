// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  formatRange,
  humanize,
  portfolioQueryString,
  toEngagedProjectIds,
  toPortfolioProject,
  toPortfolioView,
} from "@/features/investor-portfolio";

describe("the tier 0 portfolio mapping", () => {
  const row = {
    project_id: "p1",
    name: "Fairview School rooftop",
    locality: "Fairview",
    stage: "pre_development",
    journey_stage_id: "pre-development",
    site_type: "rooftop",
    preliminary_project_type: "community_solar",
    viability_status: "potentially_viable",
    estimated_system_size_kw_low: 180,
    estimated_system_size_kw_high: 240,
    estimated_annual_generation_kwh_low: 216_000,
    estimated_annual_generation_kwh_high: 288_000,
    open_funding_needs_count: 2,
  };

  it("carries every tier 0 field across", () => {
    const project = toPortfolioProject(row);

    expect(project.projectId).toBe("p1");
    expect(project.name).toBe("Fairview School rooftop");
    expect(project.locality).toBe("Fairview");
    expect(project.stage).toBe("pre_development");
    expect(project.capacityKwLow).toBe(180);
    expect(project.openFundingNeedsCount).toBe(2);
  });

  /**
   * The projection is the access-control boundary. If a tier-restricted field
   * ever appeared in the payload, the mapping must not carry it into something
   * a component could render.
   */
  it("ignores tier-restricted fields even when the payload carries them", () => {
    const project = toPortfolioProject({
      ...row,
      site_address_raw: "12 Real Street, Fairview",
      site_latitude: 51.5,
      site_longitude: -0.12,
      owner_user_id: "owner-1",
    });

    expect(JSON.stringify(project)).not.toContain("Real Street");
    expect(JSON.stringify(project)).not.toContain("owner-1");
    expect(Object.keys(project)).not.toContain("siteAddressRaw");
  });

  it("labels snake_case values without a lookup table", () => {
    expect(humanize("more_information_required")).toBe(
      "More information required",
    );
    expect(toPortfolioProject(row).stageLabel).toBe("Pre development");
  });

  it("renders an unrecognised value rather than dropping it", () => {
    const project = toPortfolioProject({ ...row, stage: "decommissioning" });
    expect(project.stageLabel).toBe("Decommissioning");
  });

  it("reports a missing estimate as absent rather than zero", () => {
    const project = toPortfolioProject({
      ...row,
      estimated_system_size_kw_low: null,
      estimated_system_size_kw_high: null,
    });

    expect(project.capacityKwLow).toBeNull();
    expect(project.capacityKwHigh).toBeNull();
  });
});

describe("quantity formatting", () => {
  it("always attaches the unit", () => {
    expect(formatRange(180, 240, "kW")).toBe("180–240 kW");
    expect(formatRange(216_000, 288_000, "kWh per year")).toBe(
      "216,000–288,000 kWh per year",
    );
  });

  it("collapses a range whose bounds agree", () => {
    expect(formatRange(310, 310, "kW")).toBe("310 kW");
  });

  it("renders a half-known range from the bound it has", () => {
    expect(formatRange(120, null, "kW")).toBe("120 kW");
    expect(formatRange(null, 120, "kW")).toBe("120 kW");
  });

  /** Absent is not zero, and must not be rendered as a figure. */
  it("reports an absent estimate as null", () => {
    expect(formatRange(null, null, "kW")).toBeNull();
  });

  it("keeps zero as a real measurement", () => {
    expect(formatRange(0, 0, "kW")).toBe("0 kW");
  });
});

describe("reading the portfolio body", () => {
  it("keeps the server's counts rather than recomputing them", () => {
    const view = toPortfolioView({
      items: [],
      project_count: 0,
      total_estimated_capacity_kw: 0,
      mandate_match: true,
    });

    expect(view?.projectCount).toBe(0);
    expect(view?.mandateMatch).toBe(true);
  });

  /**
   * An onboarded investor matching nothing is a real, live, empty answer.
   * Treating it as a failure would substitute sample rows for the truth.
   */
  it("treats an empty item list as a view, not a failure", () => {
    expect(toPortfolioView({ items: [] })).not.toBeNull();
    expect(toPortfolioView({ items: [] })?.projects).toEqual([]);
  });

  it("refuses a body that is not a portfolio", () => {
    expect(toPortfolioView(null)).toBeNull();
    expect(toPortfolioView("nope")).toBeNull();
    expect(toPortfolioView({})).toBeNull();
    expect(toPortfolioView({ items: "not an array" })).toBeNull();
  });

  /** The server applies the mandate filter by default, so absent means true. */
  it("assumes the mandate filter was applied when the field is missing", () => {
    expect(toPortfolioView({ items: [] })?.mandateMatch).toBe(true);
  });
});

describe("the portfolio query string", () => {
  it("states mandate_match explicitly even at the default", () => {
    const query = new URLSearchParams(
      portfolioQueryString({
        stages: [],
        viability: null,
        projectType: null,
        mandateMatch: true,
      }),
    );
    expect(query.get("mandate_match")).toBe("true");
  });

  it("repeats stage rather than joining it, as the handler expects", () => {
    const query = new URLSearchParams(
      portfolioQueryString({
        stages: ["development", "construction"],
        viability: null,
        projectType: null,
        mandateMatch: false,
      }),
    );

    expect(query.getAll("stage")).toEqual(["development", "construction"]);
    expect(query.get("mandate_match")).toBe("false");
  });

  /** The handler rejects unknown parameters, so absent filters must be absent. */
  it("omits filters that were not set", () => {
    const query = new URLSearchParams(
      portfolioQueryString({
        stages: [],
        viability: null,
        projectType: null,
        mandateMatch: true,
      }),
    );

    expect(query.has("viability")).toBe(false);
    expect(query.has("project_type")).toBe(false);
    expect([...query.keys()]).toEqual(["mandate_match"]);
  });

  it("uses the parameter names the handler accepts", () => {
    const query = new URLSearchParams(
      portfolioQueryString({
        stages: [],
        viability: "potentially_viable",
        projectType: "community_solar",
        mandateMatch: true,
      }),
    );

    expect(query.get("viability")).toBe("potentially_viable");
    expect(query.get("project_type")).toBe("community_solar");
  });
});

describe("reading existing engagements", () => {
  it("collects projects whose engagement is live", () => {
    expect(
      toEngagedProjectIds([
        { project_id: "p1", state: "interested" },
        { project_id: "p2", state: "committed" },
        { project_id: "p3", state: "funded" },
      ]),
    ).toEqual(["p1", "p2", "p3"]);
  });

  /**
   * A declined or withdrawn engagement is not live, so the API would accept a
   * fresh expression of interest. Marking it engaged would hide a button that
   * still works.
   */
  it("ignores engagements that have ended", () => {
    expect(
      toEngagedProjectIds([
        { project_id: "p1", state: "declined" },
        { project_id: "p2", state: "withdrawn" },
      ]),
    ).toEqual([]);
  });

  it("reports a project once even with several engagements", () => {
    expect(
      toEngagedProjectIds([
        { project_id: "p1", state: "interested" },
        { project_id: "p1", state: "committed" },
      ]),
    ).toEqual(["p1"]);
  });

  it("survives a body that is not a list", () => {
    expect(toEngagedProjectIds(null)).toEqual([]);
    expect(toEngagedProjectIds({ items: [] })).toEqual([]);
  });
});
