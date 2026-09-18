/**
 * Types for the pure helpers in `blob.mjs`, so `blob-seed.test.ts` can be type
 * checked like the rest of the suite.
 *
 * Hand-written because the script is plain `.mjs` run straight by Node with no
 * build step, and `allowJs` is off. Only the two exports the test needs are
 * declared; the emulator-facing tasks stay out of the type system because
 * nothing type checked calls them.
 */

/** A `documents` row read out of `src/backend/db/seed.sql`. */
export interface SeededDocument {
  /** Container-qualified: `site-documents/owners/{ownerId}/...`. */
  readonly blobPath: string;
  readonly filename: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}

export function seededDocuments(): SeededDocument[];

/** The smallest a placeholder for this title can be, before any padding. */
export function placeholderPdfMinimumBytes(title: string): number;

/** A valid one-page PDF of exactly `byteLength` bytes. Throws below the minimum. */
export function placeholderPdf(byteLength: number, title: string): Buffer;
