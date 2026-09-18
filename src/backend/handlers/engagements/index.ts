import {
  expressInterest,
  listMyEngagements,
  listProjectFundingNeeds,
  listProjectEngagements,
} from "../../core/engagements";
import type { Viewer } from "../../core/identity";
import { demoBackendStore, type BackendStore } from "../../core/store";
import { requireRole, resolveViewer } from "../identity";
import {
  failureResponse,
  isUuid,
  jsonResponse,
  readJsonObject,
  rejectUnknownKeys,
  validatePathId,
} from "../shared";

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>;
}

export async function handlePostEngagement(
  request: Request,
  viewer: Viewer,
  projectId: string,
  store: BackendStore = demoBackendStore,
): Promise<Response> {
  const id = validatePathId(projectId, "invalid_body");
  if (!id.ok) return failureResponse(id.failure);
  const body = await readJsonObject(request);
  if (!body.ok) return failureResponse(body.failure);
  const keys = rejectUnknownKeys(body.value, ["funding_need_id"]);
  if (!keys.ok) return failureResponse(keys.failure);
  const fundingNeedId = body.value.funding_need_id;
  if (
    fundingNeedId !== undefined &&
    (typeof fundingNeedId !== "string" || !isUuid(fundingNeedId))
  ) {
    return failureResponse({
      code: "invalid_body",
      message: "Expected a UUID.",
      details: { field: "funding_need_id" },
    });
  }
  const result = await expressInterest(
    viewer,
    projectId,
    typeof fundingNeedId === "string" ? fundingNeedId : null,
    store,
  );
  return result.ok
    ? jsonResponse(result.value, 201)
    : failureResponse(result.failure);
}

export async function postEngagementRoute(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const viewer = await requireRole(request, "investor");
  if (!viewer.ok) return failureResponse(viewer.failure);
  return handlePostEngagement(
    request,
    viewer.value,
    (await context.params).id,
  );
}


export async function handleGetProjectFundingNeeds(
  viewer: Viewer,
  projectId: string,
  store: BackendStore = demoBackendStore,
): Promise<Response> {
  const id = validatePathId(projectId, "invalid_query");
  if (!id.ok) return failureResponse(id.failure);
  const result = await listProjectFundingNeeds(viewer, projectId, store);
  return result.ok ? jsonResponse(result.value) : failureResponse(result.failure);
}

export async function getProjectFundingNeedsRoute(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const viewer = await resolveViewer(request);
  if (!viewer.ok) return failureResponse(viewer.failure);
  return handleGetProjectFundingNeeds(viewer.value, (await context.params).id);
}

export async function handleGetMyEngagements(
  viewer: Viewer,
  store: BackendStore = demoBackendStore,
): Promise<Response> {
  const result = await listMyEngagements(viewer, store);
  return result.ok ? jsonResponse(result.value) : failureResponse(result.failure);
}

export async function getMyEngagementsRoute(request: Request): Promise<Response> {
  const viewer = await requireRole(request, "investor");
  if (!viewer.ok) return failureResponse(viewer.failure);
  return handleGetMyEngagements(viewer.value);
}

export async function handleGetProjectEngagements(
  viewer: Viewer,
  projectId: string,
  store: BackendStore = demoBackendStore,
): Promise<Response> {
  const id = validatePathId(projectId, "invalid_query");
  if (!id.ok) return failureResponse(id.failure);
  const result = await listProjectEngagements(viewer, projectId, store);
  return result.ok ? jsonResponse(result.value) : failureResponse(result.failure);
}

export async function getProjectEngagementsRoute(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const viewer = await requireRole(request, "operator");
  if (!viewer.ok) return failureResponse(viewer.failure);
  return handleGetProjectEngagements(
    viewer.value,
    (await context.params).id,
  );
}
