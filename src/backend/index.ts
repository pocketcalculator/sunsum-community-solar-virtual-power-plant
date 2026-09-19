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

export {
  selectBackendStore,
  selectedStoreName,
  selectProjectStore,
  type StoreName,
} from "./composition";

export {
  demoSwitchRoute,
  getExportRoute,
  getInvestorProfileRoute,
  getMeRoute,
  getPipelineRoute,
  getMyEngagementsRoute,
  getOwnerOutstandingRoute,
  getProjectFundingNeedsRoute,
  getSiteDocumentContentRoute,
  getSubmissionDetailRoute,
  isDemoAuthEnabled,
  patchProjectRoute,
  patchSiteRoute,
  postInvestorProfileRoute,
  postSiteDocumentRoute,
  postSiteSubmitRoute,
  putSiteDocumentContentRoute,
  getDealRoomRoute,
  getOwnerSitesRoute,
  getPortfolioRoute,
  getProjectEngagementsRoute,
  getSubmissionsRoute,
  logoutRoute,
  patchProjectVisibilityRoute,
  postEngagementRoute,
  postAssessmentOverrideRoute,
  postProjectStageRoute,
  postSiteRoute,
  postSubmissionDecisionRoute,
  toDomainRole,
  toWireRole,
} from "./handlers";
