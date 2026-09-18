import type { ActivityRecord } from "../activity";
import type { Viewer } from "../identity";
import { journeyStageIdForProject } from "../journey";
import type { ProjectStage, FundingStage } from "../projects";
import { failure, ok, type Result } from "../shared";
import { demoBackendStore, type BackendStore } from "../store";
import type { EngagementRecord, EngagementState, FundingNeedRecord } from "./types";
import type { JourneyStageId } from "@/domain/journey";

const LIVE_STATES: readonly EngagementState[] = [
  "interested",
  "committed",
  "underwriting",
  "approved",
  "funded",
];

export interface FundingNeedPayload {
  readonly id: string;
  readonly project_id: string;
  readonly need_type: string;
  readonly stage: FundingStage;
  readonly description: string;
  readonly amount_requested: number | null;
  /**
   * Never null. A need with nothing committed has zero committed, not unknown,
   * which is also what the `NOT NULL DEFAULT '0'` column requires.
   */
  readonly amount_committed: number;
  readonly status: string;
  readonly created_at: string;
}

export interface EngagementPipelineItem extends EngagementPayload {
  readonly project_name: string;
  readonly project_stage: ProjectStage;
  /** The charter ribbon literal for `project_stage`. */
  readonly journey_stage_id: JourneyStageId;
  readonly funding_need_id: string | null;
}

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
        siteId: null,
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


export async function listProjectFundingNeeds(
  viewer: Viewer,
  projectId: string,
  store: BackendStore = demoBackendStore,
): Promise<Result<readonly FundingNeedPayload[]>> {
  if (viewer.role !== "investor" && viewer.role !== "operator") {
    return failure("forbidden_role", "Only an investor or operator can read funding needs.");
  }
  const project = await store.getProject(projectId);
  if (project === null) return failure("not_found", "Project not found.");
  if (viewer.role === "investor") {
    if (viewer.investor.onboardingCompletedAt === null) {
      return failure("forbidden_tier", "Complete investor onboarding to read funding needs.");
    }
    if (!project.visibleToInvestors) return failure("not_found", "Project not found.");
  }
  const needs = await store.listFundingNeeds(projectId);
  return ok(needs.filter((need) => need.status === "open" || need.status === "partially_funded").map(toFundingNeedPayload));
}

export async function listMyEngagements(
  viewer: Viewer,
  store: BackendStore = demoBackendStore,
): Promise<Result<readonly EngagementPipelineItem[]>> {
  if (viewer.role !== "investor") {
    return failure("forbidden_role", "Only an investor can read their engagements.");
  }
  /**
   * The same completion gate the portfolio, funding-needs and deal-room reads
   * apply. Without it `/me` reports `onboarded: false` while this endpoint
   * still returns the caller's pipeline, and an investor whose onboarding was
   * revoked would keep reading project names and stage transitions after
   * every other investor-facing read had closed to them.
   */
  if (viewer.investor.onboardingCompletedAt === null) {
    return failure("forbidden_tier", "Complete investor onboarding to read your engagements.");
  }
  const projects = await store.listProjects();
  const items: EngagementPipelineItem[] = [];
  for (const project of projects) {
    /**
     * `visibleToInvestors` is the operator's only lever for pulling a project
     * back. Every other investor-facing read honours it, so this one must too:
     * without it, revoking visibility would still leak the project's name and
     * its continuing stage transitions to anyone already engaged.
     */
    if (!project.visibleToInvestors) continue;
    const engagements = (await store.listEngagements(project.id)).filter(
      (item) => item.investorId === viewer.investor.id,
    );
    for (const engagement of engagements) {
      items.push({
        id: engagement.id,
        investor_id: engagement.investorId,
        project_id: engagement.projectId,
        funding_need_id: engagement.fundingNeedId,
        state: engagement.state,
        state_changed_at: engagement.stateChangedAt,
        is_binding: engagement.isBinding,
        created_at: engagement.createdAt,
        project_name: project.name,
        project_stage: project.stage,
        journey_stage_id: journeyStageIdForProject(project.stage),
      });
    }
  }
  return ok(items);
}

export function toFundingNeedPayload(need: FundingNeedRecord): FundingNeedPayload {
  return {
    id: need.id,
    project_id: need.projectId,
    need_type: need.needType,
    stage: need.stage,
    description: need.description,
    amount_requested: need.amountRequested,
    amount_committed: need.amountCommitted,
    status: need.status,
    created_at: need.createdAt,
  };
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
