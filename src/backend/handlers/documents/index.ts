import type { Viewer } from "../../core/identity";
import {
  addSiteDocument,
  getSiteDocumentContent,
  isAllowedDocumentContentType,
  isDocumentDisclosureClass,
  MAX_DOCUMENT_SIZE_BYTES,
  putSiteDocumentContent,
  type DocumentCreateInput,
} from "../../core/documents";
import { failure, ok, type Result } from "../../core/shared";
import { demoBackendStore, type BackendStore } from "../../core/store";
import { documentBlobClient } from "../../blob";
import { resolveDemoSiteOwner } from "../identity";
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

interface DocumentRouteContext {
  readonly params: Promise<{ readonly id: string; readonly documentId: string }>;
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
  return handlePostSiteDocument(request, resolveDemoSiteOwner(), (await context.params).id);
}

/**
 * Bytes travel as a raw body rather than base64 inside the registration JSON:
 * the allow-listed types are all binary, and base64 would inflate a 10 MB cap
 * to roughly 13 MB of JSON for no gain. The `Content-Type` header is ignored on
 * purpose — the stored record already carries a validated type, and letting an
 * upload restate it would separate what a document claims to be from what is
 * served back.
 */
export async function handlePutSiteDocumentContent(
  request: Request,
  viewer: Viewer,
  siteId: string,
  documentId: string,
  store: BackendStore = demoBackendStore,
): Promise<Response> {
  const id = validatePathId(siteId, "invalid_body");
  if (!id.ok) return failureResponse(id.failure);
  const document = validatePathId(documentId, "invalid_body");
  if (!document.ok) return failureResponse(document.failure);

  const content = new Uint8Array(await request.arrayBuffer());
  const result = await putSiteDocumentContent(
    viewer,
    siteId,
    documentId,
    content,
    documentBlobClient(),
    store,
  );
  return result.ok ? jsonResponse(result.value, 200) : failureResponse(result.failure);
}

export async function handleGetSiteDocumentContent(
  viewer: Viewer,
  siteId: string,
  documentId: string,
  store: BackendStore = demoBackendStore,
): Promise<Response> {
  const id = validatePathId(siteId, "invalid_body");
  if (!id.ok) return failureResponse(id.failure);
  const document = validatePathId(documentId, "invalid_body");
  if (!document.ok) return failureResponse(document.failure);

  const result = await getSiteDocumentContent(
    viewer,
    siteId,
    documentId,
    documentBlobClient(),
    store,
  );
  if (!result.ok) return failureResponse(result.failure);

  /**
   * `Response` requires a view backed by a plain `ArrayBuffer`, which a
   * `Uint8Array` widened to `ArrayBufferLike` does not satisfy. `set` is a
   * memcpy rather than an element-wise copy, so this is cheap even at the
   * 10 MB cap, and it avoids asserting a type the compiler cannot verify.
   */
  const body = new Uint8Array(result.value.content.byteLength);
  body.set(result.value.content);

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": result.value.contentType,
      /**
       * `attachment` so a document is never rendered in the origin: an uploaded
       * SVG or HTML masquerading as an allowed type would otherwise run as
       * first-party script. The filename is RFC 5987 encoded because it is
       * caller-supplied and may contain quotes or non-ASCII.
       */
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
        result.value.originalFilename,
      )}`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function putSiteDocumentContentRoute(
  request: Request,
  context: DocumentRouteContext,
): Promise<Response> {
  const params = await context.params;
  return handlePutSiteDocumentContent(
    request,
    resolveDemoSiteOwner(),
    params.id,
    params.documentId,
  );
}

export async function getSiteDocumentContentRoute(
  _request: Request,
  context: DocumentRouteContext,
): Promise<Response> {
  const params = await context.params;
  return handleGetSiteDocumentContent(resolveDemoSiteOwner(), params.id, params.documentId);
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
