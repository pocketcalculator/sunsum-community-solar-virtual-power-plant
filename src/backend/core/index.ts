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
  type PortfolioStore,
  CAPITAL_TYPES,
  INVESTOR_TYPES,
  getMyInvestorProfile,
  upsertMyInvestorProfile,
  type CapitalType,
  type InvestorProfileInput,
  type InvestorProfilePayload,
  type InvestorType,
} from "./investors";
export {
  ROLES,
  type InvestorProfile,
  type Role,
  type Viewer,
  type ViewerIdentity,
} from "./identity";
export {
  isProjectStage,
  isViabilityStatus,
  FUNDING_STAGE_BY_PROJECT_STAGE,
  FUNDING_STAGES,
  mockProjectStore,
  PROJECT_STAGES,
  SITE_TYPES,
  VIABILITY_STATUSES,
  type FundingStage,
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
export {
  createSite,
  demoViabilityClient,
  getMissingFields,
  getSubmissionDetail,
  isOwnershipStatus,
  isSubmissionStatus,
  listSubmissions,
  submitSite,
  OWNERSHIP_STATUSES,
  SUBMISSION_STATUSES,
  type ActivityPayload,
  type AssessmentPayload,
  type AssessmentRecord,
  type CreateSiteResponse,
  type DocumentPayload,
  type MissingField,
  type OwnershipStatus,
  type SiteCreateInput,
  type SiteUpdateInput,
  type SitePayload,
  type SiteRecord,
  type SubmissionDetail,
  type SubmissionQuery,
  type SubmissionStatus,
  type SubmissionSummary,
  type ViabilityAssessmentInput,
  type ViabilityAssessmentResult,
  type ViabilityClient,
} from "./sites";
export {
  advanceProjectStage,
  decideSubmission,
  toProjectPayload,
  getPipeline,
  updateProject,
  updateProjectVisibility,
  type DecisionInput,
  type DecisionResponse,
  type PipelineCard,
  type PipelineColumn,
  type PipelineResponse,
  type ProjectPayload,
  type ProjectUpdateInput,
  type SubmissionDecision,
} from "./projects";
export {
  expressInterest,
  listMyEngagements,
  listProjectEngagements,
  listProjectFundingNeeds,
  unlocksTierOne,
  type EngagementPipelineItem,
  type EngagementPayload,
  type FundingNeedPayload,
  type EngagementRecord,
  type EngagementState,
} from "./engagements";
export {
  getDealRoom,
  getOwnerOutstanding,
  getOwnerSites,
} from "./views";
export { journeyStageId, journeyStageIdForProject } from "./journey";
export {
  createMemoryBackendStore,
  demoBackendStore,
  resetDemoBackendStore,
  type BackendStore,
  type MemoryStoreOptions,
} from "./store";

export {
  addSiteDocument,
  ALLOWED_DOCUMENT_CONTENT_TYPES,
  buildDocumentBlobLocation,
  containerForDisclosure,
  DEFAULT_DOCUMENT_TYPE,
  DOCUMENT_CONTAINERS,
  DOCUMENT_TYPES,
  formatBlobPath,
  isDocumentContainer,
  MAX_DOCUMENT_SIZE_BYTES,
  normalizeDocType,
  parseBlobPath,
  projectDocumentParent,
  safeFilename,
  siteDocumentParent,
  type DocumentBlobLocation,
  type DocumentContainer,
  type DocumentCreateInput,
  type DocumentParent,
  type KnownDocumentType,
} from "./documents";
export { DOCUMENT_DISCLOSURE_CLASSES, type DocumentDisclosureClass } from "./sites";
