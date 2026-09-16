import type { ActivityRecord } from "../activity";
import type { Viewer } from "../identity";
import { failure, ok, type Result } from "../shared";
import { demoBackendStore, type BackendStore } from "../store";
import type { EngagementRecord, EngagementState } from "./types";

const LIVE_STATES: readonly EngagementState[] = [
  "interested",
  "committed",
  "underwriting",
  "approved",
  "funded",
];

export interface EngagementPayload {
  readonly id: string;
  readonly investor_id: string;
  readonly project_id: string;
  readonly funding_need_id: string | null;
  readonly state: EngagementState;
  readonly state_changed_at: string;
  readonly is_binding: boolean;
  readonly created_at: string;
}

export async function expressInterest(
  viewer: Viewer,
  projectId: string,
  fundingNeedId: string | null,
  store: BackendStore = demoBackendStore,
): Promise<Result<EngagementPayload>> {
  if (viewer.role !== "investor") {
    return failure(
      "forbidden_role",
      "Only an investor can express project interest.",
    );
  }
  if (viewer.investor.onboardingCompletedAt === null) {
    return failure(
      "forbidden_tier",
      "Complete investor onboarding before expressing interest.",
    );
  }

  return store.transaction<Result<EngagementPayload>>(
    async (transaction) => {
      const visibleProject = await transaction.getProject(projectId);
      if (visibleProject === null || !visibleProject.visibleToInvestors) {
        return failure("not_found", "Project not found.");
      }
      if (fundingNeedId !== null) {
        const fundingNeed = await transaction.getFundingNeed(fundingNeedId);
        if (fundingNeed === null || fundingNeed.projectId !== projectId) {
          return failure("not_found", "Funding need not found.");
        }
      }
      const existing = await transaction.findEngagement(
        viewer.investor.id,
        projectId,
        fundingNeedId,
      );
      if (existing !== null && LIVE_STATES.includes(existing.state)) {
        return failure("conflict", "A live engagement already exists.");
      }

      const now = new Date().toISOString();
      const engagement: EngagementRecord = {
        id: transaction.nextId("engagement"),
        investorId: viewer.investor.id,
        investorUserId: viewer.userId,
        projectId,
        fundingNeedId,
        state: "interested",
        stateChangedAt: now,
        committedAmount: null,
        commitmentInstrument: null,
        isBinding: false,
        declineReason: null,
        createdAt: now,
      };
      const activity: ActivityRecord = {
        id: transaction.nextId("activity"),
        siteId: visibleProject.siteId,
        projectId,
        actorUserId: viewer.userId,
        action: "investor_interest_expressed",
        note: null,
        fromValue: null,
        toValue: "interested",
        createdAt: now,
      };
      await transaction.addEngagement(engagement);
      await transaction.addActivity(activity);
      return ok(toEngagementPayload(engagement));
    },
  );
}

export async function listProjectEngagements(
  viewer: Viewer,
  projectId: string,
  store: BackendStore = demoBackendStore,
): Promise<Result<readonly EngagementPayload[]>> {
  if (viewer.role !== "operator") {
    return failure(
      "forbidden_role",
      "Only an operator can list project engagements.",
    );
  }
  if ((await store.getProject(projectId)) === null) {
    return failure("not_found", "Project not found.");
  }
  const engagements = await store.listEngagements(projectId);
  return ok(engagements.map(toEngagementPayload));
}

export function toEngagementPayload(
  engagement: EngagementRecord,
): EngagementPayload {
  return {
    id: engagement.id,
    investor_id: engagement.investorId,
    project_id: engagement.projectId,
    funding_need_id: engagement.fundingNeedId,
    state: engagement.state,
    state_changed_at: engagement.stateChangedAt,
    is_binding: engagement.isBinding,
    created_at: engagement.createdAt,
  };
}

export function unlocksTierOne(state: EngagementState): boolean {
  return LIVE_STATES.includes(state);
}
