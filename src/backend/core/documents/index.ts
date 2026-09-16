import type { Viewer } from "../identity";
import { failure, ok, type Result } from "../shared";
import { demoBackendStore, type BackendStore } from "../store";
import {
  DOCUMENT_DISCLOSURE_CLASSES,
  type DocumentDisclosureClass,
  type DocumentRecord,
} from "../sites";
import { toDocumentPayload, type DocumentPayload } from "../sites";

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
  const project = await store.getProjectBySite(site.id);
  const now = new Date().toISOString();
  const document: DocumentRecord = {
    id: store.nextId("document"),
    siteId: site.id,
    projectId: project?.id ?? null,
    blobPath: `placeholder/sites/${site.id}/${now}/${input.originalFilename}`,
    originalFilename: input.originalFilename,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    docType: input.docType,
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
