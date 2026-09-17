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
      parent: siteDocumentParent(SITE_ID),
      documentId: DOCUMENT_ID,
      docType: "electricity_bill",
      originalFilename: "march-bill.pdf",
      disclosureClass: "owner_private",
    });
    expect(location.container).toBe("owner-private");
    expect(location.blobName).toBe(
      `sites/${SITE_ID}/electricity_bill/${DOCUMENT_ID}/march-bill.pdf`,
    );
  });

  it("prefixes project documents separately from site documents", () => {
    const location = buildDocumentBlobLocation({
      parent: projectDocumentParent(SITE_ID),
      documentId: DOCUMENT_ID,
      docType: "land_report",
      originalFilename: "survey.pdf",
      disclosureClass: "investor_tier_1",
    });
    expect(location.blobName.startsWith("projects/")).toBe(true);
    expect(location.container).toBe("investor-tier-1");
  });

  it("separates two uploads of the same filename", () => {
    const base = {
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
      parent: siteDocumentParent(SITE_ID),
      documentId: DOCUMENT_ID,
      docType: "site_photo",
      originalFilename: "../../../etc/passwd",
      disclosureClass: "owner_private",
    });
    expect(location.blobName).toBe(`sites/${SITE_ID}/site_photo/${DOCUMENT_ID}/passwd`);
    expect(location.blobName).not.toContain("..");
  });

  it("refuses to let a crafted doc type escape its prefix", () => {
    const location = buildDocumentBlobLocation({
      parent: siteDocumentParent(SITE_ID),
      documentId: DOCUMENT_ID,
      docType: "../../owner-private",
      originalFilename: "a.pdf",
      disclosureClass: "investor_tier_1",
    });
    expect(location.blobName).not.toContain("..");
    expect(location.blobName.split("/")).toHaveLength(5);
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
