/**
 * Public entry point for the backend layer.
 *
 * Routes in `app/` may import this module and nothing deeper: the lint
 * boundary rejects `@/backend/handlers/...` and `@/backend/core/...` from a
 * route, so handler and core module paths stay free to move.
 *
 * A route should be a one-line re-export of a wired handler from here. Anything
 * it would otherwise decide — identity, validation, permission — belongs in the
 * backend, where it is tested and cannot be bypassed by adding a second route.
 *
 * This is also the composition root. It is where the handler is joined to a
 * store, because it is the only module that is allowed to see both: `core`
 * defines the store interface and never imports persistence, and handlers take
 * a store rather than picking one. Wiring here means switching to PostgreSQL is
 * a change to one line and an environment variable, not a change to a rule.
 */

import { selectProjectStore } from "./composition";
import { createPortfolioReader, createPortfolioRoute } from "./handlers";

export { selectedStoreName, selectProjectStore, type StoreName } from "./composition";

export type {
  PortfolioItem,
  PortfolioResponse,
} from "./core/investors";
export type { Failure, FailureCode, Result } from "./core/shared";

/** Chosen once, so the route and the page provably read the same data. */
const projectStore = selectProjectStore();

export const getPortfolioRoute = createPortfolioRoute(projectStore);

/**
 * The portfolio for a server component, as a `Result` rather than a `Response`.
 *
 * The page route uses this instead of fetching its own `/api/portfolio`, which
 * would mean the server opening an HTTP connection to itself to ask a question
 * it can answer directly. Both are built from the same store above, so the two
 * cannot drift apart.
 */
export const readPortfolioView = createPortfolioReader(projectStore);
