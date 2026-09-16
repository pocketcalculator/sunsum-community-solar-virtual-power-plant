/**
 * Who is making the request.
 *
 * A `Viewer` is the caller's already-established identity. Handlers resolve it
 * at the transport edge; core decides what it is allowed to see.
 */

import type { FundingStage } from "../projects";

export const ROLES = ["site_owner", "operator", "investor"] as const;

export type Role = (typeof ROLES)[number];

export interface InvestorProfile {
  readonly id: string;
  readonly userId?: string;
  readonly organizationName: string;
  readonly investorType?: string;
  readonly capitalType?: string;
  readonly fundingStageFocus: readonly FundingStage[];
  readonly ticketSizeMin?: number | null;
  readonly ticketSizeMax?: number | null;
  readonly geographies: readonly string[];
  readonly investmentObjectives?: readonly string[];
  readonly impactPriorities?: readonly string[];
  readonly decisionCriteria?: readonly string[];
  readonly dealRoomProfile?: string;
  readonly visiblePortfolioScope?: readonly string[];
  readonly onboardingCompletedAt: string | null;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export type Viewer =
  | { readonly role: "site_owner"; readonly userId: string }
  | { readonly role: "operator"; readonly userId: string }
  | {
      readonly role: "investor";
      readonly userId: string;
      readonly investor: InvestorProfile;
    };
