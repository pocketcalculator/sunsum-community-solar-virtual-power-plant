/**
 * Stable synthetic identities for the fixed-principal demo routes.
 *
 * These UUIDs identify fixtures only. They are not credentials and must not be
 * treated as authenticated identities.
 *
 * Every value here is also a row in `src/backend/db/seed.sql`. That is not a
 * coincidence and must not drift: the in-memory store and PostgreSQL are
 * required to answer a request identically, which they cannot do if a fixture
 * attributes a project to an owner the seeded database has never heard of.
 */
export const DEMO_SITE_OWNER_USER_ID =
  "7a1f4e58-6b2c-4d91-8e30-1c5a7b9d2f40";
export const DEMO_OPERATOR_USER_ID =
  "2c8d6f10-9a34-4b57-a1e2-6f0c3d8b5a71";
export const DEMO_INVESTOR_USER_ID =
  "91e3b7c4-2d65-4a08-bf19-7c5e0a6d3b82";
export const DEMO_INVESTOR_ID = "4d7a2c91-8e56-43bf-9a10-5c6d2f7b8e34";

/**
 * The other seeded site owners.
 *
 * The demo deliberately spreads five projects across four owners so that
 * owner-scoped rules are exercised by the fixtures rather than assumed. A
 * single-owner fixture set cannot tell a correct owner filter from a missing
 * one.
 */
export const DEMO_SITE_OWNER_WEBB_USER_ID =
  "11111111-1111-4111-8111-000000001002";
export const DEMO_SITE_OWNER_THOMPSON_USER_ID =
  "11111111-1111-4111-8111-000000001004";
export const DEMO_SITE_OWNER_BROOKS_USER_ID =
  "11111111-1111-4111-8111-000000001005";

