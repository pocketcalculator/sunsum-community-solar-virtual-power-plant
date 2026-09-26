import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectCollection, resetCollectionPreferences } from "@/features/design-lab/ProjectCollection";
import { DemoNotifications } from "@/features/design-lab/DemoNotifications";
import { DocumentsView } from "@/features/design-lab/OwnerViews";
import { SUBMISSION_STATUS_LABELS, submissionStatusTone, compareLifecycle, compareRecordedTimes, timestampLabel, actorLabel } from "@/features/design-lab/demoPresentation";
import { createSeed, reduceLab, type LabState } from "@/features/design-lab/model";
import { dispatch, STORAGE_KEY, serializePreview } from "@/features/design-lab/store";

beforeEach(() => {
  localStorage.clear();
  resetCollectionPreferences();
  dispatch({ type: "reset" });
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } },
  });
});

function load(state: LabState) {
  act(() => {
    localStorage.setItem(STORAGE_KEY, serializePreview(state));
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
  });
}

describe("submission status presentation", () => {
  it("preserves the six operator submission labels, filter order and tones", () => {
    const expected = [
      ["draft", "Draft", "neutral"],
      ["submitted", "Submitted", "neutral"],
      ["screening", "Screening", "neutral"],
      ["info_requested", "Information requested", "warning"],
      ["accepted", "Accepted", "positive"],
      ["rejected", "Not accepted", "danger"],
    ] as const;

    expect(Object.entries(SUBMISSION_STATUS_LABELS)).toEqual(
      expected.map(([status, label]) => [status, label]),
    );
    for (const [status, , tone] of expected) {
      expect(submissionStatusTone(status)).toBe(tone);
    }
  });
});

describe("collection presentation and lifecycle order", () => {
  it("uses lifecycle ordinals, deterministic ties and unknown-last in both directions", () => {
    const stages = [
      { id: "unknown", stage: "future-stage" }, { id: "z", stage: "pre-development" },
      { id: "operations", stage: "operations" }, { id: "a", stage: "pre-development" },
      { id: "construction", stage: "construction" }, { id: "submitted", stage: "submitted" },
      { id: "null", stage: null },
    ];
    expect([...stages].sort((a, b) => compareLifecycle(a, b)).map((site) => site.id)).toEqual(["submitted", "a", "z", "construction", "operations", "null", "unknown"]);
    expect([...stages].sort((a, b) => compareLifecycle(a, b, true)).map((site) => site.id)).toEqual(["operations", "construction", "a", "z", "submitted", "null", "unknown"]);
  });

  it("uses 25/50/100, identical card/list fields, the whole filtered map, and a nonmodal companion", () => {
    const seed = createSeed();
    const onOpen = vi.fn();
    render(<ProjectCollection sites={seed.sites} role="operator" onOpen={onOpen} />);
    const results = screen.getByRole("region", { name: "Project results" });
    const map = screen.getByRole("region", { name: "Linked illustrative map" });
    const guidance = screen.getByRole("complementary", { name: "Ask SunSum" });
    expect(guidance).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(map.compareDocumentPosition(results) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByLabelText("Projects per page")).toHaveValue("25");
    expect(within(results).getAllByRole("listitem")).toHaveLength(25);
    const text = results.textContent;
    fireEvent.click(screen.getByRole("button", { name: /^Cards$/ }));
    expect(results).toHaveAttribute("data-display", "cards");
    expect(results.textContent).toBe(text);
    expect(within(map).getAllByRole("button")).toHaveLength(seed.sites.filter((site) => site.mapPosition).length);
    fireEvent.change(screen.getByLabelText("Projects per page"), { target: { value: "50" } });
    expect(within(results).getAllByRole("listitem")).toHaveLength(50);
    fireEvent.change(screen.getByLabelText("Projects per page"), { target: { value: "100" } });
    expect(within(results).getAllByRole("listitem")).toHaveLength(50);
    fireEvent.change(screen.getByLabelText("Search projects"), { target: { value: "Sweet Auburn" } });
    expect(within(results).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("complementary", { name: "Ask SunSum" })).toHaveTextContent("Sweet Auburn rooftop");
    expect(screen.getByRole("status")).toHaveTextContent("1 of 50 permitted fictional projects in the filtered set; showing 1-1");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("brings off-page map selection into the list and retains it through page-size changes", () => {
    render(<ProjectCollection sites={createSeed().sites} role="operator" onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "View Sweet Auburn rooftop" }));
    expect(screen.getByText(/Page 2 of 2/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Select Sweet Auburn rooftop" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByLabelText("Projects per page"), { target: { value: "50" } });
    expect(screen.getByText(/Page 1 of 1/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Select Sweet Auburn rooftop" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("truthful metadata and notice history", () => {
  it("preserves timestamps, displays a timezone, and never guesses an unknown actor or time", () => {
    expect(timestampLabel("2026-09-20T16:10:25Z")).toContain(new Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(timestampLabel("2026-09-20")).toBe("2026-09-20 / time and timezone not recorded");
    expect(timestampLabel("2026-09-20T16:10:25")).toContain("timezone not recorded");
    expect(timestampLabel("")).toBe("Time not recorded");
    expect(timestampLabel("invalid")).toBe("Time not recorded");
    expect(actorLabel(null)).toBe("Actor not recorded");
    expect(actorLabel("shared-account")).toBe("Actor not recorded");
    expect(compareRecordedTimes("2026-09-20T14:00:00-04:00", "2026-09-20T17:00:00Z")).toBeLessThan(0);
    expect(compareRecordedTimes("", "2026-09-20T17:00:00Z")).toBeGreaterThan(0);
  });

  it("renders current metadata before preserved versions and file history without acknowledging it", () => {
    const at = "2026-09-20T16:10:25Z";
    let state = createSeed();
    state = reduceLab(state, { type: "document", id: "sweet-auburn", actor: "site-owner", document: {
      id: "bill-v2", name: "Corrected fictional bill.pdf", kind: "electricity_bill", size: 100,
      disclosure: "owner_private", version: 2, review: "unreviewed", createdAt: at, replacesId: "bill-sweet-auburn",
    } }, at);
    render(<DocumentsView role="site-owner" siteId="sweet-auburn" onOpen={vi.fn()} />);
    load(state);
    const before = localStorage.getItem(STORAGE_KEY);
    const current = screen.getByRole("article", { name: "Document metadata: Corrected fictional bill.pdf" });
    const previous = screen.getByRole("article", { name: "Document metadata: Example electricity bill.pdf", hidden: true });
    expect(current.compareDocumentPosition(previous) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(current).toHaveTextContent("Current metadata");
    expect(current).toHaveTextContent("Sensitivity: uninspected");
    fireEvent.click(within(current).getByText("File history: Corrected fictional bill.pdf"));
    expect(within(current).getByText("Site owner (demo role)")).toBeVisible();
    expect(within(current).getAllByText(timestampLabel(at))[0]).toHaveAttribute("datetime", at);
    expect(screen.getByText("Extraction and retention are different decisions")).toBeVisible();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });

  it("shows one sanitized owner notice per new interest transition and preserves withdrawal history", () => {
    const fetcher = vi.fn();
    vi.spyOn(globalThis, "fetch").mockImplementation(fetcher);
    let state = createSeed();
    state = reduceLab(state, { type: "interest", id: "sweet-auburn" }, "2026-09-20T16:00:00Z");
    expect(reduceLab(state, { type: "interest", id: "sweet-auburn" })).toBe(state);
    state = reduceLab(state, { type: "withdraw", id: "sweet-auburn" }, "2026-09-20T17:00:00Z");
    const notice = state.sites[0]!.activity.find((event) => event.kind === "owner_interest")!;
    notice.title = "PRIVATE INVESTOR";
    notice.detail = "PRIVATE CONTACT and amount 123456";
    render(<DemoNotifications role="site-owner" onClose={vi.fn()} onOpen={vi.fn()} />);
    load(state);
    const before = localStorage.getItem(STORAGE_KEY);
    expect(screen.getByRole("list", { name: "Recorded owner notices" }).children).toHaveLength(1);
    expect(screen.queryByText(/PRIVATE/)).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveTextContent("Unread count is not supplied");
    expect(screen.getByRole("dialog")).toHaveTextContent("does not assert current interest");
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
    state = reduceLab(state, { type: "interest", id: "sweet-auburn" }, "2026-09-20T18:00:00Z");
    load(state);
    expect(screen.getByRole("list", { name: "Recorded owner notices" }).children).toHaveLength(2);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
