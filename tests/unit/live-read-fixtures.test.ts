// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createWorkspaceClient, formatReadExport,
  type LiveReadConfiguration, type LiveRole, type ReadResult,
} from "@/features/live-read";
import {
  createSyntheticLiveReadFixtures, SYNTHETIC_LIVE_READ_IDS as IDS,
  SYNTHETIC_LIVE_READ_PDF, SYNTHETIC_SAVE_CANARIES,
  installSyntheticBrowserAudit, installSyntheticSaveAudit, readSyntheticSaveAudit,
  syntheticLocalOrigin, syntheticTrafficViolation,
  type SyntheticAuditPage, type SyntheticBrowserRequest, type SyntheticBrowserRoute,
  type SyntheticLiveReadFixtureOptions, type SyntheticLiveReadResponse, type SyntheticStorageAttempt,
  type SyntheticInterestRefusal, type SyntheticInterestScenario,
} from "../fixtures/live-read-contracts";

afterEach(() => vi.unstubAllGlobals());

const configuration: LiveReadConfiguration = {
  mode: "connected",
  canAttemptReads: true,
  canAttemptInterest: true,
  canAttemptExports: true,
  canAttemptDocumentDownloads: true,
  apiBasePath: "/api",
  source: "database-configured",
  reason: "SYNTHETIC unit-test admission only; no real session or service.",
};

function take<T>(result: ReadResult<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.data;
}

function setup(role: LiveRole, options: SyntheticLiveReadFixtureOptions = {}) {
  const fixtures = createSyntheticLiveReadFixtures(role, options);
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (init?.body !== undefined && typeof init.body !== "string") {
      throw new Error("Synthetic contracts only admit a literal JSON command body.");
    }
    const reply = fixtures.responseFor(url, init?.method, init?.body);
    return new Response(reply.body, {
      status: reply.status,
      headers: { ...reply.headers, "content-type": reply.contentType },
    });
  });
  return {
    fixtures,
    fetcher,
    client: take(createWorkspaceClient(configuration, { origin: "https://synthetic.invalid", fetch: fetcher })),
  };
}

describe("shared SYNTHETIC WS2 wire contracts", () => {
  it.each(["site-owner", "operator", "investor"] as const)(
    "drives the exact %s snapshot, details and export through the public adapter",
    async (role) => {
      const { client, fetcher, fixtures } = setup(role);
      const snapshot = take(await client.readSnapshot());
      expect(snapshot.role).toBe(role);
      expect(snapshot.completeness).toBe("complete");
      expect(snapshot.records).toHaveLength(role === "investor" ? 1 : 2);
      expect(fixtures.classification).toBe("SYNTHETIC_TEST_ONLY");
      const linked = snapshot.records.find((record) => record.projectId === IDS.projectId);
      if (!linked) throw new Error("Missing linked synthetic project");
      const details = take(await client.readDetail(linked.detail, { scope: snapshot.scope }));
      expect(details.role).toBe(role);
      expect(details.record.projectStage).toBe("pre_development");
      expect(details.record.journeyStageId).toBe("pre-development");
      expect(details.assessments.current).toMatchObject({
        id: IDS.overrideId, estimatedSystemSizeKw: { low: 14, high: 20, unit: "kW" },
      });
      if (role !== "investor") {
        const pending = snapshot.records.find((record) => record.siteId === IDS.unconvertedSiteId);
        if (!pending) throw new Error("Missing unconverted synthetic site");
        expect(pending.projectId).toBeNull();
        expect(take(await client.readDetail(pending.detail, { scope: snapshot.scope })).record.projectId).toBeNull();
      } else {
        expect(JSON.stringify(details)).not.toContain("Synthetic private address");
        expect(details.documents[0]?.download).toBeNull();
      }
      const manifest = take(await client.readExport({ scope: snapshot.scope }));
      expect(manifest.projects).toHaveLength(snapshot.records.length);
      expect(manifest.documents).toHaveLength(1);
      expect(manifest.reportedProjectCount).toBe(manifest.projects.length);
      expect(manifest.reportedDocumentCount).toBe(manifest.documents.length);
      expect(JSON.parse(await formatReadExport(manifest, "json").blob.text()).role).toBe(role);
      expect(fetcher.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
    },
  );

  it.each(["site-owner", "operator"] as const)("keeps the default %s PDF site-parented in private metadata and export", (role) => {
    const fixtures = createSyntheticLiveReadFixtures(role);
    const expectedDocument = expect.objectContaining({
      id: IDS.documentId, site_id: IDS.siteId, project_id: null,
    });
    const metadataPath = role === "site-owner" ? "/api/me/sites" : `/api/submissions/${IDS.siteId}`;
    const metadata: unknown = JSON.parse(fixtures.responseFor(metadataPath).body);
    if (role === "site-owner") {
      expect(metadata).toEqual(expect.arrayContaining([
        expect.objectContaining({
          site: expect.objectContaining({ id: IDS.siteId }),
          documents: [expectedDocument],
        }),
      ]));
    } else {
      expect(metadata).toMatchObject({ documents: [expectedDocument] });
    }
    // Assert this site-parented row, not a single-parent rule for export fallback rows.
    const manifest: unknown = JSON.parse(fixtures.responseFor("/api/export?format=json").body);
    expect(manifest).toMatchObject({ documents: [expectedDocument] });
  });

  it.each(["site-owner", "operator"] as const)("serves synthetic PDF bytes only to %s fixture routes", async (role) => {
    const { client, fixtures } = setup(role);
    const snapshot = take(await client.readSnapshot());
    const record = snapshot.records.find((entry) => entry.projectId === IDS.projectId);
    if (!record) throw new Error("Missing synthetic project");
    const details = take(await client.readDetail(record.detail, { scope: snapshot.scope }));
    const reference = details.documents[0]?.download;
    if (!reference) throw new Error("Missing synthetic original-byte reference");
    const download = take(await client.readDocument(reference, { scope: snapshot.scope }));
    expect(await download.blob.text()).toBe(SYNTHETIC_LIVE_READ_PDF);
    expect(download.sizeBytes).toBe(new TextEncoder().encode(SYNTHETIC_LIVE_READ_PDF).length);
    expect(fixtures.responseFor(`/api/sites/${IDS.siteId}/documents/${IDS.documentId}/content`).headers).not.toHaveProperty("set-cookie");
  });

  it("can represent missing original content without changing metadata or issuing a session", async () => {
    const { client } = setup("site-owner", { documentBytesAvailable: false });
    const snapshot = take(await client.readSnapshot());
    const details = take(await client.readDetail({ kind: "owner-site", siteId: IDS.siteId }, { scope: snapshot.scope }));
    const reference = details.documents[0]?.download;
    if (!reference) throw new Error("Missing metadata reference");
    expect(await client.readDocument(reference, { scope: snapshot.scope })).toMatchObject({
      ok: false, error: { kind: "missing", status: 404 },
    });
  });

  it("keeps an unengaged investor at tier zero without interest or original-byte routes", async () => {
    const { client, fetcher, fixtures } = setup("investor", { investorEngaged: false });
    const snapshot = take(await client.readSnapshot());
    expect(snapshot.records[0]?.engagementState).toBeNull();
    const manifest = take(await client.readExport({ scope: snapshot.scope }));
    expect(manifest.documents).toEqual([]);
    expect(manifest.reportedDocumentCount).toBe(0);
    expect(await client.readDetail({ kind: "deal-room", projectId: IDS.projectId }, { scope: snapshot.scope })).toMatchObject({
      ok: false, error: { kind: "denied", code: "forbidden_tier" },
    });
    expect(fetcher.mock.calls.some(([input]) => String(input).includes("deal-room"))).toBe(false);
    expect(fixtures.responseFor(`/api/projects/${IDS.projectId}/deal-room`).status).toBe(403);
    expect(fixtures.responseFor(`/api/sites/${IDS.siteId}/documents/${IDS.documentId}/content`).status).toBe(403);
  });

  it("applies the admitted operator and investor query vocabulary coherently", async () => {
    const operator = setup("operator");
    const queued = take(await operator.client.readSnapshot({ query: { statuses: ["submitted"], siteType: "land", location: "unconverted" } }));
    expect(queued.records).toHaveLength(1);
    expect(queued.records[0]?.siteId).toBe(IDS.unconvertedSiteId);
    const projects = take(await operator.client.readSnapshot({ query: { statuses: ["accepted"] } }));
    expect(projects.records).toHaveLength(1);
    expect(projects.records[0]?.projectId).toBe(IDS.projectId);
    const investor = setup("investor");
    const included = take(await investor.client.readSnapshot({ query: { mandateMatch: true, projectType: "synthetic_project_type" } }));
    expect(included.records).toHaveLength(1);
    expect(included.summary.mandateMatch).toBe(true);
    const excluded = take(await investor.client.readSnapshot({ query: { stages: ["operations"] } }));
    expect(excluded.records).toEqual([]);
    expect(excluded.summary.projectCount).toBe(0);
  });

  it("uses exact repeated investor stages with viability, project_type and explicit mandate_match", async () => {
    const { client, fetcher } = setup("investor", { collectionScenario: "page-two" });
    const query = {
      stages: ["pre_development", "operations"], viability: "potentially_viable",
      projectType: "synthetic_project_type", mandateMatch: false,
    } as const;
    const wider = take(await client.readSnapshot({ query }));
    const matched = take(await client.readSnapshot({ query: { ...query, mandateMatch: true } }));
    expect(wider.records).toHaveLength(64);
    expect(matched.records).toHaveLength(63);
    expect(matched.records.every((record) => record.projectStage === "pre_development")).toBe(true);
    const requests = fetcher.mock.calls.map(([input]) => new URL(String(input)))
      .filter((url) => url.pathname === "/api/portfolio");
    expect(requests).toHaveLength(2);
    for (const [index, url] of requests.entries()) {
      expect([...url.searchParams.entries()].sort(([left], [right]) => left.localeCompare(right))).toEqual([
        ["mandate_match", index === 0 ? "false" : "true"], ["project_type", "synthetic_project_type"],
        ["stage", "pre_development"], ["stage", "operations"],
        ["viability", "potentially_viable"],
      ]);
      expect(url.searchParams.has("site_type")).toBe(false);
      expect(url.searchParams.has("page")).toBe(false);
    }
  });

  it("sends one exact repeated-status query to pipeline and submissions, searching raw address rather than display name", async () => {
    const { client, fetcher } = setup("operator");
    const snapshot = take(await client.readSnapshot({ query: {
      statuses: ["submitted", "accepted"], siteType: "rooftop",
      viability: "potentially_viable", location: "Synthetic private address / Synthetic project",
    } }));
    expect(snapshot.records).toHaveLength(1);
    expect(snapshot.records[0]?.projectId).toBe(IDS.projectId);
    const requests = fetcher.mock.calls.map(([input]) => new URL(String(input)))
      .filter((url) => ["/api/pipeline", "/api/submissions"].includes(url.pathname));
    expect(requests).toHaveLength(2);
    expect(requests[0]?.search).toBe(requests[1]?.search);
    for (const url of requests) {
      expect(url.searchParams.getAll("status")).toEqual(["submitted", "accepted"]);
      expect(url.searchParams.get("type")).toBe("rooftop");
      expect(url.searchParams.get("viability")).toBe("potentially_viable");
      expect(url.searchParams.get("location")).toBe("Synthetic private address / Synthetic project");
      expect([...new Set(url.searchParams.keys())].sort()).toEqual(["location", "status", "type", "viability"]);
      expect(url.href).not.toContain(" ");
    }
  });

  it("returns explicit errors rather than falling through to an API or accepting auth/writes", () => {
    const fixtures = createSyntheticLiveReadFixtures("operator");
    expect(fixtures.responseFor("/api/notifications").status).toBe(404);
    expect(fixtures.responseFor(`/api/projects/${IDS.projectId}`).status).toBe(404);
    expect(fixtures.responseFor("/api/auth/demo-switch", "POST").status).toBe(405);
    expect(fixtures.responseFor("/api/submissions", "PATCH").status).toBe(405);
    expect(fixtures.responseFor("/api/me/sites").status).toBe(403);
    expect(fixtures.responseFor("/api/export?format=csv").status).toBe(400);
    expect(fixtures.responseFor("/api/pipeline?made_up=true").status).toBe(400);
    expect(fixtures.responseFor("/api/pipeline?status=made_up").status).toBe(400);
    expect(fixtures.responseFor("/api/me?role=investor").status).toBe(400);
    expect(fixtures.responseFor("/api/me#fragment").status).toBe(400);
    for (const response of Object.values(fixtures.responses)) {
      expect(response.headers["x-sunsum-fixture"]).toBe("SYNTHETIC_TEST_ONLY");
      expect(response.headers).not.toHaveProperty("set-cookie");
    }
  });

  it("keeps fixture instances and role identities independent", () => {
    const owner = createSyntheticLiveReadFixtures("site-owner");
    const operator = createSyntheticLiveReadFixtures("operator");
    const investor = createSyntheticLiveReadFixtures("investor");
    expect(JSON.parse(owner.responseFor("/api/me").body).user_id).toBe(IDS.ownerUserId);
    expect(JSON.parse(operator.responseFor("/api/me").body).user_id).toBe(IDS.operatorUserId);
    expect(JSON.parse(investor.responseFor("/api/me").body).user_id).toBe(IDS.investorUserId);
    expect(owner.responses).not.toBe(createSyntheticLiveReadFixtures("site-owner").responses);
    expect(Object.isFrozen(owner.responses)).toBe(true);
    expect(Object.isFrozen(owner.responseFor("/api/me"))).toBe(true);
  });

  it("contains a minimal valid ASCII PDF with coherent byte offsets, not a real document", () => {
    expect(SYNTHETIC_LIVE_READ_PDF).toContain("(SYNTHETIC TEST ONLY)");
    const start = /startxref\n(\d+)\n%%EOF/.exec(SYNTHETIC_LIVE_READ_PDF)?.[1];
    expect(start).toBeDefined();
    expect(SYNTHETIC_LIVE_READ_PDF.slice(Number(start))).toMatch(/^xref\n/);
    const offsets = [...SYNTHETIC_LIVE_READ_PDF.matchAll(/^(\d{10}) 00000 n /gm)];
    expect(offsets).toHaveLength(5);
    offsets.forEach((match, index) => {
      expect(SYNTHETIC_LIVE_READ_PDF.slice(Number(match[1]))).toMatch(new RegExp(`^${index + 1} 0 obj\\n`));
    });
  });

  describe("TEST-1 synthetic request allowlists and independent browser audit", () => {
    const origin = "http://127.0.0.1:3117";
    const interest: SyntheticInterestScenario = { investorId: IDS.investorId, projectId: IDS.projectId };
    const interestPath = `/api/projects/${IDS.projectId}/engagements`;

    it("keeps the default fixture GET-only and requires a named actor/project plus deliberate arming", () => {
      for (const role of ["site-owner", "operator", "investor"] as const) {
        expect(createSyntheticLiveReadFixtures(role).requestViolation(interestPath, "POST", "{}")).toBe("non-get");
      }
      expect(() => createSyntheticLiveReadFixtures("operator", { interest })).toThrow(/synthetic investor/);
      expect(() => createSyntheticLiveReadFixtures("investor", {
        interest: { ...interest, investorId: IDS.ownerUserId },
      })).toThrow(/synthetic investor/);
      expect(() => createSyntheticLiveReadFixtures("investor", {
        interest: { ...interest, projectId: IDS.unconvertedSiteId },
      })).toThrow(/loaded synthetic project/);
      const fixtures = createSyntheticLiveReadFixtures("investor", { origin, investorEngaged: false, interest });
      expect(fixtures.requestViolation(interestPath, "POST", "{}")).toBe("interest-not-armed");
      expect(() => fixtures.armInterest(IDS.unconvertedSiteId)).toThrow(/chosen synthetic project/);
      fixtures.armInterest(IDS.projectId);
      expect(fixtures.requestViolation(interestPath, "POST", "{}")).toBeNull();
      expect(fixtures.requestViolation(interestPath, "GET")).toBe("role-endpoint");
      expect(fixtures.requestViolation(interestPath, "DELETE", "{}")).toBe("non-get");
      expect(fixtures.requestViolation("/api/auth/demo-switch", "POST", '{"role":"investor"}')).toBe("non-get");
      expect(fixtures.requestViolation(`/api/projects/${IDS.unconvertedSiteId}/engagements`, "POST", "{}")).toBe("non-get");
      expect(fixtures.requestViolation(`${interestPath}?scope=project`, "POST", "{}")).toBe("invalid-query");
      expect(fixtures.requestViolation(`https://outside.invalid${interestPath}`, "POST", "{}")).toBe("foreign-origin");
      for (const body of [undefined, null, "", "null", "[]", '{"funding_need_id":null}', '{"state":"funded"}', '{"a":1}', "\u00a0{}\u00a0", `${" ".repeat(33)}{}`]) {
        expect(fixtures.requestViolation(interestPath, "POST", body)).toBe("invalid-body");
      }
      const incomplete = createSyntheticLiveReadFixtures("investor", { interest, investorOnboarded: false });
      incomplete.armInterest(IDS.projectId);
      expect(incomplete.requestViolation(interestPath, "POST", "{}")).toBe("role-endpoint");
      expect(incomplete.responseFor("/api/investors/me/profile").status).toBe(200);
      expect(JSON.parse(incomplete.responseFor("/api/investors/me/profile").body)).toMatchObject({ onboarding_completed_at: null });
      expect(incomplete.responseFor("/api/me/engagements").status).toBe(403);
    });

    it("observes the explicit command body independently and cannot override an unarmed or expanded write into success", async () => {
      const observers: ((request: SyntheticBrowserRequest) => void)[] = [];
      const handlers: ((route: SyntheticBrowserRoute) => Promise<void>)[] = [];
      const page: SyntheticAuditPage = {
        on() {},
        context: () => ({
          on(_event, listener) { observers.push(listener); },
          async exposeBinding() {},
          async addInitScript() {},
          async route(_pattern, handler) { handlers.push(handler); },
        }),
        async evaluate() { return { attempts: [], canaries: SYNTHETIC_SAVE_CANARIES }; },
      };
      const audit = await installSyntheticBrowserAudit(page, origin);
      const fixtures = createSyntheticLiveReadFixtures("investor", { investorEngaged: false, interest });
      const override = vi.fn((_path: string, response: SyntheticLiveReadResponse) => response);
      audit.useFixtures(fixtures, override);
      const onRequest = observers[0];
      const handle = handlers[0];
      if (!onRequest || !handle) throw new Error("Both independent audit paths are required.");
      const request = (body: string): SyntheticBrowserRequest => ({
        url: () => `${origin}${interestPath}`, method: () => "POST",
        resourceType: () => "fetch", headers: () => ({ "content-type": "application/json" }),
        postData: () => body,
      });
      const abort = vi.fn(async () => {});
      const fulfill = vi.fn(async () => {});
      const dispatch = async (body: string) => {
        const command = request(body);
        onRequest(command);
        await handle({ request: () => command, abort, fulfill, continue: async () => { throw new Error("API passthrough"); } });
      };
      await dispatch("{}");
      audit.armInterest(IDS.projectId);
      await dispatch('{"funding_need_id":null}');
      expect(abort).toHaveBeenCalledTimes(2);
      expect(override).not.toHaveBeenCalled();
      expect(fulfill).not.toHaveBeenCalled();
      await dispatch("{}");
      expect(fulfill).toHaveBeenCalledWith(expect.objectContaining({ status: 201 }));
      expect(override).toHaveBeenCalledTimes(1);
      expect(audit.calls.map(({ method, postData, violation }) => ({ method, postData, violation }))).toEqual([
        { method: "POST", postData: "{}", violation: "interest-not-armed" },
        { method: "POST", postData: '{"funding_need_id":null}', violation: "invalid-body" },
        { method: "POST", postData: "{}", violation: null },
      ]);
      expect(audit.unexpected).toHaveLength(2);
      expect(JSON.parse(fixtures.responseFor("/api/me/engagements").body)).toHaveLength(1);
    });

    it("pins the exact local origin and rejects wrong roles, paths, methods and queries", () => {
      const fixtures = createSyntheticLiveReadFixtures("investor", { origin });
      expect(syntheticLocalOrigin(origin)).toBe(origin);
      expect(() => syntheticLocalOrigin("https://outside.invalid")).toThrow();
      expect(fixtures.requestViolation(`${origin}/api/me`)).toBeNull();
      expect(fixtures.requestViolation("https://outside.invalid/api/me")).toBe("foreign-origin");
      expect(fixtures.responseFor("https://outside.invalid/api/me").status).toBe(403);
      expect(fixtures.requestViolation("http://localhost:3117/api/me")).toBe("foreign-origin");
      expect(fixtures.requestViolation(`${origin}/api/pipeline`)).toBe("role-endpoint");
      expect(fixtures.requestViolation(`${origin}/api/submissions/${IDS.siteId}`)).toBe("role-endpoint");
      expect(fixtures.requestViolation(`${origin}/api/notifications`)).toBe("unknown-endpoint");
      expect(fixtures.requestViolation(`${origin}/api/me`, "POST")).toBe("non-get");
      expect(fixtures.requestViolation(`${origin}/api/portfolio?mandate_match=true&mandate_match=false`)).toBe("invalid-query");
      expect(fixtures.requestViolation(`${origin}/api/portfolio?stage=operations&stage=operations`)).toBe("invalid-query");
      expect(fixtures.requestViolation(`${origin}/api/portfolio?status=accepted`)).toBe("invalid-query");
      expect(fixtures.requestViolation(`${origin}/api/portfolio?stage=operations&mandate_match=false`)).toBeNull();
      expect(fixtures.requestViolation(`${origin}/api/export?format=json&extra=true`)).toBe("invalid-query");
      expect(fixtures.requestViolation(`${origin}/api/projects/${IDS.projectId}/funding-needs?extra=true`)).toBe("invalid-query");
    });

    describe("explicit local interest state and authoritative GET reconciliation", () => {
      const interest: SyntheticInterestScenario = { investorId: IDS.investorId, projectId: IDS.projectId };
      const path = `/api/projects/${IDS.projectId}/engagements`;
      const room = `/api/projects/${IDS.projectId}/deal-room`;

      it("changes only the named synthetic project's project-level state after a 201, shared across origin adapters", () => {
        const fixtures = createSyntheticLiveReadFixtures("investor", {
          investorEngaged: false, collectionScenario: "page-two", interest,
        });
        const local = fixtures.atOrigin("http://127.0.0.1:3117");
        expect(JSON.parse(local.responseFor("/api/me/engagements").body)).toEqual([]);
        expect(local.responseFor(room).status).toBe(403);
        local.armInterest(IDS.projectId);
        expect(JSON.parse(local.responseFor("/api/me/engagements").body)).toEqual([]);
        const created = local.responseFor(path, "POST", "{}");
        expect(created.status).toBe(201);
        const receipt: unknown = JSON.parse(created.body);
        expect(receipt).toEqual({
          id: expect.any(String), investor_id: IDS.investorId, project_id: IDS.projectId,
          funding_need_id: null, state: "interested", is_binding: false,
          state_changed_at: expect.any(String), created_at: expect.any(String),
        });
        expect(JSON.parse(fixtures.responseFor("/api/me/engagements").body)).toEqual([
          expect.objectContaining({
            investor_id: IDS.investorId, project_id: IDS.projectId,
            funding_need_id: null, state: "interested", is_binding: false, project_name: "Synthetic project",
          }),
        ]);
        expect(fixtures.responseFor(room).status).toBe(200);
        const other = fixtures.records.find((record) => record.id !== IDS.projectId);
        if (!other) throw new Error("The scoped scenario needs another synthetic project.");
        expect(fixtures.responseFor(`/api/projects/${other.id}/deal-room`).status).toBe(403);
        expect(local.responseFor(path, "POST", "{}").status).toBe(409);
        expect(JSON.parse(fixtures.responseFor("/api/me/engagements").body)).toHaveLength(1);
        expect(createSyntheticLiveReadFixtures("investor", { investorEngaged: false }).responseFor(room).status).toBe(403);
        local.disarmInterest();
        expect(fixtures.requestViolation(path, "POST", "{}")).toBe("interest-not-armed");
      });

      it("drives the narrow public client command with a backend-shaped receipt and independent GET provenance", async () => {
        const { client, fixtures, fetcher } = setup("investor", { investorEngaged: false, interest });
        const snapshot = take(await client.readSnapshot());
        fixtures.armInterest(IDS.projectId);
        const result = await client.expressInterest(IDS.projectId, { scope: snapshot.scope });
        expect(result).toMatchObject({
          kind: "created",
          receipt: { method: "POST", path, dispatched: true, projectId: IDS.projectId, investorId: IDS.investorId },
          engagement: { fundingNeedId: null, state: "interested", isBinding: false },
        });
        const current = take(await client.readMyEngagements({ scope: snapshot.scope }));
        expect(current.engagements).toEqual([
          expect.objectContaining({ projectId: IDS.projectId, fundingNeedId: null, state: "interested", isBinding: false }),
        ]);
        expect(current.provenance.operations.length).toBeGreaterThan(0);
        expect(current.provenance.operations.every((operation) => operation.method === "GET")).toBe(true);
        const commands = fetcher.mock.calls.filter(([, init]) => init?.method !== "GET");
        expect(commands).toHaveLength(1);
        expect(commands[0]?.[1]).toMatchObject({ method: "POST", body: "{}" });
        const headers = new Headers(commands[0]?.[1]?.headers);
        expect(headers.get("content-type")).toBe("application/json");
        expect(headers.has("idempotency-key")).toBe(false);
      });

      it("keeps funding-need eligibility separate from project-level duplicate semantics and service-emitted order", () => {
        const fundingOnly = createSyntheticLiveReadFixtures("investor", {
          interest, engagements: [{ scope: "funding-need", state: "funded", isBinding: true }],
        });
        expect(fundingOnly.responseFor(room).status).toBe(200);
        fundingOnly.armInterest(IDS.projectId);
        expect(fundingOnly.responseFor(path, "POST", "{}").status).toBe(201);
        expect(JSON.parse(fundingOnly.responseFor("/api/me/engagements").body)).toEqual([
          expect.objectContaining({ funding_need_id: IDS.fundingNeedId, state: "funded", is_binding: true }),
          expect.objectContaining({ funding_need_id: null, state: "interested", is_binding: false }),
        ]);
        const mixed = createSyntheticLiveReadFixtures("investor", {
          interest, engagements: [
            { scope: "project", state: "funded", isBinding: true, changedAt: "2026-09-23T00:00:00Z" },
            { scope: "funding-need", state: "withdrawn", changedAt: "2026-09-20T00:00:00Z" },
          ],
        });
        expect(mixed.responseFor(room).status).toBe(403);
        mixed.armInterest(IDS.projectId);
        expect(mixed.responseFor(path, "POST", "{}").status).toBe(409);
        expect(JSON.parse(mixed.responseFor("/api/me/engagements").body)).toHaveLength(2);
        expect(mixed.responseFor(room).status).toBe(403);
      });

      it("represents a concurrent 409 as an existing binding engagement, not another creation", () => {
        const fixtures = createSyntheticLiveReadFixtures("investor", {
          investorEngaged: false, interest: { ...interest, outcome: { kind: "conflict", state: "committed" } },
        });
        fixtures.armInterest(IDS.projectId);
        expect(fixtures.responseFor(path, "POST", "{}")).toMatchObject({ status: 409 });
        expect(JSON.parse(fixtures.responseFor("/api/me/engagements").body)).toEqual([
          expect.objectContaining({ state: "committed", is_binding: true, funding_need_id: null }),
        ]);
      });

      it.each([
        ["unauthenticated", 401], ["forbidden_role", 403], ["forbidden_tier", 403],
        ["forbidden_origin", 403], ["not_found", 404], ["invalid_body", 400],
      ] satisfies readonly (readonly [SyntheticInterestRefusal, number])[])("keeps %s refusal distinct and does not create fixture state", (code, status) => {
        const fixtures = createSyntheticLiveReadFixtures("investor", {
          investorEngaged: false, interest: { ...interest, outcome: { kind: "refused", code } },
        });
        fixtures.armInterest(IDS.projectId);
        const response = fixtures.responseFor(path, "POST", "{}");
        expect(response.status).toBe(status);
        expect(JSON.parse(response.body)).toMatchObject({ code });
        expect(JSON.parse(fixtures.responseFor("/api/me/engagements").body)).toEqual([]);
        expect(fixtures.responseFor(room).status).toBe(403);
      });

      it.each([true, false])("can lose a response with recorded=%s; only subsequent scoped GETs describe current state", (recorded) => {
        const fixtures = createSyntheticLiveReadFixtures("investor", {
          investorEngaged: false, interest: { ...interest, outcome: { kind: "unknown", recorded } },
        });
        fixtures.armInterest(IDS.projectId);
        expect(fixtures.responseFor(path, "POST", "{}").status).toBe(503);
        const read = fixtures.responseFor("/api/me/engagements");
        expect(JSON.parse(read.body)).toHaveLength(recorded ? 1 : 0);
        expect(fixtures.responseFor(room).status).toBe(recorded ? 200 : 403);
        expect(fixtures.responseFor("/api/me/engagements").body).toBe(read.body);
      });
    });

    it.each([
      { url: "https://outside.invalid/api/me", method: "GET", resourceType: "fetch", reason: "foreign-origin" },
      { url: `${origin}/api/pipeline`, method: "GET", resourceType: "fetch", reason: "role-endpoint" },
      { url: `${origin}/api/notifications`, method: "GET", resourceType: "xhr", reason: "unknown-endpoint" },
      { url: `${origin}/not-an-api-route`, method: "POST", resourceType: "fetch", reason: "non-get" },
      { url: `${origin}/private-proxy`, method: "GET", resourceType: "xhr", reason: "non-api-data-read" },
    ])("records $reason independently of interception and refuses a success override", async (input) => {
      const observers: ((request: SyntheticBrowserRequest) => void)[] = [];
      const handlers: ((route: SyntheticBrowserRoute) => Promise<void>)[] = [];
      const page: SyntheticAuditPage = {
        on() {},
        context: () => ({
          on(_event, listener) { observers.push(listener); },
          async exposeBinding() {},
          async addInitScript() {},
          async route(_pattern, handler) { handlers.push(handler); },
        }),
        async evaluate() { return { attempts: [], canaries: SYNTHETIC_SAVE_CANARIES }; },
      };
      const fixtures = createSyntheticLiveReadFixtures("investor", { origin });
      const audit = await installSyntheticBrowserAudit(page, origin);
      const override = vi.fn((_path: string, response: SyntheticLiveReadResponse) => ({ ...response, status: 200 }));
      audit.useFixtures(fixtures, override);
      const request: SyntheticBrowserRequest = {
        url: () => input.url, method: () => input.method,
        resourceType: () => input.resourceType, headers: () => ({}),
      };
      const onRequest = observers[0];
      const routeHandler = handlers[0];
      if (!onRequest || !routeHandler) throw new Error("The independent request observer and interceptor must both be installed.");
      // Observation must work even if an added route were to fulfill the request itself.
      onRequest(request);
      expect(audit.unexpected).toEqual([expect.objectContaining({
        url: input.url, method: input.method, violation: input.reason,
      })]);
      const abort = vi.fn(async () => {});
      const fulfill = vi.fn(async () => {});
      const continueRequest = vi.fn(async () => {});
      await routeHandler({ request: () => request, abort, fulfill, continue: continueRequest });
      expect(abort).toHaveBeenCalledWith("blockedbyclient");
      expect(fulfill).not.toHaveBeenCalled();
      expect(continueRequest).not.toHaveBeenCalled();
      expect(override).not.toHaveBeenCalled();
      expect(audit.calls[0]?.url).toBe(input.url);
    });

    it("admits intentional error/network overrides only after a permitted request passes policy", async () => {
      const observers: ((request: SyntheticBrowserRequest) => void)[] = [];
      const handlers: ((route: SyntheticBrowserRoute) => Promise<void>)[] = [];
      const page: SyntheticAuditPage = {
        on() {},
        context: () => ({
          on(_event, listener) { observers.push(listener); },
          async exposeBinding() {},
          async addInitScript() {},
          async route(_pattern, handler) { handlers.push(handler); },
        }),
        async evaluate() { return { attempts: [], canaries: SYNTHETIC_SAVE_CANARIES }; },
      };
      const audit = await installSyntheticBrowserAudit(page, origin);
      const request: SyntheticBrowserRequest = {
        url: () => `${origin}/api/me`, method: () => "GET", resourceType: () => "fetch", headers: () => ({}),
      };
      const onRequest = observers[0];
      const routeHandler = handlers[0];
      if (!onRequest || !routeHandler) throw new Error("Missing synthetic observers.");
      for (const mode of [401, 403, "network"] as const) {
        audit.useFixtures(createSyntheticLiveReadFixtures("investor"), (_path, response) =>
          mode === "network" ? "network" : { ...response, status: mode });
        onRequest(request);
        const abort = vi.fn(async () => {});
        const fulfill = vi.fn(async () => {});
        await routeHandler({ request: () => request, abort, fulfill, continue: async () => { throw new Error("API passthrough"); } });
        if (mode === "network") expect(abort).toHaveBeenCalledWith("failed");
        else expect(fulfill).toHaveBeenCalledWith(expect.objectContaining({ status: mode }));
      }
      expect(audit.calls).toHaveLength(3);
      expect(audit.unexpected).toEqual([]);
      expect(syntheticTrafficViolation({ url: `${origin}/api/me`, method: "GET", resourceType: "fetch" }, origin, null))
        .toBe("unconfigured-api-read");
    });
  });

  describe("TEST-4 protected save access is observable even when storage errors are caught", () => {
    function storageHarness() {
      class FakeStorage implements Storage {
        private readonly values = new Map<string, string>();
        fail: string | null = null;
        get length() { return this.values.size; }
        key(index: number) { return [...this.values.keys()][index] ?? null; }
        getItem(key: string) {
          if (this.fail === "getItem") throw new Error("Synthetic native storage failure");
          return this.values.get(key) ?? null;
        }
        setItem(key: string, value: string) {
          if (this.fail === "setItem") throw new Error("Synthetic native storage failure");
          this.values.set(key, value);
        }
        removeItem(key: string) {
          if (this.fail === "removeItem") throw new Error("Synthetic native storage failure");
          this.values.delete(key);
        }
        clear() {
          if (this.fail === "clear") throw new Error("Synthetic native storage failure");
          this.values.clear();
        }
      }
      const localStorage = new FakeStorage();
      const sessionStorage = new FakeStorage();
      for (const [key, value] of Object.entries(SYNTHETIC_SAVE_CANARIES)) localStorage.setItem(key, value);
      const delivered: SyntheticStorageAttempt[] = [];
      vi.stubGlobal("Storage", FakeStorage);
      vi.stubGlobal("window", {
        localStorage, sessionStorage,
        __sunsumRecordSyntheticStorageAttempt: async (attempt: SyntheticStorageAttempt) => { delivered.push(attempt); },
      });
      installSyntheticSaveAudit(SYNTHETIC_SAVE_CANARIES);
      return { localStorage, delivered };
    }

    it.each(["getItem", "setItem", "removeItem", "clear"] as const)("records caught %s before the native failure and retains canary bytes", async (operation) => {
      const { localStorage, delivered } = storageHarness();
      localStorage.fail = operation;
      try {
        if (operation === "getItem") localStorage.getItem("sunsum-design-lab-v1");
        else if (operation === "setItem") localStorage.setItem("sunsum-design-lab-v2", "overwrite");
        else if (operation === "removeItem") localStorage.removeItem("sunsum-design-lab-v1");
        else localStorage.clear();
        throw new Error("Expected a synthetic native failure.");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error).toHaveProperty("message", "Synthetic native storage failure");
      }
      localStorage.fail = null;
      const snapshot = await readSyntheticSaveAudit();
      expect(snapshot.attempts).toEqual([expect.objectContaining({ operation, area: "localStorage" })]);
      expect(delivered).toEqual(snapshot.attempts);
      expect(snapshot.canaries).toEqual(SYNTHETIC_SAVE_CANARIES);
    });

    it("detects native deletions and clear without throwing while ignoring the separate theme preference", async () => {
      const { localStorage, delivered } = storageHarness();
      localStorage.setItem("sunsum-theme", "dark");
      expect(localStorage.getItem("sunsum-theme")).toBe("dark");
      localStorage.removeItem("sunsum-theme");
      expect(delivered).toEqual([]);
      localStorage.removeItem("sunsum-design-lab-v1");
      localStorage.clear();
      const snapshot = await readSyntheticSaveAudit();
      expect(snapshot.attempts.map((attempt) => attempt.operation)).toEqual(["removeItem", "clear"]);
      expect(delivered).toEqual(snapshot.attempts);
      expect(snapshot.canaries).toEqual({
        "sunsum-design-lab-v1": null,
        "sunsum-design-lab-v2": null,
      });
      expect(snapshot.canaries).not.toEqual(SYNTHETIC_SAVE_CANARIES);
    });
  });

  describe("TEST-3/7 coherent multi-record and changed-release fixtures", () => {
    it("uses disjoint A-only/B-only projects and documents while preserving the same participant", async () => {
      const preview = setup("site-owner", { exportPhase: "preview-a" });
      const release = setup("site-owner", { exportPhase: "release-b" });
      expect(preview.fixtures.ids.projectId).not.toBe(release.fixtures.ids.projectId);
      expect(preview.fixtures.ids.documentId).not.toBe(release.fixtures.ids.documentId);
      expect(preview.fixtures.ids.ownerUserId).toBe(release.fixtures.ids.ownerUserId);
      for (const scenario of [preview, release]) {
        const snapshot = take(await scenario.client.readSnapshot());
        const manifest = take(await scenario.client.readExport({ scope: snapshot.scope }));
        expect(manifest.documents).toHaveLength(1);
        expect(manifest.documents[0]).toMatchObject({
          id: scenario.fixtures.ids.documentId, siteId: scenario.fixtures.ids.siteId, projectId: null,
        });
      }
    });

    it("provides sixty matching rows plus independently excluded rows and a linked page-two document", async () => {
      const { client, fixtures } = setup("operator", { collectionScenario: "page-two" });
      const snapshot = take(await client.readSnapshot());
      expect(snapshot.records).toHaveLength(65);
      const searched = snapshot.records.filter((record) => record.name?.includes("Continuity"));
      expect(searched).toHaveLength(62);
      const staged = searched.filter((record) => record.journeyStageId === "pre-development");
      expect(staged).toHaveLength(61);
      const matching = staged.filter((record) => record.siteType === "rooftop")
        .sort((left, right) => (left.name ?? "").localeCompare(right.name ?? "", "en"));
      expect(matching).toHaveLength(60);
      const selected = matching.slice(50, 100)[3];
      if (!selected) throw new Error("Missing nonfirst page-two record.");
      const detail = take(await client.readDetail(selected.detail, { scope: snapshot.scope }));
      expect(detail.record.id).toBe(selected.id);
      const source = fixtures.records.find((record) => record.id === selected.id);
      expect(detail.documents[0]).toMatchObject({
        id: source?.documentId, siteId: selected.siteId, projectId: null,
      });
      expect(detail.documents[0]?.download?.siteId).toBe(selected.siteId);
      const manifest = take(await client.readExport({ scope: snapshot.scope }));
      expect(manifest.projects).toHaveLength(65);
      expect(manifest.documents).toHaveLength(64);
      expect(new Set(manifest.documents.map((document) => document.id)).size).toBe(64);
    });
  });
});
