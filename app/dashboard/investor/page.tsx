import type { Metadata } from "next";
import { cookies } from "next/headers";

import { getMyEngagementsRoute, getPortfolioRoute } from "@/backend";
import {
  InvestorPortfolio,
  SAMPLE_PORTFOLIO,
  toEngagedProjectIds,
  toPortfolioView,
  type PortfolioDataSource,
  type PortfolioView,
} from "@/features/investor-portfolio";

export const metadata: Metadata = {
  title: "Investor portfolio",
  description:
    "Community solar projects released to investors, with their stage, viability and open funding needs.",
};

/**
 * The session lives in a cookie, so this page is per-request by definition and
 * must never be prerendered into a static shell shared between investors.
 */
export const dynamic = "force-dynamic";

interface PortfolioRead {
  readonly view: PortfolioView;
  readonly dataSource: PortfolioDataSource;
}

const SAMPLE: PortfolioRead = {
  view: SAMPLE_PORTFOLIO,
  dataSource: "sample",
};

/**
 * Reads the portfolio through the same handler the HTTP route exports.
 *
 * Calling the handler directly rather than fetching our own origin is the
 * pattern the site owner dashboard established: it keeps one authorization
 * path — `getPortfolioRoute` still runs `requireRole("investor")` on the
 * request built here — while avoiding a server making a network round trip to
 * itself, which needs a base URL that differs between local, CI and App
 * Service.
 *
 * Any failure falls back to the illustrative sample rather than erroring: a
 * signed-out visitor, an investor who has not finished onboarding, or a store
 * that is down should still see the feature, since this page is also the demo
 * artefact.
 *
 * An empty list is not a failure. An onboarded investor whose mandate matches
 * nothing gets `live` with nothing in it, which honestly shows there is
 * nothing to fund today; substituting the sample would tell them projects
 * exist that do not.
 */
async function readPortfolio(cookieHeader: string): Promise<PortfolioRead> {
  if (cookieHeader.length === 0) return SAMPLE;

  try {
    const response = await getPortfolioRoute(
      new Request("http://internal/api/portfolio", {
        headers: { cookie: cookieHeader },
      }),
    );
    if (!response.ok) return SAMPLE;

    const view = toPortfolioView(await response.json());
    return view === null ? SAMPLE : { view, dataSource: "live" };
  } catch {
    return SAMPLE;
  }
}

/**
 * Which projects this investor is already engaged on.
 *
 * Read separately from the portfolio because the two answer different
 * questions, and because a failure here must not cost the investor the
 * portfolio itself. Without it every already-engaged project would offer a
 * button whose only possible outcome is `409 conflict`.
 */
async function readEngagedProjectIds(
  cookieHeader: string,
): Promise<readonly string[]> {
  if (cookieHeader.length === 0) return [];

  try {
    const response = await getMyEngagementsRoute(
      new Request("http://internal/api/me/engagements", {
        headers: { cookie: cookieHeader },
      }),
    );
    if (!response.ok) return [];
    return toEngagedProjectIds(await response.json());
  } catch {
    return [];
  }
}

export default async function InvestorPortfolioPage() {
  const cookieHeader = (await cookies()).toString();
  const [{ view, dataSource }, engagedProjectIds] = await Promise.all([
    readPortfolio(cookieHeader),
    readEngagedProjectIds(cookieHeader),
  ]);

  return (
    <InvestorPortfolio
      dataSource={dataSource}
      initialEngagedProjectIds={engagedProjectIds}
      initialView={view}
    />
  );
}
