import { describe, expect, it } from "vitest";
import { contextHref, permittedView, workspaceContext } from "@/features/live-workspace/navigation";

describe("read workspace navigation, not authorization", () => {
  it("keeps operator work first without replacing the owner's overview", () => {
    expect(permittedView("operator", null)).toBe("queue");
    expect(permittedView("operator", "overview")).toBe("queue");
    expect(permittedView("site-owner", null)).toBe("overview");
    expect(permittedView("investor", null)).toBe("portfolio");
  });

  it("never exposes another role's primary page from a query", () => {
    expect(permittedView("investor", "queue")).toBe("portfolio");
    expect(permittedView("site-owner", "portfolio")).toBe("overview");
    expect(permittedView(null, "pipeline")).toBe("overview");
    expect(permittedView("investor", "intake")).toBe("portfolio");
  });

  it("retains bounded context but drops a caller role, duplicate keys and arbitrary redirects", () => {
    const context = workspaceContext("/app?view=queue&project=opaque%26id&role=operator&scope=a&scope=b&task=work-1&redirect=https://outside.invalid");
    expect(context).toEqual({ view: "queue", projectId: "opaque&id", scopeId: null, taskId: "work-1", collectionView: null });
    expect(contextHref(context)).toBe("/app?view=queue&project=opaque%26id&task=work-1");
  });

  it("allows learning before sign-in without offering another perspective", () => {
    expect(permittedView(null, "welcome")).toBe("help");
    expect(permittedView(null, "roadmap")).toBe("connections");
    expect(workspaceContext("/app?view=not-a-view").view).toBeNull();
  });

  it("keeps investor document metadata and safe activity reachable without another role's data", () => {
    expect(permittedView("investor", "documents")).toBe("documents");
    expect(permittedView("investor", "activity")).toBe("activity");
    expect(permittedView("investor", "pipeline")).toBe("portfolio");
  });
});
