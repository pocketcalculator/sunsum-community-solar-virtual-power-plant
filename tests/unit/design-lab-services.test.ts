// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveConfiguration, SERVICE_CAPABILITIES } from "@/features/design-lab/configuration";
import { apiUrl, isServiceId, requestService, wireRole } from "@/features/design-lab/services";

const session = { apiBaseUrl: "https://example.invalid/api", origin: "https://example.invalid", principalId: "11111111-1111-4111-8111-111111111111", role: "operator" as const };
const parse = (value: unknown) => typeof value === "string" ? value : null;
afterEach(() => vi.unstubAllGlobals());

describe("existing-service boundary", () => {
  it("keeps the static demo independent of live transport and uses the ten-family registry", () => {
    expect(resolveConfiguration({}).mode).toBe("preview");
    expect(resolveConfiguration({ SUNSUM_PUBLIC_DATA_MODE: "connected", SUNSUM_PUBLIC_API_BASE_URL: "/api" }).mode).toBe("unavailable");
    expect(resolveConfiguration({ SUNSUM_PUBLIC_API_BASE_URL: "https://example.invalid/api" }).mode).toBe("unavailable");
    expect(SERVICE_CAPABILITIES).toHaveLength(10);
    expect(SERVICE_CAPABILITIES.every((capability) => capability.id.startsWith("SUNSUM-CONNECTION:"))).toBe(true);
  });
  it("preserves API prefixes and rejects preview ids, unsafe roots and route escapes", () => {
    expect(apiUrl(session.apiBaseUrl, "sites/123")).toBe("https://example.invalid/api/sites/123");
    expect(isServiceId("site-11111111-1111-4111-8111-111111111111")).toBe(false);
    expect(isServiceId("sweet-auburn")).toBe(false);
    expect(wireRole("site-owner")).toBe("site_owner");
    expect(() => apiUrl(session.apiBaseUrl, "../sites")).toThrow();
    expect(() => apiUrl(session.apiBaseUrl, "/sites")).toThrow();
    expect(resolveConfiguration({ SUNSUM_PUBLIC_DATA_MODE: "wrong" }).mode).toBe("unavailable");
    expect(resolveConfiguration({ SUNSUM_PUBLIC_DATA_MODE: "connected" }).issue).toBeTruthy();
    expect(resolveConfiguration({ SUNSUM_PUBLIC_API_BASE_URL: "https://user:secret@example.invalid/api" }).mode).toBe("unavailable");
  });
  it("does not treat a demo role or cross-origin cookie configuration as authentication", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect((await requestService(null, "sites", parse)).ok).toBe(false);
    expect((await requestService({ ...session, origin: "https://nicolassalazar-pro.github.io" }, "sites", parse)).ok).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([400, 401, 403, 404, 409, 422, 503])("surfaces HTTP %i without mock fallback or retry", async (status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response("error", { status }));
    vi.stubGlobal("fetch", fetcher);
    const result = await requestService(session, "sites", parse);
    expect(result.ok).toBe(false);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("keeps uncertain write outcomes distinct and never retries them", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("network"));
    vi.stubGlobal("fetch", fetcher);
    expect(await requestService(session, "sites", parse, { method: "POST", body: { name: "Fictional" } })).toMatchObject({ ok: false, kind: "uncertain" });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("does not treat malformed success as valid data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"different":"schema"}', { status: 200 })));
    expect(await requestService(session, "sites", parse)).toMatchObject({ ok: false, kind: "malformed" });
  });
});
