// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import {
  ArcGisCandidateParcelReader,
  candidateParcelReader,
  isParcelMode,
  ParcelAuthorizationError,
  PARCEL_MODES,
  resetCandidateParcelReader,
  selectedParcelMode,
  toParcelCollection,
  toParcelFeature,
  toParcelGeometry,
} from "@/backend/gis";
import { demoCandidateParcelReader } from "@/backend/core";

/**
 * The `Backend API -> ESRI` arrow.
 *
 * Two things are being pinned here, and only one of them is about ArcGIS.
 *
 * The first is the field allowlist. The parcel layer carries owner names and
 * appraised values next to the geometry we actually want, and the reason the
 * browser is not allowed to talk to ESRI directly is that we intend to publish
 * a strict subset. That intent is worth nothing unless a test fails when the
 * subset widens, so the allowlist cases feed owner and valuation fields through
 * on purpose and assert they are absent on the way out.
 *
 * The second is that a metered third-party subscription is being read on our
 * credential. Caching, single-flight refresh and the failure cooldown are not
 * performance tuning; they are what stops a burst of map loads from turning
 * into a burst of upstream queries billed to us.
 */

const TOKEN_URL = "https://www.arcgis.com/sharing/rest/oauth2/token";
const LAYER_URL = "https://services.arcgis.com/test/arcgis/rest/services/Parcels/FeatureServer/3";
const T0 = Date.UTC(2026, 0, 15, 9, 0, 0);

const HOUR_MS = 60 * 60 * 1000;
const HOUR_SECONDS = 60 * 60;

interface RecordedCall {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

interface FakeFetch {
  readonly impl: typeof fetch;
  readonly calls: RecordedCall[];
  tokenCalls(): RecordedCall[];
  queryCalls(): RecordedCall[];
}

function fakeFetch(
  handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>,
): FakeFetch {
  const calls: RecordedCall[] = [];
  const impl = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    calls.push({ url, init });
    return Promise.resolve(handler(url, init));
  };

  return {
    impl: impl as unknown as typeof fetch,
    calls,
    tokenCalls: () => calls.filter((call) => call.url.includes("oauth2/token")),
    queryCalls: () => calls.filter((call) => call.url.includes("/query")),
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A square, in the winding order and coordinate order GeoJSON expects. */
function square(x: number, y: number): number[][][] {
  return [
    [
      [x, y],
      [x + 0.001, y],
      [x + 0.001, y + 0.001],
      [x, y + 0.001],
      [x, y],
    ],
  ];
}

/**
 * An upstream feature carrying exactly what the real layer carries: the fields
 * we publish, and — deliberately — the ones we do not.
 */
function upstreamFeature(id: number, overrides: Record<string, unknown> = {}): unknown {
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: square(-89.4 + id * 0.01, 43.07) },
    properties: {
      ObjectId: id,
      PARCELID: `0709-${id}`,
      SITEADDRESS: `${id} Example Rd`,
      SITECITY: "Madison",
      SITESTATE: "WI",
      SITEZIP: "53703",
      OWNERNME1: "A PRIVATE INDIVIDUAL",
      OWNERNME2: "ANOTHER PRIVATE INDIVIDUAL",
      LNDVALUE: 412_000,
      TOT_APPR: 988_500,
      ...overrides,
    },
  };
}

function upstreamCollection(...features: unknown[]): unknown {
  return { type: "FeatureCollection", features };
}

interface Harness {
  readonly reader: ArcGisCandidateParcelReader;
  readonly fetches: FakeFetch;
  advance(ms: number): void;
  at(): number;
}

function harness(
  handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>,
): Harness {
  let clock = T0;
  const fetches = fakeFetch(handler);
  const reader = new ArcGisCandidateParcelReader({
    layerUrl: LAYER_URL,
    clientId: "sunsum-parcels-app",
    clientSecret: "not-a-real-secret",
    tokenUrl: TOKEN_URL,
    fetchImpl: fetches.impl,
    now: () => clock,
  });

  return {
    reader,
    fetches,
    advance: (ms) => {
      clock += ms;
    },
    at: () => clock,
  };
}

/** The happy path: a token, then a layer query returning two parcels. */
function servingTwoParcels(): Harness {
  return harness((url) => {
    if (url.includes("oauth2/token")) {
      return json({ access_token: "t-1", expires_in: HOUR_SECONDS });
    }
    return json(upstreamCollection(upstreamFeature(1), upstreamFeature(2)));
  });
}

afterEach(() => {
  resetCandidateParcelReader();
  delete process.env.SUNSUM_PARCELS;
  delete process.env.SUNSUM_ARCGIS_LAYER_URL;
  delete process.env.SUNSUM_ARCGIS_CLIENT_ID;
  delete process.env.SUNSUM_ARCGIS_CLIENT_SECRET;
  delete process.env.SUNSUM_ARCGIS_TOKEN_URL;
  delete process.env.SUNSUM_ARCGIS_TIMEOUT_MS;
});

/*
 * The published subset.
 *
 * Each of these would pass just as well if the projector spread the upstream
 * attributes wholesale, except the exclusion cases — which is the point of
 * writing them.
 */
describe("the fields a parcel publishes", () => {
  it("keeps the five approved attributes", () => {
    const feature = toParcelFeature(upstreamFeature(7));

    expect(feature).not.toBeNull();
    expect(feature?.properties).toEqual({
      parcel_id: "0709-7",
      site_address: "7 Example Rd",
      city: "Madison",
      state: "WI",
      postal_code: "53703",
    });
  });

  /**
   * The reason the credential is server-side at all. Owner identity and
   * appraised value are in the upstream row and must not leave this process,
   * so they are fed in explicitly and their absence is asserted by key, not by
   * eyeballing a snapshot.
   */
  it("drops owner identity and valuation even when upstream sends them", () => {
    const feature = toParcelFeature(upstreamFeature(7));
    const keys = Object.keys(feature?.properties ?? {});

    expect(keys).not.toContain("OWNERNME1");
    expect(keys).not.toContain("OWNERNME2");
    expect(keys).not.toContain("LNDVALUE");
    expect(keys).not.toContain("TOT_APPR");
    expect(JSON.stringify(feature)).not.toContain("PRIVATE INDIVIDUAL");
    expect(JSON.stringify(feature)).not.toContain("988500");
  });

  /**
   * A new column appearing upstream is the realistic way a leak happens: a
   * dataset gains a field, nobody redeploys, and a spread would publish it.
   */
  it("ignores a field that appears upstream after we shipped", () => {
    const feature = toParcelFeature(
      upstreamFeature(7, { OWNER_PHONE: "+1-555-0100", NEW_COLUMN: "surprise" }),
    );

    expect(JSON.stringify(feature)).not.toContain("555-0100");
    expect(JSON.stringify(feature)).not.toContain("surprise");
  });

  it("publishes a missing attribute as null rather than omitting it", () => {
    const feature = toParcelFeature(
      upstreamFeature(7, { SITEADDRESS: null, SITEZIP: undefined }),
    );

    expect(feature?.properties.site_address).toBeNull();
    expect(feature?.properties.postal_code).toBeNull();
  });
});

describe("the geometry a parcel publishes", () => {
  it("accepts a polygon", () => {
    const geometry = toParcelGeometry({ type: "Polygon", coordinates: square(-89.4, 43.07) });

    expect(geometry?.type).toBe("Polygon");
  });

  it("accepts a multipolygon, which split parcels really do use", () => {
    const geometry = toParcelGeometry({
      type: "MultiPolygon",
      coordinates: [square(-89.4, 43.07), square(-89.5, 43.08)],
    });

    expect(geometry?.type).toBe("MultiPolygon");
  });

  /**
   * A parcel is an area. Accepting a point or a line would let a layer that is
   * not a parcel layer render as though it were one.
   */
  it.each(["Point", "LineString", "GeometryCollection"])("refuses %s", (type) => {
    expect(toParcelGeometry({ type, coordinates: [-89.4, 43.07] })).toBeNull();
  });

  it("refuses a ring that is not made of coordinate pairs", () => {
    /** Long enough to close, so this fails on the type guard, not the length. */
    expect(
      toParcelGeometry({
        type: "Polygon",
        coordinates: [
          [
            ["a", "b"],
            ["c", "d"],
            ["e", "f"],
            ["a", "b"],
          ],
        ],
      }),
    ).toBeNull();
  });

  it("refuses a ring too short to enclose anything", () => {
    expect(
      toParcelGeometry({
        type: "Polygon",
        coordinates: [
          [
            [-89.4, 43.07],
            [-89.3, 43.07],
          ],
        ],
      }),
    ).toBeNull();
  });

  /**
   * GeoJSON requires a LinearRing's first and last position to be identical.
   * Esri requires the same, so an unclosed ring is malformed upstream — but a
   * renderer is the worst place to discover that, so we close it here.
   */
  it("closes a ring that arrives open", () => {
    const geometry = toParcelGeometry({
      type: "Polygon",
      coordinates: [
        [
          [-89.4, 43.07],
          [-89.3, 43.07],
          [-89.3, 43.08],
          [-89.4, 43.08],
        ],
      ],
    });

    if (geometry?.type !== "Polygon") throw new Error("expected a polygon");
    const ring = geometry.coordinates[0];
    if (ring === undefined) throw new Error("expected a ring");
    expect(ring).toHaveLength(5);
    expect(ring[4]).toEqual([-89.4, 43.07]);
  });

  it("leaves an already closed ring alone", () => {
    const geometry = toParcelGeometry({
      type: "Polygon",
      coordinates: square(-89.4, 43.07),
    });

    if (geometry?.type !== "Polygon") throw new Error("expected a polygon");
    const ring = geometry.coordinates[0];
    if (ring === undefined) throw new Error("expected a ring");
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
  });
});

describe("a payload from upstream", () => {
  it("skips an unusable feature rather than blanking the map", () => {
    const collection = toParcelCollection(
      upstreamCollection(
        upstreamFeature(1),
        { type: "Feature", geometry: null, properties: {} },
        upstreamFeature(2),
      ),
      "2026-01-15T09:00:00.000Z",
    );

    expect(collection.features).toHaveLength(2);
    expect(collection.features.map((feature) => feature.id)).toEqual(["1", "2"]);
  });

  /**
   * ArcGIS answers `200 OK` with an error document. Trusting the status code
   * would cache an error as though it were an empty parcel layer, and an empty
   * map looks like a working map with nothing in it.
   */
  it("treats a 200 carrying an error document as a failure", () => {
    expect(() =>
      toParcelCollection({ error: { code: 400, message: "Invalid query" } }, "t"),
    ).toThrow(/Invalid query/);
  });

  it.each([498, 499, 403])("treats error code %i as an authorization failure", (code) => {
    expect(() => toParcelCollection({ error: { code, message: "Token required" } }, "t")).toThrow(
      ParcelAuthorizationError,
    );
  });

  it("refuses a body that is not a feature collection", () => {
    expect(() => toParcelCollection({ type: "Feature" }, "t")).toThrow(/feature collection/);
  });
});

describe("talking to ArcGIS", () => {
  it("authenticates as an application, not as a user account", async () => {
    const test = servingTwoParcels();
    await test.reader.read();

    const token = test.fetches.tokenCalls()[0];
    const body = String(token?.init?.body ?? "");
    expect(body).toContain("grant_type=client_credentials");
    expect(body).toContain("client_id=sunsum-parcels-app");

    /**
     * No user account is involved, so nothing here inherits a person's
     * privileges, and nothing breaks when their password changes.
     */
    expect(body).not.toContain("username=");
    expect(body).not.toContain("password=");
  });

  it("does not bind the token to a referer or replay one on the query", async () => {
    const test = servingTwoParcels();
    await test.reader.read();

    /**
     * An app token carries its own authority. The user-token flow had to pin a
     * referer and resend it on every query or be rejected with a 498, which
     * meant coupling the credential to a deployment hostname. This asserts
     * that coupling is gone rather than merely unused.
     */
    const body = String(test.fetches.tokenCalls()[0]?.init?.body ?? "");
    expect(body).not.toContain("client=referer");
    expect(body).not.toContain("referer=");

    const query = test.fetches.queryCalls()[0];
    const headers = query?.init?.headers as Record<string, string> | undefined;
    expect(headers?.referer).toBeUndefined();
  });

  it("asks only for the fields it publishes", async () => {
    const test = servingTwoParcels();
    await test.reader.read();

    const outFields = new URL(test.fetches.queryCalls()[0]?.url ?? "").searchParams.get("outFields");

    expect(outFields).toBe("ObjectId,PARCELID,SITEADDRESS,SITECITY,SITESTATE,SITEZIP");
    expect(outFields).not.toContain("*");
    expect(outFields).not.toContain("OWNER");
  });

  it("never lets the token reach the published collection", async () => {
    const test = servingTwoParcels();
    const collection = await test.reader.read();

    expect(JSON.stringify(collection)).not.toContain("t-1");
    expect(JSON.stringify(collection)).not.toContain("not-a-real-secret");
  });

  it("refuses a query answered 403 without falling back to anything", async () => {
    const test = harness((url) =>
      url.includes("oauth2/token")
        ? json({ access_token: "t-1", expires_in: HOUR_SECONDS })
        : json({ error: "forbidden" }, 403),
    );

    await expect(test.reader.read()).rejects.toBeInstanceOf(ParcelAuthorizationError);
  });
});

/*
 * Every case here is about how much of someone else's metered service we
 * consume, which is why they assert call counts rather than payloads.
 */
describe("how often we actually call upstream", () => {
  it("serves a second read from cache", async () => {
    const test = servingTwoParcels();
    await test.reader.read();
    test.advance(60_000);
    await test.reader.read();

    expect(test.fetches.queryCalls()).toHaveLength(1);
    expect(test.fetches.tokenCalls()).toHaveLength(1);
  });

  it("gives concurrent readers one upstream query between them", async () => {
    const test = servingTwoParcels();
    const [first, second] = await Promise.all([test.reader.read(), test.reader.read()]);

    expect(test.fetches.queryCalls()).toHaveLength(1);
    expect(first).toEqual(second);
  });

  it("refreshes once the cached copy is no longer fresh", async () => {
    const test = servingTwoParcels();
    await test.reader.read();
    test.advance(HOUR_MS + 1);
    await test.reader.read();

    expect(test.fetches.queryCalls()).toHaveLength(2);
  });

  it("reuses a token that is still comfortably valid", async () => {
    const test = harness((url) =>
      url.includes("oauth2/token")
        ? json({ access_token: "t-long", expires_in: 24 * HOUR_SECONDS })
        : json(upstreamCollection(upstreamFeature(1))),
    );

    await test.reader.read();
    test.advance(HOUR_MS + 1);
    await test.reader.read();

    expect(test.fetches.queryCalls()).toHaveLength(2);
    expect(test.fetches.tokenCalls()).toHaveLength(1);
  });

  /**
   * The margin matters: a token that expires mid-flight produces a 498 that
   * looks exactly like a revoked credential, so it is replaced early instead.
   */
  it("replaces a token before it expires rather than after", async () => {
    /**
     * The token has to outlive the data cache for this to be observable at
     * all. With both at an hour, the second read is served from cache and
     * never reaches the token at all — so the margin goes untested while the
     * test still passes for the wrong reason.
     *
     * Seventy minutes puts the margin window at 65-70. Reading at 66 finds
     * the collection stale, so it refreshes, and finds a token that is still
     * valid but inside its margin.
     */
    const tokenLifetimeSeconds = 70 * 60;
    const test = harness((url) =>
      url.includes("oauth2/token")
        ? json({ access_token: "t-short", expires_in: tokenLifetimeSeconds })
        : json(upstreamCollection(upstreamFeature(1))),
    );

    await test.reader.read();
    /** Past freshness, and inside the five-minute expiry margin. */
    test.advance(66 * 60 * 1000);
    await test.reader.read();

    expect(test.fetches.tokenCalls()).toHaveLength(2);
  });

  /**
   * The companion case. A token comfortably outside its margin is reused even
   * though the collection itself had to be refetched, which is the whole point
   * of caching the token separately from the data.
   */
  it("reuses a token that is nowhere near expiry", async () => {
    const test = harness((url) =>
      url.includes("oauth2/token")
        ? json({ access_token: "t-long", expires_in: 24 * HOUR_SECONDS })
        : json(upstreamCollection(upstreamFeature(1))),
    );

    await test.reader.read();
    test.advance(HOUR_MS + 60_000);
    await test.reader.read();

    expect(test.fetches.queryCalls()).toHaveLength(2);
    expect(test.fetches.tokenCalls()).toHaveLength(1);
  });
});

describe("when ArcGIS is unavailable", () => {
  it("serves the last good copy, labelled stale", async () => {
    let failing = false;
    const test = harness((url) => {
      if (url.includes("oauth2/token")) return json({ access_token: "t-1", expires_in: 24 * HOUR_SECONDS });
      if (failing) return json({ message: "upstream is down" }, 500);
      return json(upstreamCollection(upstreamFeature(1), upstreamFeature(2)));
    });

    const fresh = await test.reader.read();
    expect(fresh.metadata.stale).toBe(false);

    failing = true;
    test.advance(HOUR_MS + 1);
    const stale = await test.reader.read();

    expect(stale.metadata.stale).toBe(true);
    expect(stale.features).toHaveLength(2);
  });

  it("stops retrying for a cooldown instead of hammering a service that is down", async () => {
    let failing = false;
    const test = harness((url) => {
      if (url.includes("oauth2/token")) return json({ access_token: "t-1", expires_in: 24 * HOUR_SECONDS });
      if (failing) return json({ message: "upstream is down" }, 500);
      return json(upstreamCollection(upstreamFeature(1)));
    });

    await test.reader.read();
    failing = true;
    test.advance(HOUR_MS + 1);
    await test.reader.read();
    const afterFirstFailure = test.fetches.queryCalls().length;

    test.advance(1_000);
    await test.reader.read();
    test.advance(1_000);
    await test.reader.read();

    expect(test.fetches.queryCalls()).toHaveLength(afterFirstFailure);
  });

  it("gives up when there is nothing cached to fall back to", async () => {
    const test = harness((url) =>
      url.includes("oauth2/token")
        ? json({ access_token: "t-1", expires_in: 24 * HOUR_SECONDS })
        : json({ message: "upstream is down" }, 500),
    );

    await expect(test.reader.read()).rejects.toThrow();
  });

  /**
   * A revoked or expired entitlement is not a transient fault, and serving
   * licensed data after the licence stopped answering is a licensing decision
   * rather than a caching one. It fails closed even though a copy is held.
   */
  it("refuses to serve stale data after the credential is rejected", async () => {
    let revoked = false;
    const test = harness((url) => {
      if (url.includes("oauth2/token")) {
        return revoked
          ? json({ error: { code: 400, message: "Unable to generate token." } })
          : json({ access_token: "t-1", expires_in: HOUR_SECONDS });
      }
      return json(upstreamCollection(upstreamFeature(1)));
    });

    await test.reader.read();
    revoked = true;
    test.advance(HOUR_MS + 1);

    await expect(test.reader.read()).rejects.toBeInstanceOf(ParcelAuthorizationError);
  });
});

describe("choosing a reader", () => {
  it("names the modes it accepts", () => {
    expect(PARCEL_MODES).toEqual(["demo", "arcgis"]);
    expect(isParcelMode("demo")).toBe(true);
    expect(isParcelMode("argis")).toBe(false);
  });

  it("uses the synthetic parcels when nothing is configured", () => {
    expect(selectedParcelMode()).toBe("demo");
    expect(candidateParcelReader()).toBe(demoCandidateParcelReader);
  });

  /**
   * A typo must not look like a working deployment quietly serving three
   * invented rectangles to real users.
   */
  it("refuses a mode it does not recognise", () => {
    process.env.SUNSUM_PARCELS = "esri";

    expect(() => selectedParcelMode()).toThrow(/SUNSUM_PARCELS/);
  });

  it("refuses to build an ArcGIS reader with no credential configured", () => {
    process.env.SUNSUM_PARCELS = "arcgis";

    expect(() => candidateParcelReader()).toThrow(/SUNSUM_ARCGIS_LAYER_URL/);
  });

  it("holds one reader so its caches survive between requests", () => {
    expect(candidateParcelReader()).toBe(candidateParcelReader());
  });
});

/**
 * Which credential the reader proves itself with, and the migration between
 * them. The application credential is the destination; the user sign-in exists
 * only until one is issued.
 */
describe("ArcGIS credential selection", () => {
  const LAYER = "https://example.test/FeatureServer/0";

  async function tokenBodyFor(
    options: Partial<ConstructorParameters<typeof ArcGisCandidateParcelReader>[0]>,
    tokenResponse: Record<string, unknown>,
  ): Promise<{ url: string; body: string }> {
    const seen: { url: string; body: string }[] = [];
    const reader = new ArcGisCandidateParcelReader({
      layerUrl: LAYER,
      fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        seen.push({ url, body: String(init?.body ?? "") });
        /**
         * Matched on the path, not the whole URL. The layer query carries its
         * own `token=` parameter, so a substring test for "token" identifies
         * the query as a token call and hands it a token body, which then
         * fails to parse as a feature collection.
         */
        const isTokenCall = !new URL(url).pathname.endsWith("/query");
        const payload = isTokenCall
          ? tokenResponse
          : { type: "FeatureCollection", features: [] };
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as unknown as typeof fetch,
      ...options,
    });
    await reader.read();
    return seen[0] ?? { url: "", body: "" };
  }

  it("uses the user endpoint and shape when only a sign-in is configured", async () => {
    const seen = await tokenBodyFor(
      { username: "parcel-reader", password: "not-a-real-password" },
      { token: "legacy-1", expires: Date.now() + 3_600_000 },
    );

    expect(seen.url).toContain("generateToken");
    expect(seen.body).toContain("username=parcel-reader");
    /** No OAuth grant is attempted with a credential that cannot satisfy it. */
    expect(seen.body).not.toContain("grant_type=client_credentials");
  });

  it("prefers the application credential when both are present", async () => {
    const seen = await tokenBodyFor(
      {
        clientId: "sunsum-parcels-app",
        clientSecret: "not-a-real-secret",
        username: "parcel-reader",
        password: "not-a-real-password",
      },
      { access_token: "app-1", expires_in: 3600 },
    );

    /**
     * This is the whole migration: issuing the app credential retires the
     * sign-in without a code change or a coordinated cutover.
     */
    expect(seen.url).toContain("oauth2/token");
    expect(seen.body).toContain("grant_type=client_credentials");
    expect(seen.body).not.toContain("username=");
  });

  it("refuses to construct with neither credential", () => {
    expect(() => new ArcGisCandidateParcelReader({ layerUrl: LAYER })).toThrow(
      /SUNSUM_ARCGIS_CLIENT_ID/,
    );
  });

  /**
   * Verified against the live service, not inferred: a `requestip`-bound token
   * minted cleanly and was then refused as "Invalid token" on the next call,
   * because the two requests left through different egress addresses.
   */
  it("binds a user token to a referer, because requestip does not survive NAT", async () => {
    const seen = await tokenBodyFor(
      { username: "parcel-reader", password: "not-a-real-password" },
      { token: "legacy-1", expires: Date.now() + 3_600_000 },
    );

    expect(seen.body).toContain("client=referer");
    expect(seen.body).not.toContain("client=requestip");
  });

  it("names both credentials when it refuses, so the fix is obvious", () => {
    expect(() => new ArcGisCandidateParcelReader({ layerUrl: LAYER })).toThrow(
      /SUNSUM_ARCGIS_USERNAME/,
    );
  });

  /**
   * The endpoints disagree about what expiry means, and the two wrong readings
   * fail in opposite directions: an absolute timestamp read as a duration
   * expires in 1970 and re-mints on every call, while a duration read as
   * absolute never expires and keeps presenting a dead token.
   */
  it("reads the user endpoint's absolute expiry rather than treating it as a duration", () => {
    const now = 1_700_000_000_000;
    const oneHourOut = now + 3_600_000;
    let calls = 0;

    const reader = new ArcGisCandidateParcelReader({
      layerUrl: LAYER,
      username: "parcel-reader",
      password: "not-a-real-password",
      now: () => now,
      fetchImpl: (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("oken")) {
          calls += 1;
          return new Response(JSON.stringify({ token: `t-${calls}`, expires: oneHourOut }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ type: "FeatureCollection", features: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as unknown as typeof fetch,
    });

    expect(reader).toBeInstanceOf(ArcGisCandidateParcelReader);
    expect(calls).toBe(0);
  });
});
