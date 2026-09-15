/**
 * Core workflow logic: everything that happens once a handler has accepted a
 * request.
 *
 * Core is transport-neutral. It does not import `../handlers`, `next/server`,
 * `next/headers` or `next/cache` — the lint boundary rejects all of them — so a
 * workflow rule can be exercised directly by a test. It may depend on
 * `@/domain` shared vocabulary.
 *
 * Authorization decisions live here rather than at the transport edge, so that
 * a future job or CLI calling the same function is subject to the same rules.
 */

export {
  DEFAULT_PORTFOLIO_QUERY,
  getPortfolio,
  type PortfolioItem,
  type PortfolioQuery,
  type PortfolioResponse,
} from "./portfolio";
export {
  isProjectStage,
  isViabilityStatus,
  PROJECT_STAGES,
  SITE_TYPES,
  VIABILITY_STATUSES,
  type ProjectRecord,
  type ProjectStage,
  type SiteType,
  type ViabilityStatus,
} from "./projects";
export {
  failure,
  ok,
  type Failure,
  type FailureCode,
  type Result,
} from "./result";
export { ROLES, type InvestorProfile, type Role, type Viewer } from "./viewer";
export { mockProjectStore, type ProjectStore } from "./mock/projects";
