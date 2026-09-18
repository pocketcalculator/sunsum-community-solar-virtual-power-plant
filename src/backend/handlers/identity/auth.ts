/**
 * Signing in, signing out, and asking who you are.
 *
 * Section 8.1 of the design document was left empty, and the placeholder that
 * stood in for it returned the same onboarded investor to every caller. These
 * three endpoints replace it with something a demo can actually drive: pick one
 * of the three seeded roles, get a signed cookie, and be refused when you have
 * not.
 *
 * `demo-switch` is the sign-in for a hackathon build. It is not a credential
 * check and does not pretend to be one — it hands out one of three *seeded*
 * identities, never a real user's. What it buys is that identity becomes
 * explicit and switchable, and that everything else can now refuse an
 * anonymous request. Replacing it with Entra changes this file and nothing
 * downstream.
 */

import type { Role, Viewer } from "../../core/identity";
import { failure, ok, type Result } from "../../core/shared";
import { backendStore, type BackendStore } from "../../core/store";
import {
  DEMO_INVESTOR_USER_ID,
  DEMO_OPERATOR_USER_ID,
  DEMO_SITE_OWNER_USER_ID,
} from "../../demo-principals";
import {
  clearedSessionCookie,
  issueSessionCookie,
  resolveViewer,
} from "./session";
import {
  failureResponse,
  jsonResponse,
  readJsonObject,
  rejectUnknownKeys,
  type JsonObject,
} from "../shared";

/** The seeded account each demo role signs in as. */
const DEMO_USER_ID_BY_ROLE: Record<Role, string> = {
  site_owner: DEMO_SITE_OWNER_USER_ID,
  operator: DEMO_OPERATOR_USER_ID,
  investor: DEMO_INVESTOR_USER_ID,
};

/**
 * Whether the demo sign-in is reachable.
 *
 * Enabled unless explicitly turned off, because on this deployment it is the
 * only way in and a disabled default would present as a site where every
 * request is refused. Setting `SUNSUM_DEMO_AUTH=disabled` is what a deployment
 * does once a real identity provider is wired up.
 */
export function isDemoAuthEnabled(): boolean {
  return process.env.SUNSUM_DEMO_AUTH !== "disabled";
}

function isRole(value: unknown): value is Role {
  return value === "site_owner" || value === "operator" || value === "investor";
}

function parseDemoSwitch(body: JsonObject): Result<Role> {
  const unknownKey = rejectUnknownKeys(body, ["role"]);
  if (!unknownKey.ok) return unknownKey;

  const role = body["role"];
  if (!isRole(role)) {
    return failure(
      "invalid_body",
      "`role` must be one of site_owner, operator or investor.",
    );
  }
  return ok(role);
}

/** The identity payload `/me` and `/auth/demo-switch` both answer with. */
function identityBody(viewer: Viewer): Record<string, unknown> {
  return {
    user_id: viewer.userId,
    role: viewer.role,
    ...(viewer.role === "investor"
      ? {
          investor: {
            id: viewer.investor.id,
            organization_name: viewer.investor.organizationName,
            onboarding_completed_at: viewer.investor.onboardingCompletedAt,
          },
        }
      : {}),
  };
}

export async function handlePostDemoSwitch(
  request: Request,
  store: BackendStore = backendStore,
): Promise<Response> {
  if (!isDemoAuthEnabled()) {
    return failureResponse({
      code: "not_found",
      message: "Demo sign-in is disabled on this deployment.",
    });
  }

  const body = await readJsonObject(request);
  if (!body.ok) return failureResponse(body.failure);
  const role = parseDemoSwitch(body.value);
  if (!role.ok) return failureResponse(role.failure);

  const userId = DEMO_USER_ID_BY_ROLE[role.value];
  /**
   * Confirm the seeded account is really there before handing out a cookie for
   * it. Against an unseeded database the alternative is a session that looks
   * valid and then fails on the next request, which is a much worse thing to
   * debug than being refused here.
   */
  const user = await store.getUser(userId);
  if (user === null) {
    return failureResponse({
      code: "service_unavailable",
      message: "The demo accounts are not present in this database.",
    });
  }

  const cookie = issueSessionCookie(userId);
  if (!cookie.ok) return failureResponse(cookie.failure);

  const viewer = await resolveViewerForUser(request, cookie.value, store);
  if (!viewer.ok) return failureResponse(viewer.failure);

  const response = jsonResponse(identityBody(viewer.value));
  response.headers.append("set-cookie", cookie.value);
  return response;
}

/**
 * Resolve the viewer for a cookie we just minted.
 *
 * The freshly issued cookie is not on the incoming request, so it is replayed
 * through the same `resolveViewer` the next request will use. That keeps one
 * code path deciding what a session means, and makes the response to
 * `demo-switch` identical to the `/me` that follows it.
 */
async function resolveViewerForUser(
  request: Request,
  cookie: string,
  store: BackendStore,
): Promise<Result<Viewer>> {
  const replay = new Request(request.url, {
    method: "GET",
    headers: { cookie: cookie.split(";")[0] ?? "" },
  });
  return resolveViewer(replay, store);
}

export function handlePostLogout(): Response {
  const response = jsonResponse({ signed_out: true });
  response.headers.append("set-cookie", clearedSessionCookie());
  return response;
}

export async function handleGetMe(
  request: Request,
  store: BackendStore = backendStore,
): Promise<Response> {
  const viewer = await resolveViewer(request, store);
  if (!viewer.ok) return failureResponse(viewer.failure);
  return jsonResponse(identityBody(viewer.value));
}

/*
 * The route bindings. They exist to match the `handleX` / `xRoute` split the
 * rest of the handlers use — the handlers above take an injectable store so a
 * test can drive them, and these are what the App Router imports.
 */

export function demoSwitchRoute(request: Request): Promise<Response> {
  return handlePostDemoSwitch(request);
}

export function logoutRoute(): Response {
  return handlePostLogout();
}

export function getMeRoute(request: Request): Promise<Response> {
  return handleGetMe(request);
}
