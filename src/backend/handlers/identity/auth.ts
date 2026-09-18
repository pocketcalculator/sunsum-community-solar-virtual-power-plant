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

import type {
  InvestorProfile,
  Role,
  ViewerIdentity,
} from "../../core/identity";
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
  resolveIdentity,
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
 * Opt-in, and deliberately so. `/auth/demo-switch` hands out a seeded
 * `site_owner` or `operator` session to anyone who asks, so a deployment that
 * leaves this unset while serving real records would be no better protected
 * than one with no sign-in at all. The demo deployment turns it on explicitly,
 * which makes that exposure a recorded decision rather than a default.
 */
export function isDemoAuthEnabled(): boolean {
  return process.env.SUNSUM_DEMO_AUTH === "enabled";
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

/**
 * The identity payload `/me` and `/auth/demo-switch` both answer with.
 *
 * Takes the profile separately because an investor may not have one yet. That
 * case is reported as `onboarded: false` rather than as a refusal, so a client
 * can tell "you need to onboard" apart from "you may not be here" and send the
 * caller to the profile form.
 *
 * `onboarded` follows `onboardingCompletedAt`, not the mere existence of a row,
 * because that timestamp is what the investor rules in `core` actually gate on
 * (§8.2 — portfolio, engagements, deal room). The column is nullable, so a row
 * can exist while core still considers the investor unfinished; reporting that
 * as onboarded would send a client past the form and into a 403.
 */
function identityBody(
  identity: ViewerIdentity,
  investor: InvestorProfile | null,
): Record<string, unknown> {
  if (identity.role !== "investor") {
    return { user_id: identity.userId, role: identity.role };
  }

  return {
    user_id: identity.userId,
    role: identity.role,
    onboarded: investor?.onboardingCompletedAt != null,
    ...(investor !== null
      ? {
          investor: {
            id: investor.id,
            organization_name: investor.organizationName,
            onboarding_completed_at: investor.onboardingCompletedAt,
          },
        }
      : {}),
  };
}

/** Load whatever the payload needs beyond the identity itself. */
async function describeIdentity(
  identity: ViewerIdentity,
  store: BackendStore,
): Promise<Record<string, unknown>> {
  const investor =
    identity.role === "investor"
      ? await store.getInvestorProfileByUserId(identity.userId)
      : null;
  return identityBody(identity, investor);
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

  /**
   * The cookie names a user, not a role — §8.1 reads the role from the row on
   * every request precisely so a role change takes effect at once. That makes
   * the requested role a claim about the row, and an unchecked claim here would
   * be a way up: if the seeded investor's row were ever set to `operator`,
   * asking to sign in as an investor would hand back an operator session. Refuse
   * instead of silently issuing a stronger session than the caller asked for.
   */
  if (user.role !== role.value) {
    return failureResponse({
      code: "service_unavailable",
      message: "The demo account for this role does not hold that role.",
    });
  }

  const cookie = issueSessionCookie(userId);
  if (!cookie.ok) return failureResponse(cookie.failure);

  const identity = await resolveIdentityForUser(request, cookie.value, store);
  if (!identity.ok) return failureResponse(identity.failure);

  const response = jsonResponse(await describeIdentity(identity.value, store));
  response.headers.append("set-cookie", cookie.value);
  return response;
}

/**
 * Resolve the identity for a cookie we just minted.
 *
 * The freshly issued cookie is not on the incoming request, so it is replayed
 * through the same `resolveIdentity` the next request will use. That keeps one
 * code path deciding what a session means, and makes the response to
 * `demo-switch` identical to the `/me` that follows it.
 *
 * Deliberately `resolveIdentity` and not `resolveViewer`: an investor who has
 * not onboarded has no profile, and refusing them here would make the profile
 * they need to create unreachable.
 */
async function resolveIdentityForUser(
  request: Request,
  cookie: string,
  store: BackendStore,
): Promise<Result<ViewerIdentity>> {
  const replay = new Request(request.url, {
    method: "GET",
    headers: { cookie: cookie.split(";")[0] ?? "" },
  });
  return resolveIdentity(replay, store);
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
  const identity = await resolveIdentity(request, store);
  if (!identity.ok) return failureResponse(identity.failure);
  return jsonResponse(await describeIdentity(identity.value, store));
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
