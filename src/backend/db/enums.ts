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
 * Every list is `as const` so it produces both the TypeScript union and the
 * CHECK constraint. That is the single-source rule from ADR 0001: a value added
 * here reaches the database and the type system together, and cannot reach one
 * without the other.
 */

/** `sites.ownership_status` */
export const OWNERSHIP_STATUSES = ["confirmed", "pending", "unverified"] as const;
export type OwnershipStatus = (typeof OWNERSHIP_STATUSES)[number];

/** `sites.submission_status` — the lifecycle in section 6.2. */
export const SUBMISSION_STATUSES = [
  "draft",
  "submitted",
  "in_review",
  "info_requested",
  "accepted",
  "rejected",
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/**
 * `investors.funding_stage_focus`, and the stage a funding need belongs to.
 *
 * **This is not `PROJECT_STAGES`.** The two overlap on their first three values
 * and then diverge: an investor funds `permanent` capital, which is not a
 * project stage, and a project reaches `commissioning` and `operations`, which
 * nothing funds. Treating them as one enumeration makes a `permanent` mandate
 * unrepresentable, which is exactly the defect review found in the portfolio
 * endpoint, where `fundingStageFocus` was typed as `ProjectStage[]`.
 *
 * Anywhere the two are compared needs an explicit mapping, not an equality
 * test. See `FUNDING_STAGE_BY_PROJECT_STAGE` below.
 */
export const FUNDING_STAGES = [
  "pre_development",
  "development",
  "construction",
  "permanent",
] as const;
export type FundingStage = (typeof FUNDING_STAGES)[number];

/**
 * Which funding stage a project at a given project stage is raising against.
 *
 * `commissioning` and `operations` map to `permanent`, because a built asset
 * raises permanent capital rather than construction finance. This mapping is an
 * inference from section 7.8 and should be confirmed with the charter before it
 * drives a real matching decision.
 */
export const FUNDING_STAGE_BY_PROJECT_STAGE = {
  pre_development: "pre_development",
  development: "development",
  construction: "construction",
  commissioning: "permanent",
  operations: "permanent",
} as const satisfies Record<string, FundingStage>;

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
