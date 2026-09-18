/**
 * `GET /export` — the caller downloads their own projects and documents.
 *
 * One endpoint for all three roles rather than three endpoints, because the
 * thing a user asks for ("export my stuff") is the same question in each case
 * and only the answer differs. Core decides what the role may see; this file
 * decides only how it is encoded and that it arrives as a download.
 *
 * There is no `requireRole` here for that reason — every authenticated role has
 * an export. An anonymous caller still gets `401` from `resolveViewer`.
 */

import {
  buildExport,
  exportFilename,
  isExportFormat,
  toCsv,
  type ExportBundle,
  type ExportFormat,
} from "../../core/export";
import type { Viewer } from "../../core/identity";
import { failure, type Result } from "../../core/shared";
import { demoBackendStore, type BackendStore } from "../../core/store";
import { resolveViewer } from "../identity";
import { failureResponse } from "../shared";

const CONTENT_TYPE_BY_FORMAT: Record<ExportFormat, string> = {
  json: "application/json; charset=utf-8",
  csv: "text/csv; charset=utf-8",
};

/**
 * Reads `?format=`.
 *
 * An unrecognised value is refused rather than silently treated as JSON: a
 * caller that asked for `xlsx` wants to know we cannot produce one, and a
 * download that arrives in the wrong format is harder to notice than an error.
 */
export function parseExportFormat(url: string): Result<ExportFormat> {
  let requested: string | null;
  try {
    requested = new URL(url).searchParams.get("format");
  } catch {
    return failure("invalid_query", "Could not read the request URL.");
  }

  if (requested === null || requested === "") return { ok: true, value: "json" };

  const normalised = requested.trim().toLowerCase();
  if (!isExportFormat(normalised)) {
    return failure("invalid_query", 'format must be "json" or "csv".', {
      field: "format",
    });
  }
  return { ok: true, value: normalised };
}

function body(bundle: ExportBundle, format: ExportFormat): string {
  return format === "csv" ? toCsv(bundle) : `${JSON.stringify(bundle, null, 2)}\n`;
}

export async function handleGetExport(
  viewer: Viewer,
  format: ExportFormat,
  store: BackendStore = demoBackendStore,
  now: Date = new Date(),
): Promise<Response> {
  const bundle = await buildExport(viewer, store, now);
  if (!bundle.ok) return failureResponse(bundle.failure);

  return new Response(body(bundle.value, format), {
    status: 200,
    headers: {
      "content-type": CONTENT_TYPE_BY_FORMAT[format],
      /**
       * The same three headers the document download sets, for the same
       * reasons: `attachment` so nothing here is ever rendered in the origin,
       * RFC 5987 encoding because the filename is composed rather than fixed,
       * and `no-store` because an export is scoped to one caller and must not
       * sit in a shared cache.
       */
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
        exportFilename(bundle.value, format),
      )}`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function getExportRoute(request: Request): Promise<Response> {
  const viewer = await resolveViewer(request);
  if (!viewer.ok) return failureResponse(viewer.failure);

  const format = parseExportFormat(request.url);
  if (!format.ok) return failureResponse(format.failure);

  return handleGetExport(viewer.value, format.value);
}
