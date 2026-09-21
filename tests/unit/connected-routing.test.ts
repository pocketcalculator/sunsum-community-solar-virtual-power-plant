import { describe, expect, it } from "vitest";
import { connectedWorkspaceHref } from "@/domain/workspace-routes";

describe("connected workspace aliases", () => {
  it("preserves bounded navigation context without forwarding persona authority", () => {
    const result = connectedWorkspaceHref({
      role: "operator", view: "documents", project: "site-7", scope: "site-7",
      task: "evidence-2", next: "https://outside.invalid",
    });
    expect(result).toBe("/app?view=documents&project=site-7&scope=site-7&task=evidence-2");
  });

  it("does not turn unknown, repeated or control-character values into routes", () => {
    expect(connectedWorkspaceHref({
      view: "admin", project: ["one", "two"], scope: "bad\nscope", task: "x".repeat(161),
    })).toBe("/app");
  });

  it("encodes IDs as query values rather than URL syntax", () => {
    expect(connectedWorkspaceHref({ project: "one&role=operator" }))
      .toBe("/app?project=one%26role%3Doperator");
  });
});
