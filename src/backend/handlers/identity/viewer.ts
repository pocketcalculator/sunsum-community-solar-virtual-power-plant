import type { InvestorProfile, Viewer } from "../../core/identity";
import { demoBackendStore, type BackendStore } from "../../core/store";
import {
  DEMO_INVESTOR_ID,
  DEMO_INVESTOR_USER_ID,
  DEMO_OPERATOR_USER_ID,
  DEMO_SITE_OWNER_USER_ID,
} from "../../demo-principals";

const DEMO_CREATED_AT = "2026-09-01T00:00:00.000Z";

export const SEEDED_DEMO_INVESTOR_PROFILE: InvestorProfile = {
  id: DEMO_INVESTOR_ID,
  userId: DEMO_INVESTOR_USER_ID,
  organizationName: "Demo Community Endowment",
  investorType: "special_community_endowment",
  capitalType: "grant",
  fundingStageFocus: ["pre_development", "development", "construction"],
  ticketSizeMin: null,
  ticketSizeMax: null,
  geographies: ["GA"],
  investmentObjectives: [],
  impactPriorities: [],
  decisionCriteria: [],
  dealRoomProfile: "default",
  visiblePortfolioScope: [],
  onboardingCompletedAt: DEMO_CREATED_AT,
  createdAt: DEMO_CREATED_AT,
  updatedAt: DEMO_CREATED_AT,
};

const DEMO_SITE_OWNER_VIEWER = {
  role: "site_owner",
  userId: DEMO_SITE_OWNER_USER_ID,
} satisfies Viewer;

const DEMO_OPERATOR_VIEWER = {
  role: "operator",
  userId: DEMO_OPERATOR_USER_ID,
} satisfies Viewer;

export async function resolveDemoViewer(
  store: BackendStore = demoBackendStore,
): Promise<Viewer> {
  return resolveDemoInvestor(store);
}

export function resolveDemoSiteOwner(): Viewer {
  return DEMO_SITE_OWNER_VIEWER;
}

export function resolveDemoOperator(): Viewer {
  return DEMO_OPERATOR_VIEWER;
}

export async function resolveDemoInvestor(
  store: BackendStore = demoBackendStore,
): Promise<Viewer> {
  return {
    role: "investor",
    userId: DEMO_INVESTOR_USER_ID,
    investor:
      (await store.getInvestorProfileByUserId(DEMO_INVESTOR_USER_ID)) ??
      SEEDED_DEMO_INVESTOR_PROFILE,
  };
}
