/**
 * Who is making the request.
 *
 * A `Viewer` is the caller's already-established identity. Handlers resolve it
 * at the transport edge; core decides what it is allowed to see. Keeping the
 * decision in core means a future job or CLI calling the same function cannot
 * skip the check by not being an HTTP request.
 *
 * The union is discriminated on `role`, so narrowing to `investor` is what
 * gives the compiler access to the investor profile. A permission check and a
 * type guard end up being the same thing.
 */

import type { FundingStage } from "../projects";

export const ROLES = ["site_owner", "operator", "investor"] as const;

export type Role = (typeof ROLES)[number];

/**
 * The self-declared mandate captured during investor onboarding. It drives
 * portfolio matching; it is not verified, and it grants nothing on its own.
 */
export interface InvestorProfile {
  readonly id: string;
  readonly organizationName: string;
  /** Stages this investor funds. An empty list means "no stage preference". */
  readonly fundingStageFocus: readonly FundingStage[];
  /** Regions this investor funds. An empty list means "no geographic limit". */
  readonly geographies: readonly string[];
  /** Null until onboarding is finished. Tier 0 is unlocked by completing it. */
  readonly onboardingCompletedAt: string | null;
}

export type Viewer =
  | { readonly role: "site_owner"; readonly userId: string }
  | { readonly role: "operator"; readonly userId: string }
  | {
      readonly role: "investor";
      readonly userId: string;
      readonly investor: InvestorProfile;
    };
