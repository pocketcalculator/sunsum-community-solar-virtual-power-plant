// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Viewer } from "@/backend/core/identity";
import { createMemoryBackendStore } from "@/backend/core/store";
import { parseDecision } from "@/backend/handlers/projects";
import {
  handleGetDealRoom,
  handleGetProjectEngagements,
  handlePatchProjectVisibility,
  handlePostEngagement,
  handlePostProjectStage,
  handlePostSubmissionDecision,
} from "@/backend/handlers";
import { parsePortfolioQuery } from "@/backend/handlers/investors";
import {
  parseSiteCreate,
  parseSubmissionQuery,
} from "@/backend/handlers/sites";

const operator: Viewer = {
  role: "operator",
  userId: "188d99df-33ce-4cd5-9744-a17968679b50",
};
const investor: Viewer = {
  role: "investor",
  userId: "9727021a-7b77-418d-a802-faa4bc230032",
  investor: {
    id: "150bbd86-f79c-48db-8579-e7c79db8c468",
    organizationName: "Test Investor",
    fundingStageFocus: [],
    geographies: [],
    onboardingCompletedAt: "2026-09-01T00:00:00.000Z",
  },
};

describe("backend input validation", () => {
  it("rejects unknown site fields and invalid physical values", () => {
    expect(parseSiteCreate({ surprise: true }).ok).toBe(false);
    expect(parseSiteCreate({ approximate_area_sqm: -1 }).ok).toBe(false);
  });

  it("rejects unknown submission filters and enum values", () => {
    expect(parseSubmissionQuery(new URLSearchParams("extra=1")).ok).toBe(false);
    expect(parseSubmissionQuery(new URLSearchParams("status=nope")).ok).toBe(false);
    expect(parseSubmissionQuery(new URLSearchParams("type=nope")).ok).toBe(false);
    expect(
      parseSubmissionQuery(new URLSearchParams("viability=nope")).ok,
    ).toBe(false);
  });

  it("rejects unknown decision fields and decisions", () => {
    expect(parseDecision({ decision: "accept", extra: true }).ok).toBe(false);
    expect(parseDecision({ decision: "maybe" }).ok).toBe(false);
  });

  it("rejects unknown portfolio query parameters", () => {
    const result = parsePortfolioQuery(new URLSearchParams("extra=1"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure).toMatchObject({
        code: "invalid_query",
        details: { parameter: "extra" },
      });
    }
  });

  it.each([
    [
      "submission decision",
      () =>
        handlePostSubmissionDecision(
          jsonRequest({ decision: "accept" }),
          operator,
          "not-a-uuid",
          createMemoryBackendStore(),
        ),
      "invalid_body",
    ],
    [
      "project stage",
      () =>
        handlePostProjectStage(
          jsonRequest({ stage: "development" }),
          operator,
          "not-a-uuid",
          createMemoryBackendStore(),
        ),
      "invalid_body",
    ],
    [
      "project visibility",
      () =>
        handlePatchProjectVisibility(
          jsonRequest({ visible_to_investors: true }),
          operator,
          "not-a-uuid",
          createMemoryBackendStore(),
        ),
      "invalid_body",
    ],
    [
      "engagement creation",
      () =>
        handlePostEngagement(
          jsonRequest({}),
          investor,
          "not-a-uuid",
          createMemoryBackendStore(),
        ),
      "invalid_body",
    ],
    [
      "engagement listing",
      () =>
        handleGetProjectEngagements(
          operator,
          "not-a-uuid",
          createMemoryBackendStore(),
        ),
      "invalid_query",
    ],
    [
      "deal room",
      () =>
        handleGetDealRoom(
          investor,
          "not-a-uuid",
          createMemoryBackendStore(),
        ),
      "invalid_query",
    ],
  ] as const)(
    "rejects an invalid path ID for %s before core",
    async (_label, call, code) => {
      const response = await call();
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code,
        details: {
          location: "path",
          parameter: "id",
          value: "not-a-uuid",
        },
      });
    },
  );
});

function jsonRequest(body: unknown): Request {
  return new Request("https://sunsum.test/api/test", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
