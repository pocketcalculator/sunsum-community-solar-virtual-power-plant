/**
 * S-IAM at the transport edge.
 *
 * Establishing who is calling is a transport concern — it reads cookies,
 * headers or a session — so it lives in handlers. What that caller may then do
 * is decided in `core`, where a job or CLI cannot route around it.
 *
 * `/auth/login`, `/auth/logout`, `/auth/demo-switch` and `GET /me` land here.
 */

export { resolveDemoViewer } from "./viewer";
