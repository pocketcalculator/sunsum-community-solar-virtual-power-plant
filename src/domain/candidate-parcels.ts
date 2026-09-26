/**
 * The candidate-parcel map contract.
 *
 * This is the shape the browser receives from `GET /api/sites/candidate-parcels`
 * and the only shape it is allowed to know about. The upstream GIS service has
 * a wider, noisier record per parcel — including owner names and appraised
 * values — and none of that vocabulary appears here, so a field cannot reach a
 * map layer by being passed through untouched.
 *
 * Deliberately a valid GeoJSON `FeatureCollection` rather than a bespoke
 * envelope, so any mapping library can consume it directly without a translation
 * step in the frontend.
 *
 * Pure data with no React, styling or routing: a feature module and the backend
 * can both depend on it without depending on each other.
 */

/**
 * A position is `[longitude, latitude]`, in that order, in EPSG:4326.
 *
 * The order is GeoJSON's, and it is the reverse of how people say coordinates
 * aloud. Stated here because a silent transposition renders a parcel in the
 * wrong hemisphere rather than failing.
 */
export type CandidateParcelPosition = readonly [number, number];

export type CandidateParcelRing = readonly CandidateParcelPosition[];

/**
 * Parcels are areas, so only the polygon geometries are modelled.
 *
 * A parcel that arrives as a point or a line is not a boundary we can draw and
 * is rejected upstream rather than widened into this union.
 */
export type CandidateParcelGeometry =
  | { readonly type: "Polygon"; readonly coordinates: readonly CandidateParcelRing[] }
  | {
      readonly type: "MultiPolygon";
      readonly coordinates: readonly (readonly CandidateParcelRing[])[];
    };

/**
 * The approved attributes, and the complete list of them.
 *
 * Every field is nullable because the upstream dataset is a public assessor
 * extract with genuine gaps; an absent address is a fact about the parcel, not
 * an error. Omitting the key entirely would make "not supplied" and "not
 * approved for release" indistinguishable to the client.
 *
 * Ownership and valuation attributes are not represented here on purpose. They
 * exist upstream, they are not ours to redistribute, and the only way to keep
 * them out reliably is for the type that crosses the wire to have no room for
 * them.
 */
export interface CandidateParcelProperties {
  readonly parcel_id: string | null;
  readonly site_address: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly postal_code: string | null;
}

export interface CandidateParcelFeature {
  readonly type: "Feature";
  /** Stable upstream identifier, used by the map to key and select a shape. */
  readonly id: string;
  readonly geometry: CandidateParcelGeometry;
  readonly properties: CandidateParcelProperties;
}

/**
 * How old the answer is, and whether it is being served past its refresh point.
 *
 * `stale` is true when the upstream could not be reached and a previously
 * cached copy is being served instead. The map is expected to surface that
 * rather than hide it: a parcel boundary that silently stops updating is worse
 * than one labelled as last known good.
 */
export interface CandidateParcelMetadata {
  /** ISO 8601 instant at which this data was retrieved from upstream. */
  readonly fetched_at: string;
  readonly stale: boolean;
}

/**
 * `metadata` is a GeoJSON foreign member: RFC 7946 §6.1 permits additional
 * members on a `FeatureCollection`, and parsers ignore what they do not
 * recognise. That keeps the payload directly loadable by a mapping library
 * while still carrying freshness information for the UI.
 */
export interface CandidateParcelCollection {
  readonly type: "FeatureCollection";
  readonly features: readonly CandidateParcelFeature[];
  readonly metadata: CandidateParcelMetadata;
}
