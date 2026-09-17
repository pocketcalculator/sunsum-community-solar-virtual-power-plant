/**
 * The journey ribbon adapter.
 *
 * WS1 owns the ribbon vocabulary in `src/domain/journey.ts`; the backend owns
 * the wire vocabulary. They differ — `pre_development` against
 * `pre-development` — and that difference is one a lookup loses silently rather
 * than failing loudly. Every view that publishes a status therefore publishes
 * the ribbon literal explicitly, and this module is the only place the two
 * vocabularies meet.
 *
 * It is deliberately a leaf: it imports nothing at runtime, so every layer can
 * depend on it without creating a cycle.
 */

import type { JourneyStageId } from "@/domain/journey";

import type { ProjectStage } from "../projects";
import type { SubmissionStatus } from "../sites";

/**
 * Where a site sits on the ribbon, given that a project may not exist yet.
 *
 * Returns `null` for the statuses that are genuinely off the ribbon — a draft
 * has not entered the journey, and `info_requested`, `accepted` and `rejected`
 * are dispositions rather than stages. A caller renders nothing rather than
 * guessing at a cell.
 */
export function journeyStageId(
  submissionStatus: SubmissionStatus,
  projectStage: ProjectStage | null,
): JourneyStageId | null {
  if (projectStage !== null) {
    return journeyStageIdForProject(projectStage);
  }

  return JOURNEY_STAGE_BY_SUBMISSION_STATUS[submissionStatus];
}

/**
 * Every project stage has a ribbon stage, so this is total where
 * `journeyStageId` is not. Callers that already hold a project — the portfolio,
 * the deal room and the investor pipeline — use this and avoid a null check
 * that can never fire.
 */
export function journeyStageIdForProject(
  projectStage: ProjectStage,
): JourneyStageId {
  return JOURNEY_STAGE_BY_PROJECT_STAGE[projectStage];
}

const JOURNEY_STAGE_BY_SUBMISSION_STATUS = {
  draft: null,
  submitted: "submitted",
  screening: "screening",
  info_requested: null,
  accepted: null,
  rejected: null,
} as const satisfies Record<SubmissionStatus, JourneyStageId | null>;

const JOURNEY_STAGE_BY_PROJECT_STAGE = {
  pre_development: "pre-development",
  development: "development",
  construction: "construction",
  commissioning: "commissioning",
  operations: "operations",
} as const satisfies Record<ProjectStage, JourneyStageId>;
