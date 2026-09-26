export const SUBMISSION_STATUSES = [
  "draft", "submitted", "screening", "info_requested", "accepted", "rejected",
] as const;
export const PROJECT_STAGES = [
  "pre_development", "development", "construction", "commissioning", "operations",
] as const;
export const SITE_TYPES = ["rooftop", "land"] as const;
export const VIABILITY_STATUSES = [
  "potentially_viable", "more_information_required", "not_currently_eligible",
] as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];
export type ProjectStage = (typeof PROJECT_STAGES)[number];
export type SiteType = (typeof SITE_TYPES)[number];
export type ViabilityStatus = (typeof VIABILITY_STATUSES)[number];
export type QueryRole = "site-owner" | "operator" | "investor";

export interface WorkspaceQuery {
  readonly statuses?: readonly SubmissionStatus[];
  readonly siteType?: SiteType;
  readonly location?: string;
  readonly viability?: ViabilityStatus;
  readonly stages?: readonly ProjectStage[];
  readonly mandateMatch?: boolean;
  readonly projectType?: string;
}

const queryKeys = ["statuses", "siteType", "location", "viability", "stages", "mandateMatch", "projectType"];

export function isWorkspaceQuery(value: unknown, role?: QueryRole): value is WorkspaceQuery {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const query: Record<string, unknown> = { ...value };
  const allowed = role === "site-owner" ? [] :
    role === "operator" ? ["statuses", "siteType", "location", "viability"] :
    role === "investor" ? ["stages", "mandateMatch", "projectType", "viability"] : queryKeys;
  if (Object.keys(query).some((key) => !allowed.includes(key))) return false;
  for (const [key, choices] of [["statuses", SUBMISSION_STATUSES], ["stages", PROJECT_STAGES]] as const) {
    const entries = query[key];
    if (entries !== undefined && (!Array.isArray(entries) || entries.length > choices.length ||
      new Set(entries).size !== entries.length ||
      entries.some((entry) => !choices.some((choice) => choice === entry)))) return false;
  }
  if (query.siteType !== undefined && !SITE_TYPES.some((choice) => choice === query.siteType)) return false;
  if (query.viability !== undefined && !VIABILITY_STATUSES.some((choice) => choice === query.viability)) return false;
  if (query.mandateMatch !== undefined && typeof query.mandateMatch !== "boolean") return false;
  for (const key of ["location", "projectType"] as const) {
    const text = query[key];
    if (text !== undefined && (typeof text !== "string" || !text.trim() ||
      text.length > 200 || /[\u0000-\u001f\u007f]/.test(text))) return false;
  }
  return true;
}

export function copyWorkspaceQuery(query: WorkspaceQuery): WorkspaceQuery {
  return {
    ...query,
    ...(query.statuses === undefined ? {} : { statuses: [...query.statuses] }),
    ...(query.stages === undefined ? {} : { stages: [...query.stages] }),
  };
}

export function defaultWorkspaceQuery(role: QueryRole): WorkspaceQuery {
  return role === "investor" ? { mandateMatch: true } : {};
}

interface QuerySerializationInput {
  readonly statuses?: readonly string[];
  readonly stages?: readonly string[];
  readonly siteType?: string;
  readonly viability?: string;
  readonly location?: string;
  readonly projectType?: string;
  readonly mandateMatch?: boolean;
}

// Legacy view models share serialization; role/enum admission stays explicit.
export function workspaceQueryString(query: QuerySerializationInput): string {
  const params = new URLSearchParams();
  for (const status of query.statuses ?? []) params.append("status", status);
  for (const stage of query.stages ?? []) params.append("stage", stage);
  if (query.siteType !== undefined) params.set("type", query.siteType);
  if (query.viability !== undefined) params.set("viability", query.viability);
  if (query.location !== undefined) params.set("location", query.location);
  if (query.projectType !== undefined) params.set("project_type", query.projectType);
  if (query.mandateMatch !== undefined) params.set("mandate_match", String(query.mandateMatch));
  return params.toString();
}
