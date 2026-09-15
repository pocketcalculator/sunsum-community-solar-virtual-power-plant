/**
 * Shared HTTP plumbing for handlers.
 *
 * Every handler answers in one of two ways: a JSON body for success, or the
 * agreed error envelope for a `Failure`. Keeping both here means a new endpoint
 * does not restate the status mapping, and the mapping stays consistent across
 * the API.
 */

import type { Failure, FailureCode } from "../core/result";

/**
 * The one place a failure code becomes a status code.
 *
 * Declared as a total `Record`, so adding a `FailureCode` without deciding its
 * status is a compile error rather than an accidental 500.
 */
const STATUS_BY_FAILURE_CODE: Record<FailureCode, number> = {
  invalid_query: 400,
  unauthenticated: 401,
  forbidden_role: 403,
  forbidden_tier: 403,
};

/** The error envelope from the contract: a stable `code` clients branch on. */
interface ErrorBody {
  readonly code: FailureCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
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
  const body: ErrorBody =
    failure.details === undefined
      ? { code: failure.code, message: failure.message }
      : {
          code: failure.code,
          message: failure.message,
          details: failure.details,
        };

  return jsonResponse(body, STATUS_BY_FAILURE_CODE[failure.code]);
}
