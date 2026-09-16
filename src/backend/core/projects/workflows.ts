import { JOURNEY_STAGES, type JourneyStageId } from "@/domain/journey";

import type { ActivityRecord } from "../activity";
import type { FundingNeedRecord } from "../engagements";
import type { Viewer } from "../identity";
import { failure, ok, type Result } from "../shared";
import { demoBackendStore, type BackendStore } from "../store";
import { journeyStageId } from "../journey";
import { toSitePayload, type SitePayload, type SubmissionQuery } from "../sites";
import { FUNDING_STAGE_BY_PROJECT_STAGE } from "./funding";
import { PROJECT_STAGES, type ProjectRecord, type ProjectStage } from "./types";

export type SubmissionDecision = "accept" | "reject" | "request_info";

export interface DecisionInput {
  readonly decision: SubmissionDecision;
  readonly note: string | null;
  readonly projectName: string | null;
  readonly assignedOperatorUserId: string | null;
}

export interface ProjectPayload {
  readonly id: string;
  readonly site_id: string;
  readonly name: string;
  readonly assigned_operator_user_id: string | null;
  readonly stage: ProjectStage;
  readonly estimated_capacity_kw: number | null;
  readonly next_action: string | null;
  readonly target_date: string | null;
  readonly visible_to_investors: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ProjectUpdateInput {
  readonly assignedOperatorUserId?: string | null;
  readonly nextAction?: string | null;
  readonly targetDate?: string | null;
}

export interface PipelineCard {
  readonly id: string;
  readonly site_id: string;
  readonly project_id: string | null;
  readonly display_name: string;
  readonly site_type: string | null;
  readonly viability_status: string | null;
  readonly estimated_capacity_kw: number | null;
  readonly address_raw: string | null;
  readonly submission_status: string | null;
  readonly project_stage: ProjectStage | null;
  readonly journey_stage_id: JourneyStageId;
  readonly updated_at: string;
}

export interface PipelineColumn {
  readonly journey_stage_id: JourneyStageId;
  readonly count: number;
  readonly items: readonly PipelineCard[];
}

export interface PipelineResponse {
  readonly columns: readonly PipelineColumn[];
}

export interface DecisionResponse {
  readonly site: SitePayload;
  readonly project?: ProjectPayload;
}

const DEFAULT_PROJECT_NAME = "Community solar project";
const DEFAULT_PROJECT_LOCALITY = "Location withheld";

export async function decideSubmission(
  viewer: Viewer,
  siteId: string,
  input: DecisionInput,
  store: BackendStore = demoBackendStore,
): Promise<Result<DecisionResponse>> {
  if (viewer.role !== "operator") {
    return failure(
      "forbidden_role",
      "Only an operator can decide a submission.",
    );
  }

  if (
    (input.decision === "reject" || input.decision === "request_info") &&
    !input.note?.trim()
  ) {
    return failure("validation_failed", "A note is required for this decision.", {
      missing_fields: [{ field: "note", message: "A note is required." }],
    });
  }

  return store.transaction(async (transaction) => {
    const site = await transaction.getSite(siteId);
    if (site === null) {
      return failure("not_found", "Submission not found.");
    }
    if (!["submitted", "screening"].includes(site.submissionStatus)) {
      return failure(
        "conflict",
        "The submission cannot be decided from its current state.",
        {
          current_status: site.submissionStatus,
          allowed_statuses: ["submitted", "screening"],
        },
      );
    }

    const now = new Date().toISOString();
    const sourceStatus = site.submissionStatus;

    if (input.decision === "reject" || input.decision === "request_info") {
      const updatedSite = {
        ...site,
        submissionStatus:
          input.decision === "reject"
            ? ("rejected" as const)
            : ("info_requested" as const),
        updatedAt: now,
      };
      await transaction.updateSite(updatedSite);
      await transaction.addActivity(
        activity(
          transaction,
          viewer.userId,
          siteParent(site.id),
          input.decision === "reject"
            ? "submission_rejected"
            : "submission_info_requested",
          input.note,
          sourceStatus,
          updatedSite.submissionStatus,
          now,
        ),
      );
      return ok({ site: toSitePayload(updatedSite) });
    }

    if ((await transaction.getProjectBySite(site.id)) !== null) {
      return failure("conflict", "A project already exists for this submission.");
    }
    const assessments = await transaction.listAssessments(site.id);
    const latestAssessment = assessments.at(-1);
    if (latestAssessment === undefined) {
      return failure("conflict", "The submission has no viability assessment.");
    }

    const project: ProjectRecord = {
      id: transaction.nextId("project"),
      siteId: site.id,
      name: safeProjectName(input.projectName, site.addressRaw),
      assignedOperatorUserId: input.assignedOperatorUserId,
      stage: "pre_development",
      estimatedCapacityKw: midpoint(
        latestAssessment.estimatedSystemSizeKwLow,
        latestAssessment.estimatedSystemSizeKwHigh,
      ),
      nextAction: null,
      targetDate: null,
      visibleToInvestors: false,
      createdAt: now,
      updatedAt: now,
      siteAddressRaw: site.addressRaw ?? "",
      siteLatitude: site.latitude ?? 0,
      siteLongitude: site.longitude ?? 0,
      ownerUserId: site.ownerUserId,
      locality: DEFAULT_PROJECT_LOCALITY,
      region: "",
      siteType: site.siteType ?? "rooftop",
      preliminaryProjectType: latestAssessment.preliminaryProjectType,
      viabilityStatus: latestAssessment.viabilityStatus,
      estimatedSystemSizeKwLow: latestAssessment.estimatedSystemSizeKwLow,
      estimatedSystemSizeKwHigh: latestAssessment.estimatedSystemSizeKwHigh,
      estimatedAnnualGenerationKwhLow:
        latestAssessment.estimatedAnnualGenerationKwhLow,
      estimatedAnnualGenerationKwhHigh:
        latestAssessment.estimatedAnnualGenerationKwhHigh,
      openFundingNeedsCount: 1,
    };
    const fundingNeed: FundingNeedRecord = {
      id: transaction.nextId("funding"),
      projectId: project.id,
      needType: "feasibility_study",
      stage: FUNDING_STAGE_BY_PROJECT_STAGE[project.stage],
      description: "Demo project development funding need.",
      amountRequested: null,
      amountCommitted: 0,
      status: "open",
      createdAt: now,
    };
    const acceptedSite = {
      ...site,
      submissionStatus: "accepted" as const,
      updatedAt: now,
    };

    await transaction.updateSite(acceptedSite);
    await transaction.addProject(project);
    await transaction.addFundingNeed(fundingNeed);
    await transaction.addActivity(
      activity(
        transaction,
        viewer.userId,
        siteParent(site.id),
        "submission_accepted",
        input.note,
        sourceStatus,
        "pre_development",
        now,
      ),
    );
    return ok({
      site: toSitePayload(acceptedSite),
      project: toProjectPayload(project),
    });
  });
}

export async function advanceProjectStage(
  viewer: Viewer,
  projectId: string,
  stage: ProjectStage,
  store: BackendStore = demoBackendStore,
): Promise<Result<ProjectPayload>> {
  if (viewer.role !== "operator") {
    return failure("forbidden_role", "Only an operator can advance a project.");
  }
  return store.transaction(async (transaction) => {
    const project = await transaction.getProject(projectId);
    if (project === null) return failure("not_found", "Project not found.");

    const currentIndex = PROJECT_STAGES.indexOf(project.stage);
    const allowed = PROJECT_STAGES[currentIndex + 1];
    if (allowed === undefined || stage !== allowed) {
      return failure("conflict", "Project stages advance one step at a time.", {
        current_stage: project.stage,
        allowed: allowed === undefined ? [] : [allowed],
      });
    }

    const from = project.stage;
    const now = new Date().toISOString();
    const updatedProject = { ...project, stage, updatedAt: now };
    await transaction.updateProject(updatedProject);
    await transaction.addActivity(
      activity(
        transaction,
        viewer.userId,
        projectParent(project.id),
        "project_stage_changed",
        null,
        from,
        stage,
        now,
      ),
    );
    return ok(toProjectPayload(updatedProject));
  });
}

export async function updateProjectVisibility(
  viewer: Viewer,
  projectId: string,
  visibleToInvestors: boolean,
  store: BackendStore = demoBackendStore,
): Promise<Result<ProjectPayload>> {
  if (viewer.role !== "operator") {
    return failure(
      "forbidden_role",
      "Only an operator can change project visibility.",
    );
  }
  return store.transaction(async (transaction) => {
    const project = await transaction.getProject(projectId);
    if (project === null) return failure("not_found", "Project not found.");

    const from = String(project.visibleToInvestors);
    const now = new Date().toISOString();
    const updatedProject = { ...project, visibleToInvestors, updatedAt: now };
    await transaction.updateProject(updatedProject);
    await transaction.addActivity(
      activity(
        transaction,
        viewer.userId,
        projectParent(project.id),
        "project_visibility_changed",
        null,
        from,
        String(visibleToInvestors),
        now,
      ),
    );
    return ok(toProjectPayload(updatedProject));
  });
}


export async function updateProject(
  viewer: Viewer,
  projectId: string,
  input: ProjectUpdateInput,
  store: BackendStore = demoBackendStore,
): Promise<Result<ProjectPayload>> {
  if (viewer.role !== "operator") {
    return failure("forbidden_role", "Only an operator can update a project.");
  }
  return store.transaction(async (transaction) => {
    const project = await transaction.getProject(projectId);
    if (project === null) return failure("not_found", "Project not found.");
    if (input.assignedOperatorUserId !== undefined && input.assignedOperatorUserId !== null) {
      const assignee = await transaction.getUser(input.assignedOperatorUserId);
      if (assignee === null || assignee.role !== "operator") {
        return failure("validation_failed", "Assigned operator must be an operator user.", {
          missing_fields: [
            { field: "assigned_operator_user_id", message: "Assignee must be an operator user." },
          ],
        });
      }
    }
    const now = new Date().toISOString();
    const updated: ProjectRecord = {
      ...project,
      assignedOperatorUserId:
        input.assignedOperatorUserId === undefined
          ? project.assignedOperatorUserId ?? null
          : input.assignedOperatorUserId,
      nextAction: input.nextAction === undefined ? project.nextAction ?? null : input.nextAction,
      targetDate: input.targetDate === undefined ? project.targetDate ?? null : input.targetDate,
      updatedAt: now,
    };
    await transaction.updateProject(updated);
    const changes: Array<[string, string | null, string | null]> = [];
    if (input.assignedOperatorUserId !== undefined && input.assignedOperatorUserId !== (project.assignedOperatorUserId ?? null)) {
      changes.push(["project_assignee_changed", project.assignedOperatorUserId ?? null, input.assignedOperatorUserId]);
    }
    if (input.nextAction !== undefined && input.nextAction !== (project.nextAction ?? null)) {
      changes.push(["project_next_action_changed", project.nextAction ?? null, input.nextAction]);
    }
    if (input.targetDate !== undefined && input.targetDate !== (project.targetDate ?? null)) {
      changes.push(["project_target_date_changed", project.targetDate ?? null, input.targetDate]);
    }
    for (const [actionName, from, to] of changes) {
      await transaction.addActivity(activity(transaction, viewer.userId, projectParent(project.id), actionName, null, from, to, now));
    }
    return ok(toProjectPayload(updated));
  });
}

export async function getPipeline(
  viewer: Viewer,
  query: SubmissionQuery,
  store: BackendStore = demoBackendStore,
): Promise<Result<PipelineResponse>> {
  if (viewer.role !== "operator") {
    return failure("forbidden_role", "Only an operator can read the pipeline.");
  }
  const columns = JOURNEY_STAGES.map((stage) => ({
    journey_stage_id: stage.id,
    count: 0,
    items: [] as PipelineCard[],
  }));
  const byStage = new Map<JourneyStageId, PipelineCard[]>(
    columns.map((column) => [column.journey_stage_id, column.items]),
  );
  const sites = await store.listSites();
  for (const site of sites) {
    if (site.submissionStatus !== "submitted" && site.submissionStatus !== "screening") continue;
    if ((await store.getProjectBySite(site.id)) !== null) continue;
    if (!matchesSitePipelineQuery(site, null, query)) continue;
    const assessments = await store.listAssessments(site.id);
    const assessment = assessments.at(-1);
    if (query.viability !== null && assessment?.viabilityStatus !== query.viability) continue;
    const stage = journeyStageId(site.submissionStatus, null);
    if (stage === null) continue;
    byStage.get(stage)?.push({
      id: site.id,
      site_id: site.id,
      project_id: null,
      display_name: site.addressRaw ?? "Submitted site",
      site_type: site.siteType,
      viability_status: assessment?.viabilityStatus ?? null,
      estimated_capacity_kw: midpoint(
        assessment?.estimatedSystemSizeKwLow ?? null,
        assessment?.estimatedSystemSizeKwHigh ?? null,
      ),
      address_raw: site.addressRaw,
      submission_status: site.submissionStatus,
      project_stage: null,
      journey_stage_id: stage,
      updated_at: site.updatedAt,
    });
  }
  const projects = await store.listProjects();
  for (const project of projects) {
    const site = await store.getSite(project.siteId);
    if (!matchesSitePipelineQuery(site, project, query)) continue;
    const stage = journeyStageId(site?.submissionStatus ?? "accepted", project.stage);
    if (stage === null) continue;
    byStage.get(stage)?.push({
      id: project.id,
      site_id: project.siteId,
      project_id: project.id,
      display_name: project.name,
      site_type: project.siteType,
      viability_status: project.viabilityStatus,
      estimated_capacity_kw: project.estimatedCapacityKw,
      address_raw: site?.addressRaw ?? project.siteAddressRaw,
      submission_status: site?.submissionStatus ?? null,
      project_stage: project.stage,
      journey_stage_id: stage,
      updated_at: project.updatedAt ?? "",
    });
  }
  return ok({
    columns: columns.map((column) => ({
      journey_stage_id: column.journey_stage_id,
      count: column.items.length,
      items: column.items,
    })),
  });
}

function matchesSitePipelineQuery(
  site: { readonly submissionStatus: string; readonly siteType: string | null; readonly addressRaw: string | null } | null,
  project: ProjectRecord | null,
  query: SubmissionQuery,
): boolean {
  if (query.statuses.length > 0 && site !== null && !query.statuses.includes(site.submissionStatus as never)) {
    return false;
  }
  if (query.siteType !== null) {
    const siteType = site?.siteType ?? project?.siteType ?? null;
    if (siteType !== query.siteType) return false;
  }
  if (query.location !== null) {
    const location = (site?.addressRaw ?? project?.siteAddressRaw ?? "").toLocaleLowerCase();
    if (!location.includes(query.location.toLocaleLowerCase())) return false;
  }
  if (query.viability !== null && project !== null && project.viabilityStatus !== query.viability) {
    return false;
  }
  return true;
}

export function toProjectPayload(project: ProjectRecord): ProjectPayload {
  return {
    id: project.id,
    site_id: project.siteId,
    name: project.name,
    assigned_operator_user_id: project.assignedOperatorUserId ?? null,
    stage: project.stage,
    estimated_capacity_kw: project.estimatedCapacityKw,
    next_action: project.nextAction ?? null,
    target_date: project.targetDate ?? null,
    visible_to_investors: project.visibleToInvestors,
    created_at: project.createdAt ?? "",
    updated_at: project.updatedAt ?? "",
  };
}

function midpoint(low: number | null, high: number | null): number | null {
  if (low === null || high === null) return null;
  return Math.round(((low + high) / 2) * 100) / 100;
}

function safeProjectName(
  requestedName: string | null,
  exactAddress: string | null,
): string {
  const name = requestedName?.trim();
  if (!name) return DEFAULT_PROJECT_NAME;

  const normalizedName = normalizeLabel(name);
  const streetDesignator =
    /\b(?:alley|aly|avenue|ave|boulevard|blvd|circle|cir|court|ct|drive|dr|highway|hwy|lane|ln|parkway|pkwy|place|pl|road|rd|route|rte|street|st|terrace|ter|trail|trl|way)\b/u;
  const looksLikeStreetAddress =
    /\b\d{1,6}\s+[\p{L}\p{N}]/u.test(normalizedName) ||
    streetDesignator.test(normalizedName);
  if (!normalizedName || looksLikeStreetAddress) return DEFAULT_PROJECT_NAME;

  const normalizedAddress = normalizeLabel(exactAddress ?? "");
  if (!normalizedAddress) return name;

  const addressTokens = new Set(
    normalizedAddress
      .split(" ")
      .filter((token) => token.length >= 2 || /^\d+$/.test(token)),
  );
  const containsAddressComponent = normalizedName
    .split(" ")
    .some((token) => addressTokens.has(token));

  return normalizedAddress.includes(normalizedName) ||
    normalizedName.includes(normalizedAddress) ||
    containsAddressComponent
    ? DEFAULT_PROJECT_NAME
    : name;
}

function normalizeLabel(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * An activity row hangs off exactly one parent, matching the
 * `activity_single_parent_check` constraint in the database schema. A row with
 * both parents, or neither, is invisible to any access rule that starts from a
 * parent, so the parent is modelled as a discriminated pair rather than two
 * independently nullable ids.
 */
type ActivityParent =
  | { readonly siteId: string; readonly projectId: null }
  | { readonly siteId: null; readonly projectId: string };

export function siteParent(siteId: string): ActivityParent {
  return { siteId, projectId: null };
}

export function projectParent(projectId: string): ActivityParent {
  return { siteId: null, projectId };
}

function activity(
  store: BackendStore,
  actorUserId: string,
  parent: ActivityParent,
  action: string,
  note: string | null,
  fromValue: string | null,
  toValue: string | null,
  createdAt: string,
): ActivityRecord {
  return {
    id: store.nextId("activity"),
    siteId: parent.siteId,
    projectId: parent.projectId,
    actorUserId,
    action,
    note,
    fromValue,
    toValue,
    createdAt,
  };
}
