/**
 * Shared HTTP plumbing for handlers.
 *
 * Every handler answers in one of two ways: a JSON body for success, or the
 * agreed error envelope for a `Failure`. Keeping both here means a new endpoint
 * does not restate the status mapping, and the mapping stays consistent across
 * the API.
 */

import type { Failure, FailureCode } from "../../core/shared";

/**
 * The one place a failure code becomes a status code.
 *
 * Declared as a total `Record`, so adding a `FailureCode` without deciding its
 * status is a compile error rather than an accidental 500.
 */
const STATUS_BY_FAILURE_CODE: Record<FailureCode, number> = {
  invalid_query: 400,
  invalid_body: 400,
  unauthenticated: 401,
  forbidden_origin: 403,
  forbidden_role: 403,
  forbidden_owner: 403,
  forbidden_tier: 403,
  not_found: 404,
  conflict: 409,
  validation_failed: 422,
  service_unavailable: 503,
};

/** The error envelope from the contract: a stable `code` clients branch on. */
interface ErrorBody {
  readonly code: FailureCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly missing_fields?: unknown;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      /**
       * A portfolio is scoped to the caller. Shared caches must not be able to
       * hand one investor's response to another.
       */
      "cache-control": "no-store",
    },
  });
}

export function failureResponse(failure: Failure): Response {
  const missingFields = failure.details?.missing_fields;
  const body: ErrorBody = {
    code: failure.code,
    message: failure.message,
    ...(failure.details === undefined ? {} : { details: failure.details }),
    ...(missingFields === undefined ? {} : { missing_fields: missingFields }),
  };

  return jsonResponse(body, STATUS_BY_FAILURE_CODE[failure.code]);
}

/**
 * Refuse a state-changing request that a different site initiated.
 *
 * `SameSite=Lax` stops an existing cookie from being *sent* on a cross-site
 * POST. It does nothing about a cross-site POST whose *response* sets one, so
 * an anonymous sign-in endpoint is open to login CSRF: an attacker's form posts
 * to `/auth/demo-switch`, the browser stores the returned cookie, and the
 * victim then drives the demo as a role the attacker chose. The endpoint takes
 * no credential, so nothing else stands in the way.
 *
 * `Sec-Fetch-Site` is the check that actually answers the question — the
 * browser sets it, script cannot, and it survives proxies untouched. `none` is
 * a user-initiated navigation and `same-origin` is our own page; anything else
 * came from somewhere we did not serve.
 *
 * Absent the header the caller is not a modern browser — curl, a test, a
 * server-to-server call — and is not subject to this attack, so fall back to
 * `Origin` and allow the request when neither is present. `Origin` is compared
 * by host against the `Host` header rather than against `request.url`, because
 * behind App Service's proxy those need not agree on scheme or port.
 */
export function rejectCrossSiteRequest(request: Request): Failure | null {
  const refusal: Failure = {
    code: "forbidden_origin",
    message: "This endpoint does not accept cross-site requests.",
  };

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null) {
    return fetchSite === "same-origin" || fetchSite === "none" ? null : refusal;
  }

  const origin = request.headers.get("origin");
  if (origin === null || origin === "null") return null;

  const host = request.headers.get("host");
  if (host === null) return refusal;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return refusal;
  }
  return originHost === host ? null : refusal;
}
