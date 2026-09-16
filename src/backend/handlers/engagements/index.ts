import {
  expressInterest,
  listProjectEngagements,
} from "../../core/engagements";
import type { Viewer } from "../../core/identity";
import { demoBackendStore, type BackendStore } from "../../core/store";
import { resolveDemoInvestor, resolveDemoOperator } from "../identity";
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
  return handlePostEngagement(
    request,
    resolveDemoInvestor(),
    (await context.params).id,
  );
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
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  return handleGetProjectEngagements(
    resolveDemoOperator(),
    (await context.params).id,
  );
}
