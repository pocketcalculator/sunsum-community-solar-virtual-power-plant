/**
 * `GET /portfolio` handler.
 *
 * The transport half of the endpoint, and the reference for how a handler is
 * written. Its whole job is four steps:
 *
 * 1. Establish who is calling.
 * 2. Validate the query string into typed values, rejecting anything unknown.
 * 3. Call core.
 * 4. Turn the result into a response.
 *
 * There is no workflow rule here. Whether this viewer may read the portfolio,
 * and which projects they are entitled to, are decided in core — so the answer
 * cannot differ depending on how the call arrived.
 */

import type { Viewer } from "../../core/identity";
import {
  DEFAULT_PORTFOLIO_QUERY,
  getPortfolio,
  type PortfolioQuery,
  type PortfolioResponse,
} from "../../core/investors";
import { isProjectStage, isViabilityStatus, type ProjectStore } from "../../core/projects";
import { failure, ok, type Result } from "../../core/shared";
import { resolveDemoViewer } from "../identity";
import { failureResponse, jsonResponse } from "../shared";

/**
 * Exported with the viewer and the store as parameters so the authorization
 * paths can be tested directly. The route factory below supplies the real ones.
 *
 * The store is an interface from `core`, never a concrete one: a handler must
 * not be able to tell whether it is talking to fixtures or to PostgreSQL, which
 * is what makes the two substitutable. Choosing between them happens once, in
 * `src/backend/index.ts`.
 */
export async function handleGetPortfolio(
  request: Request,
  viewer: Viewer,
  store?: ProjectStore,
): Promise<Response> {
  const result = await readPortfolio(
    new URL(request.url).searchParams,
    viewer,
    store,
  );

  return result.ok
    ? jsonResponse(result.value)
    : failureResponse(result.failure);
}

/**
 * The endpoint with the transport removed.
 *
 * Validation, then core. Everything `GET /portfolio` does except turning the
 * answer into an HTTP response, so that a caller which is already inside the
 * server can have the same answer without one of its own routes calling itself
 * over the network.
 *
 * A React server component is the caller that matters. Rendering the portfolio
 * page goes through this function, which means the page and the JSON endpoint
 * share one query parser, one viewer and one authorization rule — a project
 * hidden from an investor by `core` cannot become visible by being rendered
 * instead of fetched. Returning a `Result` rather than a `Response` is what
 * lets the page decide how a refusal should look.
 */
export async function readPortfolio(
  params: URLSearchParams,
  viewer: Viewer,
  store?: ProjectStore,
): Promise<Result<PortfolioResponse>> {
  const query = parsePortfolioQuery(params);

  if (!query.ok) {
    return query;
  }

  return getPortfolio(viewer, query.value, store);
}

/**
 * Wires the handler to a store and returns the function a route exports.
 *
 * A factory rather than a constant so that the store is chosen by the
 * composition root instead of being baked in here — the handler would otherwise
 * have to import persistence to pick one, which is the boundary this layer
 * exists to hold.
 */
export function createPortfolioRoute(
  store?: ProjectStore,
): (request: Request) => Promise<Response> {
  return (request) => handleGetPortfolio(request, resolveDemoViewer(), store);
}

/**
 * The same wiring for a caller that renders instead of responding.
 *
 * Pairs with `createPortfolioRoute`: one store decision in the composition
 * root feeds both, so the page and the API can never be reading from different
 * places.
 */
export function createPortfolioReader(
  store?: ProjectStore,
): (params: URLSearchParams) => Promise<Result<PortfolioResponse>> {
  return (params) => readPortfolio(params, resolveDemoViewer(), store);
}

/**
 * Validate the query string.
 *
 * Everything here arrives from the client, so an unrecognised value is
 * rejected with 400 rather than quietly ignored: silently dropping an unknown
 * `stage` would show an investor a wider portfolio than they asked for and let
 * them believe it was filtered.
 */
export function parsePortfolioQuery(
  params: URLSearchParams,
): Result<PortfolioQuery> {
  const mandateMatch = parseBoolean(
    params.get("mandate_match"),
    DEFAULT_PORTFOLIO_QUERY.mandateMatch,
  );

  if (!mandateMatch.ok) {
    return mandateMatch;
  }

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

function parseBoolean(value: string | null, fallback: boolean): Result<boolean> {
  if (value === null) {
    return ok(fallback);
  }

  if (value === "true" || value === "false") {
    return ok(value === "true");
  }

  return failure("invalid_query", "Expected true or false.", {
    parameter: "mandate_match",
    value,
  });
}
