import type { InvestorProfile, Viewer, ViewerIdentity } from "../identity";
import { FUNDING_STAGES, type FundingStage } from "../projects";
import { failure, ok, type Result } from "../shared";
import { demoBackendStore, type BackendStore } from "../store";

// Mirrors PR #11's src/backend/db/enums.ts until that branch merges.
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

// Mirrors PR #11's src/backend/db/enums.ts until that branch merges.
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

export { FUNDING_STAGES, type FundingStage };

export interface InvestorProfileInput {
  readonly organizationName: string;
  readonly investorType: InvestorType;
  readonly capitalType: CapitalType;
  readonly fundingStageFocus: readonly FundingStage[];
  readonly ticketSizeMin: number | null;
  readonly ticketSizeMax: number | null;
  readonly geographies: readonly string[];
  readonly investmentObjectives: readonly string[];
  readonly impactPriorities: readonly string[];
  readonly decisionCriteria: readonly string[];
}

export interface InvestorProfilePayload {
  readonly id: string;
  readonly user_id: string;
  readonly organization_name: string;
  readonly investor_type: string;
  readonly capital_type: string;
  readonly funding_stage_focus: readonly FundingStage[];
  readonly ticket_size_min: number | null;
  readonly ticket_size_max: number | null;
  readonly geographies: readonly string[];
  readonly investment_objectives: readonly string[];
  readonly impact_priorities: readonly string[];
  readonly decision_criteria: readonly string[];
  readonly deal_room_profile: string;
  readonly visible_portfolio_scope: readonly string[];
  readonly onboarding_completed_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export async function getMyInvestorProfile(
  viewer: Viewer,
  store: BackendStore = demoBackendStore,
): Promise<Result<InvestorProfilePayload>> {
  if (viewer.role !== "investor") {
    return failure("forbidden_role", "Only an investor can read their profile.");
  }
  const stored = await store.getInvestorProfileByUserId(viewer.userId);
  return ok(toInvestorProfilePayload(stored ?? viewer.investor));
}

/**
 * Create or replace the calling investor's profile.
 *
 * Takes a {@link ViewerIdentity} rather than a {@link Viewer} because this is
 * the endpoint that brings a profile into existence: requiring one here would
 * make onboarding unreachable for the account it exists to onboard.
 */
export async function upsertMyInvestorProfile(
  viewer: ViewerIdentity,
  input: InvestorProfileInput,
  store: BackendStore = demoBackendStore,
): Promise<Result<InvestorProfilePayload>> {
  if (viewer.role !== "investor") {
    return failure("forbidden_role", "Only an investor can update their profile.");
  }
  if (
    input.ticketSizeMin !== null &&
    input.ticketSizeMax !== null &&
    input.ticketSizeMin > input.ticketSizeMax
  ) {
    return failure("validation_failed", "Minimum ticket size cannot exceed maximum.", {
      missing_fields: [
        { field: "ticket_size_max", message: "Maximum ticket size must be at least the minimum." },
      ],
    });
  }

  /**
   * One transaction around read, allocate, write and re-read. Re-reading alone
   * was not enough: nothing stopped two first-time posts from both observing
   * no profile, minting different ids, and racing the upsert. Serialising the
   * whole sequence means the second caller sees the first caller's row as
   * `existing` and reuses its id, so only one id is ever allocated and the
   * response cannot disagree with what is stored.
   */
  return store.transaction(async (transaction) => {
    const existing = await transaction.getInvestorProfileByUserId(viewer.userId);
    const now = new Date().toISOString();
    const profile: InvestorProfile = {
      id: existing?.id ?? transaction.nextId("investor"),
      userId: viewer.userId,
      organizationName: input.organizationName,
      investorType: input.investorType,
      capitalType: input.capitalType,
      fundingStageFocus: input.fundingStageFocus,
      ticketSizeMin: input.ticketSizeMin,
      ticketSizeMax: input.ticketSizeMax,
      geographies: input.geographies,
      investmentObjectives: input.investmentObjectives,
      impactPriorities: input.impactPriorities,
      decisionCriteria: input.decisionCriteria,
      dealRoomProfile: existing?.dealRoomProfile ?? defaultDealRoomProfile(input.investorType),
      visiblePortfolioScope: existing?.visiblePortfolioScope ?? [],
      onboardingCompletedAt: now,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await transaction.upsertInvestorProfile(profile);
    const stored = await transaction.getInvestorProfileByUserId(viewer.userId);
    return ok(toInvestorProfilePayload(stored ?? profile));
  });
}

export function toInvestorProfilePayload(
  profile: InvestorProfile,
): InvestorProfilePayload {
  return {
    id: profile.id,
    user_id: profile.userId ?? "",
    organization_name: profile.organizationName,
    investor_type: profile.investorType ?? "impact_investor",
    capital_type: profile.capitalType ?? "concessionary_debt",
    funding_stage_focus: profile.fundingStageFocus,
    ticket_size_min: profile.ticketSizeMin ?? null,
    ticket_size_max: profile.ticketSizeMax ?? null,
    geographies: profile.geographies,
    investment_objectives: profile.investmentObjectives ?? [],
    impact_priorities: profile.impactPriorities ?? [],
    decision_criteria: profile.decisionCriteria ?? [],
    deal_room_profile: profile.dealRoomProfile ?? "default",
    visible_portfolio_scope: profile.visiblePortfolioScope ?? [],
    onboarding_completed_at: profile.onboardingCompletedAt,
    created_at: profile.createdAt ?? "",
    updated_at: profile.updatedAt ?? "",
  };
}

export function isInvestorType(value: string): value is InvestorType {
  return INVESTOR_TYPES.some((item) => item === value);
}

export function isCapitalType(value: string): value is CapitalType {
  return CAPITAL_TYPES.some((item) => item === value);
}

export function isFundingStage(value: string): value is FundingStage {
  return FUNDING_STAGES.some((item) => item === value);
}

function defaultDealRoomProfile(investorType: InvestorType): string {
  if (investorType === "philanthropy" || investorType === "special_community_endowment") {
    return "philanthropy";
  }
  if (["cdfi_cde", "nmtc", "senior_debt", "tax_equity"].includes(investorType)) {
    return "debt_project_finance";
  }
  return "default";
}
