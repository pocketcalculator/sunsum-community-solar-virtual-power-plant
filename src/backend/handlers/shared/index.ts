/**
 * Transport plumbing every handler shares.
 *
 * JSON encoding, the error envelope and the one failure-code-to-status map.
 * Like its core counterpart, it must not import a domain: a status code should
 * not need to know what a portfolio is.
 */

export { failureResponse, jsonResponse } from "./http";
export {
  isUuid,
  readJsonObject,
  rejectUnknownKeys,
  validatePathId,
  type JsonObject,
} from "./body";
