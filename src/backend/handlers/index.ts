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
  getInvestorProfileRoute,
  getPortfolioRoute,
  handleGetInvestorProfile,
  handleGetPortfolio,
  handlePostInvestorProfile,
  parseInvestorProfile,
  parsePortfolioQuery,
  postInvestorProfileRoute,
} from "./investors";
export {
  getSubmissionDetailRoute,
  getSubmissionsRoute,
  handleGetSubmissionDetail,
  handleGetSubmissions,
  handlePatchSite,
  handlePostSite,
  handlePostSiteSubmit,
  parseSiteCreate,
  parseSiteUpdate,
  parseSubmissionQuery,
  patchSiteRoute,
  postSiteRoute,
  postSiteSubmitRoute,
} from "./sites";
export {
  getPipelineRoute,
  handleGetPipeline,
  handlePatchProject,
  handlePatchProjectVisibility,
  handlePostProjectStage,
  handlePostSubmissionDecision,
  parseDecision,
  parseProjectUpdate,
  patchProjectRoute,
  patchProjectVisibilityRoute,
  postProjectStageRoute,
  postSubmissionDecisionRoute,
} from "./projects";
export {
  getMyEngagementsRoute,
  getProjectEngagementsRoute,
  getProjectFundingNeedsRoute,
  handleGetMyEngagements,
  handleGetProjectEngagements,
  handleGetProjectFundingNeeds,
  handlePostEngagement,
  postEngagementRoute,
} from "./engagements";
export {
  getDealRoomRoute,
  getOwnerSitesRoute,
  handleGetDealRoom,
  handleGetOwnerOutstanding,
  handleGetOwnerSites,
  getOwnerOutstandingRoute,
} from "./views";
export {
  SESSION_COOKIE_NAME,
  demoSwitchRoute,
  getMeRoute,
  handleGetMe,
  handlePostDemoSwitch,
  handlePostLogout,
  isDemoAuthEnabled,
  logoutRoute,
  requireRole,
  resolveDemoInvestor,
  resolveDemoOperator,
  resolveDemoSiteOwner,
  resolveViewer,
} from "./identity";
export {
  failureResponse,
  isUuid,
  jsonResponse,
  readJsonObject,
  rejectUnknownKeys,
  toDomainRole,
  toWireRole,
  validatePathId,
} from "./shared";

export {
  getExportRoute,
  handleGetExport,
  parseExportFormat,
} from "./export";
export {
  getSiteDocumentContentRoute,
  handleGetSiteDocumentContent,
  handlePostSiteDocument,
  handlePutSiteDocumentContent,
  parseDocumentCreate,
  postSiteDocumentRoute,
  putSiteDocumentContentRoute,
} from "./documents";
