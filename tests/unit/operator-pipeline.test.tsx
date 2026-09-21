// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OperatorPipeline,
  formatCapacityKw,
  pipelineQueryString,
  toPipelineView,
  type PipelineView,
} from "@/features/operator-pipeline";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function column(stageId: string, items: Record<string, unknown>[]) {
  return { journey_stage_id: stageId, count: items.length, items };
}

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    site_id: "s1",
    project_id: null,
    display_name: "18 Example Way",
    site_type: "rooftop",
    viability_status: "potentially_viable",
    estimated_capacity_kw: 210,
    address_raw: "18 Example Way, Fairview",
    submission_status: "submitted",
    project_stage: null,
    journey_stage_id: "submitted",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
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

describe("reading the pipeline board", () => {
  it("flattens the columns into cards and keeps the per-stage counts", () => {
    const view = toPipelineView({
      columns: [
        column("submitted", [item({ id: "a" }), item({ id: "b" })]),
        column("screening", [item({ id: "c", journey_stage_id: "screening" })]),
      ],
    });

    expect(view?.cards.map((card) => card.id)).toEqual(["a", "b", "c"]);
    expect(view?.stageCounts).toEqual([
      { journeyStageId: "submitted", label: "Submitted", count: 2 },
      { journeyStageId: "screening", label: "Screening", count: 1 },
    ]);
  });

  it("keeps the ribbon's hyphenated stage readable", () => {
    const view = toPipelineView({
      columns: [column("pre-development", [])],
    });
    expect(view?.stageCounts[0]?.label).toBe("Pre development");
  });

  /** An empty board is a real answer, not a malformed one. */
  it("treats an empty board as a view", () => {
    expect(toPipelineView({ columns: [] })).not.toBeNull();
    expect(toPipelineView({ columns: [] })?.cards).toEqual([]);
  });

  it("refuses a body that is not a board", () => {
    expect(toPipelineView(null)).toBeNull();
    expect(toPipelineView({})).toBeNull();
    expect(toPipelineView({ columns: "nope" })).toBeNull();
  });

  it("prefers the server's count over the item length", () => {
    const view = toPipelineView({
      columns: [{ journey_stage_id: "submitted", count: 9, items: [item()] }],
    });
    expect(view?.stageCounts[0]?.count).toBe(9);
  });
});

describe("the pipeline query string", () => {
  /**
   * The site-type parameter is `type`, not `site_type`. The handler rejects
   * unknown parameters outright, so getting this wrong fails the whole read.
   */
  it("names the site-type parameter `type`", () => {
    const query = new URLSearchParams(
      pipelineQueryString({
        statuses: [],
        siteType: "rooftop",
        viability: null,
        location: null,
      }),
    );

    expect(query.get("type")).toBe("rooftop");
    expect(query.has("site_type")).toBe(false);
  });

  it("repeats status rather than joining it", () => {
    const query = new URLSearchParams(
      pipelineQueryString({
        statuses: ["submitted", "screening"],
        siteType: null,
        viability: null,
        location: null,
      }),
    );
    expect(query.getAll("status")).toEqual(["submitted", "screening"]);
  });

  it("sends nothing at all when no filter is set", () => {
    expect(
      pipelineQueryString({
        statuses: [],
        siteType: null,
        viability: null,
        location: null,
      }),
    ).toBe("");
  });

  it("drops a location that is only whitespace", () => {
    expect(
      pipelineQueryString({
        statuses: [],
        siteType: null,
        viability: null,
        location: "   ",
      }),
    ).toBe("");
  });
});

describe("capacity formatting", () => {
  it("attaches the unit", () => {
    expect(formatCapacityKw(1200)).toBe("1,200 kW");
  });

  it("reports an absent estimate as absent, not zero", () => {
    expect(formatCapacityKw(null)).toBeNull();
    expect(formatCapacityKw(0)).toBe("0 kW");
  });
});

describe("the operator pipeline view", () => {
  const view: PipelineView = toPipelineView({
    columns: [
      column("submitted", [item({ id: "a", display_name: "Alpha site" })]),
      column("construction", [
        item({
          id: "b",
          display_name: "Beta site",
          journey_stage_id: "construction",
          submission_status: "accepted",
          project_stage: "construction",
          site_type: "land",
        }),
      ]),
    ],
  }) as PipelineView;

  it("renders the funnel counts and the rows", () => {
    render(<OperatorPipeline dataSource="live" initialView={view} />);

    expect(screen.getByText("Alpha site")).toBeTruthy();
    expect(screen.getByText("Beta site")).toBeTruthy();
    expect(screen.getAllByText("18 Example Way, Fairview")).toHaveLength(2);
  });

  it("re-queries with the status the operator picked", async () => {
    const fetchMock = stubJson(200, { columns: [] });
    render(<OperatorPipeline dataSource="live" initialView={view} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Screening" }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const url = new URL(
      fetchMock.mock.calls[0]?.[0] as string,
      "http://localhost",
    );
    expect(url.pathname).toBe("/api/pipeline");
    expect(url.searchParams.getAll("status")).toEqual(["screening"]);
  });

  it("sends the site type as `type`", async () => {
    const fetchMock = stubJson(200, { columns: [] });
    render(<OperatorPipeline dataSource="live" initialView={view} />);

    fireEvent.change(screen.getByLabelText("Site type"), {
      target: { value: "land" },
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const url = new URL(
      fetchMock.mock.calls[0]?.[0] as string,
      "http://localhost",
    );
    expect(url.searchParams.get("type")).toBe("land");
  });

  /** Location is free text, so it is submitted rather than sent per keystroke. */
  it("only queries location when the filter is submitted", async () => {
    const fetchMock = stubJson(200, { columns: [] });
    render(<OperatorPipeline dataSource="live" initialView={view} />);

    const input = screen.getByLabelText("Location");
    fireEvent.change(input, { target: { value: "Fairview" } });
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const url = new URL(
      fetchMock.mock.calls[0]?.[0] as string,
      "http://localhost",
    );
    expect(url.searchParams.get("location")).toBe("Fairview");
  });

  it("reports a refused query rather than keeping stale rows silently", async () => {
    stubJson(400, {
      code: "invalid_query",
      message: "Unknown submission status.",
    });
    render(<OperatorPipeline dataSource="live" initialView={view} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Screening" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Unknown submission status.");
  });

  it("pages the rows when there are more than fit", () => {
    const many = toPipelineView({
      columns: [
        column(
          "submitted",
          Array.from({ length: 12 }, (_, index) =>
            item({ id: `s${index}`, display_name: `Site ${index}` }),
          ),
        ),
      ],
    }) as PipelineView;

    render(<OperatorPipeline dataSource="live" initialView={many} />);

    fireEvent.change(screen.getByLabelText("Sites per page"), {
      target: { value: "10" },
    });

    expect(screen.getByText("Site 0")).toBeTruthy();
    expect(screen.queryByText("Site 11")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Site 11")).toBeTruthy();
  });

  it("filters the sample in the browser without calling the API", () => {
    const fetchMock = stubJson(200, { columns: [] });
    render(<OperatorPipeline dataSource="sample" initialView={view} />);

    fireEvent.change(screen.getByLabelText("Site type"), {
      target: { value: "land" },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Beta site")).toBeTruthy();
    expect(screen.queryByText("Alpha site")).toBeNull();
  });

  it("says so when nothing matches", () => {
    const empty = toPipelineView({ columns: [] }) as PipelineView;
    render(<OperatorPipeline dataSource="live" initialView={empty} />);

    expect(screen.getByText(/No submissions match these filters/)).toBeTruthy();
  });

  /** A superseded read must not replace the rows for the current filters. */
  it("ignores a stale response that resolves after a newer one", async () => {
    const resolvers: ((value: unknown) => void)[] = [];
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<OperatorPipeline dataSource="live" initialView={view} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Screening" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Accepted" }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const body = (name: string) => ({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          columns: [column("submitted", [item({ id: name, display_name: name })])],
        }),
    });

    resolvers[1]?.(body("Current site"));
    await screen.findByText("Current site");
    resolvers[0]?.(body("Stale site"));

    await vi.waitFor(() => expect(screen.getByText("Current site")).toBeTruthy());
    expect(screen.queryByText("Stale site")).toBeNull();
  });
});
