import type { FundingStage } from "../projects";

export const ENGAGEMENT_STATES = [
  "interested",
  "committed",
  "underwriting",
  "approved",
  "funded",
  "declined",
  "withdrawn",
] as const;

export type EngagementState = (typeof ENGAGEMENT_STATES)[number];

export interface EngagementRecord {
  id: string;
  investorId: string;
  investorUserId: string;
  projectId: string;
  fundingNeedId: string | null;
  state: EngagementState;
  stateChangedAt: string;
  committedAmount: number | null;
  commitmentInstrument: string | null;
  isBinding: boolean;
  declineReason: string | null;
  createdAt: string;
}

export interface FundingNeedRecord {
  id: string;
  projectId: string;
  needType: string;
  stage: FundingStage;
  description: string;
  amountRequested: number | null;
  /**
   * Not nullable: a need with nothing committed has zero committed, not an
   * unknown amount. PR #11 declares the column `NOT NULL DEFAULT '0'`, and a
   * column default does not apply to an explicitly inserted null.
   */
  amountCommitted: number;
  status: "open" | "partially_funded" | "funded" | "delivered" | "cancelled";
  createdAt: string;
}
