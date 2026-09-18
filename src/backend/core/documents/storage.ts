import type { DocumentDisclosureClass } from "../sites";

/**
 * Where a document lives, and under what name.
 *
 * The rules live in `core` with no Azure dependency so they can be unit tested
 * and so the wire/storage layout is decided in one place rather than inside an
 * SDK call. `src/backend/blob` is the only module that talks to Azure.
 */

/**
 * One container per disclosure class, rather than one container with the class
 * encoded in the path.
 *
 * The disclosure class decides who may read a document, and `core` already
 * enforces that on every read path. Splitting the containers adds a second,
 * coarser boundary underneath the application logic: a credential or SAS scoped
 * to `investor-tier-1` cannot name a blob in `owner-private` at all, so an
 * authorization bug in the application cannot by itself expose an owner's
 * electricity bill. Defence in depth, not a replacement for the checks in core.
 *
 * This is safe because a document's disclosure class is fixed at upload —
 * `addSiteDocument` is the only writer and there is no re-classification path.
 * If one is ever added it must copy the blob to the other container and rewrite
 * `blobPath`, which is why the stored path is fully qualified below.
 */
export const DOCUMENT_CONTAINERS = {
  owner_private: "owner-private",
  investor_tier_1: "investor-tier-1",
} as const satisfies Record<DocumentDisclosureClass, string>;

export type DocumentContainer = (typeof DOCUMENT_CONTAINERS)[DocumentDisclosureClass];

export function containerForDisclosure(
  disclosureClass: DocumentDisclosureClass,
): DocumentContainer {
  return DOCUMENT_CONTAINERS[disclosureClass];
}

/**
 * Document types the platform expects to hold. `doc_type` is free text in the
 * schema and stays free text on the wire, so an unrecognised value is stored
 * rather than rejected — this list exists to keep the common ones spelled the
 * same way across workstreams, not to constrain them.
 */
export const DOCUMENT_TYPES = [
  "electricity_bill",
  "site_photo",
  "site_summary",
  "screening_report",
  "land_report",
  "other",
] as const;

export type KnownDocumentType = (typeof DOCUMENT_TYPES)[number];

export const DEFAULT_DOCUMENT_TYPE: KnownDocumentType = "other";

/**
 * The upload endpoint accepts a request with no `doc_type`, and the column is
 * nullable, so the absent case could be carried through as null. It is resolved
 * to a real value here instead because the result is a blob-path segment: a null
 * would format a path with an empty segment, which is a different blob from the
 * one any other caller would compute for the same document.
 */
export function normalizeDocType(value: string | null | undefined): string {
  if (typeof value !== "string") return DEFAULT_DOCUMENT_TYPE;
  const normalized = safeSegment(value);
  return normalized === "" ? DEFAULT_DOCUMENT_TYPE : normalized;
}

/**
 * Reduces one path segment to characters that cannot change the shape of the
 * path. `..` and separators are removed rather than escaped, so a crafted
 * `doc_type` or filename cannot walk out of its prefix.
 */
function safeSegment(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/-{2,}/g, "-")
    .replace(/^[.\-]+|[.\-]+$/g, "")
    .slice(0, 64);
}

const MAX_FILENAME_LENGTH = 120;

/**
 * The original filename is caller-supplied and ends up in a blob name, so it is
 * reduced to a safe leaf: any directory part is dropped first, because only the
 * leaf is meaningful and keeping it would let the caller choose the prefix.
 * The extension is preserved through truncation so the stored blob still reads
 * as the type it is.
 */
export function safeFilename(value: string): string {
  const leaf = value.split(/[/\\]/).pop() ?? "";
  const cleaned = leaf
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/-{2,}/g, "-")
    .replace(/^[.\-]+/, "");

  if (cleaned === "") return "file";
  if (cleaned.length <= MAX_FILENAME_LENGTH) return cleaned;

  const dot = cleaned.lastIndexOf(".");
  if (dot <= 0 || cleaned.length - dot > 12) return cleaned.slice(0, MAX_FILENAME_LENGTH);

  const extension = cleaned.slice(dot);
  return cleaned.slice(0, MAX_FILENAME_LENGTH - extension.length) + extension;
}

/** A document hangs off exactly one parent, matching the schema's check constraint. */
export type DocumentParent =
  | { readonly kind: "site"; readonly id: string }
  | { readonly kind: "project"; readonly id: string };

export function siteDocumentParent(siteId: string): DocumentParent {
  return { kind: "site", id: siteId };
}

export function projectDocumentParent(projectId: string): DocumentParent {
  return { kind: "project", id: projectId };
}

export interface DocumentBlobLocation {
  readonly container: DocumentContainer;
  /** Blob name within the container — never includes the container itself. */
  readonly blobName: string;
}

export interface BuildBlobPathInput {
  readonly ownerUserId: string;
  readonly parent: DocumentParent;
  readonly documentId: string;
  readonly docType: string;
  readonly originalFilename: string;
  readonly disclosureClass: DocumentDisclosureClass;
}

/**
 * `owners/{ownerId}/sites/{siteId}/{docType}/{documentId}/{filename}`
 *
 * Grouped owner first, then the thing the documents belong to, so listing one
 * prefix returns everything for one owner and a second segment narrows it to a
 * single project. Browsing by hand goes owner → project → document type, which
 * is how anyone looking for "the electricity bill for that Atlanta rooftop"
 * actually searches.
 *
 * The project scope is keyed by the *site* id, not the project id, and that is
 * deliberate. A project is created from a site at acceptance and the two are
 * one-to-one (`project.siteId`), but documents arrive during intake — before a
 * project exists at all. A blob path is immutable once written into
 * `documents.blob_path`, so anchoring on the project id would leave every
 * intake document stranded under a prefix the project never uses, and the
 * alternative is copying every blob at acceptance. Keying on the site id gives
 * one stable prefix from first upload through operations.
 *
 * `projects/{projectId}` remains for documents whose parent genuinely is a
 * project — an underwriting summary produced after acceptance has no
 * site-stage equivalent.
 *
 * The document id is its own segment rather than a filename prefix so two
 * uploads of the same filename cannot collide, and so a blob can be located
 * from the record without re-deriving a timestamp.
 */
export function buildDocumentBlobLocation(input: BuildBlobPathInput): DocumentBlobLocation {
  const prefix = input.parent.kind === "site" ? "sites" : "projects";
  const blobName = [
    "owners",
    input.ownerUserId,
    prefix,
    input.parent.id,
    normalizeDocType(input.docType),
    input.documentId,
    safeFilename(input.originalFilename),
  ].join("/");

  return { container: containerForDisclosure(input.disclosureClass), blobName };
}

/**
 * Stored in `documents.blob_path` as `{container}/{blobName}`.
 *
 * Fully qualified rather than container-derived-from-disclosure-class: the
 * record then locates its own blob without depending on a second column, which
 * keeps it correct if a document is ever re-disclosed and copied.
 */
export function formatBlobPath(location: DocumentBlobLocation): string {
  return `${location.container}/${location.blobName}`;
}

export function parseBlobPath(blobPath: string): DocumentBlobLocation | null {
  const separator = blobPath.indexOf("/");
  if (separator <= 0) return null;

  const container = blobPath.slice(0, separator);
  const blobName = blobPath.slice(separator + 1);
  if (blobName === "") return null;
  if (!isDocumentContainer(container)) return null;

  return { container, blobName };
}

export function isDocumentContainer(value: string): value is DocumentContainer {
  return Object.values(DOCUMENT_CONTAINERS).some((container) => container === value);
}

/**
 * The bytes side of a document, as `core` needs it.
 *
 * Declared here rather than imported from `src/backend/blob` because the
 * dependency runs the other way — `blob` imports this module for the layout,
 * so `core` importing `blob` back would be a cycle. `core` owns the port and
 * `blob` supplies the adapter, which is the same shape `ViabilityClient` uses
 * in `core/sites`: the workflow stays testable with no Azure anywhere near it.
 */
export interface DocumentBlobPort {
  upload(location: DocumentBlobLocation, body: Uint8Array, contentType: string): Promise<void>;
  download(location: DocumentBlobLocation): Promise<Uint8Array | null>;
}
