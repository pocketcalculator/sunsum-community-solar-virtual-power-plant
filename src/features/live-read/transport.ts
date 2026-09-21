import { LIVE_READ_LIMITS } from "./constants";
import { ReadFault, malformed, readError, rejectRead } from "./errors";
import type { ConnectionId } from "./registry";
import type { LiveRole, ReadOperation, SnapshotQuery } from "./types";
import {
  isId, isObject, projectStages, siteTypes, submissionStatuses, viabilityStatuses,
} from "./values";

export type Operation =
  | { readonly kind: "identity" | "owner-sites" | "outstanding" | "profile" | "my-engagements" | "export" }
  | { readonly kind: "submissions" | "pipeline" | "portfolio"; readonly query?: SnapshotQuery }
  | { readonly kind: "submission"; readonly siteId: string }
  | { readonly kind: "project-engagements" | "funding" | "deal-room"; readonly projectId: string; readonly role: "operator" | "investor" }
  | { readonly kind: "document"; readonly siteId: string; readonly documentId: string };

const queryKeys = [
  "statuses", "siteType", "location", "viability", "stages", "mandateMatch", "projectType",
];

function invalidQuery(): never {
  return rejectRead("invalid", "The filter is not admitted for this read.", "invalid_query");
}

export function validateQuery(query: unknown, role?: LiveRole): asserts query is SnapshotQuery | undefined {
  if (query === undefined) return;
  if (!isObject(query) || Object.keys(query).some((key) => !queryKeys.includes(key))) invalidQuery();
  const allowed = role === "site-owner" ? [] :
    role === "operator" ? ["statuses", "siteType", "location", "viability"] :
    role === "investor" ? ["stages", "mandateMatch", "projectType", "viability"] : queryKeys;
  if (Object.keys(query).some((key) => !allowed.includes(key))) invalidQuery();
  for (const [key, choices] of [
    ["statuses", submissionStatuses], ["stages", projectStages],
  ] as const) {
    const entries = query[key];
    if (entries === undefined) continue;
    if (
      !Array.isArray(entries) || entries.length > choices.length ||
      new Set(entries).size !== entries.length ||
      entries.some((entry) => !choices.some((candidate) => candidate === entry))
    ) invalidQuery();
  }
  if (query.siteType !== undefined && !siteTypes.some((value) => value === query.siteType)) invalidQuery();
  if (query.viability !== undefined && !viabilityStatuses.some((value) => value === query.viability)) invalidQuery();
  if (query.mandateMatch !== undefined && typeof query.mandateMatch !== "boolean") invalidQuery();
  for (const key of ["location", "projectType"] as const) {
    const value = query[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || !value.trim() || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) invalidQuery();
  }
}

function queryString(query: SnapshotQuery | undefined, role: LiveRole): string {
  validateQuery(query, role);
  if (query === undefined) return "";
  const params = new URLSearchParams();
  for (const status of query.statuses ?? []) params.append("status", status);
  for (const stage of query.stages ?? []) params.append("stage", stage);
  if (query.siteType !== undefined) params.set("type", query.siteType);
  if (query.viability !== undefined) params.set("viability", query.viability);
  if (query.location !== undefined) params.set("location", query.location);
  if (query.projectType !== undefined) params.set("project_type", query.projectType);
  if (query.mandateMatch !== undefined) params.set("mandate_match", String(query.mandateMatch));
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

function pathId(value: string): string {
  if (!isId(value)) rejectRead("invalid", "A canonical service UUID is required.", "invalid_id");
  return value.toLowerCase();
}

export function operationPath(operation: Operation): ReadOperation {
  let path: string;
  let connectionId: ConnectionId;
  switch (operation.kind) {
    case "identity":
      path = "/api/me";
      connectionId = "SUNSUM-CONNECTION:WS2-IDENTITY";
      break;
    case "owner-sites":
    case "outstanding":
      path = operation.kind === "owner-sites" ? "/api/me/sites" : "/api/me/outstanding";
      connectionId = "SUNSUM-CONNECTION:WS2-OWNER";
      break;
    case "submissions":
    case "pipeline":
      path = `/api/${operation.kind}${queryString(operation.query, "operator")}`;
      connectionId = "SUNSUM-CONNECTION:WS2-OPERATOR";
      break;
    case "submission":
      path = `/api/submissions/${pathId(operation.siteId)}`;
      connectionId = "SUNSUM-CONNECTION:WS2-OPERATOR";
      break;
    case "portfolio":
      path = `/api/portfolio${queryString(operation.query, "investor")}`;
      connectionId = "SUNSUM-CONNECTION:WS2-INVESTOR";
      break;
    case "profile":
    case "my-engagements":
      path = operation.kind === "profile" ? "/api/investors/me/profile" : "/api/me/engagements";
      connectionId = "SUNSUM-CONNECTION:WS2-INVESTOR";
      break;
    case "project-engagements":
    case "funding":
    case "deal-room": {
      if (
        (operation.kind === "project-engagements" && operation.role !== "operator") ||
        (operation.kind === "deal-room" && operation.role !== "investor") ||
        !["operator", "investor"].includes(operation.role)
      ) rejectRead("invalid", "This operation is not admitted for the role.", "invalid_operation");
      const suffix = operation.kind === "project-engagements" ? "engagements" :
        operation.kind === "funding" ? "funding-needs" : "deal-room";
      path = `/api/projects/${pathId(operation.projectId)}/${suffix}`;
      connectionId = operation.role === "operator" ?
        "SUNSUM-CONNECTION:WS2-OPERATOR" : "SUNSUM-CONNECTION:WS2-INVESTOR";
      break;
    }
    case "document":
      path = `/api/sites/${pathId(operation.siteId)}/documents/${pathId(operation.documentId)}/content`;
      connectionId = "SUNSUM-CONNECTION:WS2-DOCUMENTS-EXPORT";
      break;
    case "export":
      path = "/api/export?format=json";
      connectionId = "SUNSUM-CONNECTION:WS2-DOCUMENTS-EXPORT";
      break;
    default:
      return rejectRead("invalid", "The requested operation is not admitted.", "invalid_operation");
  }
  return { method: "GET", path, connectionId };
}

export function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  if (signal.reason instanceof ReadFault) throw signal.reason;
  rejectRead("canceled", "The read was canceled.", "canceled");
}

export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      reject(signal.reason instanceof ReadFault ? signal.reason :
        new ReadFault(readError("canceled", "The read was canceled.", "canceled")));
    };
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) abort();
        else resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
    if (signal.aborted) {
      signal.removeEventListener("abort", abort);
      abort();
    }
  });
}

function checkJsonBounds(value: unknown, depth = 0, budget = { items: 0 }): void {
  if (depth > LIVE_READ_LIMITS.maxDepth) {
    rejectRead("too-large", "The response exceeds the admitted nesting limit.", "depth_limit");
  }
  if (typeof value === "string" && value.length > LIVE_READ_LIMITS.maxStringLength) {
    rejectRead("too-large", "The response exceeds the admitted text limit.", "text_limit");
  }
  if (Array.isArray(value)) {
    budget.items += value.length;
    if (budget.items > LIVE_READ_LIMITS.maxItems) {
      rejectRead("too-large", "The response exceeds the admitted item limit.", "item_limit");
    }
    for (const entry of value) checkJsonBounds(entry, depth + 1, budget);
  } else if (isObject(value)) {
    for (const [key, entry] of Object.entries(value)) {
      checkJsonBounds(key, depth + 1, budget);
      checkJsonBounds(entry, depth + 1, budget);
    }
  }
}

async function boundedBody(response: Response, limit: number, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    if (!/^\d+$/.test(declared)) malformed();
    if (Number(declared) > limit) {
      rejectRead("too-large", "The response exceeds the admitted byte limit.", "byte_limit");
    }
  }
  if (!response.body) return new Uint8Array(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let done = false;
  try {
    while (!done) {
      const next = await abortable(reader.read(), signal);
      done = next.done;
      if (!next.done) {
        length += next.value.byteLength;
        if (length > limit) rejectRead("too-large", "The response exceeds the admitted byte limit.", "byte_limit");
        chunks.push(next.value);
      }
    }
  } finally {
    try {
      if (!done) await abortable(reader.cancel(), signal);
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function parseJson(bytes: Uint8Array): unknown {
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) return malformed();
    throw error;
  }
  checkJsonBounds(payload);
  return payload;
}

function httpFault(status: number, operation: ReadOperation, body?: unknown): ReadFault {
  const codes = [
    "invalid_query", "invalid_body", "unauthenticated", "forbidden_origin",
    "forbidden_role", "forbidden_owner", "forbidden_tier", "not_found",
    "conflict", "validation_failed", "service_unavailable",
  ];
  const code = isObject(body) && typeof body.code === "string" && codes.includes(body.code) ? body.code : null;
  const kind = status === 401 ? "unauthenticated" : status === 403 ? "denied" :
    status === 404 ? "missing" : status === 400 || status === 422 ? "invalid" :
    status === 408 || status === 504 ? "timeout" : status === 413 ? "too-large" : "unavailable";
  return new ReadFault(readError(
    kind,
    status === 401 ? "The existing session is not authenticated." :
      status === 403 ? "The service did not permit this read." :
      status === 404 ? "The requested record or original document is not available." :
      "The service could not complete the admitted read.",
    code, operation.connectionId, status,
  ));
}

export interface Transport {
  json(operation: Operation, signal: AbortSignal, operations: ReadOperation[]): Promise<unknown>;
  bytes(operation: Operation, signal: AbortSignal, operations: ReadOperation[]): Promise<{
    readonly bytes: Uint8Array<ArrayBuffer>;
    readonly contentType: string;
  }>;
}

export function createTransport(origin: string, fetcher: typeof globalThis.fetch, timeoutMs: number): Transport {
  async function request(
    operation: Operation,
    parentSignal: AbortSignal,
    operations: ReadOperation[],
    binary: boolean,
  ) {
    const admitted = operationPath(operation);
    throwIfAborted(parentSignal);
    const controller = new AbortController();
    const relay = () => controller.abort(parentSignal.reason);
    parentSignal.addEventListener("abort", relay, { once: true });
    const timer = setTimeout(() => controller.abort(new ReadFault(readError(
      "timeout", "The read exceeded its deadline.", "deadline",
      admitted.connectionId,
    ))), timeoutMs);
    try {
      operations.push(admitted);
      const url = `${origin}${admitted.path}`;
      const response = await abortable(fetcher(url, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      }), controller.signal);
      if (response.redirected || (response.url !== "" && response.url !== url)) {
        rejectRead("network", "Redirected or cross-origin responses are not admitted.", "redirect_not_admitted");
      }
      const contentType = (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
      if (!response.ok) {
        let body: unknown;
        try {
          const bytes = await boundedBody(response, LIVE_READ_LIMITS.jsonBytes, controller.signal);
          if (contentType === "application/json") body = parseJson(bytes);
        } catch (error) {
          if (!(error instanceof ReadFault) && !(error instanceof TypeError)) throw error;
          throwIfAborted(parentSignal);
          if (response.status !== 401 && response.status !== 403) throw error;
        }
        throwIfAborted(parentSignal);
        throw httpFault(response.status, admitted, body);
      }
      if (binary) {
        const bytes = await boundedBody(response, LIVE_READ_LIMITS.downloadBytes, controller.signal);
        throwIfAborted(controller.signal);
        return { kind: "bytes" as const, bytes, contentType };
      }
      if (contentType !== "application/json") malformed();
      const bytes = await boundedBody(response, LIVE_READ_LIMITS.jsonBytes, controller.signal);
      throwIfAborted(controller.signal);
      return { kind: "json" as const, payload: parseJson(bytes) };
    } catch (error) {
      if (error instanceof ReadFault) {
        throw new ReadFault({
          ...error.error,
          connectionId: error.error.connectionId ?? admitted.connectionId,
        });
      }
      throwIfAborted(controller.signal);
      if (error instanceof TypeError) {
        throw new ReadFault(readError("network", "The service could not be reached.", "network", admitted.connectionId));
      }
      throw error;
    } finally {
      clearTimeout(timer);
      parentSignal.removeEventListener("abort", relay);
      controller.abort();
    }
  }

  return {
    async json(operation, signal, operations) {
      const result = await request(operation, signal, operations, false);
      if (result.kind !== "json") return malformed();
      return result.payload;
    },
    async bytes(operation, signal, operations) {
      const result = await request(operation, signal, operations, true);
      if (result.kind !== "bytes") return malformed();
      return { bytes: result.bytes, contentType: result.contentType };
    },
  };
}
