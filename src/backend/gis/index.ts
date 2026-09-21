import type {
  CandidateParcelCollection,
  CandidateParcelFeature,
  CandidateParcelGeometry,
  CandidateParcelPosition,
  CandidateParcelRing,
} from "@/domain/candidate-parcels";

import { demoCandidateParcelReader, type CandidateParcelReader } from "@/backend/core";

/**
 * The GIS seam — the platform's side of the ArcGIS parcel service.
 *
 * This is the only module that holds the ArcGIS credential, and the only one
 * that knows ArcGIS exists. Everything above it sees {@link
 * CandidateParcelReader}: a no-argument read that returns approved parcels.
 *
 * The shape of this module follows from one decision: the browser never talks
 * to ArcGIS. A credential shipped to the client is a reusable credential, and a
 * token minted for the client is reusable too, so neither can be handed out
 * however the handoff is dressed up. The consequence is that this file is not a
 * proxy — it takes no caller input at all. The layer, the filter and the field
 * list are fixed below, so there is no parameter through which a caller could
 * reach a different layer, widen the `where`, or ask for a column we chose not
 * to publish.
 *
 * Mirrors `SUNSUM_VIABILITY` and `SUNSUM_STORE`: `SUNSUM_PARCELS=demo` is the
 * default so a clean checkout, `npm test` and CI all work with no ArcGIS
 * subscription, and `SUNSUM_PARCELS=arcgis` points at the real service. An
 * unrecognised value throws rather than falling back, because a typo would
 * otherwise present as a working map quietly drawn from fixtures.
 *
 * Deliberately no `import "server-only"`, matching the sibling adapters in
 * `viability/` and `blob/`. That marker is used here only on the database
 * internals, which nothing re-exports; this module is reachable from the
 * `@/backend` barrel, and a module in that graph that throws on import outside
 * a server component breaks every test importing the barrel. The boundary it
 * would guard is already enforced statically, and tested: `architecture.test.ts`
 * runs the real ESLint config and asserts that a client component importing
 * `@/backend` is an error. No credential is read at module scope either — the
 * secret is read inside {@link candidateParcelReader}, not baked into the graph.
 */

export const PARCEL_MODES = ["demo", "arcgis"] as const;

export type ParcelMode = (typeof PARCEL_MODES)[number];

export function isParcelMode(value: string): value is ParcelMode {
  return PARCEL_MODES.some((mode) => mode === value);
}

/**
 * The upstream attribute names we publish, and what each becomes.
 *
 * This is an allowlist, not a redaction list. The upstream record also carries
 * owner names and appraised values; those are absent here and, because the
 * projection below reconstructs each feature rather than spreading the upstream
 * object, absence is sufficient. A new column appearing upstream cannot reach a
 * client by default — it has to be added here first.
 */
const PUBLISHED_FIELDS = {
  PARCELID: "parcel_id",
  SITEADDRESS: "site_address",
  SITECITY: "city",
  SITESTATE: "state",
  SITEZIP: "postal_code",
} as const satisfies Record<string, string>;

/** The identifier column, requested alongside the published fields. */
const ID_FIELD = "ObjectId";

const OUT_FIELDS = [ID_FIELD, ...Object.keys(PUBLISHED_FIELDS)].join(",");

const DEFAULT_TOKEN_URL = "https://www.arcgis.com/sharing/rest/oauth2/token";

/** Where a named user's sign-in is exchanged for a token. Interim path only. */
const DEFAULT_LEGACY_TOKEN_URL = "https://www.arcgis.com/sharing/rest/generateToken";

/** What an interim user token is bound to when nothing else is configured. */
const DEFAULT_REFERER = "https://sunsum.local";

/** One request's patience, matching the viability seam. */
const DEFAULT_TIMEOUT_MS = 10_000;

/** How long a successful read is served without going back upstream. */
const FRESH_MS = 60 * 60 * 1000;

/**
 * How far past {@link FRESH_MS} a cached copy may still be served when upstream
 * is unreachable. Parcel boundaries change on the timescale of a county
 * assessor's revisions, so a day-old boundary is materially correct; a blank
 * map is not.
 */
const STALE_MAX_MS = 24 * 60 * 60 * 1000;

/** After a failure, stop hammering a service that is already struggling. */
const FAILURE_COOLDOWN_MS = 60 * 1000;

/** Renew before expiry, so an in-flight request cannot straddle it. */
const TOKEN_EXPIRY_MARGIN_MS = 5 * 60 * 1000;

/** Minted lifetime requested from ArcGIS, in minutes. */
const TOKEN_LIFETIME_MINUTES = 60;

/** The same lifetime in seconds, which is the unit an OAuth response reports. */
const TOKEN_LIFETIME_SECONDS = TOKEN_LIFETIME_MINUTES * 60;

/**
 * A ceiling on what we will hold in memory from upstream.
 *
 * The published layer is a few dozen parcels and roughly 11 KB of GeoJSON. A
 * response orders of magnitude larger means the layer changed into something
 * this endpoint was not scoped for, and buffering it would be the failure
 * rather than a symptom of one.
 */
const MAX_RESPONSE_BYTES = 1024 * 1024;

/**
 * An upstream refusal of our credential, as distinct from a transport blip.
 *
 * The two are handled differently on purpose: a timeout falls back to the
 * cached copy, an authorization failure does not. Continuing to serve a third
 * party's dataset after the subscription that entitled us to it has stopped
 * accepting us is a licensing decision, and not one a cache should make by
 * default.
 */
export class ParcelAuthorizationError extends Error {}

export interface ArcGisParcelReaderOptions {
  /** Full feature-layer URL, including the layer index. */
  readonly layerUrl: string;
  /**
   * OAuth 2.0 client credentials for a registered application. Preferred.
   *
   * App authentication rather than a user account, which is Esri's documented
   * model for a server-side process reading private content. The practical
   * differences are all on our side: privileges are granted to the app instead
   * of inherited from whichever human the account belongs to, nothing breaks
   * when that person's password changes or they leave, and the secret can be
   * rotated without touching an identity anyone signs in with.
   *
   * It also removes a coupling. A token minted from a user account has to be
   * bound to a referer or a request IP — App Service egress addresses are
   * shared and rotate, so that meant pinning a referer and replaying it on
   * every query. An app token carries its own authority and needs neither.
   */
  readonly clientId?: string;
  readonly clientSecret?: string;
  /**
   * A named user's sign-in. Interim only.
   *
   * Supported because the account we were given access to is of this kind, and
   * an integration that cannot run until a different credential is issued is
   * an integration nobody can review. It is strictly worse than the above: the
   * token inherits every privilege that person holds, which for an
   * organisation administrator is far more than reading one layer, and it
   * stops working the day they rotate their password or leave.
   *
   * Set the app credentials and this is ignored — that is the migration, and
   * it needs no code change.
   */
  readonly username?: string;
  readonly password?: string;
  /** Interim only: the referer a user token is bound to. Not a secret. */
  readonly referer?: string;
  readonly tokenUrl?: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
  /** Injectable clock, so cache expiry is testable without waiting an hour. */
  readonly now?: () => number;
}

/**
 * Picks the credential to use, preferring the application one.
 *
 * Preference rather than rejection when both are present: during migration a
 * deployment may briefly carry both, and the safe resolution is to use the
 * better one rather than fail.
 */
function resolveCredential(options: ArcGisParcelReaderOptions): ArcGisCredential {
  const clientId = options.clientId?.trim();
  const clientSecret = options.clientSecret?.trim();
  if (clientId && clientSecret) {
    return { kind: "app", clientId, clientSecret };
  }

  const username = options.username?.trim();
  const password = options.password?.trim();
  if (username && password) {
    return {
      kind: "user",
      username,
      password,
      referer: options.referer?.trim() || DEFAULT_REFERER,
    };
  }

  throw new Error(
    "ArcGIS credentials are not configured. Set SUNSUM_ARCGIS_CLIENT_ID and " +
      "SUNSUM_ARCGIS_CLIENT_SECRET, or SUNSUM_ARCGIS_USERNAME and " +
      "SUNSUM_ARCGIS_PASSWORD as an interim.",
  );
}

interface CachedToken {
  readonly token: string;
  readonly expiresAt: number;
}

interface CachedParcels {
  readonly collection: CandidateParcelCollection;
  readonly fetchedAt: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNullableString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  /**
   * Assessor extracts routinely type a ZIP or a parcel number as a number.
   * Coercing is correct here; the alternative is dropping a real value because
   * of how someone else's schema stores it.
   */
  return typeof value === "number" && Number.isFinite(value) ? String(value) : null;
}

function isPosition(value: unknown): value is readonly number[] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

/**
 * Narrows a position to exactly `[lon, lat]`.
 *
 * ArcGIS can emit a third ordinate. It is dropped rather than carried, because
 * an elevation we neither asked for nor validated is not something the map
 * contract promises, and passing it through would make the wire shape depend on
 * upstream configuration.
 */
function toPosition(value: readonly number[]): CandidateParcelPosition {
  return [value[0] as number, value[1] as number];
}

/** A linear ring needs four positions to close; fewer is not an area. */
function toRing(value: unknown): CandidateParcelRing | null {
  if (!Array.isArray(value) || value.length < 4) return null;
  const ring: CandidateParcelPosition[] = [];
  for (const position of value) {
    if (!isPosition(position)) return null;
    ring.push(toPosition(position));
  }
  return ring;
}

function toRings(value: unknown): readonly CandidateParcelRing[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const rings: CandidateParcelRing[] = [];
  for (const candidate of value) {
    const ring = toRing(candidate);
    if (ring === null) return null;
    rings.push(ring);
  }
  return rings;
}

/**
 * Validates and narrows an upstream geometry, or rejects the feature.
 *
 * Only areas are accepted. A parcel that arrives as a point or a line is not a
 * boundary the map can draw, and admitting it would push the problem into the
 * browser, where it surfaces as a rendering bug rather than a data one.
 */
export function toParcelGeometry(value: unknown): CandidateParcelGeometry | null {
  const geometry = asRecord(value);

  if (geometry.type === "Polygon") {
    const coordinates = toRings(geometry.coordinates);
    return coordinates === null ? null : { type: "Polygon", coordinates };
  }

  if (geometry.type === "MultiPolygon") {
    if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) {
      return null;
    }
    const polygons: (readonly CandidateParcelRing[])[] = [];
    for (const candidate of geometry.coordinates) {
      const rings = toRings(candidate);
      if (rings === null) return null;
      polygons.push(rings);
    }
    return { type: "MultiPolygon", coordinates: polygons };
  }

  return null;
}

/**
 * Rebuilds one feature from the approved fields.
 *
 * Every property is named explicitly. Nothing in this function spreads the
 * upstream attributes, which is what makes the allowlist above load-bearing
 * rather than advisory.
 */
export function toParcelFeature(value: unknown): CandidateParcelFeature | null {
  const feature = asRecord(value);
  const geometry = toParcelGeometry(feature.geometry);
  if (geometry === null) return null;

  const attributes = asRecord(feature.properties);
  const id = asNullableString(attributes[ID_FIELD]) ?? asNullableString(feature.id);
  if (id === null) return null;

  return {
    type: "Feature",
    id,
    geometry,
    properties: {
      parcel_id: asNullableString(attributes.PARCELID),
      site_address: asNullableString(attributes.SITEADDRESS),
      city: asNullableString(attributes.SITECITY),
      state: asNullableString(attributes.SITESTATE),
      postal_code: asNullableString(attributes.SITEZIP),
    },
  };
}

/**
 * Translates an upstream GeoJSON payload into the published collection.
 *
 * Unusable features are skipped rather than failing the whole read: one
 * malformed row in an assessor extract should not blank the map. A payload that
 * is not a feature collection at all, or that reports an ArcGIS error, does
 * throw — that is a fault, not a gap.
 */
export function toParcelCollection(
  body: unknown,
  fetchedAt: string,
): CandidateParcelCollection {
  const root = asRecord(body);

  /**
   * ArcGIS answers `200 OK` with an error document. Checking the status code
   * alone would cache a failure as though it were data.
   */
  const error = asRecord(root.error);
  if (Object.keys(error).length > 0) {
    const message = asNullableString(error.message) ?? "unknown error";
    const code = error.code;
    if (code === 498 || code === 499 || code === 403) {
      throw new ParcelAuthorizationError(`ArcGIS rejected the token: ${message}`);
    }
    throw new Error(`ArcGIS returned an error: ${message}`);
  }

  if (root.type !== "FeatureCollection" || !Array.isArray(root.features)) {
    throw new Error("ArcGIS did not return a GeoJSON feature collection.");
  }

  const features: CandidateParcelFeature[] = [];
  for (const candidate of root.features) {
    const feature = toParcelFeature(candidate);
    if (feature !== null) features.push(feature);
  }

  return {
    type: "FeatureCollection",
    features,
    metadata: { fetched_at: fetchedAt, stale: false },
  };
}

function requireSetting(value: string, name: string): string {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new Error(`${name} is required when SUNSUM_PARCELS=arcgis.`);
  }
  return trimmed;
}

/**
 * How we prove who we are to ArcGIS.
 *
 * `app` is the destination: an OAuth 2.0 client credential belonging to an
 * application, scoped to the layers it needs. `user` is a named person's
 * sign-in, which carries that person's whole privilege set and dies with their
 * account — it exists here only so the integration can run before a scoped
 * application credential has been issued. Both mint a token the same way from
 * the caller's point of view; they differ in endpoint, request shape, and how
 * expiry is reported, which is why this is a union rather than a pair of
 * optional fields.
 */
export type ArcGisCredential =
  | { readonly kind: "app"; readonly clientId: string; readonly clientSecret: string }
  | {
      readonly kind: "user";
      readonly username: string;
      readonly password: string;
      /**
       * A user token must be bound to something. Of Esri's binding modes only
       * referer holds for us: `requestip` pins the token to the address it was
       * minted from, and egress addresses behind NAT or App Service are not
       * stable between the token call and the query — verified, not assumed,
       * by a token that minted cleanly and was then refused as "Invalid token"
       * on the very next request.
       *
       * This is a binding value, not a secret, and it is not a security
       * boundary — anyone can send any referer. It exists so ArcGIS has
       * something stable to tie the token to. The app credential needs none of
       * this, which is one more reason it is the destination.
       */
      readonly referer: string;
    };

export class ArcGisCandidateParcelReader implements CandidateParcelReader {
  private readonly layerUrl: string;
  private readonly credential: ArcGisCredential;
  private readonly tokenUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  private token: CachedToken | null = null;
  private cache: CachedParcels | null = null;
  private inFlight: Promise<CandidateParcelCollection> | null = null;
  private lastFailureAt: number | null = null;

  constructor(options: ArcGisParcelReaderOptions) {
    /**
     * Configuration is validated at construction rather than at import, so a
     * missing credential fails the parcel endpoint instead of process
     * start-up. The rest of the API has no business going down because a map
     * layer is misconfigured.
     */
    this.layerUrl = requireSetting(options.layerUrl, "SUNSUM_ARCGIS_LAYER_URL").replace(
      /\/+$/,
      "",
    );
    this.credential = resolveCredential(options);
    this.tokenUrl =
      options.tokenUrl ??
      (this.credential.kind === "app" ? DEFAULT_TOKEN_URL : DEFAULT_LEGACY_TOKEN_URL);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async read(): Promise<CandidateParcelCollection> {
    const now = this.now();

    const cached = this.cache;
    if (cached !== null && now - cached.fetchedAt < FRESH_MS) {
      return cached.collection;
    }

    /**
     * A single refresh is shared by every concurrent caller. Without this, a
     * burst of map loads after expiry would each mint a token and each pull the
     * layer, making our own traffic the thing that breaks the upstream.
     */
    const existing = this.inFlight;
    if (existing !== null) return existing;

    if (this.lastFailureAt !== null && now - this.lastFailureAt < FAILURE_COOLDOWN_MS) {
      return this.serveStaleOr(
        new Error("Parcel refresh is in its failure cooldown."),
        now,
      );
    }

    const refresh = this.refresh(now);
    this.inFlight = refresh;

    try {
      return await refresh;
    } catch (cause) {
      this.lastFailureAt = this.now();
      /**
       * A lost entitlement is not something to paper over with cached data, so
       * it propagates whether or not a copy is held.
       */
      if (cause instanceof ParcelAuthorizationError) throw cause;
      return this.serveStaleOr(cause, this.now());
    } finally {
      this.inFlight = null;
    }
  }

  /** Last known good, explicitly labelled, or the original failure. */
  private serveStaleOr(cause: unknown, now: number): CandidateParcelCollection {
    const cached = this.cache;
    if (cached !== null && now - cached.fetchedAt < STALE_MAX_MS) {
      return {
        ...cached.collection,
        metadata: { ...cached.collection.metadata, stale: true },
      };
    }
    throw cause instanceof Error ? cause : new Error(String(cause));
  }

  private async refresh(now: number): Promise<CandidateParcelCollection> {
    const token = await this.acquireToken(now);

    const url = new URL(`${this.layerUrl}/query`);
    url.searchParams.set("where", "1=1");
    url.searchParams.set("outFields", OUT_FIELDS);
    url.searchParams.set("returnGeometry", "true");
    url.searchParams.set("outSR", "4326");
    url.searchParams.set("f", "geojson");
    url.searchParams.set("token", token);

    const response = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        /**
         * Replayed only for a referer-bound user token; an app token carries
         * its own authority and ArcGIS ignores this.
         */
        ...(this.credential.kind === "user"
          ? { referer: this.credential.referer }
          : {}),
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (response.status === 401 || response.status === 403) {
      throw new ParcelAuthorizationError(
        `ArcGIS refused the parcel query with ${response.status}.`,
      );
    }
    if (!response.ok) {
      throw new Error(
        `ArcGIS parcel query responded ${response.status} ${response.statusText}.`,
      );
    }

    const collection = toParcelCollection(
      JSON.parse(await this.readBounded(response)),
      new Date(now).toISOString(),
    );

    this.cache = { collection, fetchedAt: now };
    this.lastFailureAt = null;
    return collection;
  }

  /**
   * Reads the body with a ceiling, refusing a declared length before
   * downloading when upstream is honest enough to declare one.
   */
  private async readBounded(response: Response): Promise<string> {
    const declared = Number(response.headers.get("content-length") ?? Number.NaN);
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
      throw new Error(`ArcGIS response declared ${declared} bytes.`);
    }

    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new Error(`ArcGIS response exceeded ${MAX_RESPONSE_BYTES} bytes.`);
    }
    return text;
  }

  private async acquireToken(now: number): Promise<string> {
    const cached = this.token;
    if (cached !== null && cached.expiresAt - TOKEN_EXPIRY_MARGIN_MS > now) {
      return cached.token;
    }

    const form =
      this.credential.kind === "app"
        ? new URLSearchParams({
            client_id: this.credential.clientId,
            client_secret: this.credential.clientSecret,
            /**
             * App authentication. The token carries the application's own
             * privileges and is not bound to a referer or a request IP, so
             * there is nothing to replay on the query and nothing that breaks
             * when App Service moves us to a different egress address.
             */
            grant_type: "client_credentials",
            expiration: String(TOKEN_LIFETIME_MINUTES),
            f: "json",
          })
        : new URLSearchParams({
            username: this.credential.username,
            password: this.credential.password,
            /**
             * Referer binding, replayed as a header on every query below.
             * `requestip` was tried first and is not usable here: the token
             * minted successfully and the next request was refused outright,
             * because the two calls left through different egress addresses.
             */
            client: "referer",
            referer: this.credential.referer,
            expiration: String(TOKEN_LIFETIME_MINUTES),
            f: "json",
          });

    const response = await this.fetchImpl(this.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: form.toString(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new ParcelAuthorizationError(
        `ArcGIS token request responded ${response.status} ${response.statusText}.`,
      );
    }

    const body = asRecord(JSON.parse(await this.readBounded(response)));

    /** Token failures also arrive as `200 OK` with an error document. */
    const error = asRecord(body.error);
    if (Object.keys(error).length > 0) {
      throw new ParcelAuthorizationError(
        `ArcGIS declined to mint a token: ${asNullableString(error.message) ?? "unknown error"}.`,
      );
    }

    /**
     * The two endpoints name the token differently: OAuth returns
     * `access_token`, `generateToken` returns `token`.
     */
    const token =
      asNullableString(body.access_token) ?? asNullableString(body.token);
    if (token === null) {
      throw new ParcelAuthorizationError("ArcGIS token response contained no token.");
    }

    /**
     * And they report expiry differently. OAuth gives `expires_in` as seconds
     * from now; `generateToken` gives `expires` as absolute epoch
     * milliseconds. Reading one as the other is not a small error — an
     * absolute timestamp read as a duration expires in 1970 and re-mints on
     * every single call, and a duration read as absolute never expires at all
     * and keeps using a dead token.
     */
    const expiresAt =
      this.credential.kind === "app"
        ? now + readLifetimeSeconds(body.expires_in) * 1000
        : readAbsoluteExpiry(body.expires, now);

    this.token = { token, expiresAt };
    return token;
  }
}

/** OAuth `expires_in`, in seconds from now. */
function readLifetimeSeconds(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : TOKEN_LIFETIME_SECONDS;
}

/**
 * `generateToken` `expires`, as absolute epoch milliseconds.
 *
 * A value at or before now is treated as absent rather than as an
 * already-expired token, so a malformed response re-mints on the configured
 * lifetime instead of spinning.
 */
function readAbsoluteExpiry(value: unknown, now: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > now
    ? value
    : now + TOKEN_LIFETIME_SECONDS * 1000;
}

let configured: CandidateParcelReader | null = null;

export function selectedParcelMode(): ParcelMode {
  const mode = process.env.SUNSUM_PARCELS ?? "demo";
  if (!isParcelMode(mode)) {
    throw new Error(
      `SUNSUM_PARCELS must be one of ${PARCEL_MODES.join(", ")}; received ${JSON.stringify(mode)}.`,
    );
  }
  return mode;
}

/**
 * The reader this deployment uses, memoised so its caches survive between
 * requests. A per-request instance would hold an empty cache and mint a fresh
 * token on every map load.
 */
export function candidateParcelReader(): CandidateParcelReader {
  if (configured === null) {
    if (selectedParcelMode() === "arcgis") {
      const timeout = Number(process.env.SUNSUM_ARCGIS_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
      const tokenUrl = process.env.SUNSUM_ARCGIS_TOKEN_URL;
      configured = new ArcGisCandidateParcelReader({
        layerUrl: process.env.SUNSUM_ARCGIS_LAYER_URL ?? "",
        clientId: process.env.SUNSUM_ARCGIS_CLIENT_ID ?? "",
        clientSecret: process.env.SUNSUM_ARCGIS_CLIENT_SECRET ?? "",
        username: process.env.SUNSUM_ARCGIS_USERNAME ?? "",
        password: process.env.SUNSUM_ARCGIS_PASSWORD ?? "",
        referer: process.env.SUNSUM_ARCGIS_REFERER ?? "",
        timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
        ...(tokenUrl === undefined || tokenUrl.trim() === "" ? {} : { tokenUrl }),
      });
    } else {
      configured = demoCandidateParcelReader;
    }
  }

  return configured;
}

/** Test helper — drops the memoised reader so the next call re-reads the env. */
export function resetCandidateParcelReader(): void {
  configured = null;
}
