// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createLiveReadClient, formatReadExport, LIVE_READ_LIMITS, WS2_CONTRACT_REVISION,
  type LiveReadClient, type LiveReadClientOptions, type LiveReadConfiguration,
  type LiveRole, type ReadResult, type ReadScope,
} from "@/features/live-read";
import { operationPath } from "@/features/live-read/transport";
import {
  SYNTHETIC_LIVE_READ_IDS,
  SYNTHETIC_LIVE_READ_OBSERVED_AT as OBSERVED,
  SYNTHETIC_LIVE_READ_PDF as PDF,
  SYNTHETIC_LIVE_READ_PRIVATE_CANARY as CANARY,
  syntheticIdentity as identity,
  syntheticSite as site,
  syntheticAssessment as assessment,
  syntheticDocument as document,
  syntheticOwnerSite as ownerEntry,
  syntheticPipeline as board,
  syntheticSubmissionDetail as detail,
  syntheticPortfolioItem as portfolioItem,
  syntheticPortfolio as portfolio,
  syntheticInvestorProfile as profile,
  syntheticEngagement as engagement,
  syntheticFundingNeed as funding,
  syntheticDealRoom as room,
  syntheticExportBundle as exportBundle,
} from "../fixtures/live-read-contracts";

const {
  ownerUserId: USER, operatorUserId: OTHER, siteId: SITE, projectId: PROJECT,
  investorId: INVESTOR, documentId: DOCUMENT, assessmentId: ASSESSMENT,
  overrideId: OVERRIDE, activityId: ACTIVITY,
} = SYNTHETIC_LIVE_READ_IDS;

const configuration: LiveReadConfiguration = {
  canAttemptReads: true, canAttemptExports: false, canAttemptDocumentDownloads: false,
  apiBasePath: "/api", source: "database-configured", reason: "Synthetic test admission only.",
};
const arbitraryScope: ReadScope = { userId: USER, role: "site-owner", generation: 1 };

function take<T>(result: ReadResult<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.data;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

type Reply = unknown | Response;
type Resolver = (path: string, init: RequestInit | undefined) => Reply | Promise<Reply>;

function harness(
  observedRole: LiveRole = "site-owner",
  overrides: Record<string, Reply | (() => Reply | Promise<Reply>)> = {},
  admission: Partial<LiveReadConfiguration> = {},
  options: Omit<LiveReadClientOptions, "fetch"> = {},
) {
  const defaults: Record<string, unknown> = {
    "/api/me": identity(observedRole),
    "/api/me/sites": [ownerEntry()],
    "/api/me/outstanding": [],
    "/api/submissions": [{ site: site({ id: OTHER }), assessment: null }],
    "/api/pipeline": board(),
    [`/api/submissions/${SITE}`]: detail(),
    "/api/portfolio": portfolio(),
    "/api/investors/me/profile": profile(),
    "/api/me/engagements": [engagement()],
    [`/api/projects/${PROJECT}/deal-room`]: room(),
    [`/api/projects/${PROJECT}/engagements`]: [engagement()],
    [`/api/projects/${PROJECT}/funding-needs`]: [funding()],
    "/api/export?format=json": exportBundle(observedRole),
  };
  const requests: { path: string; init: RequestInit | undefined }[] = [];
  const resolve: Resolver = async (path) => {
    const key = Object.hasOwn(overrides, path) ? path : path.split("?")[0] ?? path;
    const route = Object.hasOwn(overrides, key) ? overrides[key] : defaults[path] ?? defaults[key];
    if (route === undefined) throw new Error(`Unexpected mocked GET ${path}`);
    return typeof route === "function" ? route() : route;
  };
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const path = `${url.pathname}${url.search}`;
    requests.push({ path, init });
    const reply = await resolve(path, init);
    return reply instanceof Response ? reply : json(reply);
  });
  const client = take(createLiveReadClient({ ...configuration, ...admission }, {
    origin: "https://sunsum.invalid", now: () => new Date(OBSERVED), ...options, fetch: fetcher,
  }));
  return { client, fetcher, requests };
}

async function scopeOf(client: LiveReadClient): Promise<ReadScope> {
  return take(await client.readIdentity()).scope;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("live read admission and fixed transport", () => {
  it.each([
    { canAttemptReads: false },
    { source: "not-confirmed" as const },
    { apiBasePath: "/api/proxy" },
    { apiBasePath: "https://elsewhere.invalid/api" },
  ])("performs no fetch for unadmitted configuration %j", (override) => {
    const fetcher = vi.fn<typeof fetch>();
    const configured = Object.assign({}, configuration, override);
    const result = Reflect.apply(createLiveReadClient, undefined, [configured, { fetch: fetcher }]);
    expect(result).toMatchObject({ ok: false, error: { kind: "out-of-reach" } });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not authenticate from admission, a caller role, headers, or alternate configuration", () => {
    const fetcher = vi.fn<typeof fetch>();
    expect(createLiveReadClient(configuration, {
      origin: "https://sunsum.invalid", fetch: fetcher,
    }).ok).toBe(true);
    const options = { origin: "https://sunsum.invalid", fetch: fetcher, role: "operator", headers: {} };
    expect(createLiveReadClient(configuration, options)).toMatchObject({ ok: false, error: { kind: "invalid" } });
    const configured = { ...configuration, principalId: USER };
    expect(createLiveReadClient(configured)).toMatchObject({ ok: false, error: { kind: "invalid" } });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    "https://elsewhere.invalid", "https://sunsum.invalid/api", "https://sunsum.invalid?x=1",
    "https://sunsum.invalid#part", "https://user:password@sunsum.invalid", "file:///api", "/api",
  ])("refuses an unsafe or non-current browser origin %s", (origin) => {
    vi.stubGlobal("location", { origin: "https://sunsum.invalid" });
    expect(createLiveReadClient(configuration, { origin })).toMatchObject({ ok: false, error: { kind: "invalid" } });
  });

  it("uses the browser origin when no origin option is supplied", async () => {
    vi.stubGlobal("location", { origin: "https://sunsum.invalid" });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(identity()));
    const client = take(createLiveReadClient(configuration, { fetch: fetcher }));
    expect(take(await client.readIdentity()).role).toBe("site-owner");
    expect(fetcher).toHaveBeenCalledWith("https://sunsum.invalid/api/me", expect.objectContaining({
      method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error",
    }));
    expect(fetcher.mock.calls[0]?.[1]).not.toHaveProperty("headers");
    expect(fetcher.mock.calls[0]?.[1]).not.toHaveProperty("body");
  });

  it("keeps document and manifest gates separate and closed without any requests", async () => {
    const { client, fetcher } = harness();
    const reference = { siteId: SITE, documentId: DOCUMENT, fileName: null, contentType: null, sizeBytes: null };
    expect(await client.readDocument(reference, { scope: arbitraryScope })).toMatchObject({
      ok: false, error: { kind: "out-of-reach", code: "documents_not_admitted" },
    });
    expect(await client.readExport({ scope: arbitraryScope })).toMatchObject({
      ok: false, error: { kind: "out-of-reach", code: "exports_not_admitted" },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("admits only explicit GET operation paths and canonical UUIDs", () => {
    expect(operationPath({ kind: "submission", siteId: SITE }).path).toBe(`/api/submissions/${SITE}`);
    expect(operationPath({ kind: "funding", projectId: PROJECT, role: "operator" }).path).toBe(`/api/projects/${PROJECT}/funding-needs`);
    expect(operationPath({ kind: "document", siteId: SITE, documentId: DOCUMENT }).path).toBe(`/api/sites/${SITE}/documents/${DOCUMENT}/content`);
    expect(operationPath({ kind: "export" }).path).toBe("/api/export?format=json");
    for (const siteId of ["../me", `%2f${SITE}`, `site-${SITE}`, `${SITE}?secret=true`, "demo-site"]) {
      expect(() => operationPath({ kind: "submission", siteId })).toThrow();
    }
    expect(() => Reflect.apply(operationPath, undefined, [{ kind: "project", projectId: PROJECT }])).toThrow();
    expect(() => Reflect.apply(operationPath, undefined, [{ kind: "notifications" }])).toThrow();
  });

  it("maps only the actual operator query vocabulary and URI-encodes values", async () => {
    const { client, requests } = harness("operator");
    take(await client.readSnapshot({ query: {
      statuses: ["submitted", "screening"], siteType: "rooftop", location: "A & B",
      viability: "potentially_viable",
    } }));
    expect(requests.map((entry) => entry.path)).toEqual([
      "/api/me",
      "/api/submissions?status=submitted&status=screening&type=rooftop&viability=potentially_viable&location=A+%26+B",
      "/api/pipeline?status=submitted&status=screening&type=rooftop&viability=potentially_viable&location=A+%26+B",
      "/api/me",
    ]);
    expect(requests.every((entry) => entry.init?.method === "GET" && entry.init.headers === undefined)).toBe(true);
  });

  it("maps investor queries and refuses role-inapplicable or unknown queries", async () => {
    const { client, requests } = harness("investor");
    take(await client.readSnapshot({ query: { stages: ["pre_development"], mandateMatch: false, projectType: "stored type" } }));
    expect(requests[1]?.path).toBe("/api/portfolio?stage=pre_development&project_type=stored+type&mandate_match=false");
    const { client: owner, requests: ownerRequests } = harness();
    expect(await owner.readSnapshot({ query: { location: "somewhere" } })).toMatchObject({ ok: false, error: { kind: "invalid" } });
    expect(ownerRequests.map((request) => request.path)).toEqual(["/api/me"]);
    const { client: strict, fetcher } = harness();
    const query = { arbitraryUrl: "https://elsewhere.invalid" };
    expect(await Reflect.apply(strict.readSnapshot, strict, [{ query }])).toMatchObject({ ok: false, error: { kind: "invalid" } });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects missing or forged scopes and invalid detail IDs before protected requests", async () => {
    const { client, fetcher } = harness("operator");
    const scope = await scopeOf(client);
    fetcher.mockClear();
    expect(await client.readDetail({ kind: "submission", siteId: "../me" }, { scope })).toMatchObject({ ok: false, error: { kind: "invalid" } });
    expect(await client.readDetail({ kind: "submission", siteId: SITE }, { scope: { ...scope, userId: OTHER } })).toMatchObject({ ok: false, error: { kind: "stale" } });
    expect(await Reflect.apply(client.readDetail, client, [{ kind: "submission", siteId: SITE }, {}])).toMatchObject({ ok: false, error: { kind: "stale" } });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("captures filters before awaiting identity so a mutable caller cannot mix query contexts", async () => {
    let release: ((value: Response) => void) | undefined;
    let observations = 0;
    const { client, requests } = harness("operator", {
      "/api/me": () => ++observations === 1 ?
        new Promise<Response>((resolve) => { release = resolve; }) : identity("operator"),
    });
    const statuses: ("submitted" | "screening")[] = ["submitted"];
    const pending = client.readSnapshot({ query: { statuses } });
    await vi.waitFor(() => expect(release).toBeDefined());
    statuses.push("screening");
    release?.(json(identity("operator")));
    take(await pending);
    expect(requests[1]?.path).toBe("/api/submissions?status=submitted");
    expect(requests[2]?.path).toBe("/api/pipeline?status=submitted");
  });
});

describe("normalized snapshots and explicit failures", () => {
  it("includes unconverted owner sites and never substitutes zero or now for unknown fields", async () => {
    const { client } = harness("site-owner", {
      "/api/me/sites": [ownerEntry({
        site: site({ created_at: null, updated_at: null }),
        assessment: null,
      })],
    });
    const snapshot = take(await client.readSnapshot());
    expect(snapshot.role).toBe("site-owner");
    expect(snapshot.records).toHaveLength(1);
    expect(snapshot.records[0]).toMatchObject({
      id: SITE, projectId: null, siteId: SITE, name: null,
      submissionStatus: "submitted", projectStage: null, journeyStageId: "submitted",
      estimatedCapacityKw: null, updatedAt: null,
      estimatedSystemSizeKw: { low: null, high: null, unit: "kW" },
      estimatedAnnualGenerationKwh: { low: null, high: null, unit: "kWh/year" },
    });
    expect(snapshot.provenance).toMatchObject({ retrievedAt: OBSERVED, deployedRevision: null });
    expect(JSON.stringify(snapshot.records)).not.toContain("Synthetic private address");
  });

  it("retains three independent lifecycle fields for a converted owner site", async () => {
    const { client } = harness("site-owner", { "/api/me/sites": [ownerEntry({
      site: site({ submission_status: "accepted" }), submission_status: "accepted",
      project_stage: "pre_development", journey_stage_id: "pre-development",
      project: { id: PROJECT, site_id: SITE, stage: "pre_development", name: "Synthetic project", estimated_capacity_kw: 0 },
    })] });
    expect(take(await client.readSnapshot()).records[0]).toMatchObject({
      siteId: SITE, projectId: PROJECT, submissionStatus: "accepted",
      projectStage: "pre_development", journeyStageId: "pre-development", estimatedCapacityKw: 0,
    });
  });

  it.each([
    null, "2026-09-22", "2026-09-22T00:00:00.000Z", "2026-09-22T09:30:00-04:00",
  ])("preserves the WS2 owner target date or database timestamp %s", async (targetDate) => {
    const { client } = harness("site-owner", {
      "/api/me/sites": [ownerEntry({
        project: { id: PROJECT, site_id: SITE, stage: "pre_development", target_date: targetDate },
        project_stage: "pre_development", journey_stage_id: "pre-development",
      })],
      "/api/export?format=json": exportBundle("site-owner", {
        projects: [{ site_id: SITE, project_id: PROJECT }],
      }),
    }, { canAttemptExports: true });
    const snapshot = take(await client.readSnapshot());
    expect(snapshot.records[0]?.projectId).toBe(PROJECT);
    const result = take(await client.readDetail({ kind: "owner-site", siteId: SITE }, { scope: snapshot.scope }));
    if (result.role !== "site-owner") throw new Error("Wrong projection");
    expect(result.project?.targetDate).toBe(targetDate);
    expect(take(await client.readExport({ scope: snapshot.scope })).projects[0]?.projectId).toBe(PROJECT);
  });

  it.each(["2026-02-30", "2026-02-30T00:00:00.000Z", "2026-09-22T09:30:00", "not a date"])(
    "refuses an impossible or ambiguous target date %s", async (targetDate) => {
      const { client } = harness("site-owner", { "/api/me/sites": [ownerEntry({
        project: { id: PROJECT, site_id: SITE, target_date: targetDate },
      })] });
      expect(await client.readSnapshot()).toMatchObject({ ok: false, error: { kind: "malformed" } });
    },
  );

  it("combines the operator queue with verified pipeline project records", async () => {
    const { client } = harness("operator");
    const snapshot = take(await client.readSnapshot());
    expect(snapshot.role).toBe("operator");
    if (snapshot.role !== "operator") throw new Error("Wrong projection");
    expect(snapshot.submissions).toHaveLength(1);
    expect(snapshot.pipeline.ok).toBe(true);
    expect(snapshot.records).toHaveLength(2);
    expect(snapshot.records.find((entry) => entry.projectId === PROJECT)?.detail).toEqual({ kind: "project", projectId: PROJECT, siteId: SITE });
    expect(snapshot.records.find((entry) => entry.siteId === OTHER)?.projectId).toBeNull();
  });

  it("keeps a failed secondary section explicit and re-observes identity", async () => {
    const { client, requests } = harness("site-owner", {
      "/api/me/outstanding": () => json({ code: "service_unavailable", message: CANARY }, 503),
    });
    const snapshot = take(await client.readSnapshot());
    if (snapshot.role !== "site-owner") throw new Error("Wrong projection");
    expect(snapshot.completeness).toBe("partial");
    expect(snapshot.records).toHaveLength(1);
    expect(snapshot.outstanding).toMatchObject({ ok: false, error: { kind: "unavailable", status: 503, code: "service_unavailable" } });
    expect(JSON.stringify(snapshot.outstanding)).not.toContain(CANARY);
    expect(requests.at(-1)?.path).toBe("/api/me");
  });

  it("does not return an empty success or fallback when a primary read fails", async () => {
    const { client, requests } = harness("site-owner", { "/api/me/sites": () => json({ code: "service_unavailable" }, 503) });
    expect(await client.readSnapshot()).toMatchObject({ ok: false, error: { kind: "unavailable" } });
    expect(requests.map((entry) => entry.path)).toEqual(["/api/me", "/api/me/sites"]);
  });

  it.each([
    [400, "invalid"], [401, "unauthenticated"], [403, "denied"], [404, "missing"],
    [409, "unavailable"], [422, "invalid"], [503, "unavailable"],
  ])("preserves HTTP %i as %s without retry or raw messages", async (status, kind) => {
    const { client, fetcher } = harness("site-owner", {
      "/api/me": () => json({ code: "not_found", message: `<script>${CANARY}</script>` }, Number(status)),
    });
    const result = await client.readIdentity();
    expect(result).toMatchObject({ ok: false, error: { kind, status } });
    expect(JSON.stringify(result)).not.toContain(CANARY);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("does not trust a role from response fields other than GET me", async () => {
    const { client, requests } = harness("site-owner", { "/api/me/sites": [ownerEntry({ role: "operator" })] });
    expect(take(await client.readSnapshot()).role).toBe("site-owner");
    expect(requests.some((entry) => entry.path.includes("pipeline"))).toBe(false);
    const invalid = harness("site-owner", { "/api/me": identity("site-owner", { role: "administrator" }) });
    expect(await invalid.client.readSnapshot()).toMatchObject({ ok: false, error: { kind: "malformed" } });
  });

  it("keeps operator pipeline and investor profile/engagement failures explicit", async () => {
    const operator = harness("operator", { "/api/pipeline": () => json({ code: "service_unavailable" }, 503) });
    const operatorSnapshot = take(await operator.client.readSnapshot());
    if (operatorSnapshot.role !== "operator") throw new Error("Wrong projection");
    expect(operatorSnapshot.completeness).toBe("partial");
    expect(operatorSnapshot.pipeline).toMatchObject({ ok: false, error: { status: 503 } });
    expect(operatorSnapshot.records).toHaveLength(1);
    expect(operatorSnapshot.summary).toMatchObject({ recordCount: 1, projectCount: null });
    const investor = harness("investor", {
      "/api/investors/me/profile": () => json({ code: "not_found" }, 404),
      "/api/me/engagements": () => json({ code: "service_unavailable" }, 503),
    });
    const investorSnapshot = take(await investor.client.readSnapshot());
    if (investorSnapshot.role !== "investor") throw new Error("Wrong projection");
    expect(investorSnapshot.completeness).toBe("partial");
    expect(investorSnapshot.profile).toMatchObject({ ok: false, error: { status: 404 } });
    expect(investorSnapshot.engagements).toMatchObject({ ok: false, error: { status: 503 } });
    expect(investorSnapshot.records).toHaveLength(1);
  });

  it("keeps a successful empty pipeline distinct from an unavailable project count", async () => {
    const { client } = harness("operator", { "/api/pipeline": board({ columns: [] }) });
    const snapshot = take(await client.readSnapshot());
    expect(snapshot.completeness).toBe("complete");
    expect(snapshot.summary).toMatchObject({ recordCount: 1, projectCount: 0 });
  });

  it("does not deliver a partial snapshot after an access-denied secondary read", async () => {
    const { client } = harness("site-owner", { "/api/me/outstanding": () => json({ code: "forbidden_owner" }, 403) });
    expect(await client.readSnapshot()).toMatchObject({ ok: false, error: { kind: "denied", status: 403 } });
  });

  it("rejects caller-owned endpoints that overreturn another owner or investor profile", async () => {
    const owner = harness("site-owner", { "/api/me/sites": [ownerEntry({ site: site({ owner_user_id: OTHER }) })] });
    expect(await owner.client.readSnapshot()).toMatchObject({ ok: false, error: { kind: "denied", code: "scope_mismatch" } });
    const investor = harness("investor", { "/api/investors/me/profile": profile({ user_id: OTHER }) });
    expect(await investor.client.readSnapshot()).toMatchObject({ ok: false, error: { kind: "denied", code: "scope_mismatch" } });
  });

  it("preserves timezone offsets while refusing impossible dates or malformed known numbers", async () => {
    const timestamp = "2026-09-20T09:30:00-04:00";
    const valid = harness("site-owner", { "/api/me/sites": [ownerEntry({ site: site({ updated_at: timestamp }) })] });
    expect(take(await valid.client.readSnapshot()).records[0]?.updatedAt).toBe(timestamp);
    const invalidDate = harness("site-owner", { "/api/me/sites": [ownerEntry({ site: site({ updated_at: "2026-02-30T09:30:00Z" }) })] });
    expect(await invalidDate.client.readSnapshot()).toMatchObject({ ok: false, error: { kind: "malformed" } });
    const invalidNumber = harness("site-owner", { "/api/me/sites": [ownerEntry({ assessment: assessment({ estimated_system_size_kw_low: "12" }) })] });
    expect(await invalidNumber.client.readSnapshot()).toMatchObject({ ok: false, error: { kind: "malformed" } });
  });
});

describe("typed detail, finance and tier boundaries", () => {
  it("keeps current, original and human results with unknown dates and actors unchanged", async () => {
    const { client } = harness("operator");
    const scope = await scopeOf(client);
    const result = take(await client.readDetail({ kind: "submission", siteId: SITE }, { scope }));
    if (result.role !== "operator") throw new Error("Wrong projection");
    expect(result.assessments.original).toMatchObject({ id: ASSESSMENT, createdAt: null, estimatedSystemSizeKw: { low: 12 } });
    expect(result.assessments.human).toMatchObject({ id: OVERRIDE, overrideReason: "Stored human review", estimatedSystemSizeKw: { low: 14 } });
    expect(result.assessments.current?.id).toBe(OVERRIDE);
    expect(result.activity?.[0]).toMatchObject({ createdAt: null, actorUserId: null });
    expect(result.owner).toMatchObject({ name: null, email: null });
    expect(result.assessments.current?.inputsUsed).not.toHaveProperty("opaque");
    expect(result.fundingNeeds).toBeNull();
  });

  it("does not manufacture owner history from the current-only owner read", async () => {
    const { client } = harness();
    const result = take(await client.readDetail({ kind: "owner-site", siteId: SITE }, { scope: await scopeOf(client) }));
    if (result.role !== "site-owner") throw new Error("Wrong projection");
    expect(result.assessments.completeness).toBe("current-only");
    expect(result.assessments.original).toBeNull();
    expect(result.activity).toBeNull();
    expect(result.owner).toBeNull();
  });

  it("verifies the project/site pair and never calls a generic GET project", async () => {
    const { client, requests } = harness("operator");
    const result = take(await client.readDetail({ kind: "project", projectId: PROJECT, siteId: SITE }, { scope: await scopeOf(client) }));
    if (result.role !== "operator") throw new Error("Wrong projection");
    expect(result.project).toMatchObject({ id: PROJECT, siteId: SITE, nextAction: null, targetDate: null });
    expect(take(result.fundingNeeds ?? { ok: true, data: [] })[0]).toMatchObject({
      amountRequested: 12_000, amountCommitted: 0, currency: null, createdAt: null,
    });
    expect(requests.map((entry) => entry.path)).toEqual([
      "/api/me", "/api/me", "/api/pipeline", `/api/submissions/${SITE}`,
      `/api/projects/${PROJECT}/engagements`, `/api/projects/${PROJECT}/funding-needs`, "/api/me",
    ]);
    expect(requests.some((entry) => entry.path === `/api/projects/${PROJECT}`)).toBe(false);
  });

  it("refuses a mismatched project/site link before any submission or finance read", async () => {
    const { client, requests } = harness("operator");
    const scope = await scopeOf(client);
    expect(await client.readDetail({ kind: "project", projectId: PROJECT, siteId: OTHER }, { scope })).toMatchObject({
      ok: false, error: { kind: "denied", code: "scope_mismatch" },
    });
    expect(requests.map((entry) => entry.path)).toEqual(["/api/me", "/api/me", "/api/pipeline"]);
  });

  it("reports project-section failures without pretending finance is zero", async () => {
    const { client } = harness("operator", { [`/api/projects/${PROJECT}/funding-needs`]: () => json({ code: "service_unavailable" }, 503) });
    const result = take(await client.readDetail({ kind: "project", projectId: PROJECT, siteId: SITE }, { scope: await scopeOf(client) }));
    if (result.role !== "operator") throw new Error("Wrong projection");
    expect(result.completeness).toBe("partial");
    expect(result.fundingNeeds).toMatchObject({ ok: false, error: { status: 503 } });
    expect(result.engagements?.ok).toBe(true);
  });

  it("discards malformed private overreturns from the investor portfolio", async () => {
    const { client } = harness("investor", { "/api/portfolio": portfolio({
      items: [portfolioItem({ site_id: { secret: CANARY }, address_raw: CANARY, latitude: "bad", owner: CANARY, inputs_used: CANARY, documents: [CANARY] })],
    }) });
    const snapshot = take(await client.readSnapshot());
    if (snapshot.role !== "investor") throw new Error("Wrong projection");
    expect(snapshot.records[0]?.siteId).toBeNull();
    expect(snapshot.records[0]?.updatedAt).toBeNull();
    expect(snapshot.records[0]?.estimatedCapacityKw).toBeNull();
    expect(snapshot.profile.ok).toBe(true);
    expect(snapshot.engagements.ok).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain(CANARY);
  });

  it("refuses investor reads without me-confirmed onboarding", async () => {
    const { client, requests } = harness("investor", { "/api/me": {
      user_id: USER, role: "investor", onboarded: false,
      investor: { id: INVESTOR, onboarding_completed_at: null },
    } });
    expect(await client.readSnapshot()).toMatchObject({ ok: false, error: { kind: "denied", code: "onboarding_required" } });
    expect(requests.map((entry) => entry.path)).toEqual(["/api/me"]);
  });

  it.each(["declined", "withdrawn", null])("does not unlock or create interest from state %s", async (state) => {
    const { client, requests } = harness("investor", { "/api/me/engagements": [engagement({ state })] });
    expect(await client.readDetail({ kind: "deal-room", projectId: PROJECT }, { scope: await scopeOf(client) })).toMatchObject({
      ok: false, error: { kind: "denied", code: "forbidden_tier" },
    });
    expect(requests.some((entry) => entry.path.includes("deal-room") || entry.path.includes("funding-needs"))).toBe(false);
    expect(requests.every((entry) => entry.init?.method === "GET")).toBe(true);
  });

  it("projects investor tier-one evidence without owner, inputs, actors, notes or byte links", async () => {
    const safeAssessment = assessment({ inputs_used: CANARY, override_reason: { bad: CANARY }, overridden_by_user_id: "invalid" });
    const { client, requests } = harness("investor", { [`/api/projects/${PROJECT}/deal-room`]: room({
      project: { id: PROJECT, site_id: { bad: CANARY }, stage: "pre_development", assigned_operator_user_id: CANARY, next_action: CANARY },
      site: { id: "invalid", locality: "Synthetic area", address_raw: CANARY, latitude: CANARY, owner_user_id: CANARY },
      owner: CANARY, assessment: safeAssessment, assessment_history: [safeAssessment],
      documents: [
        document({ disclosure_class: "investor_tier_1", site_id: "invalid", uploaded_by_user_id: CANARY, content_url: CANARY }),
        document({ id: OTHER, disclosure_class: "owner_private", original_filename: CANARY }),
      ],
      timeline: [
        { id: ACTIVITY, action: "project_stage_changed", note: CANARY, actor_user_id: CANARY, created_at: null },
        { id: OTHER, action: "private_operator_note", note: CANARY },
      ],
    }) });
    const result = take(await client.readDetail({ kind: "deal-room", projectId: PROJECT }, { scope: await scopeOf(client) }));
    if (result.role !== "investor") throw new Error("Wrong projection");
    expect(result.disclosureTier).toBe(1);
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]?.download).toBeNull();
    expect(result.timeline).toHaveLength(1);
    expect(result.assessments.current).not.toHaveProperty("siteId");
    expect(JSON.stringify(result)).not.toContain(CANARY);
    expect(requests.some((entry) => entry.path.includes("submissions") || entry.path.includes("pipeline"))).toBe(false);
  });

  it("refuses the current withdrawn engagement and another investor's engagement", async () => {
    const ambiguous = harness("investor", {
      "/api/me/engagements": [
        engagement({ id: OTHER, state_changed_at: null }),
        engagement({ state: "withdrawn", state_changed_at: null }),
      ],
    });
    expect(await ambiguous.client.readDetail(
      { kind: "deal-room", projectId: PROJECT }, { scope: await scopeOf(ambiguous.client) },
    )).toMatchObject({ ok: false, error: { kind: "denied" } });
    const foreign = harness("investor", { "/api/me/engagements": [engagement({ investor_id: OTHER })] });
    expect(await foreign.client.readDetail(
      { kind: "deal-room", projectId: PROJECT }, { scope: await scopeOf(foreign.client) },
    )).toMatchObject({ ok: false, error: { kind: "denied", code: "scope_mismatch" } });
  });

  it("uses the service's current engagement even when an older withdrawal changed later", async () => {
    const { client, requests } = harness("investor", { "/api/me/engagements": [
      engagement({
        id: OTHER, state: "withdrawn", created_at: "2026-09-18T00:00:00Z",
        state_changed_at: "2026-09-21T00:00:00Z",
      }),
      engagement({ created_at: "2026-09-19T00:00:00Z", state_changed_at: "2026-09-19T00:00:00Z" }),
    ] }, { canAttemptExports: true });
    const scope = await scopeOf(client);
    expect(take(await client.readDetail({ kind: "deal-room", projectId: PROJECT }, { scope })).role).toBe("investor");
    expect(take(await client.readExport({ scope })).documents).toHaveLength(1);
    expect(requests.filter((entry) => entry.path.endsWith("/deal-room"))).toHaveLength(2);
    expect(requests.every((entry) => entry.init?.method === "GET")).toBe(true);
  });

  it("preserves the service's stable row order when engagement timestamps tie", async () => {
    const { client } = harness("investor", { "/api/me/engagements": [
      engagement({ id: OTHER, state: "withdrawn" }), engagement(),
    ] });
    expect(take(await client.readDetail(
      { kind: "deal-room", projectId: PROJECT }, { scope: await scopeOf(client) },
    )).role).toBe("investor");
  });

  it("leaves final deal-room authorization with the service despite an eligible engagement", async () => {
    const { client, requests } = harness("investor", {
      [`/api/projects/${PROJECT}/deal-room`]: () => json({ code: "forbidden_tier" }, 403),
    });
    expect(await client.readDetail(
      { kind: "deal-room", projectId: PROJECT }, { scope: await scopeOf(client) },
    )).toMatchObject({ ok: false, error: { kind: "denied", status: 403 } });
    expect(requests.some((entry) => entry.path.endsWith("/deal-room"))).toBe(true);
    expect(requests.every((entry) => entry.init?.method === "GET")).toBe(true);
  });

  it("refuses funding attached to a different project", async () => {
    const { client } = harness("operator", { [`/api/projects/${PROJECT}/funding-needs`]: [funding({ project_id: OTHER })] });
    expect(await client.readDetail(
      { kind: "project", projectId: PROJECT, siteId: SITE }, { scope: await scopeOf(client) },
    )).toMatchObject({ ok: false, error: { kind: "denied", code: "scope_mismatch" } });
  });
});

describe("identity fencing, cancellation and resource bounds", () => {
  it("discards a snapshot when identity changes across its read group", async () => {
    let observed = 0;
    const { client } = harness("site-owner", { "/api/me": () => identity("site-owner", { user_id: ++observed === 1 ? USER : OTHER }) });
    expect(await client.readSnapshot()).toMatchObject({ ok: false, error: { kind: "stale", code: "identity_changed" } });
  });

  it("detects an identity change before a scoped read and retires old scopes", async () => {
    let observed = 0;
    const { client, requests } = harness("operator", { "/api/me": () => ++observed === 1 ? identity("operator") : identity("investor") });
    const scope = await scopeOf(client);
    expect(await client.readDetail({ kind: "submission", siteId: SITE }, { scope })).toMatchObject({ ok: false, error: { kind: "stale" } });
    expect(await client.readDetail({ kind: "submission", siteId: SITE }, { scope })).toMatchObject({ ok: false, error: { kind: "stale" } });
    expect(requests.map((entry) => entry.path)).toEqual(["/api/me", "/api/me"]);
  });

  it.each([401, 403])("retires scopes after HTTP %i", async (status) => {
    const { client, fetcher } = harness("operator", { [`/api/submissions/${SITE}`]: () => json({ code: "forbidden_role" }, status) });
    const scope = await scopeOf(client);
    expect((await client.readDetail({ kind: "submission", siteId: SITE }, { scope })).ok).toBe(false);
    const calls = fetcher.mock.calls.length;
    expect(await client.readDetail({ kind: "submission", siteId: SITE }, { scope })).toMatchObject({ ok: false, error: { kind: "stale" } });
    expect(fetcher).toHaveBeenCalledTimes(calls);
  });

  it("does not fetch for an already-aborted signal", async () => {
    const { client, fetcher } = harness();
    expect(await client.readSnapshot({ signal: AbortSignal.abort() })).toMatchObject({ ok: false, error: { kind: "canceled" } });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("cancels a fetch that ignores its signal without leaking the caller abort reason", async () => {
    const { client, requests } = harness("site-owner", { "/api/me": () => new Promise<Response>(() => {}) });
    const controller = new AbortController();
    const pending = client.readIdentity({ signal: controller.signal });
    controller.abort(CANARY);
    expect(await pending).toMatchObject({ ok: false, error: { kind: "canceled" } });
    expect(requests[0]?.init?.signal?.aborted).toBe(true);
  });

  it("retires an older snapshot and discards late responses", async () => {
    let release: ((value: Response) => void) | undefined;
    let calls = 0;
    const { client } = harness("site-owner", {
      "/api/me/sites": () => ++calls === 1 ? new Promise<Response>((resolve) => { release = resolve; }) : [ownerEntry()],
    });
    const first = client.readSnapshot();
    await vi.waitFor(() => expect(release).toBeDefined());
    const second = client.readSnapshot();
    expect(await first).toMatchObject({ ok: false, error: { kind: "stale" } });
    expect(take(await second).records).toHaveLength(1);
    release?.(json([ownerEntry({ site: site({ owner_user_id: OTHER }) })]));
    expect(take(await client.readIdentity()).userId).toBe(USER);
  });

  it("cancels a superseded detail without retiring the newer detail's scope", async () => {
    let release: ((value: Response) => void) | undefined;
    const { client } = harness("operator", {
      [`/api/submissions/${SITE}`]: () => new Promise<Response>((resolve) => { release = resolve; }),
      [`/api/submissions/${OTHER}`]: detail({
        site: site({ id: OTHER }), assessment: null, assessment_history: [], documents: [], activity: [],
      }),
    });
    const scope = await scopeOf(client);
    const first = client.readDetail({ kind: "submission", siteId: SITE }, { scope });
    await vi.waitFor(() => expect(release).toBeDefined());
    const second = client.readDetail({ kind: "submission", siteId: OTHER }, { scope });
    expect(await first).toMatchObject({ ok: false, error: { kind: "canceled", code: "superseded" } });
    expect(take(await second).record.siteId).toBe(OTHER);
    release?.(json(detail()));
    expect(take(await client.readIdentity()).scope).toEqual(scope);
  });

  it.each([401, 403])("a superseded HTTP %i body cannot retire the newer detail", async (status) => {
    let readingBody = false;
    let observations = 0;
    let releaseIdentity: ((value: Response) => void) | undefined;
    const { client } = harness("operator", {
      "/api/me": () => ++observations === 3
        ? new Promise<Response>((resolve) => { releaseIdentity = resolve; }) : identity("operator"),
      [`/api/submissions/${SITE}`]: () => new Response(new ReadableStream<Uint8Array>({
        pull() { readingBody = true; },
      }), { status, headers: { "content-type": "application/json" } }),
      [`/api/submissions/${OTHER}`]: detail({
        site: site({ id: OTHER }), assessment: null, assessment_history: [], documents: [], activity: [],
      }),
    });
    const scope = await scopeOf(client);
    const first = client.readDetail({ kind: "submission", siteId: SITE }, { scope });
    await vi.waitFor(() => expect(readingBody).toBe(true));
    const second = client.readDetail({ kind: "submission", siteId: OTHER }, { scope });
    await vi.waitFor(() => expect(releaseIdentity).toBeDefined());
    expect(await first).toMatchObject({ ok: false, error: { kind: "canceled", code: "superseded" } });
    releaseIdentity?.(json(identity("operator")));
    expect(take(await second).record.siteId).toBe(OTHER);
    expect(take(await client.readIdentity()).scope).toEqual(scope);
  });

  it("removes the original abort listener even if a caller replaces its options signal", async () => {
    let release: ((value: Response) => void) | undefined;
    const { client } = harness("site-owner", { "/api/me": () => new Promise<Response>((resolve) => { release = resolve; }) });
    const first = new AbortController();
    const options = { signal: first.signal };
    const removed = vi.spyOn(first.signal, "removeEventListener");
    const pending = client.readIdentity(options);
    options.signal = new AbortController().signal;
    release?.(json(identity()));
    take(await pending);
    expect(removed).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("explicit invalidation aborts pending context work", async () => {
    const { client, requests } = harness("site-owner", { "/api/me": () => new Promise<Response>(() => {}) });
    const pending = client.readIdentity();
    client.invalidate();
    expect(await pending).toMatchObject({ ok: false, error: { kind: "stale" } });
    expect(requests[0]?.init?.signal?.aborted).toBe(true);
  });

  it.each([
    [undefined, 10_000], [100_000, 30_000], [0, 1],
  ])("bounds timeout %s to %i ms, including signal-ignoring fetches", async (timeoutMs, expected) => {
    vi.useFakeTimers();
    const options = timeoutMs === undefined ? {} : { timeoutMs };
    const { client, fetcher } = harness("site-owner", { "/api/me": () => new Promise<Response>(() => {}) }, {}, options);
    const pending = client.readIdentity();
    await vi.advanceTimersByTimeAsync(expected);
    expect(await pending).toMatchObject({ ok: false, error: { kind: "timeout" } });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("bounds a stalled streamed body as well as response headers", async () => {
    vi.useFakeTimers();
    let canceled = false;
    const { client } = harness("site-owner", { "/api/me": () => new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('{"user_id":')); },
      cancel() { canceled = true; },
    }), { headers: { "content-type": "application/json" } }) }, {}, { timeoutMs: 20 });
    const pending = client.readIdentity();
    await vi.advanceTimersByTimeAsync(20);
    expect(await pending).toMatchObject({ ok: false, error: { kind: "timeout" } });
    expect(canceled).toBe(true);
  });

  it.each([
    () => new Response("not json", { headers: { "content-type": "application/json" } }),
    () => new Response("<html>not the API</html>", { headers: { "content-type": "text/html" } }),
    () => json({ different_schema: true }),
    () => new Response(new Uint8Array([0xff]), { headers: { "content-type": "application/json" } }),
  ])("refuses malformed success payloads", async (reply) => {
    const { client, fetcher } = harness("site-owner", { "/api/me": reply });
    expect(await client.readIdentity()).toMatchObject({ ok: false, error: { kind: "malformed" } });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("rejects a followed redirect even from a mocked transport", async () => {
    const response = json(identity());
    Object.defineProperty(response, "redirected", { value: true });
    const { client } = harness("site-owner", { "/api/me": response });
    expect(await client.readIdentity()).toMatchObject({ ok: false, error: { kind: "network", code: "redirect_not_admitted" } });
  });

  it("checks declared and streamed JSON byte bounds without trusting content-length", async () => {
    const declared = harness("site-owner", { "/api/me": () => new Response("{}", {
      headers: { "content-type": "application/json", "content-length": String(LIVE_READ_LIMITS.jsonBytes + 1) },
    }) });
    expect(await declared.client.readIdentity()).toMatchObject({ ok: false, error: { kind: "too-large" } });
    const streamed = harness("site-owner", { "/api/me": () => new Response(" ".repeat(LIVE_READ_LIMITS.jsonBytes + 1), {
      headers: { "content-type": "application/json", "content-length": "1" },
    }) });
    expect(await streamed.client.readIdentity()).toMatchObject({ ok: false, error: { kind: "too-large", code: "byte_limit" } });
  });

  it("accepts exactly 2 MiB of JSON bytes", async () => {
    const encoded = JSON.stringify(identity());
    const body = " ".repeat(LIVE_READ_LIMITS.jsonBytes - encoded.length) + encoded;
    const { client } = harness("site-owner", { "/api/me": () => new Response(body, { headers: { "content-type": "application/json" } }) });
    expect(take(await client.readIdentity()).userId).toBe(USER);
  });

  it.each([401, 403])("retires a current scope even if its HTTP %i body breaks mid-stream", async (status) => {
    const { client, fetcher } = harness("operator", { [`/api/submissions/${SITE}`]: () => new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.error(new TypeError("Synthetic failed auth body")); },
    }), { status, headers: { "content-type": "application/json" } }) });
    const scope = await scopeOf(client);
    expect(await client.readDetail({ kind: "submission", siteId: SITE }, { scope })).toMatchObject({
      ok: false, error: { kind: status === 401 ? "unauthenticated" : "denied", status },
    });
    const calls = fetcher.mock.calls.length;
    expect(await client.readDetail({ kind: "submission", siteId: SITE }, { scope })).toMatchObject({ ok: false, error: { kind: "stale" } });
    expect(fetcher).toHaveBeenCalledTimes(calls);
  });

  it("admits exactly 5,000 items and refuses 5,001 without truncation", async () => {
    const entries = Array.from({ length: LIVE_READ_LIMITS.maxItems }, (_, index) => ({
      site: { id: `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`, owner_user_id: USER },
    }));
    const accepted = harness("site-owner", { "/api/me/sites": entries });
    expect(take(await accepted.client.readSnapshot()).records).toHaveLength(5_000);
    const refused = harness("site-owner", { "/api/me/sites": [...entries, entries[0]] });
    expect(await refused.client.readSnapshot()).toMatchObject({ ok: false, error: { kind: "too-large", code: "item_limit" } });
  });

  it("rejects unbounded strings and nesting without exposing unknown properties", async () => {
    const oversized = harness("site-owner", { "/api/me": identity("site-owner", { ignored: "x".repeat(LIVE_READ_LIMITS.maxStringLength + 1) }) });
    expect(await oversized.client.readIdentity()).toMatchObject({ ok: false, error: { kind: "too-large" } });
    let nested: unknown = null;
    for (let index = 0; index < 40; index += 1) nested = { nested };
    const deep = harness("site-owner", { "/api/me": identity("site-owner", { ignored: nested }) });
    expect(await deep.client.readIdentity()).toMatchObject({ ok: false, error: { kind: "too-large", code: "depth_limit" } });
  });

  it("surfaces network failure without retries and does not swallow programming errors", async () => {
    const unavailable = harness("site-owner", { "/api/me": () => { throw new TypeError("Synthetic network failure"); } });
    expect(await unavailable.client.readIdentity()).toMatchObject({ ok: false, error: { kind: "network" } });
    expect(unavailable.fetcher).toHaveBeenCalledOnce();
    const broken = harness("site-owner", { "/api/me": () => { throw new Error("Synthetic programming error"); } });
    await expect(broken.client.readIdentity()).rejects.toThrow("Synthetic programming error");
  });
});

describe("separately admitted original bytes and normalized exports", () => {
  async function preparedDocument(reply: () => Response, more: Record<string, Reply | (() => Reply | Promise<Reply>)> = {}) {
    const result = harness("site-owner", {
      [`/api/sites/${SITE}/documents/${DOCUMENT}/content`]: reply, ...more,
    }, { canAttemptDocumentDownloads: true });
    const scope = await scopeOf(result.client);
    const details = take(await result.client.readDetail({ kind: "owner-site", siteId: SITE }, { scope }));
    if (details.role !== "site-owner") throw new Error("Wrong projection");
    const reference = details.documents[0]?.download;
    if (!reference) throw new Error("Missing admitted reference");
    return { ...result, reference, scope };
  }

  it("offers metadata without a byte capability when downloads are not admitted", async () => {
    const { client } = harness();
    const result = take(await client.readDetail({ kind: "owner-site", siteId: SITE }, { scope: await scopeOf(client) }));
    expect(result.documents[0]?.download).toBeNull();
  });

  it("returns bytes only between identity observations with an inert sanitized filename", async () => {
    const { client, reference, scope, requests } = await preparedDocument(
      () => new Response(PDF, { headers: { "content-type": "application/pdf" } }),
      { "/api/me/sites": [ownerEntry({ documents: [document({ original_filename: "../../unsafe<script>.html" })] })] },
    );
    const downloaded = take(await client.readDocument(reference, { scope }));
    expect(downloaded.fileName).toBe("unsafe_script_.pdf");
    expect(await downloaded.blob.text()).toBe(PDF);
    expect(downloaded.sizeBytes).toBe(PDF.length);
    expect(requests.slice(-3).map((entry) => entry.path)).toEqual([
      "/api/me", `/api/sites/${SITE}/documents/${DOCUMENT}/content`, "/api/me",
    ]);
  });

  it("reports legitimate missing original content without fallback", async () => {
    const { client, reference, scope } = await preparedDocument(() => json({ code: "not_found" }, 404));
    expect(await client.readDocument(reference, { scope })).toMatchObject({ ok: false, error: { kind: "missing", status: 404 } });
  });

  it("refuses unissued or modified document references without an original-content call", async () => {
    const { client, reference, scope, requests } = await preparedDocument(() => new Response(PDF, { headers: { "content-type": "application/pdf" } }));
    expect(await client.readDocument({ ...reference, contentType: "text/html" }, { scope })).toMatchObject({ ok: false, error: { kind: "denied" } });
    expect(requests.some((entry) => entry.path.endsWith("/content"))).toBe(false);
  });

  it.each([
    () => new Response("<script>unsafe</script>", { headers: { "content-type": "text/html" } }),
    () => new Response(PDF + "changed", { headers: { "content-type": "application/pdf" } }),
  ])("refuses active content or changed document metadata", async (reply) => {
    const { client, reference, scope } = await preparedDocument(reply);
    expect(await client.readDocument(reference, { scope })).toMatchObject({ ok: false, error: { kind: "malformed" } });
  });

  it("enforces the 10 MiB byte bound", async () => {
    const { client, reference, scope } = await preparedDocument(() => new Response("", {
      headers: { "content-type": "application/pdf", "content-length": String(LIVE_READ_LIMITS.downloadBytes + 1) },
    }));
    expect(await client.readDocument(reference, { scope })).toMatchObject({ ok: false, error: { kind: "too-large" } });
  });

  it("admits exactly 10 MiB of original bytes without truncation", async () => {
    const { client, reference, scope } = await preparedDocument(
      () => new Response(new Uint8Array(LIVE_READ_LIMITS.downloadBytes), { headers: { "content-type": "application/pdf" } }),
      { "/api/me/sites": [ownerEntry({ documents: [document({ size_bytes: LIVE_READ_LIMITS.downloadBytes })] })] },
    );
    expect(take(await client.readDocument(reference, { scope })).sizeBytes).toBe(LIVE_READ_LIMITS.downloadBytes);
  });

  it("withdraws old document references when a new detail context starts", async () => {
    const { client, reference, scope, requests } = await preparedDocument(() => new Response(PDF, { headers: { "content-type": "application/pdf" } }));
    expect(await client.readDetail({ kind: "owner-site", siteId: OTHER }, { scope })).toMatchObject({ ok: false, error: { kind: "missing" } });
    expect(await client.readDocument(reference, { scope })).toMatchObject({ ok: false, error: { kind: "denied" } });
    expect(requests.some((entry) => entry.path.endsWith("/content"))).toBe(false);
  });

  it("discards a download if identity changes after its bytes were read", async () => {
    let observations = 0;
    const { client, reference, scope } = await preparedDocument(
      () => new Response(PDF, { headers: { "content-type": "application/pdf" } }),
      { "/api/me": () => identity("site-owner", { user_id: ++observations < 5 ? USER : OTHER }) },
    );
    expect(await client.readDocument(reference, { scope })).toMatchObject({ ok: false, error: { kind: "stale" } });
  });

  it("exports the admitted caller-scoped JSON manifest, never raw server CSV or links", async () => {
    const { client, requests } = harness("site-owner", {}, { canAttemptExports: true });
    const manifest = take(await client.readExport({ scope: await scopeOf(client) }));
    expect(manifest.documents[0]?.download).toBeNull();
    const jsonDownload = formatReadExport(manifest, "json");
    const encoded = await jsonDownload.blob.text();
    expect(encoded).not.toContain(CANARY);
    expect(encoded).not.toContain("content_url");
    expect(JSON.parse(encoded).role).toBe("site-owner");
    expect(requests.some((entry) => entry.path === "/api/export?format=csv")).toBe(false);
    expect(requests.at(-1)?.path).toBe("/api/me");
  });

  it.each(["site-owner", "operator"] as const)(
    "normalizes a %s project-only export document without inventing original bytes", async (role) => {
      const { client, requests } = harness(role, {
        "/api/me/sites": [ownerEntry({
          project: { id: PROJECT, site_id: SITE, stage: "pre_development" },
          project_stage: "pre_development", journey_stage_id: "pre-development",
          documents: [document({ site_id: null, project_id: PROJECT })],
        })],
        "/api/export?format=json": exportBundle(role, {
          projects: [{ site_id: SITE, project_id: PROJECT }],
          documents: [document({ site_id: SITE, project_id: PROJECT })],
        }),
      }, { canAttemptExports: true, canAttemptDocumentDownloads: true });
      const manifest = take(await client.readExport({ scope: await scopeOf(client) }));
      expect(manifest.documents).toMatchObject([{
        id: DOCUMENT, siteId: null, projectId: PROJECT, download: null,
      }]);
      expect(JSON.parse(await formatReadExport(manifest, "json").blob.text()).documents[0]).toMatchObject({
        siteId: null, projectId: PROJECT,
      });
      expect(requests.some((entry) => entry.path.endsWith("/content"))).toBe(false);
    },
  );

  it.each(["site-owner", "operator"] as const)(
    "rejects a %s export document whose fallback site contradicts the project membership", async (role) => {
      const { client } = harness(role, { "/api/export?format=json": exportBundle(role, {
        projects: [{ site_id: SITE, project_id: PROJECT }],
        documents: [document({ site_id: OTHER, project_id: PROJECT })],
      }) }, { canAttemptExports: true, canAttemptDocumentDownloads: true });
      expect(await client.readExport({ scope: await scopeOf(client) })).toMatchObject({
        ok: false, error: { kind: "denied", code: "scope_mismatch" },
      });
    },
  );

  it("retains original-byte admission for a genuine site-parented export document", async () => {
    const { client } = harness("site-owner", {}, {
      canAttemptExports: true, canAttemptDocumentDownloads: true,
    });
    const manifest = take(await client.readExport({ scope: await scopeOf(client) }));
    expect(manifest.documents[0]?.download).toMatchObject({ siteId: SITE, documentId: DOCUMENT });
  });

  it("retains owner document membership checks after project-parent normalization", async () => {
    const { client } = harness("site-owner", {
      "/api/me/sites": [ownerEntry({
        project: { id: PROJECT, site_id: SITE, stage: "pre_development" },
        project_stage: "pre_development", documents: [],
      })],
      "/api/export?format=json": exportBundle("site-owner", {
        projects: [{ site_id: SITE, project_id: PROJECT }],
        documents: [document({ site_id: SITE, project_id: PROJECT })],
      }),
    }, { canAttemptExports: true });
    expect(await client.readExport({ scope: await scopeOf(client) })).toMatchObject({
      ok: false, error: { kind: "denied", code: "scope_mismatch" },
    });
  });

  it("encodes source provenance separately from the service's generation timestamp", async () => {
    const { client } = harness("site-owner", {}, { canAttemptExports: true });
    const manifest = take(await client.readExport({ scope: await scopeOf(client) }));
    const encoded = JSON.parse(await formatReadExport(manifest, "json").blob.text());
    expect(encoded.provenance).toEqual({
      source: "WS2", mode: "connected", store: "database-configured",
      contractRevision: WS2_CONTRACT_REVISION, deployedRevision: null, retrievedAt: OBSERVED,
    });
    expect(encoded.generatedAt).toBe(manifest.generatedAt);
    expect(encoded.generatedAt).not.toBe(encoded.provenance.retrievedAt);
    const csv = await formatReadExport(manifest, "csv").blob.text();
    expect(csv).toContain('"source","WS2"');
    expect(csv).toContain('"source_mode","connected"');
    expect(csv).toContain('"source_store","database-configured"');
    expect(csv).toContain(`"contract_revision","${WS2_CONTRACT_REVISION}"`);
    expect(csv).toContain('"deployed_revision",""');
    expect(csv).toContain(`"retrieved_at","${OBSERVED}"`);
    expect(csv).toContain(`"generated_at","${manifest.generatedAt}"`);
    expect(csv).not.toContain("/api/");
    expect(encoded.provenance).not.toHaveProperty("operations");
  });

  it("checks the export's user and role against the current identity", async () => {
    const { client } = harness("site-owner", { "/api/export?format=json": exportBundle("site-owner", { user_id: OTHER }) }, { canAttemptExports: true });
    expect(await client.readExport({ scope: await scopeOf(client) })).toMatchObject({
      ok: false, error: { kind: "stale", code: "identity_changed" },
    });
  });

  it("discards an export if identity changes after the manifest group", async () => {
    let observations = 0;
    const { client } = harness("site-owner", { "/api/me": () => identity("site-owner", { user_id: ++observations < 3 ? USER : OTHER }) }, { canAttemptExports: true });
    expect(await client.readExport({ scope: await scopeOf(client) })).toMatchObject({ ok: false, error: { kind: "stale" } });
  });

  it.each(["=SUM(1)", "+SUM(1)", "-SUM(1)", "@SUM(1)", " \ufeff=SUM(1)", "\r@SUM(1)"])("escapes formula-leading CSV text %j", async (name) => {
    const source = exportBundle();
    source.projects[0] = { ...source.projects[0]!, name };
    const { client } = harness("site-owner", { "/api/export?format=json": source }, { canAttemptExports: true });
    const manifest = take(await client.readExport({ scope: await scopeOf(client) }));
    expect(await formatReadExport(manifest, "csv").blob.text()).toContain(`"'${name}"`);
  });

  it("keeps source generated time unknown and escapes spreadsheet formulas and HTML", async () => {
    const source = exportBundle("site-owner", { generated_at: null, scope: "\t=private_formula()" });
    source.projects[0] = { ...source.projects[0]!, name: ' =HYPERLINK("bad")<script>' };
    const { client } = harness("site-owner", { "/api/export?format=json": source }, { canAttemptExports: true });
    const manifest = take(await client.readExport({ scope: await scopeOf(client) }));
    expect(manifest.generatedAt).toBeNull();
    const csv = formatReadExport(manifest, "csv");
    expect(csv.fileName).toBe("sunsum-export-site-owner-undated.csv");
    expect(await csv.blob.text()).toContain(`"' =HYPERLINK(""bad"")<script>"`);
    expect(await csv.blob.text()).toContain(`"'\t=private_formula()"`);
    const encoded = await formatReadExport(manifest, "json").blob.text();
    expect(encoded).not.toContain("<script>");
    expect(encoded).toContain("\\u003cscript\\u003e");
  });

  it("drops tier-zero overreturned private fields and documents without opening a deal room", async () => {
    const source = exportBundle("investor");
    const privateRow = { ...source.projects[0]!, site_id: { private: CANARY }, address: CANARY, submission_status: CANARY };
    const { client, requests } = harness("investor", {
      "/api/export?format=json": { ...source, projects: [privateRow], private_dump: CANARY },
      "/api/me/engagements": [],
    }, { canAttemptExports: true });
    const manifest = take(await client.readExport({ scope: await scopeOf(client) }));
    expect(manifest.documents).toEqual([]);
    expect(manifest.projects[0]).toMatchObject({ siteId: null, address: null, submissionStatus: null });
    expect(JSON.stringify(manifest)).not.toContain(CANARY);
    expect(requests.some((entry) => entry.path.includes("deal-room"))).toBe(false);
  });

  it("re-confirms each investor document release through an existing engaged deal room", async () => {
    const { client, requests } = harness("investor", {}, { canAttemptExports: true, canAttemptDocumentDownloads: true });
    const manifest = take(await client.readExport({ scope: await scopeOf(client) }));
    expect(manifest.documents).toHaveLength(1);
    expect(manifest.documents[0]).toMatchObject({ siteId: null, projectId: null, download: null });
    expect(requests.some((entry) => entry.path === `/api/projects/${PROJECT}/deal-room`)).toBe(true);
    expect(JSON.stringify(manifest)).not.toContain(CANARY);
    expect(await formatReadExport(manifest, "json").blob.text()).not.toContain("download");
  });
});
