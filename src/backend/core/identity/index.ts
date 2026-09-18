/**
 * S-IAM — Identity and Access (design document section 9.2).
 *
 * Owns roles, the session token, and the resolved `Viewer` every other domain
 * authorizes against. This domain does not decide what a viewer may see; each
 * domain owns its own permissions, because the rule and the data it protects
 * should not live in different places.
 *
 * Endpoints: `/auth/demo-switch`, `/auth/logout`, `/me`. A real `/auth/login`
 * against Entra replaces how a session is minted and nothing else — everything
 * downstream already takes a `Viewer` and does not care where it came from.
 */

export {
  ROLES,
  type InvestorProfile,
  type Role,
  type Viewer,
  type ViewerIdentity,
} from "./viewer";
export {
  MIN_SESSION_SECRET_LENGTH,
  SESSION_MAX_AGE_MS,
  signSession,
  verifySession,
  type SessionPayload,
} from "./session";
