// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  placeholderPdf,
  placeholderPdfMinimumBytes,
  seededDocuments,
} from "../../../scripts/blob.mjs";

/**
 * The seeded blobs must be *exactly* the size their document row claims,
 * because `putSiteDocumentContent` rejects bytes that disagree with
 * `size_bytes` — filler of the wrong length would make the seeded documents the
 * one case the API itself refuses.
 *
 * The padding arithmetic has awkward boundaries (no room for a comment, room
 * for only a terminator, exactly one line) and an off-by-one there is invisible
 * until something downloads the file. These pin it.
 */
/**
 * The first capture group, or a failure naming what was missing.
 *
 * A structural assertion that quietly returns when its regex does not match is
 * a test that passes on a broken file, which is the opposite of the point here.
 */
function capture(pattern: RegExp, text: string, what: string): string {
  const found = pattern.exec(text)?.[1];
  if (found === undefined) throw new Error(`The placeholder PDF has no ${what}.`);
  return found;
}

describe("placeholder PDF", () => {
  const MINIMUM = placeholderPdfMinimumBytes("bill.pdf");

  it("cannot be built smaller than its own structure", () => {
    expect(() => placeholderPdf(MINIMUM - 1, "bill.pdf")).toThrow(/cannot be smaller/);
  });

  it("can be built at exactly its own structure, with nothing left over", () => {
    expect(placeholderPdf(MINIMUM, "bill.pdf").byteLength).toBe(MINIMUM);
  });

  it.each([
    ["one byte, too small for a comment", 1],
    ["the smallest possible comment", 2],
    ["a partial line", 37],
    ["exactly one full line", 64],
    ["one full line plus a byte", 65],
    ["one full line plus a comment", 66],
    ["many lines", 4096],
    ["the size of the seeded electricity bill", 184_320 - MINIMUM],
  ])("is exactly the requested size with %s of padding", (_label, padding) => {
    expect(placeholderPdf(MINIMUM + padding, "bill.pdf").byteLength).toBe(MINIMUM + padding);
  });

  /** The title is drawn on the page, so a longer one leaves less room for padding. */
  it("accounts for the title in its own minimum", () => {
    expect(placeholderPdfMinimumBytes("a-considerably-longer-filename.pdf")).toBeGreaterThan(
      MINIMUM,
    );
  });

  it("is a structurally sound PDF whose xref offsets all resolve", () => {
    const text = placeholderPdf(9000, "march bill.pdf").toString("latin1");

    expect(text.startsWith("%PDF-1.4\n")).toBe(true);
    expect(text.endsWith("%%EOF\n")).toBe(true);

    /** `startxref` must point at the real `xref` keyword, not near it. */
    const startxref = Number(capture(/startxref\n(\d+)\n%%EOF\n$/, text, "startxref"));
    expect(text.slice(startxref, startxref + 4)).toBe("xref");

    const count = Number(capture(/xref\n0 (\d+)\n/, text, "xref size"));
    const table = capture(/xref\n0 \d+\n([\s\S]*?)trailer/, text, "xref table");

    /** Entry 0 is the free-list head, so the object offsets start at index 1. */
    const offsets = table.trimEnd().split("\n").slice(1);
    expect(offsets).toHaveLength(count - 1);

    offsets.forEach((entry, index) => {
      expect(text.slice(Number(entry.slice(0, 10)))).toMatch(new RegExp(`^${index + 1} 0 obj\\n`));
    });
  });

  /**
   * The spec asks that lines stay under 255 characters. A single 180 KB padding
   * line satisfied every other assertion here and would still have been refused
   * by a strict reader.
   */
  it("keeps every line within the length the spec asks for", () => {
    const lines = placeholderPdf(200_000, "bill.pdf").toString("latin1").split("\n");
    expect(Math.max(...lines.map((line) => line.length))).toBeLessThan(255);
  });

  it("escapes a filename that would otherwise break the content stream", () => {
    const text = placeholderPdf(9000, "bill (final) \\ v2.pdf").toString("latin1");
    expect(text).toContain("bill \\(final\\) \\\\ v2.pdf");
  });
});

describe("seeded document list", () => {
  const documents = seededDocuments();

  it("finds every documents row in seed.sql", () => {
    expect(documents.length).toBeGreaterThanOrEqual(2);
  });

  it("reads a fully qualified path, a positive size and a content type for each", () => {
    for (const document of documents) {
      expect(document.blobPath).toMatch(/^(owner-private|investor-tier-1)\/owners\//);
      expect(document.sizeBytes).toBeGreaterThan(0);
      expect(Number.isInteger(document.sizeBytes)).toBe(true);
      expect(document.contentType).toBe("application/pdf");
      expect(document.filename).toMatch(/\.pdf$/);
    }
  });

  /**
   * The point of parsing seed.sql rather than restating the paths: if the seed
   * moves a document, the placeholder follows it without anyone remembering to
   * update a second list.
   */
  it("covers both disclosure containers, so the demo has one of each", () => {
    const containers = new Set(documents.map((item) => item.blobPath.split("/")[0]));
    expect([...containers].sort()).toEqual(["investor-tier-1", "owner-private"]);
  });

  it("can build a placeholder for every row it found", () => {
    for (const document of documents) {
      expect(placeholderPdf(document.sizeBytes, document.filename).byteLength).toBe(
        document.sizeBytes,
      );
    }
  });
});
