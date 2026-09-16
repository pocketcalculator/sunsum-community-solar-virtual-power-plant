import type { ActivityRecord } from "../activity";
import type { FundingNeedRecord } from "../engagements";
import type { Viewer } from "../identity";
import { failure, ok, type Result } from "../shared";
import { demoBackendStore, type BackendStore } from "../store";
import { toSitePayload, type SitePayload } from "../sites";
import {
  PROJECT_STAGES,
  type ProjectRecord,
  type ProjectStage,
} from "./types";

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
          site.id,
          null,
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
      stage: project.stage,
      description: "Demo project development funding need.",
      amountRequested: null,
      amountCommitted: null,
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
        site.id,
        project.id,
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
        project.siteId,
        project.id,
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
        project.siteId,
        project.id,
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

function activity(
  store: BackendStore,
  actorUserId: string,
  siteId: string | null,
  projectId: string | null,
  action: string,
  note: string | null,
  fromValue: string | null,
  toValue: string | null,
  createdAt: string,
): ActivityRecord {
  return {
    id: store.nextId("activity"),
    siteId,
    projectId,
    actorUserId,
    action,
    note,
    fromValue,
    toValue,
    createdAt,
  };
}
