import type { Viewer } from "../../core/identity";
import {
  addSiteDocument,
  isAllowedDocumentContentType,
  isDocumentDisclosureClass,
  MAX_DOCUMENT_SIZE_BYTES,
  type DocumentCreateInput,
} from "../../core/documents";
import { failure, ok, type Result } from "../../core/shared";
import { demoBackendStore, type BackendStore } from "../../core/store";
import { resolveViewer } from "../identity";
import {
  failureResponse,
  jsonResponse,
  readJsonObject,
  rejectUnknownKeys,
  validatePathId,
  type JsonObject,
} from "../shared";

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>;
}

export async function handlePostSiteDocument(
  request: Request,
  viewer: Viewer,
  siteId: string,
  store: BackendStore = demoBackendStore,
): Promise<Response> {
  const id = validatePathId(siteId, "invalid_body");
  if (!id.ok) return failureResponse(id.failure);
  const body = await readJsonObject(request);
  if (!body.ok) return failureResponse(body.failure);
  const input = parseDocumentCreate(body.value);
  if (!input.ok) return failureResponse(input.failure);
  const result = await addSiteDocument(viewer, siteId, input.value, store);
  return result.ok ? jsonResponse(result.value, 201) : failureResponse(result.failure);
}

export async function postSiteDocumentRoute(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const viewer = await resolveViewer(request);
  if (!viewer.ok) return failureResponse(viewer.failure);
  return handlePostSiteDocument(request, viewer.value, (await context.params).id);
}

export function parseDocumentCreate(body: JsonObject): Result<DocumentCreateInput> {
  const keys = rejectUnknownKeys(body, [
    "original_filename",
    "content_type",
    "size_bytes",
    "doc_type",
    "disclosure_class",
  ]);
  if (!keys.ok) return keys;
  if (typeof body.original_filename !== "string" || body.original_filename.trim() === "") {
    return failure("invalid_body", "Expected a non-empty string.", { field: "original_filename" });
  }
  if (typeof body.content_type !== "string" || !isAllowedDocumentContentType(body.content_type)) {
    return failure("invalid_body", "Unsupported content type.", { field: "content_type" });
  }
  if (
    typeof body.size_bytes !== "number" ||
    !Number.isInteger(body.size_bytes) ||
    body.size_bytes <= 0 ||
    body.size_bytes > MAX_DOCUMENT_SIZE_BYTES
  ) {
    return failure("invalid_body", "Document size is outside the allowed range.", {
      field: "size_bytes",
      max_size_bytes: MAX_DOCUMENT_SIZE_BYTES,
    });
  }
  if (body.doc_type !== undefined && body.doc_type !== null && typeof body.doc_type !== "string") {
    return failure("invalid_body", "Expected a string or null.", { field: "doc_type" });
  }
  const disclosureClass = body.disclosure_class ?? "owner_private";
  if (typeof disclosureClass !== "string" || !isDocumentDisclosureClass(disclosureClass)) {
    return failure("invalid_body", "Unknown disclosure class.", { field: "disclosure_class" });
  }
  return ok({
    originalFilename: body.original_filename,
    contentType: body.content_type,
    sizeBytes: body.size_bytes,
    docType: typeof body.doc_type === "string" ? body.doc_type : null,
    disclosureClass,
  });
}
