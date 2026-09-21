import { getCandidateParcels, type CandidateParcelReader } from "../../core/sites";
import { demoBackendStore, type BackendStore } from "../../core/store";
import { candidateParcelReader as selectParcelReader } from "../../gis";
import { resolveViewer } from "../identity";
import { failureResponse } from "../shared";

/**
 * `GET /api/sites/candidate-parcels` — the parcel layer behind the site map.
 *
 * Note what this endpoint does not accept. There is no layer, bounding box,
 * `where`, field list or token parameter, and a request carrying any query
 * string at all is refused. That is the whole difference between this and a
 * proxy: a proxy lets the caller choose what to ask a third party, and the
 * moment it does, our ArcGIS subscription is reachable by anyone who can reach
 * us. Refusing every parameter is how that stays true as the endpoint is
 * maintained — a future parameter has to be added deliberately, past this
 * comment and past a test.
 */

/**
 * The GeoJSON media type, per RFC 7946 §12.
 *
 * Served instead of `application/json` because it tells a mapping client what
 * it is holding without inspecting the body.
 */
const GEO_JSON_CONTENT_TYPE = "application/geo+json; charset=utf-8";

export async function handleGetCandidateParcels(
  request: Request,
  reader: CandidateParcelReader,
  store: BackendStore = demoBackendStore,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.search !== "") {
    return failureResponse({
      code: "invalid_query",
      message: "This endpoint takes no query parameters.",
    });
  }

  /**
   * Any signed-in participant resolves here; core decides which roles may
   * actually see boundaries. Keeping the role rule in core rather than swapping
   * in `requireRole` means the same rule applies to a job or a CLI that asks
   * the same question.
   */
  const viewer = await resolveViewer(request, store);
  if (!viewer.ok) return failureResponse(viewer.failure);

  const result = await getCandidateParcels(viewer.value, reader);
  if (!result.ok) return failureResponse(result.failure);

  return new Response(JSON.stringify(result.value), {
    status: 200,
    headers: {
      "content-type": GEO_JSON_CONTENT_TYPE,
      /**
       * The payload is identical for every permitted caller, but the decision
       * to release it is not: a shared cache that stored this could replay it
       * to an investor or an anonymous visitor, who are both refused above.
       */
      "cache-control": "no-store",
    },
  });
}

export function getCandidateParcelsRoute(request: Request): Promise<Response> {
  /**
   * The reader is resolved per request rather than defaulted in the signature,
   * so a misconfigured `SUNSUM_PARCELS` fails this endpoint instead of module
   * load. Selection itself can throw — an unset credential under
   * `SUNSUM_PARCELS=arcgis` is a configuration fault — and that is answered as
   * `service_unavailable` rather than escaping as an unhandled 500, which would
   * leak a stack trace naming our environment variables.
   */
  let reader: CandidateParcelReader;
  try {
    reader = selectParcelReader();
  } catch {
    return Promise.resolve(
      failureResponse({
        code: "service_unavailable",
        message: "Parcel boundaries are temporarily unavailable.",
      }),
    );
  }

  return handleGetCandidateParcels(request, reader);
}
