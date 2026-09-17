/**
 * Which store the backend reads from.
 *
 * The one place that knows both `core` and `db` exist. Everything else holds
 * the boundary: `core` owns the `BackendStore` interface and never imports
 * persistence, handlers accept a store rather than choosing one, and this file
 * — which is neither — makes the single decision and passes the result down.
 *
 * `SUNSUM_STORE=db` reads PostgreSQL; anything else uses the in-memory
 * fixtures. The default is the mock so that `npm run dev`, `npm test` and CI
 * work with no database and no `DATABASE_URL` at all, and so that forgetting to
 * configure one produces the demo data rather than a connection error.
 *
 * `seed.sql` holds the same five projects `mock-store.ts` does, so every
 * endpoint returns byte-identical responses under either setting. That is the
 * property `tests/integration/store-parity.test.ts` checks.
 */

import type { ProjectStore } from "./core/projects";
import {
  memoryBackendStore,
  setActiveStore,
  type BackendStore,
} from "./core/store";
import { postgresBackendStore } from "./db/backend-store";

export type StoreName = "mock" | "db";

export function selectedStoreName(): StoreName {
  return process.env.SUNSUM_STORE === "db" ? "db" : "mock";
}

/**
 * The store this process should use. Reads the environment on every call rather
 * than caching, so a test can set `SUNSUM_STORE` and ask again.
 */
export function selectBackendStore(): BackendStore {
  return selectedStoreName() === "db" ? postgresBackendStore : memoryBackendStore;
}

/**
 * Points `core`'s store seam at the selected implementation.
 *
 * It runs on import, below. This module is the composition root and is pulled
 * in by `src/backend/index.ts`, which every route re-exports from, so the store
 * is chosen exactly once and before the first handler runs. Choosing it inside
 * each handler instead would mean twenty places to forget.
 *
 * Installs on both branches rather than leaving the mock implicit: the seam
 * already starts on the fixtures, but a second call after `SUNSUM_STORE`
 * changed has to be able to put them back, and "only ever install PostgreSQL"
 * is a one-way door that makes this function lie about its own name.
 */
export function installSelectedStore(): StoreName {
  setActiveStore(selectBackendStore());
  return selectedStoreName();
}

installSelectedStore();

/**
 * Kept for callers that only need the read side. A `BackendStore` is a
 * `ProjectStore`, so this is the same object seen through a narrower type.
 */
export function selectProjectStore(): ProjectStore {
  return selectBackendStore();
}
