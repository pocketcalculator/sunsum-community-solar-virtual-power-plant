/**
 * S-IAM at the transport edge.
 *
 * Establishing who is calling is a transport concern, so it lives in handlers.
 * The current implementation selects fixed role-specific demo principals and
 * reads no request credentials. Future WS3 identity may read a session or
 * bearer token. What that viewer may do is decided in `core`, where a job or
 * CLI cannot route around it.
 *
 * `/auth/login`, `/auth/logout`, `/auth/demo-switch` and `GET /me` land here.
 */

export {
  resolveDemoInvestor,
  resolveDemoOperator,
  resolveDemoSiteOwner,
  resolveDemoViewer,
} from "./viewer";
