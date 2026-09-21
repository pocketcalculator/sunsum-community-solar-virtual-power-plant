import type { CandidateParcelCollection } from "@/domain/candidate-parcels";

import type { Viewer } from "../identity";
import { failure, ok, type Result } from "../shared";

/**
 * Candidate parcels: the map layer behind "where could a project go?".
 *
 * The parcels come from a third-party GIS service under a credential the
 * platform holds. Core owns this interface and never learns that the other side
 * is HTTP, ArcGIS, or reachable at all — the same split as {@link
 * ViabilityClient} in `./types`, and for the same reason: the rule about *who
 * may see parcels* is a domain rule and has to stay testable without a network.
 *
 * Note what this deliberately is not. There is no parameter for a layer, a
 * filter, a bounding box or a field list, because the endpoint in front of it
 * accepts none. A reader that took a caller-supplied query would turn a
 * fixed-purpose lookup into a general proxy onto someone else's subscription,
 * which is the thing the design set out to avoid.
 */
export interface CandidateParcelReader {
  /**
   * Returns the full approved parcel set, or throws if upstream cannot be
   * reached and nothing usable is cached.
   *
   * Throwing rather than returning a `Result` keeps the seam narrow: the
   * adapter reports a transport problem in the one way transports fail, and
   * {@link getCandidateParcels} is the single place that becomes a `Failure`.
   */
  read(): Promise<CandidateParcelCollection>;
}

/**
 * Who may see parcel boundaries.
 *
 * Site owners need them to point at the land they are offering, and operators
 * need them to run intake. Investors are excluded: `docs/api/README.md` already
 * withholds exact addresses and coordinates from investor-facing payloads, and
 * a parcel boundary is a more precise location than the fields that policy
 * exists to redact. Granting it here would quietly reverse that decision for
 * the whole investor tier.
 *
 * Anonymous callers are refused earlier, by session resolution, and so never
 * reach this check.
 */
const PARCEL_VIEWER_ROLES = ["site_owner", "operator"] as const;

function mayViewParcels(viewer: Viewer): boolean {
  return PARCEL_VIEWER_ROLES.some((role) => role === viewer.role);
}

export async function getCandidateParcels(
  viewer: Viewer,
  reader: CandidateParcelReader,
): Promise<Result<CandidateParcelCollection>> {
  if (!mayViewParcels(viewer)) {
    return failure(
      "forbidden_role",
      "Parcel boundaries are available to site owners and operators.",
    );
  }

  try {
    return ok(await reader.read());
  } catch {
    /**
     * The upstream reason is swallowed on purpose. A GIS credential or
     * configuration fault is an operational fact about us, not advice for the
     * caller, and echoing it would let an authenticated user probe the state of
     * a third-party subscription. The adapter logs the bounded detail; the
     * caller gets the one thing they can act on, which is "try later".
     */
    return failure(
      "service_unavailable",
      "Parcel boundaries are temporarily unavailable.",
    );
  }
}

/**
 * A small synthetic parcel set, used when `SUNSUM_PARCELS` is unset.
 *
 * Invented rectangles with invented identifiers. None of this is derived from
 * the licensed dataset: committing real parcel geometry would put a third
 * party's data in the repository, which is one of the things keeping the
 * credential server-side is meant to prevent.
 *
 * It exists so the map is developable. A clean checkout, `npm test` and CI have
 * no ArcGIS subscription, and without a default reader the endpoint would be a
 * 503 everywhere except production — which is the slowest possible way for the
 * frontend to discover it got the shape wrong.
 */
const DEMO_PARCELS: CandidateParcelCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "demo-1",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-84.376, 33.752],
            [-84.374, 33.752],
            [-84.374, 33.754],
            [-84.376, 33.754],
            [-84.376, 33.752],
          ],
        ],
      },
      properties: {
        parcel_id: "DEMO-0001",
        site_address: "100 Example Works Rd",
        city: "ATLANTA",
        state: "GA",
        postal_code: "30312",
      },
    },
    {
      type: "Feature",
      id: "demo-2",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-84.37, 33.752],
            [-84.367, 33.752],
            [-84.367, 33.754],
            [-84.37, 33.754],
            [-84.37, 33.752],
          ],
        ],
      },
      properties: {
        parcel_id: "DEMO-0002",
        site_address: "220 Sample Distribution Way",
        city: "ATLANTA",
        state: "GA",
        postal_code: "30315",
      },
    },
    {
      /** A deliberate gap: the upstream extract has rows with no address. */
      type: "Feature",
      id: "demo-3",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-84.383, 33.748],
            [-84.38, 33.748],
            [-84.38, 33.751],
            [-84.383, 33.751],
            [-84.383, 33.748],
          ],
        ],
      },
      properties: {
        parcel_id: "DEMO-0003",
        site_address: null,
        city: "ATLANTA",
        state: "GA",
        postal_code: null,
      },
    },
  ],
  metadata: { fetched_at: "2026-01-01T00:00:00.000Z", stale: false },
};

export const demoCandidateParcelReader: CandidateParcelReader = {
  read: () => Promise.resolve(DEMO_PARCELS),
};
