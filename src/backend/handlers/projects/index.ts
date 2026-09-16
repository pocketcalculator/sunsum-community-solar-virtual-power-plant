import type { Viewer } from "../../core/identity";
import {
  advanceProjectStage,
  decideSubmission,
  isProjectStage,
  updateProjectVisibility,
  type DecisionInput,
} from "../../core/projects";
import { failure, ok, type Result } from "../../core/shared";
import { demoBackendStore, type BackendStore } from "../../core/store";
import { resolveDemoOperator } from "../identity";
import {
  failureResponse,
  isUuid,
  jsonResponse,
  readJsonObject,
  rejectUnknownKeys,
  validatePathId,
  type JsonObject,
} from "../shared";

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>;
}

export async function handlePostSubmissionDecision(
  request: Request,
  viewer: Viewer,
  siteId: string,
  store: BackendStore = demoBackendStore,
): Promise<Response> {
  const id = validatePathId(siteId, "invalid_body");
  if (!id.ok) return failureResponse(id.failure);
  const body = await readJsonObject(request);
  if (!body.ok) return failureResponse(body.failure);
  const input = parseDecision(body.value);
  if (!input.ok) return failureResponse(input.failure);
  const result = await decideSubmission(viewer, siteId, input.value, store);
  return result.ok ? jsonResponse(result.value) : failureResponse(result.failure);
}

export async function postSubmissionDecisionRoute(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  return handlePostSubmissionDecision(
    request,
    resolveDemoOperator(),
    (await context.params).id,
  );
}

export async function handlePostProjectStage(
  request: Request,
  viewer: Viewer,
  projectId: string,
  store: BackendStore = demoBackendStore,
): Promise<Response> {
  const id = validatePathId(projectId, "invalid_body");
  if (!id.ok) return failureResponse(id.failure);
  const body = await readJsonObject(request);
  if (!body.ok) return failureResponse(body.failure);
  const keys = rejectUnknownKeys(body.value, ["stage"]);
  if (!keys.ok) return failureResponse(keys.failure);
  if (typeof body.value.stage !== "string" || !isProjectStage(body.value.stage)) {
    return failureResponse({
      code: "invalid_body",
      message: "Unknown project stage.",
      details: { field: "stage" },
    });
  }
  const result = await advanceProjectStage(
    viewer,
    projectId,
    body.value.stage,
    store,
  );
  return result.ok ? jsonResponse(result.value) : failureResponse(result.failure);
}

export async function postProjectStageRoute(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  return handlePostProjectStage(
    request,
    resolveDemoOperator(),
    (await context.params).id,
  );
}

export async function handlePatchProjectVisibility(
  request: Request,
  viewer: Viewer,
  projectId: string,
  store: BackendStore = demoBackendStore,
): Promise<Response> {
  const id = validatePathId(projectId, "invalid_body");
  if (!id.ok) return failureResponse(id.failure);
  const body = await readJsonObject(request);
  if (!body.ok) return failureResponse(body.failure);
  const keys = rejectUnknownKeys(body.value, ["visible_to_investors"]);
  if (!keys.ok) return failureResponse(keys.failure);
  if (typeof body.value.visible_to_investors !== "boolean") {
    return failureResponse({
      code: "invalid_body",
      message: "Expected a boolean.",
      details: { field: "visible_to_investors" },
    });
  }
  const result = await updateProjectVisibility(
    viewer,
    projectId,
    body.value.visible_to_investors,
    store,
  );
  return result.ok ? jsonResponse(result.value) : failureResponse(result.failure);
}

export async function patchProjectVisibilityRoute(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  return handlePatchProjectVisibility(
    request,
    resolveDemoOperator(),
    (await context.params).id,
  );
}

export function parseDecision(body: JsonObject): Result<DecisionInput> {
  const keys = rejectUnknownKeys(body, [
    "decision",
    "note",
    "project_name",
    "assigned_operator_user_id",
  ]);
  if (!keys.ok) return keys;
  if (
    body.decision !== "accept" &&
    body.decision !== "reject" &&
    body.decision !== "request_info"
  ) {
    return failure("invalid_body", "Unknown submission decision.", {
      field: "decision",
    });
  }
  for (const field of ["note", "project_name", "assigned_operator_user_id"]) {
    if (body[field] !== undefined && typeof body[field] !== "string") {
      return failure("invalid_body", "Expected a string.", { field });
    }
  }
  const assigned = body.assigned_operator_user_id;
  if (typeof assigned === "string" && !isUuid(assigned)) {
    return failure("invalid_body", "Expected a UUID.", {
      field: "assigned_operator_user_id",
    });
  }
  return ok({
    decision: body.decision,
    note: typeof body.note === "string" ? body.note : null,
    projectName:
      typeof body.project_name === "string" ? body.project_name : null,
    assignedOperatorUserId: typeof assigned === "string" ? assigned : null,
  });
}
