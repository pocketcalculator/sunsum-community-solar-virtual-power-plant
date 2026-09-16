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
 * Nothing imports this yet. ADR 0001 lands the schema first and wires a store
 * implementation to it separately, so that the table definitions can be
 * reviewed on their own terms while `mockProjectStore` still backs the running
 * endpoint.
 */

export * from "./enums";
export * from "./schema";
