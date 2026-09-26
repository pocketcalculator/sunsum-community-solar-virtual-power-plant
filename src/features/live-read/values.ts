import { JOURNEY_STAGES } from "@/domain/journey";

import { LIVE_READ_LIMITS } from "./constants";
import { malformed, rejectRead } from "./errors";
import type { LiveRole, ReadRange } from "./types";

export const submissionStatuses = [
  "draft", "submitted", "screening", "info_requested", "accepted", "rejected",
] as const;
export const projectStages = [
  "pre_development", "development", "construction", "commissioning", "operations",
] as const;
export const siteTypes = ["rooftop", "land"] as const;
export const viabilityStatuses = [
  "potentially_viable", "more_information_required", "not_currently_eligible",
] as const;
export const engagementStates = [
  "interested", "committed", "underwriting", "approved", "funded", "declined", "withdrawn",
] as const;
export const fundingStages = [
  "pre_development", "development", "construction", "permanent",
] as const;
export const journeyStages = JOURNEY_STAGES.map((stage) => stage.id);
export const activeEngagementStates: readonly string[] = [
  "interested", "committed", "underwriting", "approved", "funded",
];

export type JsonRecord = { readonly [key: string]: unknown };

export function isObject(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function object(value: unknown): JsonRecord {
  if (!isObject(value)) malformed();
  return value;
}

export function optionalObject(value: unknown): JsonRecord | null {
  return value == null ? null : object(value);
}

export function list(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) malformed();
  if (value.length > LIVE_READ_LIMITS.maxItems) {
    rejectRead("too-large", "The response exceeds the admitted item limit.", "item_limit");
  }
  return value;
}

export function text(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") malformed();
  if (value.length > LIVE_READ_LIMITS.maxStringLength) {
    rejectRead("too-large", "The response exceeds the admitted text limit.", "text_limit");
  }
  return value;
}

export function strings(value: unknown): readonly string[] | null {
  if (value == null) return null;
  return list(value).map((entry) => {
    if (typeof entry !== "string") malformed();
    text(entry);
    return entry;
  });
}

export function number(
  value: unknown,
  minimum = 0,
  maximum = Number.MAX_VALUE,
): number | null {
  if (value == null) return null;
  if (
    typeof value !== "number" || !Number.isFinite(value) ||
    value < minimum || value > maximum
  ) malformed();
  return value;
}

export function count(value: unknown): number | null {
  const result = number(value, 0, Number.MAX_SAFE_INTEGER);
  if (result !== null && !Number.isInteger(result)) malformed();
  return result;
}

export function boolean(value: unknown): boolean | null {
  if (value == null) return null;
  if (typeof value !== "boolean") malformed();
  return value;
}

export function choice<T extends string>(
  value: unknown,
  choices: readonly T[],
): T | null {
  if (value == null) return null;
  const matched = choices.find((candidate) => candidate === value);
  if (matched === undefined) malformed();
  return matched;
}

export function isId(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function id(value: unknown): string {
  if (!isId(value)) malformed();
  return value.toLowerCase();
}

export function optionalId(value: unknown): string | null {
  return value == null ? null : id(value);
}

export function timestamp(value: unknown): string | null {
  const result = text(value);
  if (result === null) return null;
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(result) ||
    !Number.isFinite(Date.parse(result))
  ) malformed();
  date(result.slice(0, 10));
  return result;
}

export function date(value: unknown): string | null {
  const result = text(value);
  if (result === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) malformed();
  const parsed = new Date(`${result}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result) {
    malformed();
  }
  return result;
}

export function role(value: unknown): LiveRole {
  if (value === "site_owner") return "site-owner";
  if (value === "operator" || value === "investor") return value;
  return malformed();
}

export function range<Unit extends string>(
  source: JsonRecord,
  lowKey: string,
  highKey: string,
  unit: Unit,
): ReadRange<Unit> {
  const low = number(source[lowKey]);
  const high = number(source[highKey]);
  if (low !== null && high !== null && low > high) malformed();
  return { low, high, unit };
}

export function capacityRange(source: JsonRecord): ReadRange<"kW"> {
  return range(source, "estimated_system_size_kw_low", "estimated_system_size_kw_high", "kW");
}

export function energyRange(source: JsonRecord): ReadRange<"kWh/year"> {
  return range(
    source,
    "estimated_annual_generation_kwh_low",
    "estimated_annual_generation_kwh_high",
    "kWh/year",
  );
}

export function uniqueById<T extends { readonly id: string }>(
  entries: readonly T[],
): readonly T[] {
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) malformed();
  return entries;
}

export function safeFileName(value: string | null, fallback = "document.bin"): string {
  const leaf = value?.split(/[\\/]/).at(-1) ?? "";
  const safe = leaf
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .replace(/^[. ]+|[. ]+$/g, "")
    .slice(0, 120);
  if (!safe || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)) {
    return fallback;
  }
  return safe;
}
