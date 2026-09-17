import type { Viewer } from "../identity";
import { failure, ok, type Result } from "../shared";
import { demoBackendStore, type BackendStore } from "../store";
import {
  DOCUMENT_DISCLOSURE_CLASSES,
  type DocumentDisclosureClass,
  type DocumentRecord,
} from "../sites";
import { toDocumentPayload, type DocumentPayload } from "../sites";
import {
  buildDocumentBlobLocation,
  formatBlobPath,
  normalizeDocType,
  parseBlobPath,
  siteDocumentParent,
  type DocumentBlobPort,
} from "./storage";

export * from "./storage";

export const ALLOWED_DOCUMENT_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;
export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

export interface DocumentCreateInput {
  readonly originalFilename: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly docType: string | null;
  readonly disclosureClass: DocumentDisclosureClass;
}

export async function addSiteDocument(
  viewer: Viewer,
  siteId: string,
  input: DocumentCreateInput,
  store: BackendStore = demoBackendStore,
): Promise<Result<DocumentPayload>> {
  if (viewer.role !== "site_owner" && viewer.role !== "operator") {
    return failure("forbidden_role", "Only a site owner or operator can add site documents.");
  }
  const site = await store.getSite(siteId);
  if (site === null) return failure("not_found", "Site not found.");
  if (viewer.role === "site_owner" && site.ownerUserId !== viewer.userId) {
    return failure("forbidden_owner", "Only the site owner can add documents to this site.");
  }
  /**
   * Publishing a document to investors is an operator disclosure decision, not
   * an owner one. Without this an owner could attach `investor_tier_1` to their
   * own electricity bill and push it into every tier-1 deal room.
   */
  if (viewer.role === "site_owner" && input.disclosureClass !== "owner_private") {
    return failure("forbidden_role", "Only an operator can disclose a document to investors.", {
      field: "disclosure_class",
      allowed: ["owner_private"],
    });
  }
  const now = new Date().toISOString();
  const documentId = store.nextId("document");
  const docType = normalizeDocType(input.docType);
  /**
   * The blob name is derived from the document id, so it is built here rather
   * than by the uploader: the record and the blob agree on one location, and a
   * caller-supplied filename cannot choose its own prefix.
   */
  const location = buildDocumentBlobLocation({
    ownerUserId: site.ownerUserId,
    parent: siteDocumentParent(site.id),
    documentId,
    docType,
    originalFilename: input.originalFilename,
    disclosureClass: input.disclosureClass,
  });
  const document: DocumentRecord = {
    id: documentId,
    /**
     * A document hangs off exactly one parent. This endpoint uploads against a
     * site, so the site is the parent even once a project exists; readers pass
     * both ids and match either side.
     */
    siteId: site.id,
    projectId: null,
    blobPath: formatBlobPath(location),
    originalFilename: input.originalFilename,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    docType,
    disclosureClass: input.disclosureClass,
    uploadedByUserId: viewer.userId,
    createdAt: now,
  };
  await store.addDocument(document);
  return ok(toDocumentPayload(document));
}

export function isDocumentDisclosureClass(value: string): value is DocumentDisclosureClass {
  return DOCUMENT_DISCLOSURE_CLASSES.some((item) => item === value);
}

export function isAllowedDocumentContentType(value: string): boolean {
  return ALLOWED_DOCUMENT_CONTENT_TYPES.some((item) => item === value);
}

/**
 * Registering a document and uploading its bytes are two steps, so a document
 * record can exist with nothing behind it. Callers distinguish the two, because
 * "you have not uploaded this yet" and "this document does not exist" need
 * different answers on an owner's outstanding-items list.
 */
export interface DocumentContent {
  readonly content: Uint8Array;
  readonly contentType: string;
  readonly originalFilename: string;
}

/**
 * Resolves a document within a site and applies the same authorization as
 * `addSiteDocument`.
 *
 * Keyed by site as well as document id so it can use `listDocuments`, which the
 * store already has, rather than adding a `getDocument` that every store
 * implementation would then have to grow. It also means an id guessed from
 * another site fails the ownership check rather than leaking the record.
 */
async function resolveSiteDocument(
  viewer: Viewer,
  siteId: string,
  documentId: string,
  store: BackendStore,
): Promise<Result<DocumentRecord>> {
  if (viewer.role !== "site_owner" && viewer.role !== "operator") {
    return failure("forbidden_role", "Only a site owner or operator can access site documents.");
  }
  const site = await store.getSite(siteId);
  if (site === null) return failure("not_found", "Site not found.");
  if (viewer.role === "site_owner" && site.ownerUserId !== viewer.userId) {
    return failure("forbidden_owner", "Only the site owner can access this site's documents.");
  }
  const documents = await store.listDocuments(site.id, null);
  const document = documents.find((item) => item.id === documentId);
  if (document === undefined) return failure("not_found", "Document not found.");
  return ok(document);
}

/**
 * Stores the bytes for a document that was already registered.
 *
 * The blob location comes from the stored `blob_path`, not from the request, so
 * an uploader cannot choose where its bytes land or overwrite another
 * document's blob. The content type likewise comes from the record, which was
 * validated against the allow-list at registration — trusting the upload's own
 * header would let a caller register `application/pdf` and then serve back
 * something the browser will execute.
 */
export async function putSiteDocumentContent(
  viewer: Viewer,
  siteId: string,
  documentId: string,
  content: Uint8Array,
  blob: DocumentBlobPort,
  store: BackendStore = demoBackendStore,
): Promise<Result<DocumentPayload>> {
  const found = await resolveSiteDocument(viewer, siteId, documentId, store);
  if (!found.ok) return found;
  const document = found.value;

  if (content.byteLength === 0) {
    return failure("invalid_body", "Document content is empty.", { field: "content" });
  }
  if (content.byteLength > MAX_DOCUMENT_SIZE_BYTES) {
    return failure("invalid_body", "Document size is outside the allowed range.", {
      field: "content",
      max_size_bytes: MAX_DOCUMENT_SIZE_BYTES,
    });
  }
  /**
   * The record already claims a size. Storing different bytes would leave the
   * record describing something that is not there, and every consumer reads the
   * record rather than the blob.
   */
  if (content.byteLength !== document.sizeBytes) {
    return failure("invalid_body", "Uploaded content does not match the registered size.", {
      field: "content",
      expected_size_bytes: document.sizeBytes,
      received_size_bytes: content.byteLength,
    });
  }

  const location = parseBlobPath(document.blobPath);
  if (location === null) {
    return failure("not_found", "Document has no resolvable blob location.");
  }

  await blob.upload(location, content, document.contentType);
  return ok(toDocumentPayload(document));
}

/**
 * Reads the bytes back. Returns `not_found` when the record exists but nothing
 * was ever uploaded, which is a normal state rather than an error.
 */
export async function getSiteDocumentContent(
  viewer: Viewer,
  siteId: string,
  documentId: string,
  blob: DocumentBlobPort,
  store: BackendStore = demoBackendStore,
): Promise<Result<DocumentContent>> {
  const found = await resolveSiteDocument(viewer, siteId, documentId, store);
  if (!found.ok) return found;
  const document = found.value;

  const location = parseBlobPath(document.blobPath);
  if (location === null) {
    return failure("not_found", "Document has no resolvable blob location.");
  }

  const content = await blob.download(location);
  if (content === null) {
    return failure("not_found", "Document content has not been uploaded yet.");
  }

  return ok({
    content,
    contentType: document.contentType,
    originalFilename: document.originalFilename,
  });
}
