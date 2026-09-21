// @vitest-environment jsdom
import { createElement } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ComparisonView, calculateComparison } from "@/features/design-lab/ComparisonView";
import { DASHBOARD_LOCATIONS, MAX_SELECTED_LOCATIONS, RETURN_POINTS } from "@/features/site-owner-dashboard/model/mockDashboard";
import { createSeed, money } from "@/features/design-lab/model";
import { STORAGE_KEY, dispatch, parseStoredState } from "@/features/design-lab/store";

beforeEach(() => {
  localStorage.clear();
  act(() => { dispatch({ type: "reset" }); });
});

function savedState() {
  const state = parseStoredState(localStorage.getItem(STORAGE_KEY) ?? "null");
  if (!state) throw new Error("Expected a persisted preview state");
  return state;
}

describe("the ten preserved source fixtures", () => {
  it("retains every original location value, default selection and synthetic position", () => {
    expect(MAX_SELECTED_LOCATIONS).toBe(5);
    expect(DASHBOARD_LOCATIONS.map((site) => [
      site.id, site.address, site.shortLabel, site.locality, site.propertyType, site.areaSquareFeet,
      site.individualReturnDollars, site.communityReturnDollars, site.selectedByDefault,
      site.mapPosition?.xPercent, site.mapPosition?.yPercent,
    ])).toEqual([
      ["oak-street", "123 Oak Street", "Oak St", "Sweet Auburn", "Single family", 1800, 20000, 30000, true, 26, 34],
      ["maple-avenue", "456 Maple Avenue", "Maple Ave", "West End", "Townhouse", 1200, 14000, 22000, true, 69, 49],
      ["pine-lane", "789 Pine Lane", "Pine Ln", "Mechanicsville", "Single family", 2200, 18000, 28000, false, 46, 72],
      ["cedar-drive", "321 Cedar Drive", "Cedar Dr", "Grant Park", "Multi-family", 3500, 36000, 56000, true, 84, 27],
      ["birch-court", "654 Birch Court", "Birch Ct", "Grove Park", "Single family", 1600, 16000, 25000, false, 61, 20],
      ["willow-boulevard", "901 Willow Boulevard", "Willow Blvd", "East Point", "Commercial", 2800, 25000, 39000, false, 18, 66],
      ["peachtree-road", "112 Peachtree Road", "Peachtree Rd", "Midtown", "Mixed use", 4100, 42000, 64000, false, 37, 18],
      ["magnolia-place", "73 Magnolia Place", "Magnolia Pl", "Kirkwood", "Townhouse", 1500, 15000, 23000, false, 76, 73],
      ["auburn-avenue", "808 Auburn Avenue", "Auburn Ave", "Old Fourth Ward", "Multi-family", 3000, 29000, 45000, false, 52, 42],
      ["decatur-street", "240 Decatur Street", "Decatur St", "Downtown Atlanta", "Commercial", 5200, 48000, 74000, false, 90, 58],
    ]);
    expect(RETURN_POINTS).toEqual([
      { year: 1, individualDollars: 2500, communityDollars: 3200 },
      { year: 2, individualDollars: 4600, communityDollars: 6200 },
      { year: 3, individualDollars: 7200, communityDollars: 9800 },
      { year: 4, individualDollars: 9800, communityDollars: 13600 },
      { year: 5, individualDollars: 12500, communityDollars: 18000 },
      { year: 7, individualDollars: 21000, communityDollars: 31000 },
      { year: 10, individualDollars: 31000, communityDollars: 49000 },
      { year: 15, individualDollars: 50000, communityDollars: 77000 },
      { year: 20, individualDollars: 70000, communityDollars: 108000 },
    ]);
  });

  it("does not mutate source data or extend the comparison model to portfolio records", () => {
    const before = JSON.stringify({ locations: DASHBOARD_LOCATIONS, points: RETURN_POINTS });
    const ids = DASHBOARD_LOCATIONS.map((site) => site.id);
    for (const horizon of [5, 10, 20]) {
      for (const share of [10, 40, 65, 90]) expect(calculateComparison(ids, horizon, share)).toHaveLength(10);
    }
    expect(JSON.stringify({ locations: DASHBOARD_LOCATIONS, points: RETURN_POINTS })).toBe(before);
    expect(calculateComparison(createSeed().sites.map((site) => site.id), 20, 40)).toEqual([]);
  });
});

describe("design comparison monetary display", () => {
  const ids = ["oak-street", "maple-avenue", "cedar-drive"];
  it("reuses the explicit twenty-year repository fixtures without forecasting", () => {
    const rows = calculateComparison(ids, 20, 40);
    expect(rows).toHaveLength(3);
    expect(rows.reduce((sum, row) => sum + row.personal, 0)).toBe(7120000);
    expect(rows.reduce((sum, row) => sum + row.community, 0)).toBe(10680000);
  });
  it.each([5, 10, 20])("keeps every displayed component and total exact for %i years", (years) => {
    for (const share of [10, 35, 40, 65, 90]) {
      const rows = calculateComparison(ids, years, share);
      expect(rows.every((row) => Number.isSafeInteger(row.personal) && Number.isSafeInteger(row.community))).toBe(true);
      expect(rows.every((row) => row.personal % 100 === 0 && row.community % 100 === 0)).toBe(true);
      const displaySum = rows.reduce((sum, row) => sum + Number(money(row.personal).replace(/[$,]/g, "")), 0);
      expect(money(rows.reduce((sum, row) => sum + row.personal, 0))).toBe(money(displaySum * 100));
    }
  });
  it("does not manufacture results for custom addresses or duplicate selection ids", () => {
    expect(calculateComparison(["unvalidated-custom-address"], 20, 40)).toEqual([]);
    expect(calculateComparison(["oak-street", "oak-street"], 20, 40)).toHaveLength(1);
    expect(calculateComparison([], 20, 40)).toEqual([]);
  });
});

describe("ComparisonView / illustrative finance presentation", () => {
  it("keeps original selection and horizon defaults with truthful units, source and separate scope", () => {
    render(createElement(ComparisonView));
    expect(screen.getAllByRole("checkbox")).toHaveLength(10);
    expect(screen.getAllByRole("checkbox", { checked: true })).toHaveLength(3);
    expect(screen.getByRole("button", { name: "20 yr" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("slider", { name: "Individual allocation percentage" })).toHaveValue("40");
    expect(screen.getByRole("spinbutton", { name: "Individual allocation (%)" })).toHaveValue(40);
    expect(screen.getByText("$71,200")).toBeVisible();
    expect(screen.getByText("$106,800")).toBeVisible();
    expect(screen.getByRole("region", { name: "Comparison scope" })).toHaveTextContent("50 fictional sites");
    expect(within(screen.getByRole("list", { name: "Original comparison fixtures" })).getAllByRole("listitem")).toHaveLength(10);
    expect(screen.getByText(/no version or as-of date is recorded/)).toBeInTheDocument();
    expect(screen.getByText(/Source amounts are USD in major units/)).toBeInTheDocument();
    expect(screen.getByText(/mockDashboard.ts/)).toBeInTheDocument();
    for (const label of ["Owner benefit", "Project payback", "Investor return", "Utility savings"]) {
      expect(screen.getByText(label).parentElement).toHaveTextContent("Not calculated");
    }
  });

  it("keeps pending horizon and percentage changes separate until Run comparison", () => {
    render(createElement(ComparisonView));
    fireEvent.click(screen.getByRole("button", { name: "5 yr" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Individual allocation (%)" }), { target: { value: "65" } });
    expect(screen.getByRole("slider", { name: "Individual allocation percentage" })).toHaveValue("65");
    expect(screen.getByRole("img", { name: /Illustrative 20-year cumulative allocations/ })).toBeVisible();
    expect(screen.getByText("$71,200")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Run comparison" }));
    expect(screen.getByRole("img", { name: /Illustrative 5-year cumulative allocations/ })).toBeVisible();
    expect(screen.getByText(/Latest run: 3 selected examples, 5 years, 65% individual \/ 35% community/)).toBeVisible();
    fireEvent.change(screen.getByRole("slider", { name: "Individual allocation percentage" }), { target: { value: "35" } });
    expect(screen.getByRole("spinbutton", { name: "Individual allocation (%)" })).toHaveValue(35);
  });

  it.each(["", "9", "42", "91"])("rejects invalid allocation %s without changing the last run", (value) => {
    render(createElement(ComparisonView));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Individual allocation (%)" }), { target: { value } });
    expect(screen.getByRole("alert")).toHaveTextContent("10% to 90% in steps of 5");
    expect(screen.getByRole("button", { name: "Run comparison" })).toBeDisabled();
    expect(screen.getByRole("slider", { name: "Individual allocation percentage" })).toHaveValue("40");
    expect(screen.getByText("$71,200")).toBeVisible();
    expect(savedState().engagements).toEqual([]);
  });

  it("preserves the five-location cap and selection across a search", () => {
    render(createElement(ComparisonView));
    fireEvent.click(screen.getByRole("checkbox", { name: /Pine Ln/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Birch Ct/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Willow Blvd/ }));
    expect(screen.getAllByRole("checkbox", { checked: true })).toHaveLength(5);
    expect(screen.getByRole("checkbox", { name: /Willow Blvd/ })).not.toBeChecked();
    fireEvent.change(screen.getByRole("textbox", { name: "Filter example locations" }), { target: { value: "Sweet Auburn" } });
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: /Oak St/ })).toBeChecked();
    expect(screen.getByText(/5 of 5 sites selected/)).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: "Filter example locations" }), { target: { value: "" } });
    expect(screen.getAllByRole("checkbox", { checked: true })).toHaveLength(5);
  });

  it("has a complete table alternative with the current cumulative period and beneficiaries", () => {
    render(createElement(ComparisonView));
    fireEvent.click(screen.getByRole("button", { name: "View data" }));
    const table = screen.getByRole("table", { name: "Cumulative illustrative allocations in USD / latest 20-year run" });
    expect(within(table).getByRole("columnheader", { name: "Individual allocation" })).toBeVisible();
    expect(within(table).getByRole("columnheader", { name: "Community allocation" })).toBeVisible();
    expect(within(table).getAllByRole("row")).toHaveLength(RETURN_POINTS.length + 1);
    expect(within(table).getByRole("row", { name: /20 \$71,200 \$106,800/ })).toBeVisible();
  });

  it("does not change mandate, interests or project state when running an allocation scenario", () => {
    render(createElement(ComparisonView));
    const before = savedState();
    fireEvent.change(screen.getByRole("slider", { name: "Individual allocation percentage" }), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "Run comparison" }));
    expect(savedState()).toEqual(before);
    expect(screen.getByText(/not money reserved/)).toBeVisible();
    expect(screen.getByText(/purchaser MWh\/year or REC limits/)).toBeVisible();
    act(() => { dispatch({ type: "visibility", id: "sweet-auburn", visible: false }); });
    expect(screen.getByRole("img", { name: /Illustrative 20-year cumulative allocations/ })).toBeVisible();
    expect(screen.getByText(/Latest run: 3 selected examples, 20 years, 90% individual/)).toBeVisible();
  });

  it("keeps custom drafts outside fixture results and disables running an empty selection", () => {
    render(createElement(ComparisonView));
    fireEvent.change(screen.getByLabelText(/Have somewhere else in mind/), { target: { value: "10 New Example Street" } });
    fireEvent.click(screen.getByRole("button", { name: "Add address draft" }));
    expect(screen.getByRole("region", { name: "Local address drafts" })).toHaveTextContent("Site-specific return and payback: not calculated");
    expect(screen.getByText("$71,200")).toBeVisible();
    expect(within(screen.getByRole("list", { name: "Original comparison fixtures" })).getAllByRole("listitem")).toHaveLength(10);
    expect(savedState().sites).toHaveLength(51);
    for (const checkbox of screen.getAllByRole("checkbox", { checked: true })) fireEvent.click(checkbox);
    expect(screen.getByRole("button", { name: "Run comparison" })).toBeDisabled();
    expect(screen.getByText("Choose a place to begin")).toBeVisible();
    expect(screen.getByText("$71,200")).toBeVisible();
  });
});

describe("local demo state boundary", () => {
  it("round-trips the complete original scenario", () => {
    const seed = createSeed();
    expect(parseStoredState(JSON.stringify(seed))).toEqual(seed);
  });
  it("rejects incomplete or foreign storage rather than treating it as loaded", () => {
    expect(parseStoredState('{"version":1,"sites":[],"engagements":[],"mandate":{}}')).toBeNull();
    expect(parseStoredState('{"version":2}')).toBeNull();
  });
  it("rejects invalid nested document metadata", () => {
    const seed = createSeed();
    const json = JSON.stringify(seed).replace('"owner_private"', '"public"');
    expect(parseStoredState(json)).toBeNull();
  });
});
