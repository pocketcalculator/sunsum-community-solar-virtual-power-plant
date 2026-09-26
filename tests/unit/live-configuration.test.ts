import { describe, expect, it } from "vitest";
import { resolveLiveReadConfiguration } from "@/domain/live-configuration";

const evidence = {
  dataMode: "connected",
  store: "db",
  demoAuth: "false",
  sessionSecretConfigured: true,
  participantSignInApproved: true,
};

describe("live-read admission", () => {
  it("does not inherit the synthetic entry's default", () => {
    expect(resolveLiveReadConfiguration({ sessionSecretConfigured: false }).canAttemptReads).toBe(false);
  });

  it.each([
    { dataMode: "preview" },
    { apiBase: "https://outside.invalid/api" },
    { apiBase: "/api?key=never-publish" },
    { store: "mock" },
    { demoAuth: "true" },
    { demoAuth: "unexpected" },
    { sessionSecretConfigured: false },
    { participantSignInApproved: false },
  ])("fails closed for incompatible evidence %o", (change) => {
    expect(resolveLiveReadConfiguration({ ...evidence, ...change }).canAttemptReads).toBe(false);
  });

  it("admits only a same-origin attempt without claiming a successful session", () => {
    const result = resolveLiveReadConfiguration({ ...evidence, apiBase: "/api" });
    expect(result.canAttemptReads).toBe(true);
    expect(result.source).toBe("database-configured");
    expect(result.reason).toContain("must still confirm");
    expect(Object.keys(result).sort()).toEqual([
      "apiBasePath", "canAttemptDocumentDownloads", "canAttemptExports", "canAttemptInterest",
      "canAttemptReads", "mode", "reason", "source", "syntheticIdentities",
    ].sort());
    expect(result.mode).toBe("connected");
    expect(result.canAttemptInterest).toBe(true);
    expect(result.canAttemptExports).toBe(false);
    expect(result.canAttemptDocumentDownloads).toBe(false);
  });

  it("admits only the exact isolated server-demo combination", () => {
    const result = resolveLiveReadConfiguration({
      dataMode: "server-demo", store: "mock", demoAuth: "enabled",
      apiBase: "/api", sessionSecretConfigured: true,
    });
    expect(result).toMatchObject({
      mode: "server-demo", source: "mock-configured", canAttemptReads: true, canAttemptInterest: true,
      canAttemptExports: false, canAttemptDocumentDownloads: false,
    });
    expect(result.reason).toContain("fictional");
  });

  it.each([
    { store: undefined }, { store: "db" }, { store: "moc" },
    { demoAuth: "true" }, { demoAuth: "1" }, { demoAuth: " enabled " },
    { demoAuth: "ENABLED" }, { demoAuth: undefined }, { sessionSecretConfigured: false },
    { apiBase: "https://elsewhere.invalid/api" },
  ])("never falls back from a mixed server-demo configuration %o", (change) => {
    expect(resolveLiveReadConfiguration({
      dataMode: "server-demo", store: "mock", demoAuth: "enabled", sessionSecretConfigured: true,
      ...change,
    })).toMatchObject({
      mode: "unavailable", source: "not-confirmed", canAttemptReads: false, canAttemptInterest: false,
    });
  });

  it("copies public synthetic-ID evidence without accepting identity as admission", () => {
    const userIds = ["11111111-1111-4111-8111-111111111111"];
    const result = resolveLiveReadConfiguration({
      ...evidence, syntheticIdentities: { userIds, investorIds: [] },
    });
    userIds.push("22222222-2222-4222-8222-222222222222");
    expect(result.syntheticIdentities.userIds).toHaveLength(1);
    expect(Object.isFrozen(result.syntheticIdentities.userIds)).toBe(true);
    expect(resolveLiveReadConfiguration({
      ...evidence, participantSignInApproved: false, syntheticIdentities: result.syntheticIdentities,
    }).mode).toBe("unavailable");
  });

  it("requires independent export approval as well as read admission", () => {
    expect(resolveLiveReadConfiguration({ ...evidence, exportApproved: true }).canAttemptExports).toBe(true);
    expect(resolveLiveReadConfiguration({
      ...evidence, participantSignInApproved: false, exportApproved: true,
    }).canAttemptExports).toBe(false);
  });

  it("does not infer original-file disclosure from metadata or summary-export approval", () => {
    expect(resolveLiveReadConfiguration({ ...evidence, exportApproved: true }).canAttemptDocumentDownloads).toBe(false);
    expect(resolveLiveReadConfiguration({ ...evidence, documentDownloadsApproved: true }).canAttemptDocumentDownloads).toBe(true);
    expect(resolveLiveReadConfiguration({
      ...evidence, participantSignInApproved: false, documentDownloadsApproved: true,
    }).canAttemptDocumentDownloads).toBe(false);
  });
});
