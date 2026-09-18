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

/**
 * A fixture builder for the seeded demo site owner.
 *
 * **This has no security value and is not on the request path.** It answers
 * with a fixed demo identity without consulting the request at all.
 *
 * @deprecated Identity now comes from `resolveViewer` in `./session`, which
 * refuses a request carrying no session instead of inventing a viewer for it.
 * Kept only for tests and seeding, where the caller has already decided who
 * they are pretending to be.
 */
export function resolveDemoSiteOwner(): Viewer {
  return DEMO_SITE_OWNER_VIEWER;
}

/**
 * A fixture builder for the seeded demo operator.
 *
 * @deprecated See {@link resolveDemoSiteOwner}.
 */
export function resolveDemoOperator(): Viewer {
  return DEMO_OPERATOR_VIEWER;
}

/**
 * A fixture builder for the seeded demo investor, hydrated from the store so
 * the mandate matches whatever the test seeded.
 *
 * @deprecated See {@link resolveDemoSiteOwner}.
 */
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
