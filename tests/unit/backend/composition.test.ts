// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import {
  installSelectedStore,
  selectBackendStore,
  selectProjectStore,
  selectedStoreName,
  type StoreName,
} from "@/backend/composition";
import type { ProjectRecord } from "@/backend/core/projects";
import {
  createMemoryBackendStore,
  isMemoryStoreActive,
  memoryBackendStore,
  setActiveStore,
  type BackendStore,
} from "@/backend/core/store";
import type { InvestorProfile, Viewer } from "@/backend/core/identity";
import { DEMO_INVESTOR_USER_ID } from "@/backend/demo-principals";
import { issueSessionCookie } from "@/backend/handlers/identity";
import {
  getPortfolioRoute,
  handleGetPortfolio,
} from "@/backend/handlers/investors";

const originalStore = process.env.SUNSUM_STORE;
const originalUrl = process.env.DATABASE_URL;

afterEach(() => {
  restore("SUNSUM_STORE", originalStore);
  restore("DATABASE_URL", originalUrl);
  // Put the seam back, since a test may have installed something else.
  installSelectedStore();
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

/**
 * A real store whose `listProjects` is replaced.
 *
 * A bare `{ listProjects }` object was enough when handlers took a
 * `ProjectStore`; they now take the full `BackendStore`, so the other
 * twenty-seven methods have to come from somewhere. Delegating through a proxy
 * rather than subclassing keeps `this` bound to the real instance, which owns
 * private state a derived object could not reach.
 */
function storeOf(...projects: readonly ProjectRecord[]): BackendStore {
  // Seeded, because the route resolves its own viewer now and an investor
  // without a profile is refused before the store seam under test is reached.
  const base = createMemoryBackendStore({ seedDemoProjects: true });
  return new Proxy(base, {
    get(target, property, receiver) {
      void receiver;
      if (property === "listProjects") return () => Promise.resolve(projects);
      const member = Reflect.get(target, property, target) as unknown;
      return typeof member === "function" ? member.bind(target) : member;
    },
  });
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
    expect(selectBackendStore()).toBe(memoryBackendStore);
  });

  it("reads PostgreSQL only for exactly db", () => {
    withStoreSetting("db");

    expect(selectedStoreName()).toBe<StoreName>("db");
    expect(selectBackendStore()).not.toBe(memoryBackendStore);
  });

  // A misspelling must not silently fall through to a store nobody configured.
  // Falling back to fixtures keeps a mistyped value from reaching a database.
  it.each(["", "DB", "Db", "postgres", "postgresql", "database", "true"])(
    "falls back to the fixtures for %o",
    (value) => {
      withStoreSetting(value);

      expect(selectedStoreName()).toBe<StoreName>("mock");
      expect(selectBackendStore()).toBe(memoryBackendStore);
    },
  );

  // `installSelectedStore` is what the composition root runs on import, and it
  // has to work in both directions: a process that read PostgreSQL once must be
  // able to go back to the fixtures, or "mock" stops meaning anything.
  it("installs the store it selected, both ways", () => {
    withStoreSetting("db");
    installSelectedStore();
    expect(isMemoryStoreActive()).toBe(false);

    withStoreSetting(undefined);
    installSelectedStore();
    expect(isMemoryStoreActive()).toBe(true);
  });

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
  /**
   * `mandate_match=false` because this is a test about which store answered,
   * not about mandate matching. The default is true, and a match needs an open
   * funding need, so a lone injected project would be filtered out for a reason
   * that has nothing to do with the seam under test. Mandate logic has its own
   * tests in `portfolio.test.ts`.
   */
  const request = new Request(
    "https://sunsum.test/api/portfolio?mandate_match=false",
  );

  /**
   * The route resolves its own viewer now, so a request that reaches it has to
   * carry a session. `handleGetPortfolio` is still handed a viewer directly —
   * the split is the point, and only the wrapper needs signing in.
   */
  function signedIn(): Request {
    const cookie = issueSessionCookie(DEMO_INVESTOR_USER_ID);
    if (!cookie.ok) throw new Error(cookie.failure.message);
    return new Request(request.url, {
      headers: { cookie: cookie.value.split(";")[0] ?? "" },
    });
  }

  it("reads from the store the handler is given", async () => {
    const response = await handleGetPortfolio(
      request,
      viewer,
      storeOf(project()),
    );

    expect(await namesFrom(response)).toEqual(["Only in the injected store"]);
  });

  // The route wrapper takes no store: it reads whichever one the composition
  // root installed. That indirection is the whole point of the seam, so test it
  // by installing a different store and watching the route follow.
  it("serves the route from the installed store", async () => {
    const previous = setActiveStore(storeOf(project()));

    try {
      expect(await namesFrom(await getPortfolioRoute(signedIn()))).toEqual([
        "Only in the injected store",
      ]);
    } finally {
      setActiveStore(previous);
    }
  });

  // Nothing installed but the default fixtures still has to answer, because
  // that is `npm run dev` with no database.
  it("still answers on the store installed by default", async () => {
    const response = await getPortfolioRoute(signedIn());

    expect(response.status).toBe(200);
  });

  // The hole this replaced: the wrapper used to hand every caller the same
  // onboarded investor, so an anonymous request read a real portfolio.
  it("refuses a request that carries no session", async () => {
    const response = await getPortfolioRoute(request);

    expect(response.status).toBe(401);
  });
});
