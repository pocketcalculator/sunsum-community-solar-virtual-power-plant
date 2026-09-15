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
 *
 * Organised by the service catalog in design document section 9.2: one
 * directory per service, plus `shared` for primitives that belong to none of
 * them. A directory's `index.ts` is its public face — sibling domains import
 * `../projects`, never `../projects/mock-store` — which is what keeps the
 * dependencies between them countable as the API surface grows.
 */

export {
  DEFAULT_PORTFOLIO_QUERY,
  getPortfolio,
  type PortfolioItem,
  type PortfolioQuery,
  type PortfolioResponse,
} from "./investors";
export { ROLES, type InvestorProfile, type Role, type Viewer } from "./identity";
export {
  isProjectStage,
  isViabilityStatus,
  mockProjectStore,
  PROJECT_STAGES,
  SITE_TYPES,
  VIABILITY_STATUSES,
  type ProjectRecord,
  type ProjectStage,
  type ProjectStore,
  type SiteType,
  type ViabilityStatus,
} from "./projects";
export {
  failure,
  ok,
  type Failure,
  type FailureCode,
  type Result,
} from "./shared";
