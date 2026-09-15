/**
 * The result of a core operation.
 *
 * Core never throws for an outcome a caller is expected to handle, and never
 * returns a status code: it returns either a value or a `Failure` carrying a
 * stable `code`. Handlers own the translation from `code` to HTTP, which is
 * what keeps core callable from a test, a job or the seeding CLI.
 */

/**
 * Stable, machine-readable failure codes. Clients branch on these, never on
 * `message`. The authorization codes come from the agreed wire contract, where
 * they map onto the section 8.2 permission matrix.
 */
export type FailureCode =
  | "invalid_query"
  | "unauthenticated"
  | "forbidden_role"
  | "forbidden_tier";

export interface Failure {
  readonly code: FailureCode;
  readonly message: string;
  /** Optional context, such as which query parameter was rejected. */
  readonly details?: Readonly<Record<string, unknown>>;
}

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: Failure };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function failure<T>(
  code: FailureCode,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): Result<T> {
  /**
   * `details` is omitted rather than set to `undefined` because the project
   * compiles with `exactOptionalPropertyTypes`, under which those differ.
   */
  return {
    ok: false,
    failure: details === undefined ? { code, message } : { code, message, details },
  };
}
