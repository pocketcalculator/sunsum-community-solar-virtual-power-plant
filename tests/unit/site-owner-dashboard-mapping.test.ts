import { describe, expect, it } from "vitest";

import {
  SQUARE_FEET_PER_SQUARE_METRE,
  humanizeStatus,
  localityFor,
  shortLabelFor,
  squareMetresToSquareFeet,
  toDashboardLocation,
  toDashboardLocations,
} from "@/features/site-owner-dashboard/model/fromOwnerSites";

/** One row shaped like `GET /api/me/sites` returns. */
function ownerSiteRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    site: {
      id: "11111111-1111-4111-8111-111111111111",
      address_raw: "742 Evergreen Terrace, Atlanta, GA 30303",
      site_type: "rooftop",
      approximate_area_sqm: 100,
    },
    assessment: { viability_status: "potentially_viable" },
    submission_status: "under_review",
    project_stage: "site_assessment",
    journey_stage_id: "assessment",
    next_action: "Await operator review",
    documents: [{ id: "doc-1" }, { id: "doc-2" }],
    outstanding: [{ id: "out-1" }],
    ...overrides,
  };
}

describe("area conversion", () => {
  it("uses the exact international-foot factor", () => {
    expect(SQUARE_FEET_PER_SQUARE_METRE).toBeCloseTo(1 / 0.3048 ** 2, 10);
  });

  it("converts square metres to whole square feet", () => {
    expect(squareMetresToSquareFeet(100)).toBe(1076);
    expect(squareMetresToSquareFeet(0)).toBe(0);
  });
});

describe("address helpers", () => {
  it("takes the street as the short label and the city as the locality", () => {
    const address = "742 Evergreen Terrace, Atlanta, GA 30303";
    expect(shortLabelFor(address)).toBe("742 Evergreen Terrace");
    expect(localityFor(address)).toBe("Atlanta");
  });

  it("tolerates an address with no commas", () => {
    expect(shortLabelFor("Unparsed address")).toBe("Unparsed address");
    expect(localityFor("Unparsed address")).toBe("");
  });
});

describe("humanizeStatus", () => {
  it("renders snake_case as a sentence", () => {
    expect(humanizeStatus("under_review")).toBe("Under review");
    expect(humanizeStatus("submitted")).toBe("Submitted");
  });

  it("still renders a status it has never seen", () => {
    expect(humanizeStatus("awaiting_utility_interconnect")).toBe(
      "Awaiting utility interconnect",
    );
  });
});

describe("toDashboardLocation", () => {
  it("carries the real address, area and status through", () => {
    const location = toDashboardLocation(ownerSiteRow());

    expect(location.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(location.address).toBe("742 Evergreen Terrace, Atlanta, GA 30303");
    expect(location.areaSquareFeet).toBe(1076);
    expect(location.propertyType).toBe("Rooftop");
    expect(location.submissionStatus).toBe("under_review");
    expect(location.projectStage).toBe("site_assessment");
    expect(location.nextAction).toBe("Await operator review");
    expect(location.viabilityStatus).toBe("potentially_viable");
    expect(location.documentCount).toBe(2);
    expect(location.outstandingCount).toBe(1);
  });

  it("never invents a financial return or a map position", () => {
    const location = toDashboardLocation(ownerSiteRow());

    expect(location.individualReturnDollars).toBeNull();
    expect(location.communityReturnDollars).toBeNull();
    expect(location.mapPosition).toBeNull();
  });

  it("maps land as well as rooftop", () => {
    const location = toDashboardLocation(
      ownerSiteRow({ site: { address_raw: "A", site_type: "land" } }),
    );
    expect(location.propertyType).toBe("Land");
  });

  it("reports a missing area as absent rather than zero", () => {
    const location = toDashboardLocation(
      ownerSiteRow({ site: { address_raw: "A", site_type: "rooftop" } }),
    );
    expect(location.areaSquareFeet).toBeNull();
  });

  it("survives a row missing every optional field", () => {
    const location = toDashboardLocation({});

    expect(location.address).toBe("Address not provided");
    expect(location.propertyType).toBe("Unknown");
    expect(location.areaSquareFeet).toBeNull();
    expect(location.viabilityStatus).toBeNull();
    expect(location.submissionStatus).toBeNull();
    expect(location.documentCount).toBe(0);
    expect(location.outstandingCount).toBe(0);
  });

  it("falls back to the address when the site carries no id", () => {
    const location = toDashboardLocation(
      ownerSiteRow({ site: { address_raw: "742 Evergreen Terrace" } }),
    );
    expect(location.id).toBe("742 Evergreen Terrace");
  });

  it("selects every real site by default", () => {
    expect(toDashboardLocation(ownerSiteRow()).selectedByDefault).toBe(true);
  });
});

describe("toDashboardLocations", () => {
  it("maps an empty list to an empty list", () => {
    expect(toDashboardLocations([])).toEqual([]);
  });

  it("preserves order and count", () => {
    const rows = [
      ownerSiteRow({ site: { address_raw: "First, Atlanta" } }),
      ownerSiteRow({ site: { address_raw: "Second, Atlanta" } }),
    ];
    const locations = toDashboardLocations(rows);

    expect(locations).toHaveLength(2);
    expect(locations[0]?.shortLabel).toBe("First");
    expect(locations[1]?.shortLabel).toBe("Second");
  });
});
