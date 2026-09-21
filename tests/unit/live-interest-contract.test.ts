// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_IDENTITY_IDS } from "@/backend/demo-principals";
import { resolveLiveReadConfiguration, type LiveReadConfiguration } from "@/domain/live-configuration";
import {
  createWorkspaceClient, currentProjectInterest, eligibleDealRoomProjects,
  type InterestResult, type ReadEngagement, type ReadResult,
} from "@/features/live-read";
import {
  SYNTHETIC_LIVE_READ_IDS as IDS,
  SYNTHETIC_LIVE_READ_TIME as TIME,
  syntheticEngagement, syntheticIdentity, syntheticInvestorProfile, syntheticPortfolio,
} from "../fixtures/live-read-contracts";

const PROJECT = IDS.projectId;
const OTHER_PROJECT = IDS.unconvertedSiteId;
const NOW = "2026-09-21T19:00:00.000Z";

function take<T>(result: ReadResult<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.data;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status, headers: { "content-type": "application/json" },
  });
}

function setup(mode: "connected" | "server-demo" = "connected", changes: Partial<LiveReadConfiguration> = {}, timeoutMs = 1000) {
  const configuration = {
    ...resolveLiveReadConfiguration({
      dataMode: mode, store: mode === "server-demo" ? "mock" : "db",
      demoAuth: mode === "server-demo" ? "enabled" : "false",
      sessionSecretConfigured: true, participantSignInApproved: mode === "connected",
      syntheticIdentities: DEMO_IDENTITY_IDS,
    }),
    ...changes,
  };
  const state: {
    identity: Record<string, unknown>;
    rows: unknown[];
    post: (() => Response | Promise<Response>) | null;
    identityRead: (() => Response | Promise<Response>) | null;
  } = {
    identity: syntheticIdentity("investor", { user_id: IDS.investorUserId }),
    rows: [], post: null, identityRead: null,
  };
  const investorId = () => {
    const profile = state.identity.investor;
    return typeof profile === "object" && profile !== null && "id" in profile ? profile.id : null;
  };
  const receipt = (extra: Record<string, unknown> = {}) => syntheticEngagement({
    investor_id: investorId(), funding_need_id: null, ...extra,
  });
  const calls: { path: string; method: string; init: RequestInit | undefined }[] = [];
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    calls.push({ path: `${url.pathname}${url.search}`, method, init });
    if (method === "POST" && url.pathname === `/api/projects/${PROJECT}/engagements`) {
      if (state.post) return state.post();
      const created = receipt({ id: state.rows.length === 0 ? IDS.engagementId : IDS.activityId });
      state.rows.push(created);
      return json(created, 201);
    }
    if (method !== "GET") throw new Error(`Unexpected synthetic mutation: ${method} ${url.pathname}`);
    if (url.pathname === "/api/me") return state.identityRead ? state.identityRead() : json(state.identity);
    if (url.pathname === "/api/portfolio") return json(syntheticPortfolio({ mandate_match: true }));
    if (url.pathname === "/api/me/engagements") return json(state.rows);
    if (url.pathname === "/api/investors/me/profile") return json(syntheticInvestorProfile({
      id: investorId(), user_id: state.identity.user_id,
    }));
    throw new Error(`Unstubbed synthetic read: ${url.pathname}`);
  });
  const client = take(createWorkspaceClient(configuration, {
    origin: "https://sunsum.invalid", fetch: fetcher, now: () => new Date(NOW), timeoutMs,
  }));
  const ready = async () => take(await client.readSnapshot({ query: { mandateMatch: true } }));
  const posts = () => calls.filter((call) => call.method === "POST");
  return { client, state, calls, fetcher, ready, posts, receipt };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("explicit project-level nonbinding interest", () => {
  it("performs one fixed POST after scoped preflight and keeps its receipt out of GET provenance", async () => {
    const h = setup();
    const snapshot = await h.ready();
    expect(h.posts()).toEqual([]);
    const result = await h.client.expressInterest(PROJECT, { scope: snapshot.scope });
    expect(result).toMatchObject({
      kind: "created", engagement: { projectId: PROJECT, fundingNeedId: null, state: "interested", isBinding: false },
      receipt: { method: "POST", dispatched: true, mode: "connected", projectId: PROJECT, observedAt: NOW, deployedRevision: null },
    });
    expect(h.posts()).toHaveLength(1);
    expect(h.posts()[0]).toMatchObject({
      path: `/api/projects/${PROJECT}/engagements`,
      init: { method: "POST", body: "{}", credentials: "same-origin", cache: "no-store",
        redirect: "error", headers: { "content-type": "application/json" } },
    });
    const refreshed = take(await h.client.readMyEngagements({ scope: snapshot.scope }));
    expect(refreshed.engagements).toHaveLength(1);
    expect(refreshed.provenance.operations.every((operation) => operation.method === "GET")).toBe(true);
    expect(snapshot.provenance.operations.every((operation) => operation.method === "GET")).toBe(true);
  });

  it("preloads an existing project-level engagement without writing or reclassifying binding state", async () => {
    const h = setup();
    h.state.rows = [h.receipt({ state: "committed", is_binding: true })];
    const snapshot = await h.ready();
    expect(await h.client.expressInterest(PROJECT, { scope: snapshot.scope })).toMatchObject({
      kind: "existing", receipt: { dispatched: false }, engagement: { state: "committed", isBinding: true },
    });
    expect(h.posts()).toEqual([]);
  });

  it("does not confuse a funding-need engagement with duplicate project-level interest", async () => {
    const h = setup();
    h.state.rows = [h.receipt({ funding_need_id: IDS.fundingNeedId })];
    const snapshot = await h.ready();
    expect(await h.client.expressInterest(PROJECT, { scope: snapshot.scope })).toMatchObject({ kind: "created" });
    expect(h.posts()).toHaveLength(1);
    expect(h.posts()[0]?.init?.body).toBe("{}");
  });

  it("treats the expected 409 as existing state without replay or a fabricated receipt row", async () => {
    const h = setup();
    h.state.post = () => json({ code: "conflict", message: "A live engagement already exists." }, 409);
    const snapshot = await h.ready();
    expect(await h.client.expressInterest(PROJECT, { scope: snapshot.scope })).toMatchObject({
      kind: "existing", engagement: null, receipt: { dispatched: true },
    });
    expect(h.posts()).toHaveLength(1);
  });

  it.each([
    [401, "unauthenticated"], [403, "forbidden_role"], [403, "forbidden_tier"],
    [403, "forbidden_origin"], [404, "not_found"], [400, "invalid_body"], [422, "validation_failed"],
  ] as const)("keeps an authoritative %i %s refusal distinct from an unknown outcome", async (status, code) => {
    const h = setup();
    h.state.post = () => json({ code, message: "Synthetic refusal." }, status);
    const snapshot = await h.ready();
    expect(await h.client.expressInterest(PROJECT, { scope: snapshot.scope })).toMatchObject({
      kind: "refused", error: { status, code },
    });
    expect(h.posts()).toHaveLength(1);
  });

  it("requires a loaded current portfolio project, not just an investor ID or an arbitrary URL", async () => {
    const h = setup();
    const identity = take(await h.client.readIdentity());
    expect(await h.client.expressInterest(PROJECT, { scope: identity.scope })).toMatchObject({
      kind: "refused", error: { code: "project_not_admitted" },
    });
    const snapshot = await h.ready();
    expect(await h.client.expressInterest("../me", { scope: snapshot.scope })).toMatchObject({ kind: "not-sent" });
    expect(await h.client.expressInterest(OTHER_PROJECT, { scope: snapshot.scope })).toMatchObject({
      kind: "refused", error: { code: "project_not_admitted" },
    });
    expect(h.posts()).toEqual([]);
  });

  it("does not turn the legacy read-only factory configuration into write approval", async () => {
    const h = setup("connected", { canAttemptInterest: false });
    const snapshot = await h.ready();
    expect(await h.client.expressInterest(PROJECT, { scope: snapshot.scope })).toMatchObject({
      kind: "not-sent", error: { code: "interest_not_admitted" },
    });
    expect(h.posts()).toEqual([]);
  });

  it("requires fresh completed onboarding before dispatch", async () => {
    const h = setup();
    const snapshot = await h.ready();
    h.state.identity = syntheticIdentity("investor", {
      user_id: IDS.investorUserId, onboarded: false,
      investor: { id: IDS.investorId, organization_name: "Synthetic cooperative", onboarding_completed_at: null },
    });
    const result = await h.client.expressInterest(PROJECT, { scope: snapshot.scope });
    expect(result.kind).not.toBe("created");
    expect(h.posts()).toEqual([]);
  });

  it.each(["operator", "site-owner"] as const)("refuses an admitted %s identity without issuing a project POST", async (role) => {
    const h = setup();
    h.state.identity = syntheticIdentity(role);
    const identity = take(await h.client.readIdentity());
    expect(await h.client.expressInterest(PROJECT, { scope: identity.scope })).toMatchObject({ kind: "refused" });
    expect(h.posts()).toEqual([]);
  });
});

describe("interest uncertainty and request lifetime", () => {
  it("serializes duplicate clicks while the first request is pending", async () => {
    const h = setup();
    const pendingPost = Promise.withResolvers<Response>();
    h.state.post = () => pendingPost.promise;
    const snapshot = await h.ready();
    const first = h.client.expressInterest(PROJECT, { scope: snapshot.scope });
    await vi.waitFor(() => expect(h.posts()).toHaveLength(1), { interval: 1 });
    expect(await h.client.expressInterest(PROJECT, { scope: snapshot.scope })).toMatchObject({
      kind: "not-sent", error: { code: "interest_pending" },
    });
    pendingPost.resolve(json(h.receipt(), 201));
    expect((await first).kind).toBe("created");
    expect(h.posts()).toHaveLength(1);
  });

  it("reports a pre-dispatch cancellation as not sent", async () => {
    const h = setup();
    const snapshot = await h.ready();
    const controller = new AbortController();
    controller.abort();
    expect(await h.client.expressInterest(PROJECT, { scope: snapshot.scope, signal: controller.signal }))
      .toMatchObject({ kind: "not-sent", error: { kind: "canceled" } });
    expect(h.posts()).toEqual([]);
  });

  it("treats cancellation after dispatch as unknown even if a late success arrives", async () => {
    const h = setup();
    const pendingPost = Promise.withResolvers<Response>();
    h.state.post = () => pendingPost.promise;
    const snapshot = await h.ready();
    const controller = new AbortController();
    const result = h.client.expressInterest(PROJECT, { scope: snapshot.scope, signal: controller.signal });
    await vi.waitFor(() => expect(h.posts()).toHaveLength(1), { interval: 1 });
    controller.abort();
    expect(await result).toMatchObject({ kind: "unknown", receipt: { dispatched: true } });
    pendingPost.resolve(json(h.receipt(), 201));
    await Promise.resolve();
    expect(h.posts()).toHaveLength(1);
  });

  it("bounds a stalled POST without retrying", async () => {
    vi.useFakeTimers();
    const h = setup("connected", {}, 25);
    const snapshot = await h.ready();
    h.state.post = () => new Promise<Response>(() => {});
    const result = h.client.expressInterest(PROJECT, { scope: snapshot.scope });
    await vi.waitFor(() => expect(h.posts()).toHaveLength(1), { interval: 1 });
    await vi.advanceTimersByTimeAsync(30);
    expect(await result).toMatchObject({ kind: "unknown", error: { kind: "timeout" } });
    expect(h.posts()).toHaveLength(1);
  });

  it("keeps an empty reconciliation unknown and permits only an acknowledged new attempt", async () => {
    const h = setup();
    h.state.post = () => { throw new TypeError("Synthetic lost response"); };
    const snapshot = await h.ready();
    expect((await h.client.expressInterest(PROJECT, { scope: snapshot.scope })).kind).toBe("unknown");
    expect(take(await h.client.readMyEngagements({ scope: snapshot.scope })).engagements).toEqual([]);
    expect((await h.client.expressInterest(PROJECT, { scope: snapshot.scope })).kind).toBe("unknown");
    expect(h.posts()).toHaveLength(1);
    h.state.post = null;
    expect((await h.client.expressInterest(PROJECT, {
      scope: snapshot.scope, acknowledgeUnknownOutcome: true,
    })).kind).toBe("created");
    expect(h.posts()).toHaveLength(2);
  });

  it("reconciles a lost response through an existing row without a second POST", async () => {
    const h = setup();
    h.state.post = () => {
      h.state.rows = [h.receipt()];
      throw new TypeError("Synthetic response lost after the mock write");
    };
    const snapshot = await h.ready();
    expect((await h.client.expressInterest(PROJECT, { scope: snapshot.scope })).kind).toBe("unknown");
    expect(take(await h.client.readMyEngagements({ scope: snapshot.scope })).engagements).toHaveLength(1);
    expect(await h.client.expressInterest(PROJECT, { scope: snapshot.scope })).toMatchObject({
      kind: "existing", receipt: { dispatched: false },
    });
    expect(h.posts()).toHaveLength(1);
  });

  it.each([
    { is_binding: true }, { project_id: OTHER_PROJECT },
    { investor_id: IDS.operatorUserId }, { funding_need_id: IDS.fundingNeedId },
    { state: "funded" }, { funding_need_id: undefined },
  ])("does not turn a mismatched success receipt into confirmation %o", async (change) => {
    const h = setup();
    h.state.post = () => json(h.receipt(change), 201);
    const snapshot = await h.ready();
    expect((await h.client.expressInterest(PROJECT, { scope: snapshot.scope })).kind).toBe("unknown");
    expect(h.posts()).toHaveLength(1);
  });

  it.each([200, 409, 500, 503])("keeps unexpected or unconfirmed HTTP %i outcomes unknown", async (status) => {
    const h = setup();
    h.state.post = () => json({ code: "unexpected" }, status);
    const snapshot = await h.ready();
    expect((await h.client.expressInterest(PROJECT, { scope: snapshot.scope })).kind).toBe("unknown");
    expect(h.posts()).toHaveLength(1);
  });

  it("does not attribute a success to another identity after the response", async () => {
    const h = setup();
    h.state.post = () => {
      const payload = h.receipt();
      h.state.identity = syntheticIdentity("investor", { user_id: IDS.operatorUserId });
      return json(payload, 201);
    };
    const snapshot = await h.ready();
    const result: InterestResult = await h.client.expressInterest(PROJECT, { scope: snapshot.scope });
    expect(result.kind).toBe("unknown");
    expect(await h.client.readMyEngagements({ scope: snapshot.scope })).toMatchObject({
      ok: false, error: { kind: "stale" },
    });
    expect(h.posts()).toHaveLength(1);
  });
});

describe("explicit source mode and engagement meanings", () => {
  it("rejects known seeded users in connected mode before any portfolio read", async () => {
    const h = setup();
    h.state.identity = syntheticIdentity("investor", { user_id: DEMO_IDENTITY_IDS.userIds[2] });
    expect(await h.client.readSnapshot()).toMatchObject({
      ok: false, error: { code: "synthetic_identity" },
    });
    expect(h.calls.map((call) => call.path)).toEqual(["/api/me"]);
  });

  it("rejects the seeded investor profile even on another user ID in connected mode", async () => {
    const h = setup();
    h.state.identity = syntheticIdentity("investor", {
      user_id: IDS.investorUserId,
      investor: { id: DEMO_IDENTITY_IDS.investorIds[0], organization_name: "Fictional", onboarding_completed_at: TIME },
    });
    expect(await h.client.readSnapshot()).toMatchObject({ ok: false, error: { code: "synthetic_identity" } });
    expect(h.posts()).toEqual([]);
  });

  it("uses the same adapter for admitted mock-backed server-demo without calling demo-switch itself", async () => {
    const h = setup("server-demo");
    h.state.identity = syntheticIdentity("investor", {
      user_id: DEMO_IDENTITY_IDS.userIds[2],
      investor: { id: DEMO_IDENTITY_IDS.investorIds[0], organization_name: "Fictional", onboarding_completed_at: TIME },
    });
    const snapshot = await h.ready();
    expect(snapshot.provenance).toMatchObject({ mode: "server-demo", store: "mock-configured", deployedRevision: null });
    expect(await h.client.expressInterest(PROJECT, { scope: snapshot.scope })).toMatchObject({
      kind: "created", receipt: { mode: "server-demo" },
    });
    expect(h.calls.some((call) => call.path.includes("/auth/"))).toBe(false);
  });

  it("rejects a mixed mode/store rather than choosing another mode", () => {
    const configuration = resolveLiveReadConfiguration({
      dataMode: "server-demo", store: "mock", demoAuth: "enabled", sessionSecretConfigured: true,
    });
    expect(createWorkspaceClient({ ...configuration, source: "database-configured" }, {
      origin: "https://sunsum.invalid",
    })).toMatchObject({ ok: false, error: { code: "configuration_not_admitted" } });
  });

  it("fences a filter refresh if the actor changes before the filtered read", async () => {
    const h = setup();
    const snapshot = await h.ready();
    const before = h.calls.length;
    h.state.identity = syntheticIdentity("operator");
    expect(await h.client.readSnapshot({ scope: snapshot.scope, query: { stages: ["development"] } }))
      .toMatchObject({ ok: false, error: { kind: "stale" } });
    expect(h.calls.slice(before).map((call) => call.path)).toEqual(["/api/me"]);
  });

  it("keeps the newest project-level duplicate and the latest project-wide room row distinct", () => {
    const entry: ReadEngagement = {
      id: IDS.engagementId, projectId: PROJECT, investorId: IDS.investorId, fundingNeedId: null,
      state: "interested", stateChangedAt: NOW, isBinding: false, createdAt: TIME,
      projectName: "Synthetic", projectStage: "pre_development", journeyStageId: "pre-development",
    };
    const later: ReadEngagement = {
      ...entry, id: IDS.activityId, fundingNeedId: IDS.fundingNeedId,
      state: "withdrawn", stateChangedAt: TIME,
    };
    expect(currentProjectInterest([entry, later], PROJECT)).toBe(entry);
    expect(eligibleDealRoomProjects([entry, later]).has(PROJECT)).toBe(false);
    expect(currentProjectInterest([entry, { ...later, fundingNeedId: null }], PROJECT)).toBeNull();
  });
});
