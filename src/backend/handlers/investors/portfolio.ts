import type { Viewer } from "../../core/identity";
import {
  DEFAULT_PORTFOLIO_QUERY,
  getMyInvestorProfile,
  getPortfolio,
  isCapitalType,
  isFundingStage,
  isInvestorType,
  upsertMyInvestorProfile,
  type InvestorProfileInput,
  type PortfolioQuery,
} from "../../core/investors";
import { isProjectStage, isViabilityStatus } from "../../core/projects";
import { failure, ok, type Result } from "../../core/shared";
import { demoBackendStore, type BackendStore } from "../../core/store";
import { resolveDemoInvestor, resolveDemoViewer } from "../identity";
import {
  failureResponse,
  jsonResponse,
  readJsonObject,
  rejectUnknownKeys,
  type JsonObject,
} from "../shared";

const PROFILE_KEYS = [
  "organization_name",
  "investor_type",
  "capital_type",
  "funding_stage_focus",
  "ticket_size_min",
  "ticket_size_max",
  "geographies",
  "investment_objectives",
  "impact_priorities",
  "decision_criteria",
] as const;

/**
 * Exported with the viewer and the store as parameters so the authorization
 * paths can be tested directly. The route wrappers below supply the real ones.
 *
 * The store is an interface from `core`, never a concrete one: a handler must
 * not be able to tell whether it is talking to fixtures or to PostgreSQL, which
 * is what makes the two substitutable. Choosing between them happens once, in
 * the composition root.
 */
export async function handleGetPortfolio(
  request: Request,
  viewer: Viewer,
  store: BackendStore = demoBackendStore,
): Promise<Response> {
  const query = parsePortfolioQuery(new URL(request.url).searchParams);
  if (!query.ok) return failureResponse(query.failure);
  const result = await getPortfolio(viewer, query.value, store);
  return result.ok ? jsonResponse(result.value) : failureResponse(result.failure);
}

export async function getPortfolioRoute(request: Request): Promise<Response> {
  return handleGetPortfolio(request, await resolveDemoViewer(), demoBackendStore);
}

export async function handleGetInvestorProfile(
  viewer: Viewer,
  store: BackendStore = demoBackendStore,
): Promise<Response> {
  const result = await getMyInvestorProfile(viewer, store);
  return result.ok ? jsonResponse(result.value) : failureResponse(result.failure);
}

export async function getInvestorProfileRoute(): Promise<Response> {
  return handleGetInvestorProfile(await resolveDemoInvestor(demoBackendStore), demoBackendStore);
}

export async function handlePostInvestorProfile(
  request: Request,
  viewer: Viewer,
  store: BackendStore = demoBackendStore,
): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body.ok) return failureResponse(body.failure);
  const input = parseInvestorProfile(body.value);
  if (!input.ok) return failureResponse(input.failure);
  const result = await upsertMyInvestorProfile(viewer, input.value, store);
  return result.ok ? jsonResponse(result.value, 201) : failureResponse(result.failure);
}

export async function postInvestorProfileRoute(request: Request): Promise<Response> {
  return handlePostInvestorProfile(
    request,
    await resolveDemoInvestor(demoBackendStore),
    demoBackendStore,
  );
}

export function parsePortfolioQuery(
  params: URLSearchParams,
): Result<PortfolioQuery> {
  const allowed = new Set([
    "mandate_match",
    "stage",
    "viability",
    "project_type",
  ]);
  const unknown = [...params.keys()].find((parameter) => !allowed.has(parameter));
  if (unknown !== undefined) {
    return failure("invalid_query", "Unknown query parameter.", {
      parameter: unknown,
    });
  }

  const mandateMatch = parseBoolean(
    params.get("mandate_match"),
    DEFAULT_PORTFOLIO_QUERY.mandateMatch,
  );
  if (!mandateMatch.ok) return mandateMatch;

  const stages = params.getAll("stage");
  const unknownStage = stages.find((stage) => !isProjectStage(stage));
  if (unknownStage !== undefined) {
    return failure("invalid_query", "Unknown project stage.", {
      parameter: "stage",
      value: unknownStage,
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
    mandateMatch: mandateMatch.value,
    stages: stages.filter(isProjectStage),
    viability,
    projectType: params.get("project_type"),
  });
}

export function parseInvestorProfile(
  body: JsonObject,
): Result<InvestorProfileInput> {
  const keys = rejectUnknownKeys(body, PROFILE_KEYS);
  if (!keys.ok) return keys;
  const organizationName = requiredString(body.organization_name, "organization_name");
  if (!organizationName.ok) return organizationName;
  const investorType = requiredString(body.investor_type, "investor_type");
  if (!investorType.ok) return investorType;
  if (!isInvestorType(investorType.value)) {
    return failure("invalid_body", "Unknown investor type.", { field: "investor_type" });
  }
  const capitalType = requiredString(body.capital_type, "capital_type");
  if (!capitalType.ok) return capitalType;
  if (!isCapitalType(capitalType.value)) {
    return failure("invalid_body", "Unknown capital type.", { field: "capital_type" });
  }
  const fundingStageFocus = stringArray(body.funding_stage_focus, "funding_stage_focus");
  if (!fundingStageFocus.ok) return fundingStageFocus;
  const unknownStage = fundingStageFocus.value.find((item) => !isFundingStage(item));
  if (unknownStage !== undefined) {
    return failure("invalid_body", "Unknown funding stage.", {
      field: "funding_stage_focus",
      value: unknownStage,
    });
  }
  const ticketSizeMin = nullableNonNegativeNumber(body.ticket_size_min, "ticket_size_min");
  if (!ticketSizeMin.ok) return ticketSizeMin;
  const ticketSizeMax = nullableNonNegativeNumber(body.ticket_size_max, "ticket_size_max");
  if (!ticketSizeMax.ok) return ticketSizeMax;
  const geographies = stringArray(body.geographies, "geographies");
  if (!geographies.ok) return geographies;
  const investmentObjectives = stringArray(body.investment_objectives, "investment_objectives");
  if (!investmentObjectives.ok) return investmentObjectives;
  const impactPriorities = stringArray(body.impact_priorities, "impact_priorities");
  if (!impactPriorities.ok) return impactPriorities;
  const decisionCriteria = stringArray(body.decision_criteria, "decision_criteria");
  if (!decisionCriteria.ok) return decisionCriteria;

  return ok({
    organizationName: organizationName.value,
    investorType: investorType.value,
    capitalType: capitalType.value,
    fundingStageFocus: fundingStageFocus.value.filter(isFundingStage),
    ticketSizeMin: ticketSizeMin.value,
    ticketSizeMax: ticketSizeMax.value,
    geographies: geographies.value,
    investmentObjectives: investmentObjectives.value,
    impactPriorities: impactPriorities.value,
    decisionCriteria: decisionCriteria.value,
  });
}

function parseBoolean(value: string | null, fallback: boolean): Result<boolean> {
  if (value === null) return ok(fallback);
  if (value === "true" || value === "false") return ok(value === "true");
  return failure("invalid_query", "Expected true or false.", {
    parameter: "mandate_match",
    value,
  });
}

function requiredString(value: unknown, field: string): Result<string> {
  return typeof value === "string" && value.trim() !== ""
    ? ok(value)
    : failure("invalid_body", "Expected a non-empty string.", { field });
}

function stringArray(value: unknown, field: string): Result<readonly string[]> {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return failure("invalid_body", "Expected an array of strings.", { field });
  }
  return ok(value);
}

function nullableNonNegativeNumber(
  value: unknown,
  field: string,
): Result<number | null> {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0)
    ? ok(value)
    : failure("invalid_body", "Expected a non-negative number or null.", { field });
}
