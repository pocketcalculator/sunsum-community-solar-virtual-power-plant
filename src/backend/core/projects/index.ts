/**
 * S-PROJ — Project and Pipeline (design document section 9.2).
 *
 * Owns the `projects` table: the project record, its vocabulary, stage
 * transitions, assignment and the operator's investor-visibility flag. Other
 * domains read projects through this barrel rather than reaching for the store
 * themselves, so the reads stay countable when persistence arrives.
 *
 * Endpoints that will land here: `GET /pipeline`, `POST /projects/{id}/stage`,
 * `PATCH /projects/{id}`, `PATCH /projects/{id}/visibility`.
 */

export { MOCK_PROJECTS, mockProjectStore } from "./mock-store";
export { type ProjectStore } from "./store";
export {
  FUNDING_STAGE_BY_PROJECT_STAGE,
  FUNDING_STAGES,
  fundingStageForProject,
  isFundingStage,
  isProjectStage,
  isSiteType,
  isViabilityStatus,
  PROJECT_STAGES,
  SITE_TYPES,
  VIABILITY_STATUSES,
  type FundingStage,
  type ProjectRecord,
  type ProjectStage,
  type SiteType,
  type ViabilityStatus,
} from "./types";
export {
  advanceProjectStage,
  decideSubmission,
  overrideAssessment,
  toProjectPayload,
  getPipeline,
  updateProject,
  updateProjectVisibility,
  type AssessmentOverrideInput,
  type AssessmentOverrideResponse,
  type DecisionInput,
  type DecisionResponse,
  type PipelineCard,
  type PipelineColumn,
  type PipelineResponse,
  type ProjectPayload,
  type ProjectUpdateInput,
  type SubmissionDecision,
} from "./workflows";
