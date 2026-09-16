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
