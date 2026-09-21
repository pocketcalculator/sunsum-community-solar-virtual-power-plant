import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportView } from "@/features/design-lab/ReportView";
import { createSeed, sourceRevision, type LabState } from "@/features/design-lab/model";
import { draftSnapshotAt } from "@/features/design-lab/reportExport";
import { STORAGE_KEY, dispatch, parseStoredState, serializePreview } from "@/features/design-lab/store";

const projectId = "sweet-auburn";
const createObjectURL = vi.fn<(blob: Blob) => string>();
const revokeObjectURL = vi.fn<(url: string) => void>();
const clickedDownloads: { filename: string; href: string }[] = [];

function storedState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const state = raw ? parseStoredState(raw) : null;
  if (!state) throw new Error("Expected a stored preview");
  return state;
}

function firstDraft() {
  const draft = storedState().drafts?.[0];
  if (!draft) throw new Error("Expected a saved draft");
  return draft;
}

function replaceSharedState(state: LabState) {
  localStorage.setItem(STORAGE_KEY, serializePreview(state));
  act(() => { window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY })); });
}

function createBriefing(title = "Fictional working briefing") {
  fireEvent.click(screen.getByRole("button", { name: "Create briefing draft" }));
  fireEvent.change(screen.getByLabelText("Draft title"), { target: { value: title } });
}

function saveDraft() {
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
}

function reviewDraft() {
  fireEvent.click(screen.getByRole("checkbox", { name: "I reviewed this saved synthetic draft" }));
  fireEvent.click(screen.getByRole("button", { name: "Record human review" }));
}

function blobText(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read generated test blob"));
    reader.readAsText(blob);
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  createObjectURL.mockReset().mockReturnValue("blob:sunroom-local-report");
  revokeObjectURL.mockReset();
  clickedDownloads.length = 0;
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clickedDownloads.push({ filename: this.download, href: this.href });
  });
  localStorage.clear();
  dispatch({ type: "reset" });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("selected-project generated drafts", () => {
  it("prefills correctable source fields and saves/reopens through the shared store without rewriting the project", () => {
    const { unmount } = render(<ReportView role="site-owner" siteId={projectId} />);
    createBriefing();
    expect(screen.getByLabelText("Project name")).toHaveValue("Sweet Auburn rooftop");
    expect(screen.getByText("Stored source: Sweet Auburn rooftop")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "Corrected briefing label" } });
    fireEvent.change(screen.getByLabelText("Owner goals"), { target: { value: "Explore a fictional community benefit" } });
    fireEvent.change(screen.getByLabelText("Draft body"), { target: { value: "Original corrected narrative for this demo." } });
    expect(screen.getByRole("button", { name: "Briefing HTML" })).toBeDisabled();
    saveDraft();
    const saved = firstDraft();
    expect(saved.sourceFields.find((field) => field.key === "project_name")).toMatchObject({
      value: "Corrected briefing label", sourceValue: "Sweet Auburn rooftop",
    });
    expect(storedState().sites[0]!.name).toBe("Sweet Auburn rooftop");
    expect(saved.sourceRevision).toBe(sourceRevision(storedState().sites[0]!));
    expect(draftSnapshotAt(saved)).not.toBe("Unknown");
    unmount();
    render(<ReportView role="site-owner" siteId={projectId} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Fictional working briefing" }));
    expect(screen.getByLabelText("Project name")).toHaveValue("Corrected briefing label");
    expect(screen.getByLabelText("Draft body")).toHaveValue("Original corrected narrative for this demo.");
    expect(screen.getByRole("button", { name: "Record human review" })).toBeDisabled();
    expect(firstDraft().review).toBe("draft");
  });

  it("requires explicit human review and clears it when a correction is saved", () => {
    render(<ReportView role="site-owner" siteId={projectId} />);
    createBriefing();
    expect(screen.getByRole("checkbox", { name: "I reviewed this saved synthetic draft" })).toBeDisabled();
    saveDraft();
    const stage = storedState().sites[0]!.stage;
    expect(screen.getByRole("button", { name: "Record human review" })).toBeDisabled();
    reviewDraft();
    expect(firstDraft()).toMatchObject({ review: "reviewed", reviewerRole: "site-owner" });
    expect(firstDraft().reviewedAt).not.toBeNull();
    expect(storedState().sites[0]!.stage).toBe(stage);
    fireEvent.change(screen.getByLabelText("Draft body"), { target: { value: "An explicitly corrected narrative." } });
    expect(screen.getByRole("button", { name: "Record human review" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Briefing HTML" })).toBeDisabled();
    saveDraft();
    expect(firstDraft()).toMatchObject({ review: "draft", reviewedAt: null, reviewerRole: null });
    expect(screen.getByRole("checkbox", { name: "I reviewed this saved synthetic draft" })).not.toBeChecked();
  });

  it("keeps edits when the active workspace tab is clicked and blocks switching away until they are handled", () => {
    render(<ReportView role="site-owner" siteId={projectId} />);
    createBriefing();
    fireEvent.change(screen.getByLabelText("Draft body"), { target: { value: "Keep these unsaved words." } });
    const navigation = screen.getByRole("navigation", { name: "Report workspace" });
    fireEvent.click(within(navigation).getByRole("button", { name: /^Project briefing/ }));
    expect(screen.getByLabelText("Draft body")).toHaveValue("Keep these unsaved words.");
    expect(within(navigation).getByRole("button", { name: /^Assessment report/ })).toBeDisabled();
    expect(within(navigation).getByRole("button", { name: /^Portfolio summary/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Discard unsaved changes" }));
    expect(screen.queryByLabelText("Draft body")).not.toBeInTheDocument();
    expect(storedState().drafts).toEqual([]);
  });

  it("blocks stale review and deliberately creates a refreshed copy without losing corrections or the original snapshot", () => {
    render(<ReportView role="site-owner" siteId={projectId} />);
    createBriefing("Keep this title");
    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "My corrected name" } });
    fireEvent.change(screen.getByLabelText("Draft body"), { target: { value: "Keep this narrative." } });
    saveDraft();
    reviewDraft();
    const original = firstDraft();
    const current = storedState();
    replaceSharedState({
      ...current, sites: current.sites.map((site) => site.id === projectId ? {
        ...site, name: "New source name", locality: "New source locality", revision: (site.revision ?? 0) + 1,
      } : site),
    });
    expect(screen.getByRole("heading", { name: "Source changed since this draft" })).toBeVisible();
    expect(screen.getByLabelText("Project name")).toHaveValue("My corrected name");
    expect(screen.getByRole("checkbox", { name: "I reviewed this saved synthetic draft" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Record human review" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Review refreshed prefill" }));
    expect(screen.getByRole("region", { name: "Refreshed field comparison" })).toHaveTextContent("New source name");
    expect(storedState().drafts).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Keep existing draft" }));
    expect(storedState().drafts).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Review refreshed prefill" }));
    fireEvent.click(screen.getByRole("button", { name: "Create refreshed copy" }));
    const drafts = storedState().drafts!;
    expect(drafts).toHaveLength(2);
    expect(drafts.find((draft) => draft.id === original.id)).toEqual(original);
    const refreshed = drafts.find((draft) => draft.id !== original.id)!;
    expect(refreshed).toMatchObject({ title: "Keep this title", content: "Keep this narrative.", review: "draft", reviewedAt: null });
    expect(refreshed.sourceFields.find((field) => field.key === "project_name")).toMatchObject({
      value: "My corrected name", sourceValue: "New source name",
    });
    expect(refreshed.sourceFields.find((field) => field.key === "locality")?.value).toBe("New source locality / GA");
    expect(refreshed.sourceRevision).not.toBe(original.sourceRevision);
    expect(screen.queryByRole("heading", { name: "Source changed since this draft" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "I reviewed this saved synthetic draft" })).toBeEnabled();
  });

  it("retains local edits and blocks overwriting a draft changed in another tab", () => {
    render(<ReportView role="site-owner" siteId={projectId} />);
    createBriefing();
    saveDraft();
    fireEvent.change(screen.getByLabelText("Draft body"), { target: { value: "Local unsaved narrative." } });
    const current = storedState();
    replaceSharedState({ ...current, drafts: current.drafts!.map((draft) => ({
      ...draft, content: "Other tab's saved narrative.", updatedAt: "2026-09-21T08:00:00.000Z",
    })) });
    expect(screen.getByText(/This draft changed in another view or tab/)).toBeVisible();
    expect(screen.getByLabelText("Draft body")).toHaveValue("Local unsaved narrative.");
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Discard unsaved changes" }));
    expect(screen.getByLabelText("Draft body")).toHaveValue("Other tab's saved narrative.");
  });

  it("binds the human-review checkbox to the exact saved draft rather than a later cross-tab revision", () => {
    render(<ReportView role="site-owner" siteId={projectId} />);
    createBriefing();
    saveDraft();
    fireEvent.click(screen.getByRole("checkbox", { name: "I reviewed this saved synthetic draft" }));
    expect(screen.getByRole("button", { name: "Record human review" })).toBeEnabled();
    const current = storedState();
    replaceSharedState({ ...current, drafts: current.drafts!.map((draft) => ({
      ...draft, content: "Another saved revision needs a fresh human reading.", updatedAt: "2026-09-21T08:00:00.000Z",
    })) });
    expect(screen.getByLabelText("Draft body")).toHaveValue("Another saved revision needs a fresh human reading.");
    expect(screen.getByRole("checkbox", { name: "I reviewed this saved synthetic draft" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Record human review" })).toBeDisabled();
    expect(firstDraft().review).toBe("draft");
  });

  it("keeps assessment report review distinct from briefing, source decisions and portfolio summaries", () => {
    render(<ReportView role="operator" siteId={projectId} />);
    act(() => { dispatch({ type: "rerun", id: projectId, result: "more_information_required", reason: "Fictional changed evidence" }); });
    fireEvent.click(within(screen.getByRole("navigation", { name: "Report workspace" })).getByRole("button", { name: /^Assessment report/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create assessment report" }));
    const provenance = screen.getByLabelText("Stored assessment provenance");
    expect(within(provenance).getByRole("heading", { name: "Original assessment" })).toBeVisible();
    expect(within(provenance).getByText(/Potentially viable/)).toBeVisible();
    expect(within(provenance).getByText(/More information needed/)).toBeVisible();
    expect(within(provenance).getByText(/Accepted for project setup/)).toBeVisible();
    expect(screen.getByText(/No connected provider or AI service/)).toBeInTheDocument();
    saveDraft();
    const decisions = storedState().sites[0]!.decisions;
    reviewDraft();
    expect(firstDraft()).toMatchObject({ kind: "assessment_report", review: "reviewed", reviewerRole: "operator" });
    expect(storedState().sites[0]!.decisions).toEqual(decisions);
    expect(screen.getByRole("button", { name: "Assessment report HTML" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Briefing HTML" })).not.toBeInTheDocument();
  });

  it("shows no-project, denied-project and missing legal-template states without substituting unrelated data", () => {
    const view = render(<ReportView role="site-owner" />);
    expect(screen.getByText("No selected project")).toBeVisible();
    fireEvent.click(within(screen.getByRole("navigation", { name: "Report workspace" })).getByRole("button", { name: /^Project briefing/ }));
    expect(screen.getByRole("heading", { name: "Choose a project first" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Create briefing draft" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Legal templates unavailable" })).toBeVisible();
    view.rerender(<ReportView role="site-owner" siteId="preview-07" />);
    expect(screen.getByRole("heading", { name: "Project unavailable" })).toBeVisible();
    expect(document.body.textContent).not.toContain("Community rooftop 07");
  });

  it("retains invalid drafts and reports why a save was rejected", () => {
    render(<ReportView role="site-owner" siteId={projectId} />);
    createBriefing("");
    fireEvent.change(screen.getByLabelText("Draft body"), { target: { value: "" } });
    saveDraft();
    expect(screen.getByRole("alert")).toHaveTextContent("Add a draft title and body before saving");
    expect(screen.getByLabelText("Draft body")).toHaveValue("");
    expect(storedState().drafts).toEqual([]);
  });
});

describe("local downloads and report scope", () => {
  it("initiates an actual HTML Blob download from saved draft bytes and releases the object URL", async () => {
    const view = render(<ReportView role="site-owner" siteId={projectId} />);
    createBriefing();
    fireEvent.change(screen.getByLabelText("Draft body"), { target: { value: '<script>not executable</script>\nAn original review.' } });
    saveDraft();
    fireEvent.click(screen.getByRole("button", { name: "Briefing HTML" }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]![0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("text/html;charset=utf-8");
    const content = await blobText(blob);
    expect(content).toContain("&lt;script&gt;not executable&lt;/script&gt;");
    expect(content).toContain("Unreviewed demo draft");
    expect(content).not.toContain("<script>");
    expect(clickedDownloads[0]).toMatchObject({ href: "blob:sunroom-local-report" });
    expect(clickedDownloads[0]!.filename).toMatch(/^sunroom-project-briefing-.*\.html$/);
    expect(screen.getByRole("status", { name: "Report action status" })).toHaveTextContent("Download started in this browser; nothing was delivered");
    expect(document.querySelector("a[download]")).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:sunroom-local-report");
  });

  it("downloads selected and all-permitted summary CSV without implying an active collection filter", async () => {
    const view = render(<ReportView role="investor" siteId={projectId} />);
    expect(screen.getByLabelText("Summary scope")).toHaveValue("selected");
    fireEvent.click(screen.getByRole("button", { name: "Prepare summary" }));
    expect(screen.getByRole("region", { name: "Portfolio summary preview" })).toHaveTextContent("Sweet Auburn rooftop");
    fireEvent.click(screen.getByRole("button", { name: "Summary CSV" }));
    const selected = await blobText(createObjectURL.mock.calls[0]![0]);
    expect(selected).toContain('"scope"');
    expect(selected).toContain('"Selected project"');
    expect(selected).not.toContain("West End community canopy");
    expect(selected).not.toContain("owner@example.invalid");
    expect(selected).not.toContain("Example Street");
    expect(createObjectURL.mock.calls[0]![0].type).toBe("text/csv;charset=utf-8");
    fireEvent.change(screen.getByLabelText("Summary scope"), { target: { value: "all_permitted" } });
    expect(screen.queryByRole("button", { name: "Summary CSV" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Prepare summary" }));
    fireEvent.click(screen.getByRole("button", { name: "Summary CSV" }));
    const all = await blobText(createObjectURL.mock.calls[1]![0]);
    expect(all).toContain('"All permitted projects"');
    expect(all).toContain("West End community canopy");
    expect(all).not.toContain("Grove Park warehouse");
    expect(clickedDownloads[1]!.filename).toContain("all-permitted-investor");
    expect(screen.getByText("No filters from another screen are applied.")).toBeVisible();
    view.unmount();
  });

  it("revokes metadata preview and old downloads immediately after an investor withdraws", () => {
    dispatch({ type: "interest", id: projectId });
    render(<ReportView role="investor" siteId={projectId} />);
    fireEvent.click(screen.getByRole("button", { name: "Prepare summary" }));
    expect(screen.getByText("Preliminary site summary.pdf")).toBeInTheDocument();
    expect(screen.queryByText("Example electricity bill.pdf")).not.toBeInTheDocument();
    act(() => { dispatch({ type: "withdraw", id: projectId }); });
    expect(screen.getByText(/Project or document access changed/)).toBeVisible();
    expect(screen.queryByText("Preliminary site summary.pdf")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Summary HTML" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh summary snapshot" }));
    expect(screen.getByRole("button", { name: "Summary HTML" })).toBeEnabled();
    expect(screen.queryByText("Preliminary site summary.pdf")).not.toBeInTheDocument();
  });

  it("clears restricted draft context on a role switch and does not offer investor draft exports", () => {
    const view = render(<ReportView role="site-owner" siteId={projectId} />);
    createBriefing("Private owner briefing");
    fireEvent.change(screen.getByLabelText("Draft body"), { target: { value: "PRIVATE_DRAFT_BODY_SENTINEL" } });
    saveDraft();
    view.rerender(<ReportView role="investor" siteId={projectId} />);
    expect(screen.queryByLabelText("Draft body")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("PRIVATE_DRAFT_BODY_SENTINEL");
    expect(document.body.textContent).not.toContain("Private owner briefing");
    expect(document.body.textContent).not.toContain("owner@example.invalid");
    expect(screen.queryByRole("button", { name: "Briefing HTML" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Summary scope")).toHaveValue("selected");
  });

  it("keeps saved content when download creation fails and reports an error instead of delivery", () => {
    render(<ReportView role="site-owner" siteId={projectId} />);
    createBriefing();
    saveDraft();
    const saved = firstDraft();
    createObjectURL.mockImplementationOnce(() => { throw new DOMException("Blocked", "SecurityError"); });
    fireEvent.click(screen.getByRole("button", { name: "Briefing HTML" }));
    expect(screen.getByRole("alert")).toHaveTextContent("browser could not create the local file");
    expect(clickedDownloads).toHaveLength(0);
    expect(screen.queryByRole("status", { name: "Report action status" })).not.toBeInTheDocument();
    expect(firstDraft()).toEqual(saved);
    expect(screen.getByLabelText("Draft title")).toHaveValue(saved.title);
    fireEvent.click(screen.getByRole("button", { name: "Briefing HTML" }));
    expect(clickedDownloads).toHaveLength(1);
  });

  it("shows a real empty export state without generating a fabricated file", () => {
    render(<ReportView role="investor" />);
    replaceSharedState({ ...createSeed(), sites: [] });
    expect(screen.getByRole("heading", { name: "No permitted projects" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Prepare summary" })).toBeDisabled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
