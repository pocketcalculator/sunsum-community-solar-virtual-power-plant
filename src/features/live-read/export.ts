import { LIVE_READ_LIMITS } from "./constants";
import { rejectRead } from "./errors";
import type { LiveExportManifest, ReadDownload } from "./types";
import {
  choice, count, id, journeyStages, optionalId, projectStages, range, safeFileName,
  siteTypes, submissionStatuses, text, timestamp, viabilityStatuses,
} from "./values";

function csvCell(value: string | number | null): string {
  if (value === null) return '""';
  let encoded = String(value).replaceAll("\u0000", "");
  if (typeof value === "string" &&
    (/^[\s\u0000-\u001f\u007f]*[=+\-@]/.test(encoded) || /^[\t\r\n]/.test(encoded))) {
    encoded = `'${encoded}`;
  }
  return `"${encoded.replaceAll('"', '""')}"`;
}

export function formatReadExport(
  manifest: LiveExportManifest,
  format: "json" | "csv",
): ReadDownload {
  if (format !== "json" && format !== "csv") {
    rejectRead("invalid", "Only local JSON and CSV manifest encodings are admitted.", "invalid_format");
  }
  if (!["site-owner", "operator", "investor"].includes(manifest.identity.role) ||
    manifest.scope.role !== manifest.identity.role || manifest.scope.userId !== manifest.identity.userId) {
    rejectRead("invalid", "The normalized manifest scope is inconsistent.", "invalid_export_scope");
  }
  if (manifest.projects.length + manifest.documents.length > LIVE_READ_LIMITS.maxItems) {
    rejectRead("too-large", "The manifest exceeds the admitted item limit.", "item_limit");
  }
  const investor = manifest.identity.role === "investor";
  const projects = manifest.projects.map((project) => ({
    siteId: investor ? null : optionalId(project.siteId),
    projectId: optionalId(project.projectId),
    name: text(project.name),
    address: investor ? null : text(project.address),
    locality: text(project.locality),
    siteType: choice(project.siteType, siteTypes),
    submissionStatus: investor ? null : choice(project.submissionStatus, submissionStatuses),
    projectStage: choice(project.projectStage, projectStages),
    journeyStageId: choice(project.journeyStageId, journeyStages),
    viabilityStatus: choice(project.viabilityStatus, viabilityStatuses),
    estimatedSystemSizeKw: range({
      low: project.estimatedSystemSizeKw.low,
      high: project.estimatedSystemSizeKw.high,
    }, "low", "high", "kW"),
    estimatedAnnualGenerationKwh: range({
      low: project.estimatedAnnualGenerationKwh.low,
      high: project.estimatedAnnualGenerationKwh.high,
    }, "low", "high", "kWh/year"),
    updatedAt: investor ? null : timestamp(project.updatedAt),
  }));
  const documents = manifest.documents.map((document) => ({
    id: id(document.id),
    siteId: investor ? null : optionalId(document.siteId),
    projectId: investor ? null : optionalId(document.projectId),
    fileName: text(document.fileName) === null ? null : safeFileName(document.fileName),
    contentType: text(document.contentType),
    sizeBytes: count(document.sizeBytes),
    docType: text(document.docType),
    createdAt: timestamp(document.createdAt),
  }));
  const generatedAt = timestamp(manifest.generatedAt);
  const provenance = {
    source: manifest.provenance.source,
    mode: choice(manifest.provenance.mode, ["connected", "server-demo"]),
    store: choice(manifest.provenance.store, ["database-configured", "mock-configured"]),
    contractRevision: text(manifest.provenance.contractRevision),
    deployedRevision: text(manifest.provenance.deployedRevision),
    retrievedAt: timestamp(manifest.provenance.retrievedAt),
  };
  const encodedManifest = {
    role: manifest.identity.role,
    userId: id(manifest.identity.userId),
    scopeLabel: text(manifest.scopeLabel),
    generatedAt,
    provenance,
    reportedProjectCount: count(manifest.reportedProjectCount),
    reportedDocumentCount: count(manifest.reportedDocumentCount),
    projects,
    documents,
  };
  let encoded: string;
  if (format === "json") {
    encoded = JSON.stringify(encodedManifest, null, 2)
      .replaceAll("<", "\\u003c")
      .replaceAll(">", "\\u003e")
      .replaceAll("&", "\\u0026")
      .replaceAll("\u2028", "\\u2028")
      .replaceAll("\u2029", "\\u2029");
    encoded += "\n";
  } else {
    const rows: (readonly (string | number | null)[])[] = [
      ["SUNSUM normalized read manifest"],
      ["role", encodedManifest.role],
      ["user_id", encodedManifest.userId],
      ["scope", encodedManifest.scopeLabel],
      ["generated_at", generatedAt],
      ["source", provenance.source],
      ["source_mode", provenance.mode],
      ["source_store", provenance.store],
      ["contract_revision", provenance.contractRevision],
      ["deployed_revision", provenance.deployedRevision],
      ["retrieved_at", provenance.retrievedAt],
      ["reported_project_count", encodedManifest.reportedProjectCount],
      ["reported_document_count", encodedManifest.reportedDocumentCount],
      [],
      ["projects"],
      [
        "site_id", "project_id", "name", "address", "locality", "site_type",
        "submission_status", "project_stage", "journey_stage_id", "viability_status",
        "estimated_system_size_kw_low", "estimated_system_size_kw_high",
        "estimated_annual_generation_kwh_low", "estimated_annual_generation_kwh_high", "updated_at",
      ],
      ...projects.map((project) => [
        project.siteId, project.projectId, project.name, project.address,
        project.locality, project.siteType, project.submissionStatus, project.projectStage,
        project.journeyStageId, project.viabilityStatus, project.estimatedSystemSizeKw.low,
        project.estimatedSystemSizeKw.high, project.estimatedAnnualGenerationKwh.low,
        project.estimatedAnnualGenerationKwh.high, project.updatedAt,
      ]),
      [],
      ["documents"],
      ["id", "site_id", "project_id", "file_name", "content_type", "size_bytes", "doc_type", "created_at"],
      ...documents.map((document) => [
        document.id, document.siteId, document.projectId, document.fileName,
        document.contentType, document.sizeBytes, document.docType, document.createdAt,
      ]),
    ];
    encoded = `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
  }
  const contentType = format === "json" ? "application/json" : "text/csv;charset=utf-8";
  const blob = new Blob([encoded], { type: contentType });
  if (blob.size > LIVE_READ_LIMITS.downloadBytes) {
    rejectRead("too-large", "The encoded manifest exceeds the admitted download limit.", "byte_limit");
  }
  return {
    blob,
    fileName: `sunsum-export-${manifest.identity.role}-${generatedAt?.slice(0, 10) ?? "undated"}.${format}`,
    contentType,
    sizeBytes: blob.size,
    provenance: manifest.provenance,
  };
}
