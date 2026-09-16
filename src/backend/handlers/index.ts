/**
 * API handlers: the transport edge of the backend.
 *
 * A handler reads a request, selects the route's fixed demo principal, validates
 * the input, and maps a core result or failure onto a status code. Core enforces
 * authorization and workflow rules so they remain callable from a test,
 * scheduled job or seeding CLI without constructing an HTTP request.
 *
 * Organised to mirror `../core`: one directory per service from design document
 * section 9.2, plus `shared` for the JSON and status-code plumbing. A
 * directory's `index.ts` is its public face.
 */

export {
  getPortfolioRoute,
  handleGetPortfolio,
  parsePortfolioQuery,
} from "./investors";
export {
  getSubmissionsRoute,
  handleGetSubmissions,
  handlePostSite,
  parseSiteCreate,
  parseSubmissionQuery,
  postSiteRoute,
} from "./sites";
export {
  handlePatchProjectVisibility,
  handlePostProjectStage,
  handlePostSubmissionDecision,
  parseDecision,
  patchProjectVisibilityRoute,
  postProjectStageRoute,
  postSubmissionDecisionRoute,
} from "./projects";
export {
  getProjectEngagementsRoute,
  handleGetProjectEngagements,
  handlePostEngagement,
  postEngagementRoute,
} from "./engagements";
export {
  getDealRoomRoute,
  getOwnerSitesRoute,
  handleGetDealRoom,
  handleGetOwnerSites,
} from "./views";
export {
  resolveDemoInvestor,
  resolveDemoOperator,
  resolveDemoSiteOwner,
  resolveDemoViewer,
} from "./identity";
export {
  failureResponse,
  isUuid,
  jsonResponse,
  readJsonObject,
  rejectUnknownKeys,
  validatePathId,
} from "./shared";
