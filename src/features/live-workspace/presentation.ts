import { JOURNEY_STAGES } from "@/domain/journey";
import type { ProjectReadRow } from "@/components/workspace/types";
import type { ReadRange, ReadRecord, ViabilityStatus } from "@/features/live-read";

export const VIABILITY_LABELS: Record<ViabilityStatus, string> = {
  potentially_viable: "Potentially viable (preliminary)",
  more_information_required: "More information required",
  not_currently_eligible: "Not currently eligible",
};

export function recordName(record: ReadRecord): string {
  return record.name || `${record.projectId ? "Unnamed project" : "Unnamed site"} (${record.id.slice(0, 8)})`;
}

export function numberText(value: number | null, unit: string): string {
  return value === null ? "Not supplied" : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)} ${unit}`.trim();
}

export function rangeText(range: ReadRange<string>): string {
  if (range.low === null && range.high === null) return "Not supplied";
  if (range.low === null) return `Upper bound ${numberText(range.high, range.unit)}; lower bound unknown`;
  if (range.high === null) return `Lower bound ${numberText(range.low, range.unit)}; upper bound unknown`;
  if (range.low === range.high) return `${numberText(range.low, range.unit)} (point estimate)`;
  return `${numberText(range.low, "")} - ${numberText(range.high, range.unit)}`;
}

export function stageLabel(record: ReadRecord): string {
  return JOURNEY_STAGES.find((stage) => stage.id === record.journeyStageId)?.name ?? "Stage not supplied";
}

export function compareSourceTimes(left: string | null, right: string | null): number {
  const instant = (value: string | null) => {
    if (value === null || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const a = instant(left);
  const b = instant(right);
  if (a === null && b !== null) return 1;
  if (b === null && a !== null) return -1;
  return (b ?? 0) - (a ?? 0);
}

export function projectRow(record: ReadRecord): ProjectReadRow {
  return {
    id: record.id,
    title: recordName(record),
    subtitle: `${record.locality || "Location not supplied"} / ${record.siteType || "Site type not supplied"}`,
    stage: stageLabel(record),
    capacity: record.estimatedCapacityKw !== null
      ? `${numberText(record.estimatedCapacityKw, "kW")} project estimate`
      : rangeText(record.estimatedSystemSizeKw),
    screening: record.viabilityStatus ? VIABILITY_LABELS[record.viabilityStatus] : "Screening not supplied",
    screeningTone: record.viabilityStatus === "potentially_viable" ? "positive"
      : record.viabilityStatus === "not_currently_eligible" ? "warning" : "neutral",
  };
}

export type CollectionSort = "stage-asc" | "stage-desc" | "name" | "updated";
export interface CollectionState {
  query: string;
  stage: string;
  siteType: string;
  sort: CollectionSort;
  page: number;
  pageSize: 25 | 50 | 100;
  display: "list" | "cards";
}
export const INITIAL_COLLECTION: CollectionState = {
  query: "", stage: "all", siteType: "all", sort: "stage-asc",
  page: 1, pageSize: 25, display: "list",
};

export function selectReadRecords(records: readonly ReadRecord[], state: CollectionState): ReadRecord[] {
  const query = state.query.trim().toLocaleLowerCase("en-US");
  const filtered = records.filter((record) =>
    (!query || `${record.name ?? ""} ${record.locality ?? ""}`.toLocaleLowerCase("en-US").includes(query)) &&
    (state.stage === "all" || (record.journeyStageId ?? "unknown") === state.stage) &&
    (state.siteType === "all" || (record.siteType ?? "unknown") === state.siteType));
  const ties = (a: ReadRecord, b: ReadRecord) => recordName(a).localeCompare(recordName(b), "en") || a.id.localeCompare(b.id);
  return filtered.sort((a, b) => {
    if (state.sort === "name") return ties(a, b);
    if (state.sort === "updated") return compareSourceTimes(a.updatedAt, b.updatedAt) || ties(a, b);
    const left = JOURNEY_STAGES.findIndex((stage) => stage.id === a.journeyStageId);
    const right = JOURNEY_STAGES.findIndex((stage) => stage.id === b.journeyStageId);
    if (left === -1 && right !== -1) return 1;
    if (right === -1 && left !== -1) return -1;
    return (left - right) * (state.sort === "stage-desc" ? -1 : 1) || ties(a, b);
  });
}
