import type { Viewer } from "../../core/identity";
import { getDealRoom, getOwnerOutstanding, getOwnerSites } from "../../core/views";
import { demoBackendStore, type BackendStore } from "../../core/store";
import { requireRole } from "../identity";
import { failureResponse, jsonResponse, validatePathId } from "../shared";

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>;
}

export async function handleGetOwnerSites(
  viewer: Viewer,
  store: BackendStore = demoBackendStore,
): Promise<Response> {
  const result = await getOwnerSites(viewer, store);
  return result.ok ? jsonResponse(result.value) : failureResponse(result.failure);
}

export async function getOwnerSitesRoute(request: Request): Promise<Response> {
  const viewer = await requireRole(request, "site_owner");
  if (!viewer.ok) return failureResponse(viewer.failure);
  return handleGetOwnerSites(viewer.value);
}


export async function handleGetOwnerOutstanding(
  viewer: Viewer,
  store: BackendStore = demoBackendStore,
): Promise<Response> {
  const result = await getOwnerOutstanding(viewer, store);
  return result.ok ? jsonResponse(result.value) : failureResponse(result.failure);
}

export async function getOwnerOutstandingRoute(
  request: Request,
): Promise<Response> {
  const viewer = await requireRole(request, "site_owner");
  if (!viewer.ok) return failureResponse(viewer.failure);
  return handleGetOwnerOutstanding(viewer.value);
}

export async function handleGetDealRoom(
  viewer: Viewer,
  projectId: string,
  store: BackendStore = demoBackendStore,
): Promise<Response> {
  const id = validatePathId(projectId, "invalid_query");
  if (!id.ok) return failureResponse(id.failure);
  const result = await getDealRoom(viewer, projectId, store);
  return result.ok ? jsonResponse(result.value) : failureResponse(result.failure);
}

export async function getDealRoomRoute(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const viewer = await requireRole(request, "investor");
  if (!viewer.ok) return failureResponse(viewer.failure);
  return handleGetDealRoom(viewer.value, (await context.params).id);
}
