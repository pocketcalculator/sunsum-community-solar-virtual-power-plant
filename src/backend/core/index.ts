/**
 * Core workflow logic: everything that happens once a handler has accepted a
 * request.
 *
 * Core is transport-neutral. It does not import `../handlers`, `next/server`,
 * `next/headers` or `next/cache` — the lint boundary rejects all of them — so a
 * workflow rule can be exercised directly by a test. It may depend on
 * `@/domain` shared vocabulary.
 *
 * Nothing is exported yet.
 */

export {};
