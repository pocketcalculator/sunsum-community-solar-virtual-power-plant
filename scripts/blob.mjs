#!/usr/bin/env node
/**
 * Blob tasks: `seed`, `list`.
 *
 * Azurite starts empty, and `npm run db:seed` only creates document *rows* —
 * so without this, every seeded document exists in the database and returns
 * 404 from `GET /sites/{id}/documents/{id}/content`. This writes a placeholder
 * file for each one, so the demo has something to download.
 *
 *   node scripts/blob.mjs seed   write a placeholder for every seeded document
 *   node scripts/blob.mjs list   show what is actually in the containers
 *
 * The rows come from `src/backend/db/seed.sql` — the same file `db:seed` loads,
 * so the paths here cannot drift from the ones the database holds, and neither
 * a running database nor Docker is needed to run this.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { BlobServiceClient } from "@azure/storage-blob";

import { loadLocalEnv, root } from "./env.mjs";

loadLocalEnv();

/**
 * Azurite's published development credential — the same fixed string in every
 * installation, reaching nothing but a local emulator. It is duplicated from
 * `src/backend/blob/index.ts` because this is a plain Node script and that is a
 * TypeScript module; `assertEmulator` below is what stops the two drifting into
 * something that matters, by refusing any endpoint that is not local.
 */
const AZURITE_CONNECTION_STRING =
  "DefaultEndpointsProtocol=http;" +
  "AccountName=devstoreaccount1;" +
  "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;" +
  "BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;";

const connectionString =
  process.env.AZURE_STORAGE_CONNECTION_STRING ?? AZURITE_CONNECTION_STRING;

/**
 * Refuse to touch anything that is not obviously a local emulator.
 *
 * This writes placeholder junk over whatever is at those paths. Against the
 * shared dev account that would replace real uploads with filler, so the check
 * matters more here than it does for the database equivalent.
 */
function assertEmulator() {
  const endpoint = /BlobEndpoint=([^;]+)/.exec(connectionString)?.[1];
  const host = endpoint ? new URL(endpoint).hostname : "";

  if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
    console.error(
      `Refusing to write to ${host || "an unknown host"}: this tool writes placeholder\n` +
        "files and is for the local emulator only. Start it with `npm run blob:up`.",
    );
    process.exit(1);
  }
}

/**
 * Pulls the document rows out of the seed file.
 *
 * Parsing SQL with a regex is usually a bad idea; it is defensible here because
 * the input is one file in this repository, written by us, and the alternative
 * — restating the paths in a second place — is the failure this is avoiding.
 * An unparseable statement throws rather than being skipped, so a reformatted
 * seed cannot quietly stop seeding blobs.
 */
export function seededDocuments() {
  const sql = readFileSync(join(root, "src", "backend", "db", "seed.sql"), "utf8");
  const statements = [
    ...sql.matchAll(/INSERT INTO documents\s*\(([^)]*)\)\s*VALUES\s*\(([\s\S]*?)\)\s*ON CONFLICT/g),
  ];

  if (statements.length === 0) {
    throw new Error("No `INSERT INTO documents ... ON CONFLICT` statements found in seed.sql.");
  }

  return statements.map(([, rawColumns, rawValues]) => {
    const columns = rawColumns.split(",").map((column) => column.trim());
    const values = splitValues(rawValues);

    if (columns.length !== values.length) {
      throw new Error(
        `seed.sql: ${columns.length} columns but ${values.length} values in one documents row.`,
      );
    }

    const row = Object.fromEntries(columns.map((column, index) => [column, values[index]]));

    for (const required of ["blob_path", "original_filename", "content_type", "size_bytes"]) {
      if (row[required] === undefined) {
        throw new Error(`seed.sql: a documents row is missing ${required}.`);
      }
    }

    return {
      blobPath: row.blob_path,
      filename: row.original_filename,
      contentType: row.content_type,
      sizeBytes: Number(row.size_bytes),
    };
  });
}

/**
 * Splits one VALUES tuple on commas that are not inside a quoted literal, and
 * unescapes SQL's doubled single quote. Values here are only strings and
 * integers — no nested parentheses, no functions.
 */
function splitValues(raw) {
  const values = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];

    if (quoted) {
      if (character === "'" && raw[index + 1] === "'") {
        current += "'";
        index += 1;
      } else if (character === "'") {
        quoted = false;
      } else {
        current += character;
      }
      continue;
    }

    if (character === "'") {
      quoted = true;
    } else if (character === ",") {
      values.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }

  values.push(current.trim());
  return values;
}

/** Ten digits covers any file this script will ever write, and is fixed-width. */
const STARTXREF_WIDTH = 10;

/**
 * The structural parts of the placeholder, with no padding yet.
 *
 * Separated so the minimum size can be asked for without building a file and
 * catching a throw. It depends on the title, which is drawn on the page, so it
 * is not a constant.
 */
function pdfSkeleton(title) {
  const text = title.replace(/([\\()])/g, "\\$1");
  const stream =
    "BT /F1 16 Tf 72 720 Td (SunSum Solar placeholder) Tj " +
    `0 -24 Td /F1 11 Tf (${text}) Tj ` +
    "0 -18 Td (Seeded by scripts/blob.mjs. Not a real document.) Tj ET";

  const bodies = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
      "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let head = "%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n";
  const offsets = [];

  bodies.forEach((body, index) => {
    offsets.push(head.length);
    head += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const trailer =
    `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n` +
    offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n`;

  return { head, trailer, tail: "\n%%EOF\n" };
}

/** The smallest a placeholder for this title can be — its structure with no padding. */
export function placeholderPdfMinimumBytes(title) {
  const { head, trailer, tail } = pdfSkeleton(title);
  return head.length + trailer.length + STARTXREF_WIDTH + tail.length;
}

/**
 * A valid PDF of exactly `byteLength` bytes.
 *
 * Exact, because the document row already claims a size and the upload endpoint
 * rejects bytes that disagree with it — filler of the wrong length would make
 * the seeded rows the one case the API itself would refuse. Valid, because a
 * file that opens in a viewer is worth more in a demo than random bytes, and
 * costs a few lines here.
 *
 * The padding is a block of PDF comments placed after the last object and
 * before `xref`, so no object offset depends on it, and `startxref` is written
 * zero-padded to a fixed width so its own length does not shift the total.
 */
export function placeholderPdf(byteLength, title) {
  const { head, trailer, tail } = pdfSkeleton(title);
  const base = placeholderPdfMinimumBytes(title);
  const padding = byteLength - base;

  if (padding < 0) {
    throw new Error(
      `A placeholder PDF cannot be smaller than ${base} bytes; asked for ${byteLength}.`,
    );
  }

  const comment = commentPadding(padding);
  const xrefOffset = head.length + comment.length;
  const file =
    head + comment + trailer + String(xrefOffset).padStart(STARTXREF_WIDTH, "0") + tail;

  /** Latin-1 keeps the binary marker one byte per character, as the header needs. */
  const bytes = Buffer.from(file, "latin1");

  if (bytes.byteLength !== byteLength) {
    throw new Error(`Placeholder is ${bytes.byteLength} bytes, expected ${byteLength}.`);
  }

  return bytes;
}

/**
 * Exactly `length` bytes of PDF comment lines, each well under the 255-character
 * limit the spec asks for. A single byte cannot hold `%` plus its terminator, so
 * that one case is a bare newline instead.
 */
function commentPadding(length) {
  const lineLength = 64;
  let remaining = length;
  let padding = "";

  while (remaining >= lineLength) {
    padding += `%${"0".repeat(lineLength - 2)}\n`;
    remaining -= lineLength;
  }

  if (remaining === 1) {
    padding += "\n";
  } else if (remaining >= 2) {
    padding += `%${"0".repeat(remaining - 2)}\n`;
  }

  return padding;
}

function service() {
  return BlobServiceClient.fromConnectionString(connectionString);
}

function split(blobPath) {
  const separator = blobPath.indexOf("/");
  return {
    container: blobPath.slice(0, separator),
    blobName: blobPath.slice(separator + 1),
  };
}

const tasks = {
  async seed() {
    assertEmulator();
    const client = service();
    const documents = seededDocuments();

    for (const document of documents) {
      const { container, blobName } = split(document.blobPath);
      const containerClient = client.getContainerClient(container);
      await containerClient.createIfNotExists();

      const body = placeholderPdf(document.sizeBytes, document.filename);
      await containerClient.getBlockBlobClient(blobName).uploadData(body, {
        blobHTTPHeaders: { blobContentType: document.contentType },
      });

      console.log(`  ${document.blobPath} (${body.byteLength} bytes)`);
    }

    console.log(
      `\nSeeded ${documents.length} placeholder document(s) from seed.sql.\n` +
        "Sizes match the `size_bytes` on each row, so the API serves them unchanged.",
    );
  },

  async list() {
    const client = service();

    for await (const container of client.listContainers()) {
      console.log(`\n${container.name}`);
      const containerClient = client.getContainerClient(container.name);
      let empty = true;

      for await (const blob of containerClient.listBlobsFlat()) {
        empty = false;
        console.log(`  ${blob.name} (${blob.properties.contentLength} bytes)`);
      }

      if (empty) {
        console.log("  (empty)");
      }
    }
  },
};

const task = process.argv[2] ?? "";

/**
 * Only dispatch when run as a script. The pure helpers above are exported so
 * `tests/unit/backend/blob-seed.test.ts` can exercise the exact-size arithmetic
 * without a running emulator, and importing a module must not run a CLI.
 */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!Object.hasOwn(tasks, task)) {
    console.error(`Usage: node scripts/blob.mjs <${Object.keys(tasks).join("|")}>`);
    process.exit(1);
  }

  try {
    await tasks[task]();
  } catch (error) {
    console.error(`\n${task} failed:\n`);
    console.error(error.message ?? error);
    console.error("\nIs the emulator running? Start it with `npm run blob:up`.");
    process.exit(1);
  }
}
