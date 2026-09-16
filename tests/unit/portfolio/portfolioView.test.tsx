import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  PortfolioUnavailable,
  PortfolioView,
  formatFundingNeeds,
  formatRange,
  formatVocabulary,
  type PortfolioProjectView,
  type PortfolioViewModel,
} from "@/features/portfolio";

function projectView(
  overrides: Partial<PortfolioProjectView> = {},
): PortfolioProjectView {
  return {
    id: "p-1",
    name: "Sweet Auburn Rooftop",
    locality: "Sweet Auburn, Atlanta",
    stage: "pre_development",
    siteType: "rooftop",
    projectType: "community_rooftop",
    viability: "potentially_viable",
    systemSizeKwLow: 180,
    systemSizeKwHigh: 240,
    annualGenerationKwhLow: 243_000,
    annualGenerationKwhHigh: 324_000,
    openFundingNeeds: 1,
    ...overrides,
  };
}

function view(overrides: Partial<PortfolioViewModel> = {}): PortfolioViewModel {
  return {
    projects: [projectView()],
    totalEstimatedCapacityKw: 210,
    mandateMatch: true,
    ...overrides,
  };
}

describe("portfolio wording", () => {
  it("hyphenates pre-development, which sentence casing gets wrong", () => {
    expect(formatVocabulary("pre_development")).toBe("Pre-development");
  });

  it("humanises a value it has never seen rather than failing", () => {
    expect(formatVocabulary("awaiting_interconnection")).toBe(
      "Awaiting interconnection",
    );
  });

  it("distinguishes an unestimated project from one estimated at zero", () => {
    expect(formatRange(null, null, "kW")).toBe("Not yet estimated");
    expect(formatRange(0, 0, "kW")).toBe("0 kW");
  });

  it("collapses a range whose bounds are equal", () => {
    expect(formatRange(200, 200, "kW")).toBe("200 kW");
  });

  it("shows the bound it has when only one is known", () => {
    expect(formatRange(null, 240, "kW")).toBe("240 kW");
    expect(formatRange(180, null, "kW")).toBe("180 kW");
  });

  it("separates a real range with an en dash", () => {
    expect(formatRange(180, 240, "kW")).toBe("180\u2013240 kW");
  });

  it("agrees in number with the count of funding needs", () => {
    expect(formatFundingNeeds(0)).toBe("No open funding needs");
    expect(formatFundingNeeds(1)).toBe("1 open funding need");
    expect(formatFundingNeeds(3)).toBe("3 open funding needs");
  });
});

describe("portfolio page", () => {
  it("leads with a single page heading", () => {
    render(<PortfolioView view={view()} />);
    expect(screen.getByRole("heading", { level: 1 })).toBeVisible();
  });

  it("renders one entry for each project it is given", () => {
    render(
      <PortfolioView
        view={view({
          projects: [
            projectView(),
            projectView({ id: "p-2", name: "Westside Solar Canopy" }),
          ],
        })}
      />,
    );

    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Westside Solar Canopy")).toBeVisible();
  });

  it("describes location only as a neighbourhood", () => {
    render(<PortfolioView view={view()} />);
    expect(screen.getByText("Sweet Auburn, Atlanta")).toBeVisible();
  });

  it("offers to widen the mandate when the mandate narrowed the list", () => {
    render(<PortfolioView view={view({ mandateMatch: true })} />);
    expect(screen.getByRole("link", { name: /every project/i })).toHaveAttribute(
      "href",
      "/portfolio?mandate_match=false",
    );
  });

  it("offers the way back once the mandate filter is off", () => {
    render(<PortfolioView view={view({ mandateMatch: false })} />);
    expect(
      screen.getByRole("link", { name: /only projects matching my mandate/i }),
    ).toHaveAttribute("href", "/portfolio");
  });

  it("treats an empty portfolio as an answer, not a failure", () => {
    render(<PortfolioView view={view({ projects: [] })} />);

    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByText(/nothing to show yet/i)).toBeVisible();
  });

  it("says plainly that every visitor is the same demonstration investor", () => {
    render(<PortfolioView view={view()} />);
    expect(screen.getByText(/sign-in is not built yet/i)).toBeVisible();
  });
});

describe("a refused portfolio", () => {
  it("repeats the service's own explanation instead of a generic apology", () => {
    render(
      <PortfolioUnavailable message="Complete investor onboarding to see the portfolio." />,
    );

    expect(
      screen.getByText("Complete investor onboarding to see the portfolio."),
    ).toBeVisible();
  });
});
