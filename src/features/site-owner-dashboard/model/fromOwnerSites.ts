/**
 * Turning the composed owner view into what the dashboard renders.
 *
 * This is deliberately a pure function over the wire rows rather than a call
 * into the backend: the feature's contract is that presentation receives an
 * already-authorized view, so the page performs the read and this file only
 * changes shape. Nothing here can widen what the caller was allowed to see.
 *
 * The mapping is also where two vocabularies meet, and the rule when they
 * disagree is that the API is the truth and the dashboard converts. The
 * prototype invented `areaSquareFeet`, a property taxonomy and a twenty-year
 * dollar return; only the first of those has a real counterpart, so it is
 * converted and the others are surfaced as absent rather than guessed.
 */

import type { DashboardLocation } from "./mockDashboard";

/**
 * Exact by definition: the international foot is 0.3048 m, so a square metre
 * is 1/0.3048² square feet. Written as a literal rather than computed so the
 * value is reviewable, and duplicated from the backend's copy on purpose —
 * importing it would pull a server module into presentation code.
 */
export const SQUARE_FEET_PER_SQUARE_METRE = 10.763910416709722;

export function squareMetresToSquareFeet(sqm: number): number {
  return Math.round(sqm * SQUARE_FEET_PER_SQUARE_METRE);
}

/** The property taxonomies do not overlap, so this is the whole mapping. */
const PROPERTY_TYPE_BY_SITE_TYPE: Record<string, string> = {
  rooftop: "Rooftop",
  land: "Land",
};

function text(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function record(
  source: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const value = source[key];
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * A human label for a status the API expresses in snake_case.
 *
 * Deliberately generic rather than a lookup table: an unrecognised status
 * should still render as something readable, because a status the dashboard
 * has not heard of is far better shown imperfectly than dropped.
 */
export function humanizeStatus(value: string): string {
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * The first comma-separated part of an address, for the compact table column.
 *
 * `address_raw` is one unparsed string — the API holds no separate street or
 * locality — so this splits for display only and never for meaning.
 */
export function shortLabelFor(address: string): string {
  const [first] = address.split(",");
  return (first ?? address).trim();
}

export function localityFor(address: string): string {
  const parts = address.split(",").map((part) => part.trim());
  return parts.length > 1 ? (parts[1] ?? "") : "";
}

/**
 * One row of `GET /me/sites` as the dashboard's location shape.
 *
 * The financial fields are `null` and that is the point. The prototype's
 * twenty-year individual and community dollar returns have no tariff, rate or
 * market model behind them anywhere in this system; emitting a number here
 * would put an invented figure in front of a homeowner deciding about their
 * own roof. The component already treats `null` as "not modelled" and excludes
 * such rows from its illustrative simulation, so absence renders correctly.
 *
 * `mapPosition` is `null` for the same class of reason: the API holds latitude
 * and longitude, which are not the percentage offsets this component's
 * decorative map expects. Inventing coordinates would place a real address at
 * a fictional point on a stylised map.
 */
export function toDashboardLocation(
  row: Record<string, unknown>,
): DashboardLocation {
  const site = record(row, "site") ?? {};
  const assessment = record(row, "assessment");

  const address = text(site, "address_raw") ?? "Address not provided";
  const areaSqm = num(site, "approximate_area_sqm");
  const siteType = text(site, "site_type");

  return {
    id: text(site, "id") ?? address,
    address,
    shortLabel: shortLabelFor(address),
    locality: localityFor(address),
    propertyType:
      siteType === null
        ? "Unknown"
        : (PROPERTY_TYPE_BY_SITE_TYPE[siteType] ?? humanizeStatus(siteType)),
    areaSquareFeet: areaSqm === null ? null : squareMetresToSquareFeet(areaSqm),
    individualReturnDollars: null,
    communityReturnDollars: null,
    selectedByDefault: true,
    mapPosition: null,
    submissionStatus: text(row, "submission_status"),
    projectStage: text(row, "project_stage"),
    journeyStageId: text(row, "journey_stage_id"),
    nextAction: text(row, "next_action"),
    viabilityStatus:
      assessment === null ? null : text(assessment, "viability_status"),
    documentCount: Array.isArray(row.documents) ? row.documents.length : 0,
    outstandingCount: Array.isArray(row.outstanding)
      ? row.outstanding.length
      : 0,
  };
}

export function toDashboardLocations(
  rows: readonly Record<string, unknown>[],
): readonly DashboardLocation[] {
  return rows.map(toDashboardLocation);
}
