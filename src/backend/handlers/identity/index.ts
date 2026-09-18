/**
 * S-IAM at the transport edge.
 *
 * Establishing who is calling is a transport concern, so it lives in handlers.
 * A session cookie names a user; the user row names a role; `core` decides what
 * that role may do, where a job or CLI cannot route around it.
 *
 * `/auth/demo-switch`, `/auth/logout` and `GET /me` land here. A real
 * `/auth/login` replaces how the cookie is minted and touches nothing else.
 */

export {
  demoSwitchRoute,
  getMeRoute,
  handleGetMe,
  handlePostDemoSwitch,
  handlePostLogout,
  isDemoAuthEnabled,
  logoutRoute,
} from "./auth";
export {
  clearedSessionCookie,
  issueSessionCookie,
  readCookie,
  requireInvestorIdentity,
  requireRole,
  resolveSessionSecret,
  resolveIdentity,
  resolveViewer,
  sessionCookie,
  SESSION_COOKIE_NAME,
} from "./session";
export {
  resolveDemoInvestor,
  resolveDemoOperator,
  resolveDemoSiteOwner,
  SEEDED_DEMO_INVESTOR_PROFILE,
} from "./viewer";
