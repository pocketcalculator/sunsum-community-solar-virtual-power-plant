import type { Viewer } from "../../core/identity";
import { isSiteType, isViabilityStatus } from "../../core/projects";
import {
  createSite,
  getSubmissionDetail,
  isOwnershipStatus,
  isSubmissionStatus,
  listSubmissions,
  submitSite,
  updateDraftSite,
  type SiteCreateInput,
  type SiteUpdateInput,
  type SubmissionQuery,
  type ViabilityClient,
} from "../../core/sites";
import { demoBackendStore, type BackendStore } from "../../core/store";
import { failure, ok, type Result } from "../../core/shared";
import { resolveDemoOperator, resolveDemoSiteOwner } from "../identity";
import {
  failureResponse,
  isUuid,
  jsonResponse,
  readJsonObject,
  rejectUnknownKeys,
  validatePathId,
  type JsonObject,
} from "../shared";

const SITE_CREATE_KEYS = [
  "address_raw",
  "site_type",
  "ownership_status",
  "approximate_area_sqm",
  "electricity_usage_kwh_annual",
  "electricity_bill_doc_id",
  "has_existing_solar",
  "consent_given",
  "submit",
] as const;

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>;
}

export async function handlePostSite(
  request: Request,
  viewer: Viewer,
  store: BackendStore = demoBackendStore,
  viabilityClient?: ViabilityClient,
): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body.ok) return failureResponse(body.failure);
  const input = parseSiteCreate(body.value);
  if (!input.ok) return failureResponse(input.failure);
  const result = await createSite(viewer, input.value, store, viabilityClient);
  return result.ok
    ? jsonResponse(result.value, 201)
    : failureResponse(result.failure);
}

export function postSiteRoute(request: Request): Promise<Response> {
  return handlePostSite(request, resolveDemoSiteOwner());
}

export async function handleGetSubmissions(
  request: Request,
  viewer: Viewer,
  store: BackendStore = demoBackendStore,
): Promise<Response> {
  const query = parseSubmissionQuery(new URL(request.url).searchParams);
  if (!query.ok) return failureResponse(query.failure);
  const result = await listSubmissions(viewer, query.value, store);
  return result.ok ? jsonResponse(result.value) : failureResponse(result.failure);
}

export function getSubmissionsRoute(request: Request): Promise<Response> {
  return handleGetSubmissions(request, resolveDemoOperator());
}


export async function handlePatchSite(
  request: Request,
  viewer: Viewer,
  siteId: string,
  store: BackendStore = demoBackendStore,
): Promise<Response> {
  const id = validatePathId(siteId, "invalid_body");
  if (!id.ok) return failureResponse(id.failure);
  const body = await readJsonObject(request);
  if (!body.ok) return failureResponse(body.failure);
  const input = parseSiteUpdate(body.value);
  if (!input.ok) return failureResponse(input.failure);
  const result = await updateDraftSite(viewer, siteId, input.value, store);
  return result.ok ? jsonResponse(result.value) : failureResponse(result.failure);
}

export async function patchSiteRoute(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  return handlePatchSite(request, resolveDemoSiteOwner(), (await context.params).id);
}

export async function handlePostSiteSubmit(
  request: Request,
  viewer: Viewer,
  siteId: string,
  store: BackendStore = demoBackendStore,
  viabilityClient?: ViabilityClient,
): Promise<Response> {
  const id = validatePathId(siteId, "invalid_body");
  if (!id.ok) return failureResponse(id.failure);
  const query = new URL(request.url).searchParams;
  const unknown = [...query.keys()][0];
  if (unknown !== undefined) {
    return failureResponse({
      code: "invalid_query",
      message: "Unknown query parameter.",
      details: { parameter: unknown },
    });
  }
  const rawBody = await request.text();
  if (rawBody.trim() !== "") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return failureResponse({
        code: "invalid_body",
        message: "The request body must be valid JSON.",
      });
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return failureResponse({
        code: "invalid_body",
        message: "The request body must be a JSON object.",
      });
    }
    const keys = rejectUnknownKeys(parsed as JsonObject, []);
    if (!keys.ok) return failureResponse(keys.failure);
  }
  const result = await submitSite(viewer, siteId, store, viabilityClient);
  return result.ok ? jsonResponse(result.value) : failureResponse(result.failure);
}

export async function postSiteSubmitRoute(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  return handlePostSiteSubmit(request, resolveDemoSiteOwner(), (await context.params).id);
}

export async function handleGetSubmissionDetail(
  viewer: Viewer,
  siteId: string,
  store: BackendStore = demoBackendStore,
): Promise<Response> {
  const id = validatePathId(siteId, "invalid_query");
  if (!id.ok) return failureResponse(id.failure);
  const result = await getSubmissionDetail(viewer, siteId, store);
  return result.ok ? jsonResponse(result.value) : failureResponse(result.failure);
}

export async function getSubmissionDetailRoute(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  return handleGetSubmissionDetail(resolveDemoOperator(), (await context.params).id);
}

export function parseSiteCreate(body: JsonObject): Result<SiteCreateInput> {
  const keys = rejectUnknownKeys(body, SITE_CREATE_KEYS);
  if (!keys.ok) return keys;

  const addressRaw = optionalString(body.address_raw, "address_raw");
  if (!addressRaw.ok) return addressRaw;
  const siteType = optionalString(body.site_type, "site_type");
  if (!siteType.ok) return siteType;
  if (siteType.value !== undefined && !isSiteType(siteType.value)) {
    return failure("invalid_body", "Unknown site type.", { field: "site_type" });
  }
  const ownership = optionalString(body.ownership_status, "ownership_status");
  if (!ownership.ok) return ownership;
  if (
    ownership.value !== undefined &&
    !isOwnershipStatus(ownership.value)
  ) {
    return failure("invalid_body", "Unknown ownership status.", {
      field: "ownership_status",
    });
  }
  const area = optionalNonNegativeNumber(
    body.approximate_area_sqm,
    "approximate_area_sqm",
  );
  if (!area.ok) return area;
  const usage = optionalNonNegativeNumber(
    body.electricity_usage_kwh_annual,
    "electricity_usage_kwh_annual",
  );
  if (!usage.ok) return usage;
  const bill = optionalString(
    body.electricity_bill_doc_id,
    "electricity_bill_doc_id",
  );
  if (!bill.ok) return bill;
  if (bill.value !== undefined && !isUuid(bill.value)) {
    return failure("invalid_body", "Expected a UUID.", {
      field: "electricity_bill_doc_id",
    });
  }
  const existing = optionalBoolean(body.has_existing_solar, "has_existing_solar");
  if (!existing.ok) return existing;
  const consent = optionalBoolean(body.consent_given, "consent_given");
  if (!consent.ok) return consent;
  const submit = optionalBoolean(body.submit, "submit");
  if (!submit.ok) return submit;

  return ok({
    ...(addressRaw.value === undefined ? {} : { addressRaw: addressRaw.value }),
    ...(siteType.value === undefined ? {} : { siteType: siteType.value }),
    ...(ownership.value === undefined
      ? {}
      : { ownershipStatus: ownership.value }),
    ...(area.value === undefined ? {} : { approximateAreaSqm: area.value }),
    ...(usage.value === undefined
      ? {}
      : { electricityUsageKwhAnnual: usage.value }),
    ...(bill.value === undefined ? {} : { electricityBillDocId: bill.value }),
    ...(existing.value === undefined
      ? {}
      : { hasExistingSolar: existing.value }),
    ...(consent.value === undefined ? {} : { consentGiven: consent.value }),
    submit: submit.value ?? false,
  });
}


export function parseSiteUpdate(body: JsonObject): Result<SiteUpdateInput> {
  const keys = rejectUnknownKeys(body, SITE_CREATE_KEYS.filter((key) => key !== "submit"));
  if (!keys.ok) return keys;
  const addressRaw = optionalNullableString(body.address_raw, "address_raw");
  if (!addressRaw.ok) return addressRaw;
  const siteType = optionalNullableString(body.site_type, "site_type");
  if (!siteType.ok) return siteType;
  if (siteType.value !== undefined && siteType.value !== null && !isSiteType(siteType.value)) {
    return failure("invalid_body", "Unknown site type.", { field: "site_type" });
  }
  const ownership = optionalNullableString(body.ownership_status, "ownership_status");
  if (!ownership.ok) return ownership;
  if (ownership.value !== undefined && ownership.value !== null && !isOwnershipStatus(ownership.value)) {
    return failure("invalid_body", "Unknown ownership status.", { field: "ownership_status" });
  }
  const area = optionalNullableNonNegativeNumber(body.approximate_area_sqm, "approximate_area_sqm");
  if (!area.ok) return area;
  const usage = optionalNullableNonNegativeNumber(body.electricity_usage_kwh_annual, "electricity_usage_kwh_annual");
  if (!usage.ok) return usage;
  const bill = optionalNullableString(body.electricity_bill_doc_id, "electricity_bill_doc_id");
  if (!bill.ok) return bill;
  if (bill.value !== undefined && bill.value !== null && !isUuid(bill.value)) {
    return failure("invalid_body", "Expected a UUID.", { field: "electricity_bill_doc_id" });
  }
  const existing = optionalNullableBoolean(body.has_existing_solar, "has_existing_solar");
  if (!existing.ok) return existing;
  const consent = optionalBoolean(body.consent_given, "consent_given");
  if (!consent.ok) return consent;
  return ok({
    ...(addressRaw.value === undefined ? {} : { addressRaw: addressRaw.value }),
    ...(siteType.value === undefined ? {} : { siteType: siteType.value }),
    ...(ownership.value === undefined ? {} : { ownershipStatus: ownership.value }),
    ...(area.value === undefined ? {} : { approximateAreaSqm: area.value }),
    ...(usage.value === undefined ? {} : { electricityUsageKwhAnnual: usage.value }),
    ...(bill.value === undefined ? {} : { electricityBillDocId: bill.value }),
    ...(existing.value === undefined ? {} : { hasExistingSolar: existing.value }),
    ...(consent.value === undefined ? {} : { consentGiven: consent.value }),
  });
}

export function parseSubmissionQuery(
  params: URLSearchParams,
): Result<SubmissionQuery> {
  const allowed = ["status", "type", "viability", "location"];
  const unknown = [...params.keys()].find((key) => !allowed.includes(key));
  if (unknown !== undefined) {
    return failure("invalid_query", "Unknown query parameter.", {
      parameter: unknown,
    });
  }
  const statuses = params.getAll("status");
  const invalidStatus = statuses.find((status) => !isSubmissionStatus(status));
  if (invalidStatus !== undefined) {
    return failure("invalid_query", "Unknown submission status.", {
      parameter: "status",
      value: invalidStatus,
    });
  }
  const siteType = params.get("type");
  if (siteType !== null && !isSiteType(siteType)) {
    return failure("invalid_query", "Unknown site type.", {
      parameter: "type",
      value: siteType,
    });
  }
  const viability = params.get("viability");
  if (viability !== null && !isViabilityStatus(viability)) {
    return failure("invalid_query", "Unknown viability status.", {
      parameter: "viability",
      value: viability,
    });
  }
  return ok({
    statuses: statuses.filter(isSubmissionStatus),
    siteType,
    viability,
    location: params.get("location"),
  });
}

function optionalNullableString(
  value: unknown,
  field: string,
): Result<string | null | undefined> {
  return value === undefined || value === null || typeof value === "string"
    ? ok(value)
    : failure("invalid_body", "Expected a string or null.", { field });
}

function optionalNullableBoolean(
  value: unknown,
  field: string,
): Result<boolean | null | undefined> {
  return value === undefined || value === null || typeof value === "boolean"
    ? ok(value)
    : failure("invalid_body", "Expected a boolean or null.", { field });
}

function optionalNullableNonNegativeNumber(
  value: unknown,
  field: string,
): Result<number | null | undefined> {
  return value === undefined ||
    value === null ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0)
    ? ok(value)
    : failure("invalid_body", "Expected a non-negative number or null.", { field });
}

function optionalString(
  value: unknown,
  field: string,
): Result<string | undefined> {
  return value === undefined || typeof value === "string"
    ? ok(value)
    : failure("invalid_body", "Expected a string.", { field });
}

function optionalBoolean(
  value: unknown,
  field: string,
): Result<boolean | undefined> {
  return value === undefined || typeof value === "boolean"
    ? ok(value)
    : failure("invalid_body", "Expected a boolean.", { field });
}

function optionalNonNegativeNumber(
  value: unknown,
  field: string,
): Result<number | undefined> {
  return value === undefined ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0)
    ? ok(value)
    : failure("invalid_body", "Expected a non-negative number.", { field });
}
