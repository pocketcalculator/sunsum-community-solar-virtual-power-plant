// @vitest-environment node
/**
 * The database store and the mock must be indistinguishable.
 *
 * This is the property the whole seam rests on: `core` asks a `ProjectStore`
 * for projects and cannot tell which one answered. If PostgreSQL returns
 * anything different from the fixtures, then switching stores changed
 * behaviour, and every test written against the mock has stopped being evidence
 * about the real system.
 *
 * So the test compares the two records field for field, and then compares the
 * serialised `GET /portfolio` payload built from each. The payload comparison is
 * the one that matters — it is what a client actually sees.
 *
 * Requires a running database:
 *
 *   docker compose up -d --wait
 *   npm run db:migrate && npm run db:reset && npm run db:seed
 *   npm run test:db
 *
 * It is not part of `npm test`, which must keep passing with no database at
 * all. That means CI does not cover it, which is a real gap — so the skip below
 * says so out loud rather than reporting a silent pass.
 */

import { afterAll, describe, expect, it } from "vitest";

import type { Viewer } from "@/backend/core/identity";
import { getPortfolio, type PortfolioQuery } from "@/backend/core/investors";
import { mockProjectStore, type ProjectRecord } from "@/backend/core/projects";
import { closeDb } from "@/backend/db/client";
import { PostgresProjectStore } from "@/backend/db/project-store";

const databaseUrl = process.env.DATABASE_URL;

/** The seed's investor, with an unfiltered mandate so nothing is excluded. */
const investor: Viewer = {
  userId: "91e3b7c4-2d65-4a08-bf19-7c5e0a6d3b82",
  role: "investor",
  investor: {
    id: "4d7a2c91-8e56-43bf-9a10-5c6d2f7b8e34",
    organizationName: "Southeast Community Solar Fund",
    fundingStageFocus: [],
    geographies: [],
    onboardingCompletedAt: "2026-09-01T00:00:00.000Z",
  },
};

const unfiltered: PortfolioQuery = {
  mandateMatch: false,
  stages: [],
  viability: null,
  projectType: null,
};

/** Ordering is not part of the store contract; content is. */
function byId(records: readonly ProjectRecord[]): readonly ProjectRecord[] {
  return [...records].sort((left, right) => left.id.localeCompare(right.id));
}

describe.skipIf(!databaseUrl)("the PostgreSQL store matches the mock", () => {
  const store = new PostgresProjectStore();

  afterAll(async () => {
    await closeDb();
  });

  it("returns the same projects, field for field", async () => {
    const [fromDb, fromMock] = await Promise.all([
      store.listProjects(),
      mockProjectStore.listProjects(),
    ]);

    expect(
      fromDb.length,
      "the database is empty or stale — run `npm run db:reset && npm run db:seed`",
    ).toBe(fromMock.length);

    expect(byId(fromDb)).toEqual(byId(fromMock));
  });

  it("builds an identical GET /portfolio payload", async () => {
    const [fromDb, fromMock] = await Promise.all([
      getPortfolio(investor, unfiltered, store),
      getPortfolio(investor, unfiltered, mockProjectStore),
    ]);

    expect(fromDb.ok).toBe(true);
    expect(fromMock.ok).toBe(true);

    if (fromDb.ok && fromMock.ok) {
      /** Serialised, because that is what crosses the wire. */
      expect(JSON.stringify(fromDb.value)).toBe(JSON.stringify(fromMock.value));
    }
  });

  it("keeps the unpublished project out of the portfolio", async () => {
    const hidden = (await store.listProjects()).filter((project) => !project.visibleToInvestors);

    expect(hidden.length, "the seed's unpublished project is missing").toBeGreaterThan(0);

    const result = await getPortfolio(investor, unfiltered, store);

    expect(result.ok).toBe(true);

    if (result.ok) {
      const returned = new Set(result.value.items.map((item) => item.project_id));

      for (const project of hidden) {
        expect(returned.has(project.id), `${project.name} leaked to an investor`).toBe(false);
      }
    }
  });

  it("counts open funding needs from rows rather than a stored number", async () => {
    const projects = await store.listProjects();
    const auburn = projects.find((project) => project.name === "Sweet Auburn rooftop array");

    expect(auburn?.openFundingNeedsCount).toBe(2);
  });
});

describe.skipIf(Boolean(databaseUrl))("store parity", () => {
  it("was not checked, because DATABASE_URL is not set", () => {
    console.warn(
      "Skipped store parity: no DATABASE_URL. Run " +
        "`docker compose up -d --wait && npm run db:migrate && npm run db:seed` first.",
    );
    expect(databaseUrl).toBeUndefined();
  });
});
