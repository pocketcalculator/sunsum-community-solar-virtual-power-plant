import type { Metadata } from "next";
import {
  readPortfolioView,
  type PortfolioItem,
  type PortfolioResponse,
} from "@/backend";
import {
  PortfolioUnavailable,
  PortfolioView,
  type PortfolioProjectView,
  type PortfolioViewModel,
} from "@/features/portfolio";

export const metadata: Metadata = {
  title: "Your portfolio",
  description:
    "Community solar projects visible to an investor in this public preview, at the disclosure tier their onboarding allows.",
};

/**
 * Never prerendered.
 *
 * The answer depends on who is asking and on rows that change after the build,
 * so a cached copy would be wrong the moment an operator publishes a project.
 * It also keeps `next build` from needing a database.
 */
export const dynamic = "force-dynamic";

interface PortfolioPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * `GET /portfolio` as a page.
 *
 * This route is an adapter and nothing else. It reads the portfolio through
 * the backend's public entry point — the same validation, viewer and
 * authorization the JSON endpoint uses — and translates the answer into the
 * shape the feature renders.
 *
 * It deliberately does not `fetch("/api/portfolio")`. The server already has
 * the answer, so asking itself over HTTP would add a round trip, a second way
 * for the call to fail, and a URL to get wrong in each environment.
 */
export default async function PortfolioPage({
  searchParams,
}: PortfolioPageProps) {
  const result = await readPortfolioView(toSearchParams(await searchParams));

  if (!result.ok) {
    return <PortfolioUnavailable message={result.failure.message} />;
  }

  return <PortfolioView view={toViewModel(result.value)} />;
}

/**
 * Next's `searchParams` into the `URLSearchParams` the backend validates.
 *
 * Repeated keys are preserved rather than collapsed, because `?stage=a&stage=b`
 * is two stages and the query parser is built to read both.
 */
function toSearchParams(
  params: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    for (const item of typeof value === "string" ? [value] : (value ?? [])) {
      search.append(key, item);
    }
  }

  return search;
}

/**
 * The wire payload into the view model.
 *
 * Written as an explicit field list for the same reason the projection in
 * `core` is: this is the seam between the API contract and the interface, and
 * a rename on either side should stop the build here rather than render as a
 * blank value.
 */
function toViewModel(response: PortfolioResponse): PortfolioViewModel {
  return {
    projects: response.items.map(toProjectView),
    totalEstimatedCapacityKw: response.total_estimated_capacity_kw,
    mandateMatch: response.mandate_match,
  };
}

function toProjectView(item: PortfolioItem): PortfolioProjectView {
  return {
    id: item.project_id,
    name: item.name,
    locality: item.locality,
    stage: item.stage,
    siteType: item.site_type,
    projectType: item.preliminary_project_type,
    viability: item.viability_status,
    systemSizeKwLow: item.estimated_system_size_kw_low,
    systemSizeKwHigh: item.estimated_system_size_kw_high,
    annualGenerationKwhLow: item.estimated_annual_generation_kwh_low,
    annualGenerationKwhHigh: item.estimated_annual_generation_kwh_high,
    openFundingNeeds: item.open_funding_needs_count,
  };
}
