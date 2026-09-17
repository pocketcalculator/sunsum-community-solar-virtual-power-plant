// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildDocumentBlobLocation,
  containerForDisclosure,
  DEFAULT_DOCUMENT_TYPE,
  DOCUMENT_CONTAINERS,
  DOCUMENT_DISCLOSURE_CLASSES,
  formatBlobPath,
  normalizeDocType,
  parseBlobPath,
  projectDocumentParent,
  safeFilename,
  siteDocumentParent,
} from "@/backend/core";
import { demoBackendStore } from "@/backend/core/store";
import { DEMO_SITE_OWNER_USER_ID } from "@/backend/demo-principals";

const OWNER_ID = "00000000-0000-4000-8000-0000000000aa";
const SITE_ID = "11111111-1111-4111-8111-111111111111";
const DOCUMENT_ID = "22222222-2222-4222-8222-222222222222";

describe("document blob layout", () => {
  it("gives every disclosure class its own container", () => {
    const containers = DOCUMENT_DISCLOSURE_CLASSES.map((c) => containerForDisclosure(c));
    expect(new Set(containers).size).toBe(DOCUMENT_DISCLOSURE_CLASSES.length);
    expect(DOCUMENT_CONTAINERS.owner_private).toBe("owner-private");
    expect(DOCUMENT_CONTAINERS.investor_tier_1).toBe("investor-tier-1");
  });

  it("routes an owner-private document away from the investor container", () => {
    const location = buildDocumentBlobLocation({
      ownerUserId: OWNER_ID,
      parent: siteDocumentParent(SITE_ID),
      documentId: DOCUMENT_ID,
      docType: "electricity_bill",
      originalFilename: "march-bill.pdf",
      disclosureClass: "owner_private",
    });
    expect(location.container).toBe("owner-private");
    expect(location.blobName).toBe(
      `owners/${OWNER_ID}/sites/${SITE_ID}/electricity_bill/${DOCUMENT_ID}/march-bill.pdf`,
    );
  });

  /**
   * The point of the owner segment: one prefix lists everything belonging to
   * one owner, and a second narrows it to a single project.
   */
  it("groups every document for one owner under a single prefix", () => {
    const other = buildDocumentBlobLocation({
      ownerUserId: OWNER_ID,
      parent: siteDocumentParent("99999999-9999-4999-8999-999999999999"),
      documentId: DOCUMENT_ID,
      docType: "site_photo",
      originalFilename: "roof.jpg",
      disclosureClass: "owner_private",
    });
    const mine = buildDocumentBlobLocation({
      ownerUserId: OWNER_ID,
      parent: siteDocumentParent(SITE_ID),
      documentId: DOCUMENT_ID,
      docType: "electricity_bill",
      originalFilename: "bill.pdf",
      disclosureClass: "owner_private",
    });

    expect(mine.blobName.startsWith(`owners/${OWNER_ID}/`)).toBe(true);
    expect(other.blobName.startsWith(`owners/${OWNER_ID}/`)).toBe(true);
    expect(mine.blobName.startsWith(`owners/${OWNER_ID}/sites/${SITE_ID}/`)).toBe(true);
    expect(other.blobName.startsWith(`owners/${OWNER_ID}/sites/${SITE_ID}/`)).toBe(false);
  });

  it("prefixes project documents separately from site documents", () => {
    const location = buildDocumentBlobLocation({
      ownerUserId: OWNER_ID,
      parent: projectDocumentParent(SITE_ID),
      documentId: DOCUMENT_ID,
      docType: "land_report",
      originalFilename: "survey.pdf",
      disclosureClass: "investor_tier_1",
    });
    expect(location.blobName.startsWith(`owners/${OWNER_ID}/projects/`)).toBe(true);
    expect(location.container).toBe("investor-tier-1");
  });

  it("separates two uploads of the same filename", () => {
    const base = {
      ownerUserId: OWNER_ID,
      parent: siteDocumentParent(SITE_ID),
      docType: "site_photo",
      originalFilename: "photo.jpg",
      disclosureClass: "owner_private",
    } as const;
    const first = buildDocumentBlobLocation({ ...base, documentId: DOCUMENT_ID });
    const second = buildDocumentBlobLocation({ ...base, documentId: "33333333-3333-4333-8333-333333333333" });
    expect(first.blobName).not.toBe(second.blobName);
  });

  /**
   * The filename and doc type are caller-supplied and both become path
   * segments, so a crafted value must not be able to walk out of its prefix
   * into another site — or, worse, into the other container's layout.
   */
  it("refuses to let a crafted filename escape its prefix", () => {
    const location = buildDocumentBlobLocation({
      ownerUserId: OWNER_ID,
      parent: siteDocumentParent(SITE_ID),
      documentId: DOCUMENT_ID,
      docType: "site_photo",
      originalFilename: "../../../etc/passwd",
      disclosureClass: "owner_private",
    });
    expect(location.blobName).toBe(
      `owners/${OWNER_ID}/sites/${SITE_ID}/site_photo/${DOCUMENT_ID}/passwd`,
    );
    expect(location.blobName).not.toContain("..");
  });

  it("refuses to let a crafted doc type escape its prefix", () => {
    const location = buildDocumentBlobLocation({
      ownerUserId: OWNER_ID,
      parent: siteDocumentParent(SITE_ID),
      documentId: DOCUMENT_ID,
      docType: "../../owner-private",
      originalFilename: "a.pdf",
      disclosureClass: "investor_tier_1",
    });
    expect(location.blobName).not.toContain("..");
    expect(location.blobName.split("/")).toHaveLength(7);
  });

  it.each([
    ["..", "file"],
    ["", "file"],
    ["  ", "file"],
    ["C:\\Users\\me\\bill.pdf", "bill.pdf"],
    ["a/b/c/report.pdf", "report.pdf"],
    [".hidden", "hidden"],
  ])("reduces %j to a safe leaf", (input, expected) => {
    expect(safeFilename(input)).toBe(expected);
  });

  it("keeps the extension when truncating a long filename", () => {
    const name = `${"a".repeat(300)}.pdf`;
    const safe = safeFilename(name);
    expect(safe.length).toBeLessThanOrEqual(120);
    expect(safe.endsWith(".pdf")).toBe(true);
  });

  /**
   * `documents.doc_type` is NOT NULL with no column default, so the absent case
   * has to resolve to a value here or the insert fails against PostgreSQL.
   */
  it.each([[null], [undefined], [""], ["   "]])("resolves %j to the default doc type", (value) => {
    expect(normalizeDocType(value as string | null | undefined)).toBe(DEFAULT_DOCUMENT_TYPE);
  });

  it("never returns null or empty for any input", () => {
    for (const value of [null, undefined, "", "...", "---", "Screening Report", "LAND report"]) {
      const normalized = normalizeDocType(value as string | null | undefined);
      expect(normalized.length).toBeGreaterThan(0);
      expect(normalized).not.toContain("/");
    }
  });

  it("round-trips a stored path back to a container and blob name", () => {
    const location = buildDocumentBlobLocation({
      ownerUserId: OWNER_ID,
      parent: siteDocumentParent(SITE_ID),
      documentId: DOCUMENT_ID,
      docType: "screening_report",
      originalFilename: "screening.pdf",
      disclosureClass: "investor_tier_1",
    });
    const stored = formatBlobPath(location);
    expect(stored).toBe(`investor-tier-1/${location.blobName}`);
    expect(parseBlobPath(stored)).toEqual(location);
  });

  it.each([["", null], ["no-slash", null], ["owner-private/", null], ["not-a-container/x/y", null]])(
    "rejects %j as a stored path",
    (input, expected) => {
      expect(parseBlobPath(input)).toBe(expected);
    },
  );
});

/**
 * `core/store` builds its demo document's `blobPath` by hand, because importing
 * `core/documents` for the builder would close a cycle. That duplication is the
 * kind that rots silently, so it is pinned here instead: if the layout changes
 * and the demo store is not updated, this fails.
 */
describe("the demo store's blob path matches the layout builder", () => {
  it("parses, and is exactly what the builder would produce", async () => {
    const projects = await demoBackendStore.listProjects();
    expect(projects.length).toBeGreaterThan(0);

    const documents = await demoBackendStore.listDocuments("", projects[0]!.id);
    const document = documents[0];
    expect(document).toBeDefined();
    expect(document!.projectId).not.toBeNull();

    const parsed = parseBlobPath(document!.blobPath);
    expect(parsed).not.toBeNull();

    const rebuilt = buildDocumentBlobLocation({
      ownerUserId: DEMO_SITE_OWNER_USER_ID,
      parent: projectDocumentParent(document!.projectId!),
      documentId: document!.id,
      docType: document!.docType,
      originalFilename: document!.originalFilename,
      disclosureClass: document!.disclosureClass,
    });

    expect(document!.blobPath).toBe(formatBlobPath(rebuilt));
  });
});
