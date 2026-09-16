/**
 * API handlers: the transport edge of the backend.
 *
 * A handler reads a request, validates the shape of its input, enforces
 * authorization, and maps a core result or failure onto a status code. Workflow
 * rules belong in `../core` instead, so that they stay callable from a test, a
 * scheduled job or the seeding CLI without constructing an HTTP request.
 *
 * Organised to mirror `../core`: one directory per service from design document
 * section 9.2, plus `shared` for the JSON and status-code plumbing. A
 * directory's `index.ts` is its public face.
 */

export {
  createPortfolioRoute,
  handleGetPortfolio,
  parsePortfolioQuery,
} from "./investors";
export { resolveDemoViewer } from "./identity";
export { failureResponse, jsonResponse } from "./shared";
