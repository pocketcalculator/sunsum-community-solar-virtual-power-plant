/**
 * Which store the backend reads from.
 *
 * The one place that knows both `core` and `db` exist. Everything else holds
 * the boundary: `core` owns the `ProjectStore` interface and never imports
 * persistence, handlers accept a store rather than choosing one, and this file
 * — which is neither — makes the single decision and passes the result down.
 *
 * `SUNSUM_STORE=db` reads PostgreSQL; anything else uses the in-memory
 * fixtures. The default is the mock so that `npm run dev`, `npm test` and CI
 * work with no database and no `DATABASE_URL` at all, and so that forgetting to
 * configure one produces the demo data rather than a connection error.
 *
 * `seed.sql` holds the same five projects `mock-store.ts` does, so `GET
 * /portfolio` returns byte-identical responses under either setting. That is
 * the property `scripts/compare-stores.mjs` checks.
 */

import { mockProjectStore, type ProjectStore } from "./core/projects";
import { postgresProjectStore } from "./db/project-store";

export type StoreName = "mock" | "db";

export function selectedStoreName(): StoreName {
  return process.env.SUNSUM_STORE === "db" ? "db" : "mock";
}

export function selectProjectStore(): ProjectStore {
  return selectedStoreName() === "db" ? postgresProjectStore : mockProjectStore;
}
