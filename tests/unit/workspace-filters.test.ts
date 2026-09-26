import { describe, expect, it } from "vitest";
import {
  copyWorkspaceQuery, defaultWorkspaceQuery, isWorkspaceQuery, workspaceQueryString,
  PROJECT_STAGES, VIABILITY_STATUSES,
} from "@/domain/workspace-filters";
import {
  PROJECT_STAGES as portfolioStages, VIABILITY_STATUSES as portfolioViability,
  portfolioQueryString,
} from "@/features/investor-portfolio/model/portfolio";
import { pipelineQueryString } from "@/features/operator-pipeline/model/pipeline";
import { CollectionHistory } from "@/features/live-workspace/collectionHistory";
import { INITIAL_COLLECTION } from "@/features/live-workspace/presentation";

describe("one pure workspace query contract", () => {
  it("reuses the exact vocabulary in the existing view model", () => {
    expect(portfolioStages).toBe(PROJECT_STAGES);
    expect(portfolioViability).toBe(VIABILITY_STATUSES);
  });

  it("shares exact serialization without confusing project, site and lifecycle types", () => {
    const portfolio = portfolioQueryString({
      stages: ["pre_development", "development"], viability: "potentially_viable",
      projectType: "A & B", mandateMatch: false,
    });
    expect(portfolio).toBe(workspaceQueryString({
      stages: ["pre_development", "development"], viability: "potentially_viable",
      projectType: "A & B", mandateMatch: false,
    }));
    const pipeline = pipelineQueryString({
      statuses: ["submitted", "screening"], siteType: "rooftop", viability: null, location: " A & B ",
    });
    expect(pipeline).toBe("status=submitted&status=screening&type=rooftop&location=A+%26+B");
    expect(defaultWorkspaceQuery("investor")).toEqual({ mandateMatch: true });
    expect(defaultWorkspaceQuery("operator")).toEqual({});
  });

  it.each([
    [{ siteType: "rooftop" }, "investor"],
    [{ stages: ["pre-development"] }, "investor"],
    [{ statuses: ["submitted", "submitted"] }, "operator"],
    [{ location: " " }, "operator"],
    [{ mandateMatch: false }, "site-owner"],
    [{ arbitraryUrl: "https://outside.invalid" }, "operator"],
    [{ page: 2 }, "operator"],
  ] as const)("rejects a query outside the role's current vocabulary", (query, role) => {
    expect(isWorkspaceQuery(query, role)).toBe(false);
  });

  it("copies query arrays before a caller can mutate the next request", () => {
    const statuses: ("submitted" | "screening")[] = ["submitted"];
    const copied = copyWorkspaceQuery({ statuses });
    statuses.push("screening");
    expect(copied.statuses).toEqual(["submitted"]);
  });
});

describe("actor-local opaque collection history", () => {
  it("restores the exact earlier query and page without storing them in a key", () => {
    const history = new CollectionHistory();
    history.setCollection({ ...INITIAL_COLLECTION, page: 2, pageSize: 50, query: "Loaded search", display: "cards" });
    const first = history.remember({ location: "Private address query" });
    history.setCollection({ ...INITIAL_COLLECTION, page: 3 });
    history.remember({ statuses: ["screening"] });
    expect(first).not.toMatch(/Private|Loaded|address|screening/);
    expect(history.restore(first)).toMatchObject({
      collection: { page: 2, pageSize: 50, query: "Loaded search", display: "cards" },
      query: { location: "Private address query" },
    });
    expect(new CollectionHistory().restore(first)).toBeNull();
  });

  it("bounds old entries and replaces current preferences without changing its opaque key", () => {
    const history = new CollectionHistory();
    const first = history.remember({});
    expect(history.remember({ location: "Replacement" }, first)).toBe(first);
    for (let index = 0; index < 64; index += 1) history.remember({});
    expect(history.restore(first)).toBeNull();
    expect(history.restore("caller-granted-role")).toBeNull();
  });
});
