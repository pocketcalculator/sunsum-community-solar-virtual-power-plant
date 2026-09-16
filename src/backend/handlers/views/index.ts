import type { Viewer } from "../../core/identity";
import { getDealRoom, getOwnerOutstanding, getOwnerSites } from "../../core/views";
import { demoBackendStore, type BackendStore } from "../../core/store";
import { resolveDemoInvestor, resolveDemoSiteOwner } from "../identity";
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

export function getOwnerSitesRoute(): Promise<Response> {
  return handleGetOwnerSites(resolveDemoSiteOwner());
}


export async function handleGetOwnerOutstanding(
  viewer: Viewer,
  store: BackendStore = demoBackendStore,
): Promise<Response> {
  const result = await getOwnerOutstanding(viewer, store);
  return result.ok ? jsonResponse(result.value) : failureResponse(result.failure);
}

export function getOwnerOutstandingRoute(): Promise<Response> {
  return handleGetOwnerOutstanding(resolveDemoSiteOwner());
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
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  return handleGetDealRoom(await resolveDemoInvestor(), (await context.params).id);
}
