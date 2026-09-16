import type { ProjectStage } from "./types";

/**
 * Mirrors PR #11's `src/backend/db/enums.ts` until that PR merges and the
 * backend can import the database vocabulary directly. Keep the values in sync.
 */
export const FUNDING_STAGES = [
  "pre_development",
  "development",
  "construction",
  "permanent",
] as const;

export type FundingStage = (typeof FUNDING_STAGES)[number];

export const FUNDING_STAGE_BY_PROJECT_STAGE = {
  pre_development: "pre_development",
  development: "development",
  construction: "construction",
  commissioning: "permanent",
  operations: "permanent",
} as const satisfies Record<ProjectStage, FundingStage>;

/**
 * Named to match the helper PR #11 exports from `core/projects/types.ts`, so
 * that merging it is a deletion of this file and its re-export rather than a
 * rewrite of every call site.
 */
export function fundingStageForProject(stage: ProjectStage): FundingStage {
  return FUNDING_STAGE_BY_PROJECT_STAGE[stage];
}
