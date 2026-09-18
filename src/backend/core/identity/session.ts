/**
 * The session token: proof that a request carries an identity we issued.
 *
 * Deliberately pure. The secret and the current time arrive as arguments, so
 * nothing here reads `process.env` or a clock, and every branch — a forged
 * signature, a token from a rotated secret, one that has aged out — is
 * reachable from a unit test without standing anything up.
 *
 * The payload carries a user id and nothing else of consequence. It notably
 * does **not** carry a role: a role travelling inside a token is a claim the
 * bearer controls the lifetime of, so a demotion would not take effect until
 * the token expired. `resolveViewer` reads the role from the user row on every
 * request instead, which costs one indexed lookup and removes the question.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { failure, ok, type Result } from "../shared";

/** How long an issued session stays valid. */
export const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

/**
 * The minimum secret length we accept.
 *
 * HMAC-SHA256 keys longer than the 64-byte block size are hashed down, and
 * short ones are simply weak; 32 bytes is the usual floor and is what
 * `openssl rand -base64 32` produces.
 */
export const MIN_SESSION_SECRET_LENGTH = 32;

export interface SessionPayload {
  readonly userId: string;
  /** Milliseconds since the epoch, as issued. */
  readonly issuedAt: number;
}

function base64UrlEncode(value: Buffer): string {
  return value.toString("base64url");
}

function sign(encodedPayload: string, secret: string): string {
  return base64UrlEncode(
    createHmac("sha256", secret).update(encodedPayload).digest(),
  );
}

/**
 * Mint a token for a user.
 *
 * The result is `<payload>.<signature>`, both base64url. The payload is signed,
 * not encrypted: it is readable by anyone holding the token, which is fine
 * because it says only which user it belongs to and when it was issued.
 */
export function signSession(payload: SessionPayload, secret: string): string {
  const encodedPayload = base64UrlEncode(
    Buffer.from(JSON.stringify(payload), "utf8"),
  );
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

/**
 * Check a token and recover its payload.
 *
 * Every rejection answers `unauthenticated` with the same message. The reason a
 * token was refused — malformed, wrong signature, expired — is useful to us and
 * to nobody else, so it goes no further than this function.
 */
export function verifySession(
  token: string,
  secret: string,
  now: number,
  maxAgeMs: number = SESSION_MAX_AGE_MS,
): Result<SessionPayload> {
  const rejected = failure<SessionPayload>(
    "unauthenticated",
    "Sign in to continue.",
  );

  const separator = token.indexOf(".");
  if (separator <= 0 || separator === token.length - 1) return rejected;

  const encodedPayload = token.slice(0, separator);
  const providedSignature = token.slice(separator + 1);
  const expectedSignature = sign(encodedPayload, secret);

  /**
   * `timingSafeEqual` throws on a length mismatch, which would itself leak
   * length through the exception. Both values are base64url of a SHA-256
   * digest, so an unequal length already means a forgery; reject it first and
   * compare the rest in constant time.
   *
   * Compare the *buffers*, not the strings: a string length counts UTF-16 code
   * units while `timingSafeEqual` sees bytes, so a signature of the right
   * character count containing any multi-byte character would pass a string
   * comparison and then throw — turning a forged cookie into a 500 instead of
   * the 401 it is.
   */
  const provided = Buffer.from(providedSignature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (provided.length !== expected.length) return rejected;
  if (!timingSafeEqual(provided, expected)) return rejected;

  let parsed: unknown;
  try {
    parsed = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
  } catch {
    return rejected;
  }

  if (typeof parsed !== "object" || parsed === null) return rejected;
  const candidate = parsed as Partial<SessionPayload>;
  if (typeof candidate.userId !== "string" || candidate.userId.length === 0) {
    return rejected;
  }
  if (typeof candidate.issuedAt !== "number" || !Number.isFinite(candidate.issuedAt)) {
    return rejected;
  }

  /**
   * A token issued in the future is not simply early — it means a clock moved
   * or a payload was edited, and neither is a request we want to serve.
   */
  const age = now - candidate.issuedAt;
  if (age < 0 || age > maxAgeMs) return rejected;

  return ok({ userId: candidate.userId, issuedAt: candidate.issuedAt });
}
