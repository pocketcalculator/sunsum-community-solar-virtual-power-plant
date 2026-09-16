/**
 * The enumerations from design document section 5.3 that no service directory
 * owns yet.
 *
 * Three already have homes and are imported by the schema rather than restated
 * here: `ROLES` in `core/identity`, and `PROJECT_STAGES`, `VIABILITY_STATUSES`
 * and `SITE_TYPES` in `core/projects`. The rest live here until S-SITE and
 * S-ENG exist, at which point they should move into those directories — the
 * schema will keep working, because it imports the array rather than repeating
 * the values.
 *
 * `SUBMISSION_STATUSES`, `OWNERSHIP_STATUSES` and `DOCUMENT_DISCLOSURE_CLASSES`
 * are declared identically in PR #12's `core/sites`. Whichever merges second
 * should delete its copy and re-export from the other, as the funding stages
 * below already do. Until then these values must be kept identical by hand:
 * because the two declarations are in different files, git merges them without
 * a conflict, so a mismatch surfaces as a CHECK-constraint failure at runtime
 * rather than as a merge conflict.
 *
 * Every list is `as const` so it produces both the TypeScript union and the
 * CHECK constraint. That is the single-source rule from ADR 0001: a value added
 * here reaches the database and the type system together, and cannot reach one
 * without the other.
 */

import type { UserTypeId } from "@/domain/userTypes";

/** `sites.ownership_status` */
export const OWNERSHIP_STATUSES = ["confirmed", "pending", "unverified"] as const;
export type OwnershipStatus = (typeof OWNERSHIP_STATUSES)[number];

/** `sites.submission_status` — the lifecycle in section 6.2. */
export const SUBMISSION_STATUSES = [
  "draft",
  "submitted",
  "screening",
  "info_requested",
  "accepted",
  "rejected",
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/**
 * `documents.disclosure_class` — who may see a document.
 *
 * The default is `owner_private`, and the default is the point: a document
 * whose classification nobody set must not enter an investor deal room. An
 * electricity bill is the obvious case. Failing closed here means a store
 * adapter cannot leak by omission.
 */
export const DOCUMENT_DISCLOSURE_CLASSES = ["owner_private", "investor_tier_1"] as const;
export type DocumentDisclosureClass = (typeof DOCUMENT_DISCLOSURE_CLASSES)[number];

/**
 * `investors.funding_stage_focus`, and the stage a funding need belongs to.
 *
 * Defined in `core/projects` and re-exported here. It was originally declared
 * in this file, which review correctly called out as useless: `core` is
 * forbidden from importing `db`, so the mapping could never reach
 * `matchesMandate()`, and modelling the distinction in the database while the
 * matcher still compared project stages left the real defect in place.
 *
 * It now lives in the domain, the matcher uses it, and the schema reads it from
 * there — which is the direction every other enumeration here should end up
 * travelling.
 */
export {
  FUNDING_STAGE_BY_PROJECT_STAGE,
  FUNDING_STAGES,
  fundingStageForProject,
  isFundingStage,
  type FundingStage,
} from "@/backend/core/projects";

/** `investors.investor_type` */
export const INVESTOR_TYPES = [
  "philanthropy",
  "impact_investor",
  "nmtc",
  "cdfi_cde",
  "energy_equity_fund",
  "corporate",
  "special_community_endowment",
] as const;
export type InvestorType = (typeof INVESTOR_TYPES)[number];

/**
 * The same seven profiles as the finance group of `src/domain/userTypes.ts`,
 * which is what the sign-up form actually offers.
 *
 * The two lists were identical in content and different in spelling — kebab-case
 * on the form, snake_case in the database — with nothing connecting them, so
 * adding a funder profile to the form produced a value the `investors` table
 * rejects, and review asked for that gap to be closed.
 *
 * `satisfies Record<InvestorType, UserTypeId>` closes one direction at compile
 * time: an investor type with no form equivalent will not build. The other
 * direction — a form profile with no database equivalent — is checked by
 * `tests/unit/backend/investor-types.test.ts`, because TypeScript cannot
 * express "this record is exhaustive over a filtered subset".
 */
export const USER_TYPE_BY_INVESTOR_TYPE = {
  philanthropy: "philanthropy",
  impact_investor: "impact-investor",
  nmtc: "nmtc",
  cdfi_cde: "cdfi-cde",
  energy_equity_fund: "energy-equity-fund",
  corporate: "corporate",
  special_community_endowment: "special-community-endowment",
} as const satisfies Record<InvestorType, UserTypeId>;

/** The form's id for a stored investor type. */
export function userTypeForInvestorType(investorType: InvestorType): UserTypeId {
  return USER_TYPE_BY_INVESTOR_TYPE[investorType];
}

/** The stored investor type for a form id, or undefined if the form offers something the database cannot hold. */
export function investorTypeForUserType(userType: UserTypeId): InvestorType | undefined {
  return INVESTOR_TYPES.find((candidate) => USER_TYPE_BY_INVESTOR_TYPE[candidate] === userType);
}

/** `investors.capital_type` */
export const CAPITAL_TYPES = [
  "grant",
  "recoverable_grant",
  "concessionary_debt",
  "senior_debt",
  "tax_equity",
  "sponsor_equity",
  "corporate_offtake",
] as const;
export type CapitalType = (typeof CAPITAL_TYPES)[number];

/** `funding_needs.need_type` */
export const FUNDING_NEED_TYPES = [
  "feasibility_study",
  "engineering_assessment",
  "site_visit",
  "interconnection_study",
  "environmental_review",
  "reporting",
  "construction",
  "permanent_financing",
] as const;
export type FundingNeedType = (typeof FUNDING_NEED_TYPES)[number];

/** `funding_needs.status` */
export const FUNDING_NEED_STATUSES = [
  "open",
  "partially_funded",
  "funded",
  "delivered",
  "cancelled",
] as const;
export type FundingNeedStatus = (typeof FUNDING_NEED_STATUSES)[number];

/**
 * `investor_engagements.state` — the lifecycle in section 6.3.
 *
 * `declined` and `withdrawn` are terminal; the rest advance in order.
 */
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

/**
 * The non-terminal states — PR #12 calls this `LIVE_STATES`.
 *
 * An investor may hold only one live engagement per project or need, but once
 * an engagement ends in `declined` or `withdrawn` they are allowed to come back
 * later. Uniqueness therefore has to be scoped to these states; enforcing it
 * unconditionally would make re-engagement impossible, which is a rule the
 * design does not have.
 */
export const LIVE_ENGAGEMENT_STATES = [
  "interested",
  "committed",
  "underwriting",
  "approved",
  "funded",
] as const satisfies readonly EngagementState[];
export type LiveEngagementState = (typeof LIVE_ENGAGEMENT_STATES)[number];

/** `diligence_requests.assigned_to_role` — a diligence item is never assigned to an investor. */
export const DILIGENCE_ASSIGNEE_ROLES = ["operator", "site_owner"] as const;
export type DiligenceAssigneeRole = (typeof DILIGENCE_ASSIGNEE_ROLES)[number];

/** `diligence_requests.item_type` */
export const DILIGENCE_ITEM_TYPES = [
  "document",
  "financial",
  "technical",
  "narrative",
  "site_access",
] as const;
export type DiligenceItemType = (typeof DILIGENCE_ITEM_TYPES)[number];

/** `diligence_requests.status` */
export const DILIGENCE_STATUSES = [
  "open",
  "in_progress",
  "submitted",
  "accepted",
  "rejected",
  "waived",
] as const;
export type DiligenceStatus = (typeof DILIGENCE_STATUSES)[number];
