/**
 * S-IAM — Identity and Access (design document section 9.2).
 *
 * Owns who the caller is: roles, sessions and the resolved `Viewer` every other
 * domain authorizes against. It does not decide what a viewer may see; each
 * domain owns its own permissions, because the rule and the data it protects
 * should not live in different places.
 *
 * Endpoints that will land here: `/auth/login`, `/auth/logout`,
 * `/auth/demo-switch`, `/me`.
 */

export { ROLES, type InvestorProfile, type Role, type Viewer } from "./viewer";
