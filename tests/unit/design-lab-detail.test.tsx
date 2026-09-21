import type { ComponentProps } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectDetail } from "@/features/design-lab/ProjectDetail";
import {
  createSeed, latestAssessment, needsReconfirmation, projectTasks, reduceLab,
  type DemoDocument, type LabState, type ProjectTask, type Role,
} from "@/features/design-lab/model";
import * as store from "@/features/design-lab/store";

type DetailProps = ComponentProps<typeof ProjectDetail>;
const AT = "2026-09-20T08:00:00.000Z";

function loadScenario(state: LabState) {
  act(() => {
    localStorage.setItem(store.STORAGE_KEY, store.serializePreview(state));
    window.dispatchEvent(new StorageEvent("storage", { key: store.STORAGE_KEY }));
  });
}

function savedState() {
  const state = store.parseStoredState(localStorage.getItem(store.STORAGE_KEY) ?? "null");
  if (!state) throw new Error("Expected a saved synthetic scenario");
  return state;
}

function savedSite(id = "sweet-auburn") {
  const site = savedState().sites.find((item) => item.id === id);
  if (!site) throw new Error(`Expected saved site ${id}`);
  return site;
}

function renderDetail(extra: Partial<DetailProps> = {}, state = createSeed()) {
  const props: DetailProps = {
    siteId: "sweet-auburn", role: "operator", onClose: vi.fn(), onEdit: vi.fn(),
    onUnderwriting: vi.fn(), ...extra,
  };
  const result = render(<ProjectDetail {...props} />);
  loadScenario(state);
  return { ...result, props };
}

function openTab(name: string) {
  fireEvent.click(screen.getByRole("tab", { name }));
  return screen.getByRole("tabpanel", { name });
}

beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } },
  });
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: true, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })));
  localStorage.clear();
  store.dispatch({ type: "reset" });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("deliberate operator commands", () => {
  it("keeps acceptance, project setup, task review, advancement and publication separate", () => {
    renderDetail({ siteId: "old-fourth" });
    expect(screen.getByRole("button", { name: "Record decision" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Start pre-development" })).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: /^Decision note/ }), { target: { value: "Accept for a fictional feasibility conversation." } });
    fireEvent.click(screen.getByRole("button", { name: "Record decision" }));

    expect(savedSite("old-fourth")).toMatchObject({ status: "accepted", stage: null, visible: false });
    expect(screen.getByText("Awaiting project setup")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Publish to investors" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Start pre-development" }));
    expect(savedSite("old-fourth")).toMatchObject({ stage: "pre-development", visible: false });
    const blocked = savedState();
    expect(screen.getByRole("button", { name: "Move to development" })).toBeDisabled();
    expect(screen.getByText("Before this stage can move")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Move to development" }));
    expect(savedState()).toEqual(blocked);

    const tasks = openTab("Tasks & evidence");
    const task = within(tasks).getByRole("article", { name: "Review the example feasibility scope" });
    expect(within(task).getByRole("button", { name: "Record task review" })).toBeDisabled();
    fireEvent.change(within(task).getByRole("textbox"), { target: { value: "Reviewed this illustrative scope; no document is required for this task." } });
    fireEvent.click(within(task).getByRole("button", { name: "Record task review" }));
    expect(savedSite("old-fourth")).toMatchObject({ stage: "pre-development", visible: false });
    expect(projectTasks(savedSite("old-fourth"))[0]?.status).toBe("reviewed");

    openTab("Work & decisions");
    expect(screen.getByRole("button", { name: "Move to development" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Move to development" }));
    expect(savedSite("old-fourth")).toMatchObject({ stage: "development", visible: false });
    fireEvent.click(screen.getByRole("button", { name: "Publish to investors" }));
    expect(savedSite("old-fourth")).toMatchObject({ status: "accepted", stage: "development", visible: true });
    expect(savedSite("old-fourth").fundingNeeds.every((need) => need.amount === null)).toBe(true);
  });

  it.each([
    { choice: "Request info", status: "info_requested" },
    { choice: "Decline", status: "rejected" },
  ])("requires a reason for $choice without creating or publishing a project", ({ choice, status }) => {
    renderDetail({ siteId: "old-fourth" });
    fireEvent.click(screen.getByRole("radio", { name: choice }));
    expect(screen.getByRole("button", { name: "Record decision" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: /^Decision note/ }), { target: { value: "A specific example evidence gap remains." } });
    fireEvent.click(screen.getByRole("button", { name: "Record decision" }));
    expect(savedSite("old-fourth")).toMatchObject({ status, stage: null, visible: false });
    expect(savedSite("old-fourth").decisions?.at(-1)?.note).toBe("A specific example evidence gap remains.");
    if (status === "info_requested") {
      expect(projectTasks(savedSite("old-fourth"))[0]?.title).toBe("A specific example evidence gap remains.");
    }
  });

  it("keeps assignment independent and makes its owner-facing next step explicit", () => {
    renderDetail();
    const before = savedSite();
    expect(screen.getByRole("button", { name: "Save assignment" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: /^Assigned to/ }), { target: { value: "Example technical reviewer" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Next action/ }), { target: { value: "Review the example structural question" } });
    fireEvent.click(screen.getByRole("button", { name: "Save assignment" }));
    expect(savedSite()).toMatchObject({ assignee: "Example technical reviewer", nextAction: "Review the example structural question", stage: before.stage, visible: before.visible });
    expect(savedSite().assessments).toEqual(before.assessments);
    expect(savedSite().decisions).toEqual(before.decisions);
    expect(projectTasks(savedSite())).toEqual(projectTasks(before));
    expect(savedSite().activity.at(-1)?.scope).toBe("owner");
    expect(screen.getByRole("button", { name: "Save assignment" })).toBeDisabled();
  });

  it("preserves input and surfaces a rejected dispatch rather than reporting success or closing", () => {
    const rejected = vi.fn(() => false);
    vi.spyOn(store, "useLab").mockReturnValue({
      state: createSeed(), ready: true, notice: null, dispatch: rejected,
      notify: vi.fn(), dismissNotice: vi.fn(),
    });
    const { props } = renderDetail({ siteId: "old-fourth" });
    const input = screen.getByRole("textbox", { name: /^Decision note/ });
    fireEvent.change(input, { target: { value: "Retain this rationale if the state changed." } });
    fireEvent.click(screen.getByRole("button", { name: "Record decision" }));
    expect(rejected).toHaveBeenCalledWith(expect.objectContaining({ type: "review", decision: "accept" }), expect.any(String));
    expect(screen.getByRole("alert")).toHaveTextContent("The action was not applied");
    expect(input).toHaveValue("Retain this rationale if the state changed.");
    expect(props.onClose).not.toHaveBeenCalled();
    expect(savedSite("old-fourth").status).toBe("screening");
  });
});

describe("canonical tasks and metadata-only evidence", () => {
  it.each(["site-owner", "operator", "investor"] as const)("composes the same scoped financial presentation for %s", (role) => {
    renderDetail({ role });
    const financial = openTab("Financial context");
    expect(within(financial).getByRole("region", { name: "Selected project financial summary" })).toBeVisible();
    expect(financial).toHaveTextContent("Sweet Auburn rooftop");
    expect(financial).toHaveTextContent("Owner benefit");
    expect(financial).toHaveTextContent("Project payback");
    expect(financial).toHaveTextContent("Investor return");
    expect(financial).toHaveTextContent("No site-specific financial model");
    expect(financial).toHaveTextContent("Unmeasured");
  });

  it("focuses a linked task and requires matching reviewed metadata plus a deliberate rationale", async () => {
    const state = createSeed();
    const task: ProjectTask = {
      id: "task-ownership", title: "Review example ownership metadata", kind: "evidence",
      status: "requested", requiredForStage: "development", documentKind: "ownership",
      note: "Illustrative prerequisite, not a legal ownership determination.",
    };
    state.sites[0]!.tasks = [task];
    const onDocuments = vi.fn();
    renderDetail({ initialTaskId: task.id, onDocuments }, state);
    const taskCard = screen.getByRole("article", { name: task.title });
    await waitFor(() => expect(taskCard).toHaveFocus());
    expect(screen.getByRole("tab", { name: "Tasks & evidence" })).toHaveAttribute("aria-selected", "true");
    expect(within(taskCard).getByText("Linked action-center task")).toBeVisible();
    fireEvent.change(within(taskCard).getByRole("textbox"), { target: { value: "The displayed metadata matches this example request." } });
    expect(within(taskCard).getByRole("button", { name: "Record task review" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Review metadata for Example electricity bill.pdf" }));
    expect(within(taskCard).getByRole("button", { name: "Record task review" })).toBeDisabled();
    const beforeUpload = savedSite();
    const document: DemoDocument = {
      id: "ownership-metadata", name: "Fictional ownership record.pdf", kind: "ownership",
      disclosure: "owner_private", size: 1200, createdAt: AT, taskId: task.id, version: 1, review: "unreviewed",
    };
    act(() => { store.dispatch({ type: "document", id: "sweet-auburn", document, actor: "site-owner" }); });
    expect(savedSite().assessments).toEqual(beforeUpload.assessments);
    expect(savedSite().decisions).toEqual(beforeUpload.decisions);
    expect(projectTasks(savedSite())[0]?.status).toBe("requested");
    expect(within(taskCard).getByRole("button", { name: "Record task review" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Open project documents" }));
    expect(onDocuments).toHaveBeenCalledWith("sweet-auburn");
    expect(savedSite().documents.find((doc) => doc.id === document.id)?.review).toBe("unreviewed");
    fireEvent.click(screen.getByRole("button", { name: `Review metadata for ${document.name}` }));
    expect(savedSite().documents.find((doc) => doc.id === document.id)?.review).toBe("reviewed");
    expect(projectTasks(savedSite())[0]?.status).toBe("requested");
    expect(savedSite().assessments).toEqual(beforeUpload.assessments);
    expect(within(taskCard).getByRole("button", { name: "Record task review" })).toBeEnabled();
    fireEvent.click(within(taskCard).getByRole("button", { name: "Record task review" }));
    expect(projectTasks(savedSite())[0]).toMatchObject({ status: "reviewed", note: "The displayed metadata matches this example request." });
    expect(savedSite().stage).toBe("pre-development");
    expect(needsReconfirmation(savedSite())).toBe(true);
  });

  it("explains a missing linked task without fabricating or completing one", () => {
    renderDetail({ role: "site-owner", initialTaskId: "missing-task" });
    const before = savedState();
    expect(screen.getByRole("tabpanel", { name: "Tasks & evidence" })).toHaveTextContent("The linked task is no longer available");
    expect(screen.queryByRole("button", { name: "Record task review" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Review metadata for/ })).toBeNull();
    expect(savedState()).toEqual(before);
  });
});

describe("assessment provenance and human reconfirmation", () => {
  it("preserves original and human records through changed, unchanged and failed manual reruns", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const state = createSeed();
    const original = state.sites[0]!.assessments[0]!;
    const decisions = state.sites[0]!.decisions;
    state.sites[0]!.visible = false;
    state.sites[0]!.tasks = projectTasks(state.sites[0]!).map<ProjectTask>((task) => ({ ...task, status: "reviewed" }));
    renderDetail({}, state);
    let assessmentPanel = openTab("Assessment");
    const originalCard = within(assessmentPanel).getByRole("article", { name: "Immutable original fixture" });
    expect(originalCard).toHaveTextContent("design-fixture-v1");
    expect(originalCard).toHaveTextContent("Sep 17, 2026");
    expect(originalCard).toHaveTextContent(new Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(within(originalCard).getByText("Unavailable: no approved endpoint or identity configuration")).toBeVisible();
    expect(within(assessmentPanel).getByRole("button", { name: "Record manual rerun" })).toBeDisabled();
    fireEvent.click(within(assessmentPanel).getByRole("radio", { name: "More information needed" }));
    fireEvent.change(within(assessmentPanel).getByRole("textbox", { name: /^Rerun reason/ }), { target: { value: "Review additional example evidence without calling a provider." } });
    fireEvent.click(within(assessmentPanel).getByRole("button", { name: "Record manual rerun" }));
    expect(savedSite().assessments[0]).toEqual(original);
    expect(savedSite().decisions).toEqual(decisions);
    expect(needsReconfirmation(savedSite())).toBe(true);
    expect(within(assessmentPanel).getByRole("heading", { name: "Changed since the previous assessment" })).toBeVisible();
    expect(within(assessmentPanel).getByRole("article", { name: "Current selected-fixture outcome" })).toHaveTextContent("More information needed");

    fireEvent.click(screen.getByRole("button", { name: "Go to review confirmation" }));
    expect(screen.getByRole("tab", { name: "Work & decisions" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Move to development" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Publish to investors" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Confirm current review" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: /^Review confirmation rationale/ }), { target: { value: "Reconfirmed only the illustrative current revision." } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm current review" }));
    expect(savedSite().decisions).toHaveLength(2);
    expect(savedSite().decisions?.[0]).toEqual(decisions?.[0]);
    expect(savedSite().decisions?.at(-1)?.assessmentId).toBe(latestAssessment(savedSite())?.id);
    expect(savedSite()).toMatchObject({ stage: "pre-development", visible: false });
    expect(needsReconfirmation(savedSite())).toBe(false);
    expect(screen.getByRole("button", { name: "Move to development" })).toBeEnabled();

    assessmentPanel = openTab("Assessment");
    fireEvent.change(within(assessmentPanel).getByRole("textbox", { name: /^Rerun reason/ }), { target: { value: "Repeat the same fixture to inspect the no-change path." } });
    fireEvent.click(within(assessmentPanel).getByRole("button", { name: "Record manual rerun" }));
    expect(within(assessmentPanel).getByRole("heading", { name: "No material fixture change" })).toBeVisible();
    expect(savedSite().assessments).toHaveLength(3);
    expect(needsReconfirmation(savedSite())).toBe(true);
    const lastGood = savedSite();
    fireEvent.click(within(assessmentPanel).getByText("Try the failure state"));
    fireEvent.click(within(assessmentPanel).getByRole("button", { name: "Simulate rerun failure" }));
    expect(within(assessmentPanel).getByRole("alert")).toHaveTextContent("last successful assessment is retained");
    expect(savedSite().assessments).toEqual(lastGood.assessments);
    expect(savedSite().decisions).toEqual(lastGood.decisions);
    expect(savedSite().assessments[0]).toEqual(original);
    fireEvent.change(within(assessmentPanel).getByRole("textbox", { name: /^Rerun reason/ }), { target: { value: "Deliberately retry the selected local fixture." } });
    fireEvent.click(within(assessmentPanel).getByRole("button", { name: "Record manual rerun" }));
    expect(within(assessmentPanel).queryByRole("alert")).toBeNull();
    expect(savedSite().assessmentError).toBeNull();
    expect(savedSite().assessments).toHaveLength(4);
    expect(savedSite().decisions).toEqual(lastGood.decisions);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not label an unchanged outcome as no-change when its fixture ranges differ", () => {
    renderDetail({ siteId: "old-fourth" });
    const panel = openTab("Assessment");
    fireEvent.change(within(panel).getByRole("textbox", { name: /^Rerun reason/ }), { target: { value: "Choose the same outcome but inspect the actual fixture differences." } });
    fireEvent.click(within(panel).getByRole("button", { name: "Record manual rerun" }));
    const comparison = within(panel).getByRole("group", { name: "Latest assessment comparison" });
    expect(comparison).toHaveTextContent("Changed since the previous assessment");
    expect(comparison).toHaveTextContent("Before: 120-165 kW");
    expect(comparison).toHaveTextContent("After: 180-240 kW");
    expect(within(panel).queryByRole("heading", { name: "No material fixture change" })).toBeNull();
  });

  it("does not make an accepted-but-unstarted site start after assessment changes", () => {
    let state = reduceLab(createSeed(), { type: "review", id: "old-fourth", decision: "accept", note: "Accept only" }, AT);
    state = reduceLab(state, { type: "rerun", id: "old-fourth", result: "not_currently_eligible", reason: "Inspect a changed fixture" }, AT);
    renderDetail({ siteId: "old-fourth" }, state);
    expect(screen.getByRole("button", { name: "Start pre-development" })).toBeDisabled();
    expect(screen.getByText("Reconfirm the changed assessment or evidence before starting.")).toBeVisible();
    expect(savedSite("old-fourth").stage).toBeNull();
  });

  it("keeps a missing assessment unknown and disables unsupported reruns", () => {
    const state = createSeed();
    state.sites.find((site) => site.id === "old-fourth")!.assessments = [];
    renderDetail({ siteId: "old-fourth" }, state);
    const panel = openTab("Assessment");
    expect(panel).toHaveTextContent("No assessment is recorded. This is unknown, not a negative screening result.");
    fireEvent.change(within(panel).getByRole("textbox", { name: /^Rerun reason/ }), { target: { value: "No initial result to rerun" } });
    expect(within(panel).getByRole("button", { name: "Record manual rerun" })).toBeDisabled();
    fireEvent.click(within(panel).getByText("Try the failure state"));
    expect(within(panel).getByRole("button", { name: "Simulate rerun failure" })).toBeDisabled();
    expect(savedSite("old-fourth").assessments).toEqual([]);
  });
});

describe("private notes and role boundaries", () => {
  it("edits typed notes with prior revisions and never exposes them to another role", () => {
    const { props, rerender } = renderDetail();
    const before = savedSite();
    let panel = openTab("Private notes");
    fireEvent.change(within(panel).getByRole("textbox", { name: /^New private note/ }), { target: { value: "Original operator-only context." } });
    fireEvent.click(within(panel).getByRole("button", { name: "Save private note" }));
    const originalNote = savedSite().notes?.[0];
    expect(originalNote?.text).toBe("Original operator-only context.");
    fireEvent.click(within(panel).getByRole("button", { name: "Edit private note 1" }));
    fireEvent.change(within(panel).getByRole("textbox", { name: /^Correct private note/ }), { target: { value: "Discarded correction." } });
    fireEvent.click(within(panel).getByRole("button", { name: "Cancel correction" }));
    expect(savedSite().notes?.[0]).toEqual(originalNote);
    fireEvent.click(within(panel).getByRole("button", { name: "Edit private note 1" }));
    fireEvent.change(within(panel).getByRole("textbox", { name: /^Correct private note/ }), { target: { value: "Corrected operator-only context." } });
    fireEvent.click(within(panel).getByRole("button", { name: "Save note correction" }));
    panel = screen.getByRole("tabpanel", { name: "Private notes" });
    fireEvent.click(within(panel).getByText("Prior revisions (1)"));
    expect(within(panel).getByText("Original operator-only context.")).toBeVisible();
    expect(savedSite().notes?.[0]).toMatchObject({ id: originalNote?.id, text: "Corrected operator-only context.", previous: [{ text: "Original operator-only context.", at: originalNote?.updatedAt }] });
    expect(savedSite()).toMatchObject({ stage: before.stage, status: before.status, visible: before.visible });
    expect(savedSite().assessments).toEqual(before.assessments);
    expect(savedSite().decisions).toEqual(before.decisions);

    rerender(<ProjectDetail {...props} role="site-owner" />);
    expect(screen.queryByRole("tab", { name: "Private notes" })).toBeNull();
    expect(document.body).not.toHaveTextContent("Original operator-only context.");
    expect(document.body).not.toHaveTextContent("Corrected operator-only context.");
    act(() => { store.dispatch({ type: "interest", id: "sweet-auburn" }); });
    rerender(<ProjectDetail {...props} role="investor" />);
    expect(document.body).not.toHaveTextContent("Original operator-only context.");
    expect(document.body).not.toHaveTextContent("Corrected operator-only context.");
    expect(document.body).not.toHaveTextContent("Example electricity bill.pdf");
  });

  it("withholds operator rerun rationale and private assessment events from both other roles", () => {
    let state = reduceLab(createSeed(), { type: "rerun", id: "sweet-auburn", result: "more_information_required", reason: "Private rerun deliberation, not an owner decision." }, AT);
    state = reduceLab(state, { type: "interest", id: "sweet-auburn" }, AT);
    const { props, rerender } = renderDetail({ role: "site-owner" }, state);
    openTab("Assessment");
    expect(document.body).not.toHaveTextContent("Private rerun deliberation");
    openTab("Activity");
    expect(document.body).not.toHaveTextContent("Private rerun deliberation");
    rerender(<ProjectDetail {...props} role="investor" />);
    openTab("Assessment");
    expect(document.body).not.toHaveTextContent("Private rerun deliberation");
    expect(screen.queryByRole("button", { name: "Record manual rerun" })).toBeNull();
    openTab("Activity");
    expect(document.body).not.toHaveTextContent("Private rerun deliberation");
  });

  it.each<{ role: Role; siteId: string; forbidden: string }>([
    { role: "site-owner", siteId: "preview-07", forbidden: "Community rooftop 07" },
    { role: "investor", siteId: "grove-park", forbidden: "Grove Park warehouse" },
    { role: "operator", siteId: "missing-site", forbidden: "Sweet Auburn rooftop" },
  ])("denies $role access to $siteId without rendering project data", ({ role, siteId, forbidden }) => {
    renderDetail({ role, siteId });
    expect(screen.getByRole("dialog", { name: "Project unavailable" })).toBeVisible();
    expect(document.body).not.toHaveTextContent(forbidden);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("button", { name: /Review metadata|Save private note|Express non-binding interest/ })).toBeNull();
  });

  it("keeps the owner notice minimal and historical while publication stays independent", () => {
    let state = reduceLab(createSeed(), { type: "interest", id: "sweet-auburn" }, AT);
    state = reduceLab(state, { type: "withdraw", id: "sweet-auburn" }, AT);
    const site = state.sites[0]!;
    site.activity.find((event) => event.kind === "interest")!.detail = "Private investor identity: person@example.invalid; amount 987654";
    site.activity.find((event) => event.kind === "owner_interest")!.detail = "Unsafe legacy notice: person@example.invalid; amount 987654";
    site.acknowledgement = { name: "Example typed name", at: AT };
    renderDetail({ role: "site-owner" }, state);
    const notice = screen.getByRole("region", { name: "Owner interest notices" });
    expect(within(notice).getAllByText("New non-binding project interest")).toHaveLength(1);
    expect(notice).toHaveTextContent("No commitment or funding has occurred.");
    expect(screen.getByText("Published to demo investors")).toBeVisible();
    expect(document.body).not.toHaveTextContent("person@example.invalid");
    expect(document.body).not.toHaveTextContent("987654");
    expect(document.body).toHaveTextContent("It is not a signature, utility authorization or executed agreement.");
    expect(screen.queryByRole("button", { name: /sign|acknowledge/i })).toBeNull();
  });

  it("gates investor evidence by interest and publication without exposing private originals", () => {
    const onDocuments = vi.fn();
    const onUnderwriting = vi.fn();
    const state = createSeed();
    state.sites[0]!.documents[0]!.replacesId = "private-original-id";
    renderDetail({ role: "investor", onDocuments, onUnderwriting }, state);
    expect(screen.queryByRole("tab", { name: "Evidence" })).toBeNull();
    expect(document.body).not.toHaveTextContent("Preliminary site summary.pdf");
    fireEvent.click(screen.getByRole("button", { name: "Express non-binding interest" }));
    fireEvent.click(screen.getByRole("button", { name: "Open illustrative scenario" }));
    expect(onUnderwriting).toHaveBeenCalledWith("sweet-auburn");
    const evidence = openTab("Evidence");
    expect(evidence).toHaveTextContent("Preliminary site summary.pdf");
    expect(evidence).not.toHaveTextContent("Example electricity bill.pdf");
    expect(evidence).not.toHaveTextContent("private-original-id");
    expect(evidence).not.toHaveTextContent("Review the example feasibility scope");
    expect(screen.queryByRole("button", { name: /Review metadata for|Record task review/ })).toBeNull();
    fireEvent.click(within(evidence).getByRole("button", { name: "Open project documents" }));
    expect(onDocuments).toHaveBeenCalledWith("sweet-auburn");
    expect(savedSite().documents[0]?.review).toBeUndefined();

    openTab("Overview");
    fireEvent.click(screen.getByRole("button", { name: "Withdraw interest" }));
    expect(screen.queryByRole("tab", { name: "Evidence" })).toBeNull();
    expect(document.body).not.toHaveTextContent("Preliminary site summary.pdf");
    fireEvent.click(screen.getByRole("button", { name: "Express non-binding interest" }));
    openTab("Evidence");
    act(() => { store.dispatch({ type: "visibility", id: "sweet-auburn", visible: false }); });
    expect(screen.getByRole("dialog", { name: "Project unavailable" })).toBeVisible();
    expect(document.body).not.toHaveTextContent("Sweet Auburn rooftop");
    expect(document.body).not.toHaveTextContent("Preliminary site summary.pdf");
  });

  it("requires the investor mandate and explicitly represents absent legacy histories", () => {
    const state = createSeed();
    state.mandate.completed = false;
    const { props, rerender } = renderDetail({ role: "investor" }, state);
    expect(screen.getByRole("dialog", { name: "Investment mandate required" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Express non-binding interest" })).toBeNull();

    delete state.sites[0]!.decisions;
    delete state.sites[0]!.notes;
    delete state.sites[0]!.tasks;
    state.sites[0]!.outstanding = ["Legacy site request"];
    loadScenario(state);
    rerender(<ProjectDetail {...props} role="operator" />);
    expect(screen.getByRole("region", { name: "Confirm the current review" })).toHaveTextContent("no decision record");
    const assessment = openTab("Assessment");
    expect(assessment).toHaveTextContent("This legacy save has no human decision history");
    const notes = openTab("Private notes");
    expect(notes).toHaveTextContent("This legacy save has no typed-note records");
    const tasks = openTab("Tasks & evidence");
    expect(within(tasks).getByRole("article", { name: "Legacy site request" })).toBeVisible();
  });
});

describe("detail navigation contracts", () => {
  it("preserves optional report/document callbacks, keyboard tabs and Escape", () => {
    const onReport = vi.fn();
    const onDocuments = vi.fn();
    const { props } = renderDetail({ onReport, onDocuments });
    const first = screen.getByRole("tab", { name: "Work & decisions" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    const assessment = screen.getByRole("tab", { name: "Assessment" });
    expect(assessment).toHaveAttribute("aria-selected", "true");
    expect(assessment).toHaveFocus();
    const before = savedState();
    fireEvent.click(screen.getByRole("button", { name: "Open project reports" }));
    expect(onReport).toHaveBeenCalledWith("sweet-auburn");
    fireEvent.keyDown(assessment, { key: "End" });
    expect(screen.getByRole("tab", { name: "Activity" })).toHaveFocus();
    openTab("Tasks & evidence");
    fireEvent.click(screen.getByRole("button", { name: "Open project documents" }));
    expect(onDocuments).toHaveBeenCalledWith("sweet-auburn");
    expect(savedState()).toEqual(before);
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("keeps the owner's edit callback and discards unsaved private text on a project switch", () => {
    const { props, rerender } = renderDetail({ role: "site-owner", siteId: "east-point" });
    fireEvent.click(screen.getByRole("button", { name: "Update and resubmit" }));
    expect(props.onEdit).toHaveBeenCalledWith("east-point");
    rerender(<ProjectDetail {...props} role="operator" siteId="sweet-auburn" />);
    const notes = openTab("Private notes");
    fireEvent.change(within(notes).getByRole("textbox", { name: /^New private note/ }), { target: { value: "Unsaved text for the first project only." } });
    rerender(<ProjectDetail {...props} role="operator" siteId="west-end" />);
    openTab("Private notes");
    expect(screen.getByRole("textbox", { name: /^New private note/ })).toHaveValue("");
    expect(document.body).not.toHaveTextContent("Unsaved text for the first project only.");
    expect(savedSite("sweet-auburn").notes).toEqual([]);
    expect(savedSite("west-end").notes).toEqual([]);
  });
});
