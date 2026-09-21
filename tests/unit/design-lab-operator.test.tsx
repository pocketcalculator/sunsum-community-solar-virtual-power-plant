import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityView, PipelineView, SubmissionQueueView, resetQueuePreferences } from "@/features/design-lab/OperatorViews";
import { resetCollectionPreferences } from "@/features/design-lab/ProjectCollection";
import { createSeed, reduceLab, type LabState } from "@/features/design-lab/model";
import { dispatch, parseStoredState, serializePreview, STORAGE_KEY } from "@/features/design-lab/store";

const AT = "2026-09-20T08:00:00.000Z";

function loadScenario(state: LabState) {
  act(() => {
    localStorage.setItem(STORAGE_KEY, serializePreview(state));
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
  });
}

function savedState() {
  const state = parseStoredState(localStorage.getItem(STORAGE_KEY) ?? "null");
  if (!state) throw new Error("Expected a saved synthetic scenario");
  return state;
}

beforeEach(() => {
  localStorage.clear();
  resetQueuePreferences();
  resetCollectionPreferences();
  dispatch({ type: "reset" });
});

describe("operator submission queue", () => {
  it("pages the complete fictional scenario, filters deliberately and only opens detail", () => {
    const onOpen = vi.fn();
    render(<SubmissionQueueView onOpen={onOpen} />);
    const before = savedState();

    expect(screen.getByRole("status")).toHaveTextContent("50 of 50 fictional sites match; showing 1-25");
    const queue = screen.getByRole("list", { name: "Submissions awaiting a manual action" });
    expect(within(queue).getAllByRole("button")).toHaveLength(25);
    expect(within(queue).getAllByRole("button")[0]).toHaveAccessibleName("Review Old Fourth Ward studios");
    expect(screen.getByRole("button", { name: "Previous submissions" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Next submissions" }));
    expect(screen.getByText("Page 2 of 2")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("showing 26-50");

    fireEvent.change(screen.getByLabelText("Next work"), { target: { value: "review" } });
    expect(screen.getByText("Page 1 of 1")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("1 of 50 fictional sites match");
    fireEvent.click(screen.getByRole("button", { name: "Review Old Fourth Ward studios" }));
    expect(onOpen).toHaveBeenCalledWith("old-fourth");
    expect(savedState()).toEqual(before);

    fireEvent.change(screen.getByLabelText("Search submissions"), { target: { value: "no matching example" } });
    expect(screen.getByRole("heading", { name: "No submissions match these filters" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("status")).toHaveTextContent("50 of 50 fictional sites match");
    expect(savedState()).toEqual(before);
  });

  it("separates acceptance awaiting setup from reconfirmation and stage blockers", () => {
    let state = reduceLab(createSeed(), { type: "review", id: "old-fourth", decision: "accept", note: "Accept the example, without starting it." }, AT);
    state = reduceLab(state, { type: "rerun", id: "sweet-auburn", result: "more_information_required", reason: "Inspect changed fixture evidence" }, AT);
    render(<SubmissionQueueView onOpen={vi.fn()} />);
    loadScenario(state);

    fireEvent.change(screen.getByLabelText("Next work"), { target: { value: "setup" } });
    const setup = screen.getByRole("button", { name: "Review Old Fourth Ward studios" });
    expect(setup).toHaveTextContent("Start project setup");
    expect(setup).toHaveTextContent("Project not started / Not published");

    fireEvent.change(screen.getByLabelText("Next work"), { target: { value: "reconfirm" } });
    expect(screen.getByRole("status")).toHaveTextContent("1 of 50 fictional sites match");
    expect(screen.getByRole("button", { name: "Review Sweet Auburn rooftop" })).toHaveTextContent("Reconfirm human review");

    fireEvent.change(screen.getByLabelText("Next work"), { target: { value: "blocked" } });
    expect(screen.getByRole("button", { name: "Review Grove Park warehouse" })).toHaveTextContent("1 stage blocker");
    expect(savedState()).toEqual(state);
  });

  it("supports explicit unknown outcomes and preserves a real zero capacity", () => {
    const state = createSeed();
    const unknown = state.sites.find((site) => site.id === "old-fourth")!;
    unknown.assessments = [];
    const zero = state.sites.find((site) => site.id === "sweet-auburn")!;
    const zeroRange: [number, number] = [0, 0];
    zero.assessments = zero.assessments.map((assessment) => ({ ...assessment, capacity: zeroRange }));
    render(<SubmissionQueueView onOpen={vi.fn()} />);
    loadScenario(state);

    fireEvent.click(screen.getByRole("button", { name: "More filters" }));
    fireEvent.change(screen.getByLabelText("Screening outcome"), { target: { value: "unscreened" } });
    expect(screen.getByRole("button", { name: "Review Old Fourth Ward studios" })).toHaveTextContent("Unknown");
    expect(screen.getByRole("status")).toHaveTextContent("1 of 50 fictional sites match");

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    fireEvent.change(screen.getByLabelText("Search submissions"), { target: { value: "Sweet Auburn" } });
    expect(screen.getByRole("button", { name: "Review Sweet Auburn rooftop" })).toHaveTextContent("0 kW");
    expect(savedState()).toEqual(state);
  });
});

describe("operator project discovery", () => {
  it("uses the shared full-width map above the paged list with read-only selection", () => {
    const onOpen = vi.fn();
    render(<PipelineView onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    const before = savedState();
    const map = screen.getByRole("region", { name: "Linked illustrative map" });
    const list = screen.getByRole("region", { name: "Project results" });

    expect(map.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(list).getAllByRole("listitem")).toHaveLength(25);
    expect(screen.getByRole("status")).toHaveTextContent("50 of 50 permitted fictional projects");
    expect(screen.queryByRole("button", { name: /Move to |Start pre-development|Publish to investors/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText(/Page 2 of 2/)).toBeVisible();
    fireEvent.change(screen.getByLabelText("Search projects"), { target: { value: "Sweet Auburn" } });
    expect(screen.getByRole("status")).toHaveTextContent("1 of 50 permitted fictional projects");
    expect(screen.getByRole("button", { name: "Select Sweet Auburn rooftop" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "View Sweet Auburn rooftop" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Open Sweet Auburn rooftop" }));
    expect(onOpen).toHaveBeenCalledWith("sweet-auburn");
    expect(savedState()).toEqual(before);
  });
});

describe("role-scoped preview activity", () => {
  it("keeps private events and non-owner examples out of the owner's log", () => {
    const state = createSeed();
    const ownerSite = state.sites.find((site) => site.id === "sweet-auburn")!;
    ownerSite.activity.push(
      { id: "private", at: AT, actor: "operator", kind: "note", title: "Private operator analysis", detail: "Operator secret text", scope: "operator" },
      { id: "legacy-note", at: AT, actor: "operator", kind: "note", title: "Mis-scoped legacy note", detail: "Never disclose this note", scope: "shared" },
      { id: "investor-private", at: AT, actor: "investor", kind: "interest", title: "Investor-only event", detail: "Private investor context", scope: "investor" },
      { id: "notice", at: AT, actor: "investor", kind: "owner_interest", title: "Untrusted notice title", detail: "Private identity and 99999 amount", scope: "owner" },
    );
    state.sites.find((site) => site.id === "preview-07")!.activity.push({
      id: "other-owner", at: AT, actor: "site-owner", kind: "submission", title: "Another owner's update", detail: "Not this owner's site", scope: "shared",
    });
    render(<ActivityView role="site-owner" />);
    loadScenario(state);

    expect(screen.getByText("New non-binding project interest")).toBeVisible();
    expect(screen.queryByText("Untrusted notice title")).toBeNull();
    expect(screen.queryByText(/Private identity|Operator secret|Never disclose|Private investor context|Another owner's update/)).toBeNull();
    expect(within(screen.getByLabelText("Activity project")).getAllByRole("option")).toHaveLength(7);

    fireEvent.change(screen.getByLabelText("Activity project"), { target: { value: "sweet-auburn" } });
    expect(screen.getByRole("status")).toHaveTextContent("3 matching preview events");
    fireEvent.change(screen.getByLabelText("Search activity"), { target: { value: "no event" } });
    expect(screen.getByRole("heading", { name: "No activity matches this view" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Clear activity filters" }));
    expect(screen.getByRole("status")).toHaveTextContent("13 matching preview events");
  });
});
