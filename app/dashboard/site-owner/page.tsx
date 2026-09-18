import type { Metadata } from "next";
import { cookies } from "next/headers";

import { getOwnerSitesRoute } from "@/backend";
import {
  DASHBOARD_LOCATIONS,
  SiteOwnerDashboard,
  toDashboardLocations,
  type DashboardDataSource,
  type DashboardLocation,
} from "@/features/site-owner-dashboard";

export const metadata: Metadata = {
  title: "Site owner dashboard",
  description:
    "Sites you have submitted to Sunsum, with their review status and the next expected action.",
};

/**
 * The session lives in a cookie, so this page is per-request by definition and
 * must never be prerendered into a static shell shared between owners.
 */
export const dynamic = "force-dynamic";

interface OwnerSitesRead {
  readonly locations: readonly DashboardLocation[];
  readonly dataSource: DashboardDataSource;
}

const SAMPLE: OwnerSitesRead = {
  locations: DASHBOARD_LOCATIONS,
  dataSource: "sample",
};

/**
 * Reads the owner's sites through the same handler the HTTP route exports.
 *
 * Calling the handler directly rather than issuing a fetch to our own origin is
 * deliberate: it keeps one authorization path — `getOwnerSitesRoute` still runs
 * `requireRole("site_owner")` on the request built here — while avoiding a
 * server making a network round trip to itself, which needs a base URL that
 * differs between local, CI and App Service and fails in exactly the
 * environments a dashboard must not fail in.
 *
 * Any failure falls back to the illustrative sample rather than erroring: a
 * signed-out visitor, an expired session or a store that is down should still
 * see the feature, since this page is also the demo artefact.
 *
 * An empty array is not a failure and is deliberately not treated as one. A
 * signed-in owner with no submissions yet gets `live` with nothing in it, which
 * honestly shows they have submitted nothing; substituting the sample there
 * would tell them they own sites that do not exist.
 */
async function readOwnerSites(): Promise<OwnerSitesRead> {
  const cookieHeader = (await cookies()).toString();
  if (cookieHeader.length === 0) return SAMPLE;

  try {
    const response = await getOwnerSitesRoute(
      new Request("http://internal/api/me/sites", {
        headers: { cookie: cookieHeader },
      }),
    );
    if (!response.ok) return SAMPLE;

    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) return SAMPLE;

    return {
      locations: toDashboardLocations(rows as Record<string, unknown>[]),
      dataSource: "live",
    };
  } catch {
    return SAMPLE;
  }
}

export default async function SiteOwnerDashboardPage() {
  const { locations, dataSource } = await readOwnerSites();
  return <SiteOwnerDashboard locations={locations} dataSource={dataSource} />;
}