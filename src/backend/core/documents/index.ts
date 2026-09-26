import type { Viewer } from "../identity";
import { unlocksTierOne } from "../engagements";
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
  projectDocumentParent,
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

/**
 * Registers a document whose parent is a project rather than a site.
 *
 * Operator-only, unlike the site endpoint. A project exists only once an
 * operator has accepted the site, and what hangs off one is a platform
 * artefact — an underwriting summary, a screening report — rather than the
 * owner-supplied evidence that justifies owner access on the site route. That
 * also makes the site route's disclosure guard unnecessary here: the only role
 * that can reach this call is the one already trusted to disclose.
 */
export async function addProjectDocument(
  viewer: Viewer,
  projectId: string,
  input: DocumentCreateInput,
  store: BackendStore = demoBackendStore,
): Promise<Result<DocumentPayload>> {
  if (viewer.role !== "operator") {
    return failure("forbidden_role", "Only an operator can add project documents.");
  }
  const project = await store.getProject(projectId);
  if (project === null) return failure("not_found", "Project not found.");
  /**
   * Blob paths are keyed by the owning user so everything belonging to one
   * owner shares a prefix. A project has no owner of its own, so it inherits
   * the site's — the same person, reached one hop further along.
   */
  const site = await store.getSite(project.siteId);
  if (site === null) return failure("not_found", "Project not found.");

  const now = new Date().toISOString();
  const documentId = store.nextId("document");
  const docType = normalizeDocType(input.docType);
  const location = buildDocumentBlobLocation({
    ownerUserId: site.ownerUserId,
    parent: projectDocumentParent(project.id),
    documentId,
    docType,
    originalFilename: input.originalFilename,
    disclosureClass: input.disclosureClass,
  });
  const document: DocumentRecord = {
    id: documentId,
    siteId: null,
    projectId: project.id,
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
 * The size checks both upload routes apply. Shared so that a project upload
 * cannot quietly accept bytes a site upload would reject.
 */
function validateDocumentContent(
  content: Uint8Array,
  document: DocumentRecord,
): Result<null> {
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
  return ok(null);
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

  const validated = validateDocumentContent(content, document);
  if (!validated.ok) return validated;

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

/**
 * Resolves a document hanging off a project and decides who may read it.
 *
 * The rule is that a role may download exactly what its own view already
 * lists. An operator lists everything; an owner's dashboard lists every
 * document belonging to their site and its project; a deal room lists only
 * tier-one disclosures. Anything looser would hand out documents no view
 * advertised, and anything tighter would leave a listed document
 * undownloadable.
 */
async function resolveProjectDocument(
  viewer: Viewer,
  projectId: string,
  documentId: string,
  store: BackendStore,
): Promise<Result<DocumentRecord>> {
  const project = await store.getProject(projectId);
  if (project === null) return failure("not_found", "Project not found.");
  const site = await store.getSite(project.siteId);
  if (site === null) return failure("not_found", "Project not found.");

  if (viewer.role === "investor") {
    if (viewer.investor.onboardingCompletedAt === null) {
      return failure("forbidden_tier", "Complete investor onboarding to read project documents.");
    }
    if (!project.visibleToInvestors) return failure("not_found", "Project not found.");
    const engagements = (await store.listEngagements(project.id)).filter(
      (item) => item.investorUserId === viewer.userId,
    );
    const currentEngagement = engagements.at(-1);
    if (currentEngagement === undefined || !unlocksTierOne(currentEngagement.state)) {
      return failure("forbidden_tier", "An active engagement is required for this deal room.");
    }
  } else if (viewer.role === "site_owner") {
    if (site.ownerUserId !== viewer.userId) {
      return failure("forbidden_owner", "Only the site owner can access this project's documents.");
    }
  } else if (viewer.role !== "operator") {
    return failure("forbidden_role", "This role cannot access project documents.");
  }

  /**
   * Deliberately the same lookup the deal room and the owner dashboard
   * perform, which matches either parent. A document registered against the
   * site before acceptance and one registered against the project after it
   * both belong to this deal, and a reader should not have to know which route
   * created it.
   */
  const documents = await store.listDocuments(site.id, project.id);
  const document = documents.find((item) => item.id === documentId);
  if (document === undefined) return failure("not_found", "Document not found.");
  /**
   * `not_found` rather than a forbidden code: an investor who is not entitled
   * to a document should not learn that it exists, and the deal room never
   * listed it for them in the first place.
   */
  if (viewer.role === "investor" && document.disclosureClass !== "investor_tier_1") {
    return failure("not_found", "Document not found.");
  }
  return ok(document);
}

/**
 * Stores the bytes for a project document. Writing stays operator-only even
 * though reading does not: an investor consumes a deal room, never supplies it.
 */
export async function putProjectDocumentContent(
  viewer: Viewer,
  projectId: string,
  documentId: string,
  content: Uint8Array,
  blob: DocumentBlobPort,
  store: BackendStore = demoBackendStore,
): Promise<Result<DocumentPayload>> {
  if (viewer.role !== "operator") {
    return failure("forbidden_role", "Only an operator can upload project documents.");
  }
  const found = await resolveProjectDocument(viewer, projectId, documentId, store);
  if (!found.ok) return found;
  const document = found.value;

  const validated = validateDocumentContent(content, document);
  if (!validated.ok) return validated;

  const location = parseBlobPath(document.blobPath);
  if (location === null) {
    return failure("not_found", "Document has no resolvable blob location.");
  }

  await blob.upload(location, content, document.contentType);
  return ok(toDocumentPayload(document));
}

/**
 * Reads a project document back. This is the download an operator uses for a
 * generated report, and the one an investor uses for the copy the deal room
 * listed.
 */
export async function getProjectDocumentContent(
  viewer: Viewer,
  projectId: string,
  documentId: string,
  blob: DocumentBlobPort,
  store: BackendStore = demoBackendStore,
): Promise<Result<DocumentContent>> {
  const found = await resolveProjectDocument(viewer, projectId, documentId, store);
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
