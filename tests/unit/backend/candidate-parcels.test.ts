// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  demoCandidateParcelReader,
  getCandidateParcels,
  type CandidateParcelReader,
} from "@/backend/core/sites";
import type { InvestorProfile, Viewer } from "@/backend/core/identity";
import { createMemoryBackendStore, type BackendStore } from "@/backend/core/store";
import { handlePostDemoSwitch } from "@/backend/handlers/identity";
import { handleGetCandidateParcels } from "@/backend/handlers/sites";
import type { CandidateParcelCollection } from "@/domain/candidate-parcels";

/**
 * Who may see a parcel boundary, and what the endpoint in front of it accepts.
 *
 * The role rule is the interesting half. Investors are refused here while being
 * admitted to most other reads, because the API already withholds exact
 * addresses and coordinates from investor payloads and a boundary is a more
 * precise location than the fields that redaction exists to hide. That is a
 * deliberate asymmetry, so it gets a test that fails if someone "fixes" it.
 */

const onboardedInvestor: InvestorProfile = {
  id: "150bbd86-f79c-48db-8579-e7c79db8c468",
  organizationName: "Test Endowment",
  fundingStageFocus: [],
  geographies: [],
  onboardingCompletedAt: "2026-09-01T00:00:00.000Z",
};

const siteOwner: Viewer = {
  role: "site_owner",
  userId: "3f0f6e2b-1a7d-4c88-9b41-2d6e8f0a1c55",
};

const operator: Viewer = {
  role: "operator",
  userId: "188d99df-33ce-4cd5-9744-a17968679b50",
};

const investor: Viewer = {
  role: "investor",
  userId: "9727021a-7b77-418d-a802-faa4bc230032",
  investor: onboardedInvestor,
};

const SECRET = "a-test-secret-that-is-long-enough-to-pass";

function readerThatThrows(error: Error): CandidateParcelReader {
  return {
    read: () => Promise.reject(error),
  };
}

function countingReader(): CandidateParcelReader & { reads: number } {
  const reader = {
    reads: 0,
    read(): Promise<CandidateParcelCollection> {
      reader.reads += 1;
      return demoCandidateParcelReader.read();
    },
  };
  return reader;
}

describe("who may read parcel boundaries", () => {
  it.each([
    ["a site owner", siteOwner],
    ["an operator", operator],
  ])("admits %s", async (_label, viewer) => {
    const result = await getCandidateParcels(viewer, demoCandidateParcelReader);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.type).toBe("FeatureCollection");
    expect(result.value.features.length).toBeGreaterThan(0);
  });

  /**
   * Not an oversight. Investor-facing payloads are deliberately imprecise about
   * location, and a parcel polygon would hand back what those payloads redact.
   */
  it("refuses an investor", async () => {
    const result = await getCandidateParcels(investor, demoCandidateParcelReader);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("forbidden_role");
  });

  it("does not call upstream for a viewer it will refuse", async () => {
    const reader = countingReader();
    await getCandidateParcels(investor, reader);

    expect(reader.reads).toBe(0);
  });
});

describe("when the reader fails", () => {
  it("reports it as temporarily unavailable", async () => {
    const result = await getCandidateParcels(
      operator,
      readerThatThrows(new Error("boom")),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("service_unavailable");
  });

  /**
   * An authenticated caller must not be able to use this endpoint to learn the
   * state of our third-party subscription — whether a credential expired, a
   * layer moved, or a host is unreachable. The upstream reason stays in the
   * logs.
   */
  it("says nothing about why", async () => {
    const result = await getCandidateParcels(
      operator,
      readerThatThrows(
        new Error("ArcGIS refused token for https://services.arcgis.com/secret/"),
      ),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.message).not.toContain("ArcGIS");
    expect(result.failure.message).not.toContain("arcgis.com");
    expect(result.failure.message).not.toContain("token");
  });
});

describe("the synthetic parcels", () => {
  it("publish only the approved properties", async () => {
    const collection = await demoCandidateParcelReader.read();

    for (const feature of collection.features) {
      expect(Object.keys(feature.properties).sort()).toEqual([
        "city",
        "parcel_id",
        "postal_code",
        "site_address",
        "state",
      ]);
    }
  });

  /**
   * The real extract has rows with no address, so the fixtures have one too.
   * A frontend built against fixtures where every field is populated discovers
   * the nulls in production.
   */
  it("include a parcel with missing fields", async () => {
    const collection = await demoCandidateParcelReader.read();
    const gaps = collection.features.filter(
      (feature) => feature.properties.site_address === null,
    );

    expect(gaps.length).toBeGreaterThan(0);
  });

  it("are areas, not points", async () => {
    const collection = await demoCandidateParcelReader.read();

    for (const feature of collection.features) {
      expect(["Polygon", "MultiPolygon"]).toContain(feature.geometry.type);
    }
  });
});

describe("the endpoint in front of the reader", () => {
  let store: BackendStore;

  beforeEach(() => {
    vi.stubEnv("SUNSUM_DEMO_AUTH", "enabled");
    vi.stubEnv("SUNSUM_SESSION_SECRET", SECRET);
    store = createMemoryBackendStore({ seedDemoProjects: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function cookieFor(role: string): Promise<string> {
    const response = await handlePostDemoSwitch(
      new Request("https://sunsum.test/api/auth/demo-switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      }),
      store,
    );
    return (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  }

  function call(
    search: string,
    cookie: string,
    reader: CandidateParcelReader = demoCandidateParcelReader,
  ): Promise<Response> {
    return handleGetCandidateParcels(
      new Request(`https://sunsum.test/api/sites/candidate-parcels${search}`, {
        headers: { cookie },
      }),
      reader,
      store,
    );
  }

  it("answers a site owner with GeoJSON", async () => {
    const response = await call("", await cookieFor("site_owner"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/geo+json");

    const body = (await response.json()) as CandidateParcelCollection;
    expect(body.type).toBe("FeatureCollection");
    expect(body.metadata.stale).toBe(false);
  });

  /**
   * The payload is the same for everyone allowed to see it, but the decision to
   * release it is not. A shared cache holding this could replay it to an
   * investor or to an anonymous visitor, both of whom are refused.
   */
  it("forbids caching the response", async () => {
    const response = await call("", await cookieFor("operator"));

    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  /*
   * The parameter refusal is the whole difference between this endpoint and a
   * proxy. Each of these is a real attempt at repointing or widening the
   * upstream query, and each must be refused on the shape of the request rather
   * than on the contents of any one parameter — that is what keeps the refusal
   * true as the endpoint is maintained.
   */
  it.each([
    ["a different layer", "?layerUrl=https://evil.test/FeatureServer/0"],
    ["a widened filter", "?where=1%3D1+OR+1%3D1"],
    ["extra fields", "?outFields=*"],
    ["a supplied token", "?token=stolen"],
    ["an unrecognised parameter", "?bbox=-90,42,-89,44"],
    ["an empty parameter", "?f="],
  ])("refuses %s", async (_label, search) => {
    const response = await call(search, await cookieFor("operator"));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid_query" });
  });

  it("refuses a parameter before it reaches upstream", async () => {
    const reader = countingReader();
    await call("?outFields=*", await cookieFor("operator"), reader);

    expect(reader.reads).toBe(0);
  });

  it("answers 503 when the reader cannot produce parcels", async () => {
    const response = await call(
      "",
      await cookieFor("operator"),
      readerThatThrows(new Error("upstream is down")),
    );

    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("upstream is down");
  });

  it("refuses an investor with 403", async () => {
    const response = await call("", await cookieFor("investor"));

    expect(response.status).toBe(403);
  });

  it("refuses an anonymous caller with 401", async () => {
    const response = await call("", "");

    expect(response.status).toBe(401);
  });
});
