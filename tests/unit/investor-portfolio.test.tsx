// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  InterestButton,
  InvestorPortfolio,
  type PortfolioProject,
  type PortfolioView,
} from "@/features/investor-portfolio";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function project(overrides: Partial<PortfolioProject> = {}): PortfolioProject {
  return {
    projectId: "p1",
    name: "Fairview School rooftop",
    locality: "Fairview",
    stage: "pre_development",
    stageLabel: "Pre development",
    siteType: "rooftop",
    siteTypeLabel: "Rooftop",
    projectType: "community_solar",
    viabilityStatus: "potentially_viable",
    viabilityLabel: "Potentially viable",
    capacityKwLow: 180,
    capacityKwHigh: 240,
    generationKwhLow: 216_000,
    generationKwhHigh: 288_000,
    openFundingNeedsCount: 2,
    ...overrides,
  };
}

function view(projects: readonly PortfolioProject[]): PortfolioView {
  return {
    projects,
    projectCount: projects.length,
    totalEstimatedCapacityKw: 0,
    mandateMatch: true,
  };
}

function stubJson(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("the Interested button", () => {
  it("posts to the engagements endpoint for this project", async () => {
    const fetchMock = stubJson(201, { id: "e1", state: "interested" });
    render(<InterestButton projectId="p1" projectName="Fairview" />);

    fireEvent.click(screen.getByRole("button", { name: /Express interest/ }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/projects/p1/engagements");
    expect(init.method).toBe("POST");
    /** Omitting funding_need_id expresses interest in the whole project. */
    expect(init.body).toBe("{}");
  });

  it("confirms the engagement once it is created", async () => {
    stubJson(201, { id: "e1", state: "interested" });
    render(<InterestButton projectId="p1" projectName="Fairview" />);

    fireEvent.click(screen.getByRole("button", { name: /Express interest/ }));

    expect(await screen.findByText(/Interest registered/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Express interest/ })).toBeNull();
  });

  /**
   * The seeded demo data pre-engages one project, so this path fires during
   * the demo. A conflict means the engagement already exists, which is the
   * state the button exists to reach — so it reads as success, not an error.
   */
  it("treats a conflict as already engaged rather than as a failure", async () => {
    stubJson(409, {
      code: "conflict",
      message: "A live engagement already exists.",
    });
    render(<InterestButton projectId="p1" projectName="Fairview" />);

    fireEvent.click(screen.getByRole("button", { name: /Express interest/ }));

    expect(await screen.findByText(/Interest registered/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("sends an unonboarded investor to the onboarding form", async () => {
    stubJson(403, {
      code: "forbidden_tier",
      message: "Complete investor onboarding before expressing interest.",
    });
    render(<InterestButton projectId="p1" projectName="Fairview" />);

    fireEvent.click(screen.getByRole("button", { name: /Express interest/ }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Complete investor onboarding");
    expect(
      screen.getByRole("link", { name: /Complete onboarding/ }).getAttribute("href"),
    ).toBe("/join?start=i-would-fund");
  });

  it("asks an anonymous visitor to sign in", async () => {
    stubJson(401, { code: "unauthenticated", message: "Sign in required." });
    render(<InterestButton projectId="p1" projectName="Fairview" />);

    fireEvent.click(screen.getByRole("button", { name: /Express interest/ }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Sign in required.");
  });

  it("reports a refusal it does not have a specific answer for", async () => {
    stubJson(404, { code: "not_found", message: "Project not found." });
    render(<InterestButton projectId="p1" projectName="Fairview" />);

    fireEvent.click(screen.getByRole("button", { name: /Express interest/ }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Project not found.");
  });

  it("reports a network failure instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<InterestButton projectId="p1" projectName="Fairview" />);

    fireEvent.click(screen.getByRole("button", { name: /Express interest/ }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not reach the server");
  });

  it("offers no click when an engagement already exists", () => {
    stubJson(201, {});
    render(
      <InterestButton alreadyEngaged projectId="p1" projectName="Fairview" />,
    );

    expect(screen.queryByRole("button", { name: /Express interest/ })).toBeNull();
    expect(screen.getByText(/Interest registered/)).toBeTruthy();
  });

  it("escapes a project id rather than injecting it into the path", async () => {
    const fetchMock = stubJson(201, {});
    render(<InterestButton projectId="a/b?c" projectName="Odd" />);

    fireEvent.click(screen.getByRole("button", { name: /Express interest/ }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/projects/a%2Fb%3Fc/engagements",
    );
  });
});

describe("the investor portfolio", () => {
  it("renders every tier 0 fact with its unit", () => {
    render(<InvestorPortfolio dataSource="live" initialView={view([project()])} />);

    expect(screen.getByText("Fairview School rooftop")).toBeTruthy();
    expect(screen.getByText("180–240 kW")).toBeTruthy();
    expect(screen.getByText("216,000–288,000 kWh per year")).toBeTruthy();
  });

  it("says an estimate is absent rather than showing zero", () => {
    render(
      <InvestorPortfolio
        dataSource="live"
        initialView={view([
          project({ capacityKwLow: null, capacityKwHigh: null }),
        ])}
      />,
    );

    expect(screen.getAllByText("Not yet estimated").length).toBeGreaterThan(0);
  });

  it("re-queries the API with the stage the investor picked", async () => {
    const fetchMock = stubJson(200, {
      items: [],
      project_count: 0,
      total_estimated_capacity_kw: 0,
      mandate_match: true,
    });
    render(<InvestorPortfolio dataSource="live" initialView={view([project()])} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Development" }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const url = new URL(
      fetchMock.mock.calls[0]?.[0] as string,
      "http://localhost",
    );
    expect(url.pathname).toBe("/api/portfolio");
    expect(url.searchParams.getAll("stage")).toEqual(["development"]);
  });

  /**
   * The server narrows to the investor's mandate by default. The view has to
   * say so and offer to widen, or a short list looks like a broken one.
   */
  it("offers to widen past the mandate filter", async () => {
    const fetchMock = stubJson(200, {
      items: [],
      project_count: 0,
      total_estimated_capacity_kw: 0,
      mandate_match: false,
    });
    render(<InvestorPortfolio dataSource="live" initialView={view([project()])} />);

    const toggle = screen.getByRole("checkbox", {
      name: /Only projects matching my mandate/,
    });
    expect((toggle as HTMLInputElement).checked).toBe(true);

    fireEvent.click(toggle);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const url = new URL(
      fetchMock.mock.calls[0]?.[0] as string,
      "http://localhost",
    );
    expect(url.searchParams.get("mandate_match")).toBe("false");
  });

  it("reports a refused filter rather than silently keeping stale rows", async () => {
    stubJson(400, {
      code: "invalid_query",
      message: "Unknown project stage.",
    });
    render(<InvestorPortfolio dataSource="live" initialView={view([project()])} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Development" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Unknown project stage.");
  });

  it("pages the cards and does not render the rest", () => {
    const projects = Array.from({ length: 8 }, (_, index) =>
      project({ projectId: `p${index}`, name: `Project ${index}` }),
    );
    render(<InvestorPortfolio dataSource="live" initialView={view(projects)} />);

    expect(screen.getByText("Project 0")).toBeTruthy();
    expect(screen.getByText("Project 5")).toBeTruthy();
    expect(screen.queryByText("Project 6")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Project 6")).toBeTruthy();
    expect(screen.queryByText("Project 0")).toBeNull();
  });

  it("shows more per page when asked to", () => {
    const projects = Array.from({ length: 8 }, (_, index) =>
      project({ projectId: `p${index}`, name: `Project ${index}` }),
    );
    render(<InvestorPortfolio dataSource="live" initialView={view(projects)} />);

    fireEvent.change(screen.getByLabelText("Projects per page"), {
      target: { value: "12" },
    });

    expect(screen.getByText("Project 6")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  });

  /** A narrower result set must not leave the reader on a page that is gone. */
  it("returns to the first page when the filters change", async () => {
    stubJson(200, {
      items: [{ project_id: "p0", name: "Project 0", stage: "development" }],
      project_count: 1,
      total_estimated_capacity_kw: 0,
      mandate_match: true,
    });
    const projects = Array.from({ length: 8 }, (_, index) =>
      project({ projectId: `p${index}`, name: `Project ${index}` }),
    );
    render(<InvestorPortfolio dataSource="live" initialView={view(projects)} />);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Project 6")).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox", { name: "Development" }));

    expect(await screen.findByText("Project 0")).toBeTruthy();
  });

  it("marks a project the investor is already engaged on", () => {
    render(
      <InvestorPortfolio
        dataSource="live"
        initialEngagedProjectIds={["p1"]}
        initialView={view([project({ projectId: "p1" })])}
      />,
    );

    expect(screen.getByText(/Interest registered/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Express interest/ })).toBeNull();
  });

  /**
   * The sample is not backed by the API, so offering a button whose request
   * would be refused — and re-querying on every filter change — would both
   * mislead.
   */
  it("does not offer to express interest in a sample project", () => {
    const fetchMock = stubJson(200, {});
    render(<InvestorPortfolio dataSource="sample" initialView={view([project()])} />);

    expect(screen.queryByRole("button", { name: /Express interest/ })).toBeNull();

    fireEvent.click(screen.getByRole("checkbox", { name: "Development" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("filters the sample in the browser instead", () => {
    render(
      <InvestorPortfolio
        dataSource="sample"
        initialView={view([
          project({ projectId: "p1", name: "Early", stage: "pre_development" }),
          project({ projectId: "p2", name: "Building", stage: "construction" }),
        ])}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Construction" }));

    expect(screen.getByText("Building")).toBeTruthy();
    expect(screen.queryByText("Early")).toBeNull();
  });

  it("says so when nothing matches, rather than rendering an empty grid", () => {
    render(<InvestorPortfolio dataSource="live" initialView={view([])} />);

    expect(screen.getByText(/No projects match these filters/)).toBeTruthy();
  });
});
