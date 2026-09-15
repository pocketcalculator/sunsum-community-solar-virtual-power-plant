/**
 * The persistence seam for projects.
 *
 * Core asks for projects through this interface and never touches a database
 * driver, so choosing persistence — the design document proposes Azure SQL or
 * PostgreSQL, and neither is wired up — means writing one new implementation
 * and changing the value passed in. No rule moves.
 *
 * The interface lives apart from the mock because it is the part that survives:
 * `mock-store.ts` is disposable, this file is the contract a real store has to
 * honour.
 *
 * Methods return promises even though the mock is synchronous, so a real query
 * does not force every caller to change shape.
 */

import type { ProjectRecord } from "./types";

export interface ProjectStore {
  listProjects(): Promise<readonly ProjectRecord[]>;
}
