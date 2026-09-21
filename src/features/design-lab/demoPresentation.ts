import type { ProjectReadRow } from "@/components/workspace/types";
import { JOURNEY_STAGES, ROLE_LABELS, VIABILITY_LABELS, capacity, formatNumber, latestAssessment, stageName, type DemoDocument, type Site, type SubmissionStatus } from "./model";

type Tone = "neutral" | "positive" | "warning" | "danger" | "accent";

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  draft: "Draft", submitted: "Submitted", screening: "Screening",
  info_requested: "Information requested", accepted: "Accepted", rejected: "Not accepted",
};

export function submissionStatusTone(status: SubmissionStatus): Tone {
  return status === "accepted" ? "positive" : status === "rejected" ? "danger"
    : status === "info_requested" ? "warning" : "neutral";
}

export function compareLifecycle(a: { id: string; stage: string | null }, b: { id: string; stage: string | null }, descending = false) {
  const left = JOURNEY_STAGES.findIndex((stage) => stage.id === a.stage);
  const right = JOURNEY_STAGES.findIndex((stage) => stage.id === b.stage);
  if (left < 0 || right < 0) return Number(left < 0) - Number(right < 0) || a.id.localeCompare(b.id);
  return (descending ? right - left : left - right) || a.id.localeCompare(b.id);
}

export function projectReadRow(site: Site): ProjectReadRow {
  const assessment = latestAssessment(site);
  return {
    id: site.id,
    title: site.name || "Untitled fictional site",
    subtitle: `${site.locality} / ${site.region === "unknown" ? "Location unknown" : `${site.region} example`}`,
    stage: site.stage ? stageName(site.stage) : site.status === "accepted" ? "Awaiting project setup" : "Project not started",
    capacity: assessment?.capacity ? `${formatNumber(capacity(site), 1)} kW / fixture midpoint` : "Not calculated",
    screening: assessment ? VIABILITY_LABELS[assessment.result] : "Not screened",
    screeningTone: !assessment ? "neutral" : assessment.result === "potentially_viable" ? "positive" :
      assessment.result === "not_currently_eligible" ? "danger" : "warning",
  };
}

export function timestampLabel(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "Time not recorded";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value} / time and timezone not recorded`;
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return `${value} / timezone not recorded`;
  const formatter = new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short",
  });
  return `${formatter.format(new Date(value))} (${formatter.resolvedOptions().timeZone})`;
}

export function compareRecordedTimes(a: string | null | undefined, b: string | null | undefined): number {
  const left = a && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(a) ? Date.parse(a) : NaN;
  const right = b && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(b) ? Date.parse(b) : NaN;
  if (!Number.isFinite(left) || !Number.isFinite(right)) return Number(!Number.isFinite(left)) - Number(!Number.isFinite(right));
  return right - left;
}

export function actorLabel(actor: string | null | undefined): string {
  return actor === "site-owner" || actor === "operator" || actor === "investor" ? `${ROLE_LABELS[actor]} (demo role)` : "Actor not recorded";
}

export function assessmentScopeLabel(sites: readonly Site[]): string {
  const assessments = sites.flatMap((site) => latestAssessment(site) ?? []);
  if (!assessments.length) return "No stored assessment sources or recorded times in this filtered set.";
  const versions = [...new Set(assessments.map((assessment) => assessment.version || "Version not recorded"))].sort();
  const recorded = assessments.map((assessment) => assessment.createdAt).filter((time) => /(?:Z|[+-]\d{2}:?\d{2})$/i.test(time) && Number.isFinite(Date.parse(time)));
  const times = [...new Set(recorded)].sort((a, b) => Date.parse(a) - Date.parse(b));
  const vintage = times.length ? `${timestampLabel(times[0])}${times.length > 1 ? ` to ${timestampLabel(times.at(-1))}` : ""}` : "No recorded instant";
  return `Latest stored assessment sources: ${versions.join(", ")}. Recorded: ${vintage}. ${assessments.length - recorded.length} times unrecorded or without timezone; ${sites.length - assessments.length} projects have no assessment. These are not current conditions.`;
}

export function currentFirstDocuments(documents: readonly DemoDocument[]): DemoDocument[] {
  const superseded = new Set(documents.flatMap((doc) => doc.replacesId ? [doc.replacesId] : []));
  return [...documents].sort((a, b) => Number(superseded.has(a.id)) - Number(superseded.has(b.id)) ||
    (b.version ?? 1) - (a.version ?? 1) || compareRecordedTimes(a.createdAt, b.createdAt) || a.id.localeCompare(b.id));
}

export function documentFamilies(documents: readonly DemoDocument[]) {
  const byId = new Map(documents.map((doc) => [doc.id, doc]));
  const families = new Map<string, DemoDocument[]>();
  for (const doc of currentFirstDocuments(documents)) {
    let root = doc;
    const visited = new Set([doc.id]);
    while (root.replacesId) {
      const previous = byId.get(root.replacesId);
      if (!previous || visited.has(previous.id)) break;
      visited.add(previous.id);
      root = previous;
    }
    const family = families.get(root.id) ?? [];
    family.push(doc);
    families.set(root.id, family);
  }
  return [...families].map(([id, versions]) => ({ id, versions }));
}
