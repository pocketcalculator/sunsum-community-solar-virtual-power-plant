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
      "apiBasePath", "canAttemptDocumentDownloads", "canAttemptExports", "canAttemptReads", "reason", "source",
    ]);
    expect(result.canAttemptExports).toBe(false);
    expect(result.canAttemptDocumentDownloads).toBe(false);
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
