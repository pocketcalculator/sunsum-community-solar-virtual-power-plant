import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuidanceAssistant, scriptedReply } from "@/features/design-lab/Guidance";
import { createSeed } from "@/features/design-lab/model";
import { dispatch } from "@/features/design-lab/store";

beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } },
  });
  dispatch({ type: "reset" });
});
afterEach(() => vi.unstubAllGlobals());

describe("scoped typed guidance", () => {
  it("answers from visible project state without executing a command", () => {
    const site = createSeed().sites[0]!;
    expect(scriptedReply("next task", "site-owner", site)).toContain(site.name);
    expect(scriptedReply("next task", "investor", site)).not.toContain("Review the example feasibility scope");
    expect(scriptedReply("What happens after acceptance?", "operator", site)).toContain("human decision");
    expect(scriptedReply("Explain the human decision", "operator", site)).toContain("Original assessment");
    expect(scriptedReply("How do I contact human adoption support?", "operator", site)).toContain("no project-manager outreach");
  });
  it("offers typed questions and does not start speech or fetch", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<GuidanceAssistant role="site-owner" siteId="sweet-auburn" onClose={vi.fn()} onNavigate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Ask a question"), { target: { value: "Is there live grid control?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));
    expect(screen.getByRole("log")).toHaveTextContent("not live device control");
    expect(screen.queryByRole("button", { name: /use voice|start speech/i })).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not reveal an unavailable project through assistance context", () => {
    render(<GuidanceAssistant role="investor" siteId="grove-park" onClose={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.queryByText(/Grove Park/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Explain next steps" }));
    expect(screen.getByRole("log")).toHaveTextContent("Select a project");
  });
});
