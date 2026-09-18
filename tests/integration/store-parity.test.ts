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
 * It is not part of `npm test`, which must keep passing on a machine with no
 * database at all. It is still run on every push: the `database` job in
 * repo-health.yml stands up a PostgreSQL service container and runs this
 * config. The skip below therefore covers a developer who has not started
 * docker, not CI — but it still announces itself rather than reporting a
 * silent pass, because a skipped assertion is not a passing one.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sql } from "drizzle-orm";

import type { Viewer, ViewerIdentity } from "@/backend/core/identity";
import {
  getPortfolio,
  upsertMyInvestorProfile,
  type InvestorProfileInput,
  type PortfolioQuery,
} from "@/backend/core/investors";
import type { ProjectRecord } from "@/backend/core/projects";
import { createMemoryBackendStore, type BackendStore } from "@/backend/core/store";
import { closeDb, getDb } from "@/backend/db/client";
import { PostgresBackendStore } from "@/backend/db/backend-store";

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

/**
 * The mock side of the comparison.
 *
 * The in-memory store rather than `mockProjectStore`: the two hold the same
 * fixtures, but `getPortfolio` now needs open funding needs as well as
 * projects, and only this one answers for both. It is also the store the
 * running app falls back to, so it is the thing PostgreSQL actually has to be
 * indistinguishable from.
 */
const memoryStore = createMemoryBackendStore({ seedDemoProjects: true });

/** Ordering is not part of the store contract; content is. */
function byId(records: readonly ProjectRecord[]): readonly ProjectRecord[] {
  return [...records].sort((left, right) => left.id.localeCompare(right.id));
}

/**
 * How long the overlap test holds one caller open. Long enough that the other
 * caller reliably lands inside the window on a loaded machine, short enough
 * that it costs the suite a fraction of a second.
 */
const OVERLAP_MS = 400;

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The same store, but its investor-profile write takes `ms` longer to return.
 *
 * Concurrency tests that merely start two calls together are not reproducible:
 * whether they overlap is up to the scheduler and the connection pool, so they
 * can report a pass for code that has no transaction. Delaying one caller in
 * the middle of its sequence makes the interleaving a property of the test
 * rather than of the machine it runs on.
 *
 * `transaction` is wrapped as well as `upsertInvestorProfile`, because the
 * store hands the callback a *new* store built around the transaction handle —
 * without re-wrapping that one, the delay would be bypassed by exactly the
 * code path under test.
 */
function pauseAfterWrite(store: BackendStore, ms: number): BackendStore {
  const wrap = (inner: BackendStore): BackendStore =>
    new Proxy(inner, {
      get(target, property, receiver): unknown {
        if (property === "upsertInvestorProfile") {
          return async (profile: Parameters<BackendStore["upsertInvestorProfile"]>[0]) => {
            const result = await target.upsertInvestorProfile(profile);
            await pause(ms);
            return result;
          };
        }

        if (property === "transaction") {
          return <T>(operation: (nested: BackendStore) => Promise<T>) =>
            target.transaction((nested) => operation(wrap(nested)));
        }

        const value = Reflect.get(target, property, receiver) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

  return wrap(store);
}

describe.skipIf(!databaseUrl)("the PostgreSQL store matches the mock", () => {
  /**
   * Built in `beforeAll`, not in the suite body.
   *
   * A skipped `describe` still runs its callback — that is how the runner
   * discovers the tests it is about to skip — so constructing the store here
   * would open a pool on a `DATABASE_URL` that by definition is not set, and
   * the suite would fail during collection instead of skipping. Hooks do not
   * run for a skipped suite, so this is the one place it is safe.
   */
  let store: PostgresBackendStore;

  beforeAll(() => {
    store = new PostgresBackendStore();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("returns the same projects, field for field", async () => {
    const [fromDb, fromMock] = await Promise.all([
      store.listProjects(),
      memoryStore.listProjects(),
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
      getPortfolio(investor, unfiltered, memoryStore),
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

  /*
   * An investor profile is the one record that is rewritten in place, so it is
   * the only one whose `updated_at` can disagree with its `created_at`. The
   * table originally had no `updated_at` column and the store answered it from
   * `created_at`, which nothing noticed while the handler replied with the
   * object it had just built rather than the row it had just stored.
   *
   * Comparing the two stores field for field would not catch it: both would
   * report *a* timestamp. The substitution only shows up across an edit, so
   * this writes twice and asserts the second write moved.
   */
  it("moves an investor profile's updated_at when it is edited", async () => {
    const existing = await store.getInvestorProfileByUserId(investor.userId);

    expect(existing, "the seed's investor profile is missing").not.toBeNull();

    if (existing === null) return;

    const edited = new Date(Date.now() + 1_000).toISOString();

    /*
     * This is the one test here that writes, and it writes to the shared seed.
     * The restore therefore has to run even when an assertion throws, or a
     * failure would leave `(edited)` behind and every later `npm run test:db`
     * would start from corrupted demo data — turning one red test into a red
     * suite that no longer describes the code.
     */
    try {
      await store.upsertInvestorProfile({
        ...existing,
        organizationName: `${existing.organizationName} (edited)`,
        updatedAt: edited,
      });

      const reread = await store.getInvestorProfileByUserId(investor.userId);

      expect(reread?.updatedAt).toBe(edited);
      expect(reread?.updatedAt).not.toBe(reread?.createdAt);
      expect(reread?.createdAt).toBe(existing.createdAt);
    } finally {
      await store.upsertInvestorProfile(existing);
    }
  });

  /*
   * The race the transaction in `upsertMyInvestorProfile` exists to close,
   * asserted against the database that actually runs in production.
   *
   * The unit test for this covers `MemoryBackendStore`, whose `transaction`
   * is an in-process promise queue that serialises callers by construction.
   * PostgreSQL does not work that way: `db.transaction()` opens a READ
   * COMMITTED transaction, and READ COMMITTED does not stop two first-time
   * posts from both reading "no profile". Whether the fix holds therefore
   * depends on the unique index on `investors.user_id` and on
   * `ON CONFLICT (user_id) DO UPDATE`, neither of which the mock models — so
   * passing the unit test is not evidence about this store.
   *
   * Two overlapping posts for one brand-new user, started without awaiting the
   * first. The three assertions are the three ways the race showed up:
   *
   *   - two ids allocated for one user, so a later read picks one arbitrarily
   *   - a caller handed back the *other* caller's organization name
   *   - two rows for one user
   *
   * Writes its own user rather than borrowing the seed's, because the whole
   * point is the path where no profile exists yet, and the seeded investor
   * already has one.
   */
  it("allocates one profile when two first-time posts overlap", async () => {
    const db = getDb();
    const userId = "6f1c0d52-9a83-4e77-b2c4-18d59e0a7f36";

    const submission = (organizationName: string): InvestorProfileInput => ({
      organizationName,
      investorType: "impact_investor",
      capitalType: "concessionary_debt",
      fundingStageFocus: [],
      ticketSizeMin: null,
      ticketSizeMax: null,
      geographies: [],
      investmentObjectives: [],
      impactPriorities: [],
      decisionCriteria: [],
    });

    const identity: ViewerIdentity = { userId, role: "investor" };

    /*
     * Cleanup runs first as well as last: a previous failure could have left
     * the row behind, and this test only describes anything if it starts from
     * a user with no profile.
     */
    const removeFixture = async (): Promise<void> => {
      await db.execute(sql`DELETE FROM investors WHERE user_id = ${userId}`);
      await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
    };

    await removeFixture();

    try {
      await db.execute(
        sql`INSERT INTO users (id, name, email, role)
            VALUES (${userId}, 'Race Fixture', 'race-fixture@example.test', 'investor')`,
      );

      /*
       * Two posts whose read-write-reread sequences are forced to overlap.
       *
       * Starting both with `Promise.all` and hoping is not enough — measured,
       * the statements complete fast enough that the first caller finishes
       * before the second's read returns, and the test passes against code
       * with no transaction at all. So the first caller is slowed *after* its
       * write and the second is started during that pause, which pins the
       * interleaving instead of leaving it to the scheduler:
       *
       *   without a transaction   the first write autocommits, the second
       *                           caller reads it, updates the row to its own
       *                           name, and the first caller's re-read returns
       *                           "Second Light Fund" to the caller who sent
       *                           "First Light Fund"
       *
       *   with a transaction      the first write is uncommitted, so the
       *                           second caller's insert blocks on the unique
       *                           index until the first commits, and each
       *                           caller re-reads its own submission
       */
      const [first, second] = await Promise.all([
        upsertMyInvestorProfile(
          identity,
          submission("First Light Fund"),
          pauseAfterWrite(store, OVERLAP_MS),
        ),
        (async () => {
          await pause(OVERLAP_MS / 4);
          return upsertMyInvestorProfile(identity, submission("Second Light Fund"), store);
        })(),
      ]);

      expect(first.ok, "the first post failed").toBe(true);
      expect(second.ok, "the second post failed").toBe(true);

      if (!first.ok || !second.ok) return;

      /** One user, one profile id, whichever order they landed in. */
      expect(first.value.id).toBe(second.value.id);

      /*
       * Each caller is told about their own submission. This is the assertion
       * that discriminates: the handler returns a re-read, so both callers
       * converge on the same id even when the race is wide open, and an
       * id-only check passes against the broken code.
       */
      expect(first.value.organization_name).toBe("First Light Fund");
      expect(second.value.organization_name).toBe("Second Light Fund");

      const rows = await db.execute<{ count: string }>(
        sql`SELECT count(*)::text AS count FROM investors WHERE user_id = ${userId}`,
      );

      expect(rows.rows[0]?.count, "the race left more than one profile row").toBe("1");
    } finally {
      await removeFixture();
    }
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
