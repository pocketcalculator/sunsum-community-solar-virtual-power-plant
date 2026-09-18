/**
 * Transport plumbing every handler shares.
 *
 * JSON encoding, the error envelope and the one failure-code-to-status map.
 * Most of this stays domain-free; transport-boundary vocabulary adapters live
 * here because handlers translate between external clients and backend wire ids.
 */

export {
  failureResponse,
  jsonResponse,
  rejectCrossSiteRequest,
} from "./http";
export { toDomainRole, toWireRole } from "./vocabulary";
export {
  isUuid,
  readJsonObject,
  rejectUnknownKeys,
  validatePathId,
  type JsonObject,
} from "./body";
