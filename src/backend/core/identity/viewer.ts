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
  /** Stages this investor funds. An empty list means "no stage preference". */
  readonly fundingStageFocus: readonly FundingStage[];
  readonly ticketSizeMin?: number | null;
  readonly ticketSizeMax?: number | null;
  /** Regions this investor funds. An empty list means "no geographic limit". */
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

/**
 * Who the caller is, without their investor profile.
 *
 * Almost every rule needs a full {@link Viewer}, because an investor rule is
 * usually a question about their mandate. Onboarding is the exception: the
 * request that creates the profile cannot be asked to present one first. A
 * `Viewer` is assignable here, so a rule that takes this accepts both.
 */
export type ViewerIdentity =
  | { readonly role: "site_owner"; readonly userId: string }
  | { readonly role: "operator"; readonly userId: string }
  | { readonly role: "investor"; readonly userId: string };
