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
 */

export {
  getDealRoomRoute,
  getOwnerSitesRoute,
  getPortfolioRoute,
  getProjectEngagementsRoute,
  getSubmissionsRoute,
  patchProjectVisibilityRoute,
  postEngagementRoute,
  postProjectStageRoute,
  postSiteRoute,
  postSubmissionDecisionRoute,
} from "./handlers";
