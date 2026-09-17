/**
 * Persistence — the schema, and nothing that decides anything.
 *
 * This directory is deliberately not a service. It sits beside `core` and
 * `handlers` rather than inside either, and the dependency runs one way: `db`
 * imports domain vocabulary from `core`, and `core` never imports `db`. That is
 * what keeps `ProjectStore` an interface a domain owns rather than a shape the
 * database dictates, and it is enforced in `eslint.config.mjs` and asserted in
 * `tests/unit/architecture.test.ts`.
 *
 * Nothing in `core` or `handlers` may import this. The composition root —
 * `src/backend/index.ts` — is the one module that sees both sides and decides
 * which store the running process uses, based on `SUNSUM_STORE`.
 */

export * from "./client";
export * from "./enums";
export * from "./backend-store";
export * from "./schema";
