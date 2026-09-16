// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import {
  selectProjectStore,
  selectedStoreName,
  type StoreName,
} from "@/backend/composition";
import { mockProjectStore } from "@/backend/core/projects";
import type { ProjectRecord, ProjectStore } from "@/backend/core/projects";
import type { InvestorProfile, Viewer } from "@/backend/core/identity";
import {
  createPortfolioRoute,
  handleGetPortfolio,
} from "@/backend/handlers/investors";

const originalStore = process.env.SUNSUM_STORE;
const originalUrl = process.env.DATABASE_URL;

afterEach(() => {
  restore("SUNSUM_STORE", originalStore);
  restore("DATABASE_URL", originalUrl);
});

function restore(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function withStoreSetting(value: string | undefined): void {
  restore("SUNSUM_STORE", value);
}

const investor: InvestorProfile = {
  id: "inv-1",
  organizationName: "Test Endowment",
  fundingStageFocus: [],
  geographies: [],
  onboardingCompletedAt: "2026-09-01T00:00:00.000Z",
};

const viewer: Viewer = {
  role: "investor",
  userId: "u-inv-1",
  investor,
};

function project(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: "p-1",
    siteId: "s-1",
    name: "Only in the injected store",
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

async function namesFrom(response: Response): Promise<readonly string[]> {
  expect(response.status).toBe(200);
  const body = (await response.json()) as { items: readonly { name: string }[] };
  return body.items.map((item) => item.name);
}

describe("choosing a store", () => {
  it("defaults to the fixtures when SUNSUM_STORE is unset", () => {
    withStoreSetting(undefined);

    expect(selectedStoreName()).toBe<StoreName>("mock");
    expect(selectProjectStore()).toBe(mockProjectStore);
  });

  it("reads PostgreSQL only for exactly db", () => {
    withStoreSetting("db");

    expect(selectedStoreName()).toBe<StoreName>("db");
    expect(selectProjectStore()).not.toBe(mockProjectStore);
  });

  // A misspelling must not silently fall through to a store nobody configured.
  // Falling back to fixtures keeps a mistyped value from reaching a database.
  it.each(["", "DB", "Db", "postgres", "postgresql", "database", "true"])(
    "falls back to the fixtures for %o",
    (value) => {
      withStoreSetting(value);

      expect(selectedStoreName()).toBe<StoreName>("mock");
      expect(selectProjectStore()).toBe(mockProjectStore);
    },
  );

  // The pool is built on first query, not on import or on inspection, which is
  // what lets `npm test`, `npm run build` and CI run with no database at all.
  it("does not need DATABASE_URL to pick or inspect the PostgreSQL store", () => {
    withStoreSetting("db");
    delete process.env.DATABASE_URL;

    const store = selectProjectStore();

    expect(typeof store.listProjects).toBe("function");
  });

  // ...but a query with nothing configured has to say so, and say what to do.
  it("explains the missing DATABASE_URL when a query is actually made", async () => {
    withStoreSetting("db");
    delete process.env.DATABASE_URL;

    await expect(selectProjectStore().listProjects()).rejects.toThrow(
      /DATABASE_URL is not set/,
    );
  });
});

describe("wiring a store into the endpoint", () => {
  const request = new Request("https://sunsum.test/api/portfolio");

  it("reads from the store the handler is given", async () => {
    const response = await handleGetPortfolio(
      request,
      viewer,
      storeOf(project()),
    );

    expect(await namesFrom(response)).toEqual(["Only in the injected store"]);
  });

  it("binds the store the route is built with", async () => {
    const route = createPortfolioRoute(storeOf(project()));

    expect(await namesFrom(await route(request))).toEqual([
      "Only in the injected store",
    ]);
  });

  // Omitting the store is what every existing caller does, so it has to keep
  // answering rather than failing on a missing dependency.
  it("still answers when no store is supplied", async () => {
    const response = await createPortfolioRoute()(request);

    expect(response.status).toBe(200);
  });
});
