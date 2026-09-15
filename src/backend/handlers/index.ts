/**
 * API handlers: the transport edge of the backend.
 *
 * A handler reads a request, validates the shape of its input, enforces
 * authorization, and maps a core result or failure onto a status code. Workflow
 * rules belong in `../core` instead, so that they stay callable from a test, a
 * scheduled job or the seeding CLI without constructing an HTTP request.
 *
 * Nothing is exported yet.
 */

export {};
