/**
 * The operator pipeline as the workspace renders it.
 *
 * A pure transform over `GET /pipeline`, which publishes the board as columns
 * keyed by journey stage. This flattens those columns into one list because
 * the operator view is a filterable, sortable working list rather than a
 * board, and keeps the stage on every card so the funnel is still legible.
 *
 * The operator tier is not the investor's: this payload does carry the exact
 * address, and it is rendered, because an operator is who the address is for.
 */

import { workspaceQueryString } from "@/domain/workspace-filters";
export { SUBMISSION_STATUSES, SITE_TYPES, VIABILITY_STATUSES } from "@/domain/workspace-filters";

export interface PipelineCard {
  readonly id: string;
  readonly siteId: string;
  readonly projectId: string | null;
  readonly displayName: string;
  readonly addressRaw: string | null;
  readonly siteType: string | null;
  readonly siteTypeLabel: string;
  readonly submissionStatus: string | null;
  readonly submissionStatusLabel: string | null;
  readonly projectStage: string | null;
  readonly journeyStageId: string;
  readonly journeyStageLabel: string;
  readonly viabilityStatus: string | null;
  readonly viabilityLabel: string | null;
  readonly estimatedCapacityKw: number | null;
  readonly updatedAt: string | null;
}

export interface PipelineStageCount {
  readonly journeyStageId: string;
  readonly label: string;
  readonly count: number;
}

export interface PipelineView {
  readonly cards: readonly PipelineCard[];
  readonly stageCounts: readonly PipelineStageCount[];
}

export type PipelineDataSource = "live" | "sample";

export interface PipelineFilters {
  readonly statuses: readonly string[];
  readonly siteType: string | null;
  readonly viability: string | null;
  readonly location: string | null;
}

export const DEFAULT_PIPELINE_FILTERS: PipelineFilters = {
  statuses: [],
  siteType: null,
  viability: null,
  location: null,
};

function text(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Shared with the investor workspace in spirit, duplicated to keep features apart. */
export function humanize(value: string): string {
  const spaced = value.replace(/[_-]/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Capacity in kilowatts, with the unit attached. `null` is not zero. */
export function formatCapacityKw(value: number | null): string | null {
  return value === null ? null : `${value.toLocaleString("en-US")} kW`;
}

export function toPipelineCard(row: Record<string, unknown>): PipelineCard {
  const siteType = text(row, "site_type");
  const submissionStatus = text(row, "submission_status");
  const viabilityStatus = text(row, "viability_status");
  const journeyStageId = text(row, "journey_stage_id") ?? "";

  return {
    id: text(row, "id") ?? "",
    siteId: text(row, "site_id") ?? "",
    projectId: text(row, "project_id"),
    displayName: text(row, "display_name") ?? "Unnamed submission",
    addressRaw: text(row, "address_raw"),
    siteType,
    siteTypeLabel: siteType === null ? "Unknown" : humanize(siteType),
    submissionStatus,
    submissionStatusLabel:
      submissionStatus === null ? null : humanize(submissionStatus),
    projectStage: text(row, "project_stage"),
    journeyStageId,
    journeyStageLabel:
      journeyStageId === "" ? "Unknown" : humanize(journeyStageId),
    viabilityStatus,
    viabilityLabel: viabilityStatus === null ? null : humanize(viabilityStatus),
    estimatedCapacityKw: num(row, "estimated_capacity_kw"),
    updatedAt: text(row, "updated_at"),
  };
}

/**
 * The whole `GET /pipeline` body as a view, or `null` when it is not one.
 *
 * Column order is preserved from the payload, which publishes the ribbon in
 * journey order, so the funnel reads correctly without this module sorting it.
 */
export function toPipelineView(payload: unknown): PipelineView | null {
  if (typeof payload !== "object" || payload === null) return null;
  const body = payload as Record<string, unknown>;
  if (!Array.isArray(body.columns)) return null;

  const cards: PipelineCard[] = [];
  const stageCounts: PipelineStageCount[] = [];

  for (const entry of body.columns as Record<string, unknown>[]) {
    if (typeof entry !== "object" || entry === null) continue;
    const stageId = text(entry, "journey_stage_id") ?? "";
    const items = Array.isArray(entry.items)
      ? (entry.items as Record<string, unknown>[])
      : [];

    for (const item of items) cards.push(toPipelineCard(item));

    stageCounts.push({
      journeyStageId: stageId,
      label: stageId === "" ? "Unknown" : humanize(stageId),
      /** The server's own count, not `items.length`, so the two never disagree. */
      count: num(entry, "count") ?? items.length,
    });
  }

  return { cards, stageCounts };
}

/**
 * The query string for `GET /pipeline`.
 *
 * `type` is the site-type parameter. It is not named `site_type`, and the
 * handler rejects unknown parameters with `invalid_query` rather than ignoring
 * them, so the difference matters.
 */
export function pipelineQueryString(filters: PipelineFilters): string {
  return workspaceQueryString({
    statuses: filters.statuses,
    ...(filters.siteType === null ? {} : { siteType: filters.siteType }),
    ...(filters.viability === null ? {} : { viability: filters.viability }),
    ...(filters.location?.trim() ? { location: filters.location.trim() } : {}),
  });
}
