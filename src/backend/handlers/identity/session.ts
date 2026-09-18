/**
 * Establishing who is calling, at the transport edge.
 *
 * This is the half of identity that knows about HTTP: it reads the session
 * cookie, resolves it to a real user row, and refuses the request when it
 * cannot. Core owns what that user is then allowed to see.
 *
 * The rule this file exists to enforce is that **absence of a session is a
 * refusal, not a default**. The demo viewers this replaced returned a fully
 * onboarded investor to an anonymous caller, which was survivable only while
 * the data was fixtures and every route was read-only. It stopped being
 * survivable when PostgreSQL landed behind the write paths.
 */

import {
  signSession,
  verifySession,
  MIN_SESSION_SECRET_LENGTH,
  SESSION_MAX_AGE_MS,
  type Role,
  type Viewer,
  type ViewerIdentity,
} from "../../core/identity";
import { failure, ok, type Result } from "../../core/shared";
import { backendStore, type BackendStore } from "../../core/store";

export const SESSION_COOKIE_NAME = "sunsum_session";

/**
 * The process-lifetime secret used when none is configured.
 *
 * Only ever reached outside production. It keeps a developer from needing any
 * setup while still making a forged token impossible, and its one visible
 * consequence — sessions do not survive a restart — is the correct trade for a
 * machine that restarts on every file save.
 */
let ephemeralSecret: string | undefined;
let warnedAboutEphemeralSecret = false;

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * The signing secret.
 *
 * A production deployment must be told its secret. Inventing one per process
 * would appear to work, then sign users out on every restart and reject each
 * other's cookies the moment a second instance existed — a failure that
 * presents as an intermittent, unreproducible logout rather than as the
 * misconfiguration it is. Better to refuse the request and say so.
 */
export function resolveSessionSecret(): Result<string> {
  const configured = process.env.SUNSUM_SESSION_SECRET;

  if (configured !== undefined && configured.length > 0) {
    if (configured.length < MIN_SESSION_SECRET_LENGTH) {
      return failure(
        "service_unavailable",
        "Sessions are not available: SUNSUM_SESSION_SECRET is too short.",
      );
    }
    return ok(configured);
  }

  if (isProduction()) {
    return failure(
      "service_unavailable",
      "Sessions are not available: SUNSUM_SESSION_SECRET is not configured.",
    );
  }

  if (ephemeralSecret === undefined) {
    ephemeralSecret = Buffer.from(
      globalThis.crypto.getRandomValues(new Uint8Array(32)),
    ).toString("base64");
  }
  if (!warnedAboutEphemeralSecret) {
    warnedAboutEphemeralSecret = true;
    console.warn(
      "[identity] SUNSUM_SESSION_SECRET is unset; using a per-process secret. Sessions end when this process does.",
    );
  }
  return ok(ephemeralSecret);
}

/**
 * Pull one cookie out of a request.
 *
 * Written by hand because the value we want is base64url and `.` separated,
 * which needs no unescaping, and reaching for a cookie parser to read a single
 * name would be the larger change.
 */
export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (header === null) return undefined;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    return value.length === 0 ? undefined : value;
  }
  return undefined;
}

function cookieAttributes(maxAgeSeconds: number): string {
  /**
   * `SameSite=Lax` lets a top-level navigation carry the session while keeping
   * it off cross-site form posts and subresource requests, which is the
   * defence against CSRF on the write endpoints. `Secure` is conditional only
   * so that plain-HTTP localhost still works.
   */
  const attributes = [
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isProduction()) attributes.push("Secure");
  return attributes.join("; ");
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE_NAME}=${token}; ${cookieAttributes(
    Math.floor(SESSION_MAX_AGE_MS / 1000),
  )}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; ${cookieAttributes(0)}`;
}

export function issueSessionCookie(userId: string): Result<string> {
  const secret = resolveSessionSecret();
  if (!secret.ok) return secret;
  return ok(
    sessionCookie(signSession({ userId, issuedAt: Date.now() }, secret.value)),
  );
}

/**
 * Turn a request into the identity behind it, without loading an investor
 * profile.
 *
 * The role is read from the user row rather than the token, so a role that
 * changes in the database takes effect on the next request and a stolen
 * cookie cannot claim a role its owner was never granted.
 */
export async function resolveIdentity(
  request: Request,
  store: BackendStore = backendStore,
): Promise<Result<ViewerIdentity>> {
  const token = readCookie(request, SESSION_COOKIE_NAME);
  if (token === undefined) {
    return failure("unauthenticated", "Sign in to continue.");
  }

  const secret = resolveSessionSecret();
  if (!secret.ok) return secret;

  const payload = verifySession(token, secret.value, Date.now());
  if (!payload.ok) return payload;

  const user = await store.getUser(payload.value.userId);
  /**
   * A signature we issued, naming a user who is no longer there. The session
   * outlived the account; treat it as signed out rather than as an error.
   */
  if (user === null) {
    return failure("unauthenticated", "Sign in to continue.");
  }

  return ok({ role: user.role, userId: user.id });
}

/**
 * Turn a request into the identity behind it.
 *
 * An investor also carries their mandate, because every investor rule in core
 * needs it and loading it here keeps those rules synchronous. An investor who
 * has not onboarded yet therefore cannot be resolved into a `Viewer` at all;
 * {@link requireInvestorIdentity} is how the onboarding write gets in.
 */
export async function resolveViewer(
  request: Request,
  store: BackendStore = backendStore,
): Promise<Result<Viewer>> {
  const identity = await resolveIdentity(request, store);
  if (!identity.ok) return identity;

  if (identity.value.role === "investor") {
    const investor = await store.getInvestorProfileByUserId(
      identity.value.userId,
    );
    if (investor === null) {
      return failure(
        "forbidden_role",
        "This investor account has no profile yet.",
      );
    }
    return ok({ role: "investor", userId: identity.value.userId, investor });
  }

  return ok(identity.value);
}

/**
 * Resolve an authenticated investor who may not have onboarded yet.
 *
 * Only the profile write should use this. Every other investor endpoint wants
 * {@link requireRole}, which refuses a caller whose mandate cannot be loaded.
 */
export async function requireInvestorIdentity(
  request: Request,
  store: BackendStore = backendStore,
): Promise<Result<Extract<ViewerIdentity, { role: "investor" }>>> {
  const identity = await resolveIdentity(request, store);
  if (!identity.ok) return identity;

  if (identity.value.role !== "investor") {
    return failure("forbidden_role", "This endpoint is for the investor role.");
  }

  return ok(identity.value);
}

/**
 * Resolve the caller and insist on a particular role.
 *
 * Core already refuses the wrong role on every endpoint, so this is not the
 * only line of defence; it is the one that answers before a handler has to
 * invent a viewer to pass along.
 */
export async function requireRole<TRole extends Role>(
  request: Request,
  role: TRole,
  store: BackendStore = backendStore,
): Promise<Result<Extract<Viewer, { role: TRole }>>> {
  const viewer = await resolveViewer(request, store);
  if (!viewer.ok) return viewer;

  if (viewer.value.role !== role) {
    return failure(
      "forbidden_role",
      `This endpoint is for the ${role.replace("_", " ")} role.`,
    );
  }

  return ok(viewer.value as Extract<Viewer, { role: TRole }>);
}
