/**
 * Focused coverage for the site-owner intake and documents surfaces.
 * These pin the demo-only guarantees: a guided draft saves and submits
 * in order, consent gates submission, and investor eyes never reach
 * owner-private files. All state is local demo state in this browser.
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentsView, IntakeView, OwnerInboxView, OwnerSitesView } from "@/features/design-lab/OwnerViews";
import { createSeed, defaultProfile, makeDraft, projectTasks, roleSites, type DemoDocument, type LabState, type Site } from "@/features/design-lab/model";
import { STORAGE_KEY, dispatch, parseStoredState, serializePreview } from "@/features/design-lab/store";

const showModalDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");

beforeAll(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } },
  });
});

afterAll(() => {
  if (showModalDescriptor) Object.defineProperty(HTMLDialogElement.prototype, "showModal", showModalDescriptor);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (closeDescriptor) Object.defineProperty(HTMLDialogElement.prototype, "close", closeDescriptor);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

function currentState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? parseStoredState(raw) : null;
  if (!parsed) throw new Error("Expected demo state in local storage.");
  return parsed;
}

function siteFrom(state: LabState, id: string): Site {
  const site = state.sites.find((entry) => entry.id === id);
  if (!site) throw new Error(`Missing fictional test site: ${id}`);
  return site;
}

function restoreScenario(state: LabState) {
  const raw = serializePreview(state);
  localStorage.setItem(STORAGE_KEY, raw);
  act(() => { window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: raw })); });
}

function documentFixture(overrides: Partial<DemoDocument> = {}): DemoDocument {
  return {
    id: "document-fixture", name: "Fictional evidence.pdf", kind: "ownership", size: 64,
    disclosure: "owner_private", createdAt: "2026-09-18T12:00:00.000Z", version: 1, review: "unreviewed",
    ...overrides,
  };
}

function fictionalFile(name = "Fictional evidence.pdf", type = "application/pdf", size?: number) {
  const file = new File(["CONTENT_MUST_NOT_BE_STORED"], name, { type });
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  return file;
}

function reachDocuments() {
  fireEvent.click(screen.getByRole("button", { name: "Use example data" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

beforeEach(() => {
  localStorage.clear();
  dispatch({ type: "reset" });
});

describe("owner intake", () => {
  function fillFirstSteps() {
    fireEvent.change(screen.getByLabelText(/site name/i), { target: { value: "Backyard rooftop" } });
    fireEvent.change(screen.getByLabelText(/contact name/i), { target: { value: "Robin Example" } });
    fireEvent.change(screen.getByLabelText(/contact email/i), { target: { value: "owner@example.invalid" } });
    fireEvent.change(screen.getByLabelText(/site address/i), { target: { value: "742 Example Ave, Atlanta, GA" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText(/usable area/i), { target: { value: "1800" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  }

  it("saves then submits a new site and reports the id", () => {
    const onComplete = vi.fn();
    render(<IntakeView onComplete={onComplete} onExit={vi.fn()} />);

    fillFirstSteps();
    fireEvent.click(screen.getByRole("checkbox", { name: /consent/i }));
    fireEvent.click(screen.getByRole("button", { name: "Submit for screening" }));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const id: unknown = onComplete.mock.calls[0]?.[0];
    if (typeof id !== "string") throw new Error("Expected the submitted site id.");
    const site = currentState().sites.find((entry) => entry.id === id);
    expect(site?.status).toBe("screening");
    expect(site?.mapPosition).toBeNull();
    expect(site?.assessments.at(-1)?.result).toBe("potentially_viable");
  });

  it("keeps submission disabled until consent is given", () => {
    render(<IntakeView onComplete={vi.fn()} onExit={vi.fn()} />);
    fillFirstSteps();

    const submit = screen.getByRole("button", { name: "Submit for screening" });
    expect(submit).toBeDisabled();
    expect(screen.getByText("Submission consent")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /consent/i }));
    expect(submit).toBeEnabled();
  });

  it("saves a resumable draft on save and exit without submitting", () => {
    const onExit = vi.fn();
    render(<IntakeView onComplete={vi.fn()} onExit={onExit} />);

    fireEvent.change(screen.getByLabelText(/site name/i), { target: { value: "Half-finished draft" } });
    fireEvent.click(screen.getByRole("button", { name: /save & exit/i }));

    expect(onExit).toHaveBeenCalledTimes(1);
    const draft = currentState().sites.find((entry) => entry.name === "Half-finished draft");
    expect(draft?.status).toBe("draft");
  });

  it("resumes saved answers and metadata at the next incomplete section", () => {
    const first = render(<IntakeView onComplete={vi.fn()} onExit={vi.fn()} />);
    reachDocuments();
    fireEvent.change(screen.getByLabelText(/choose a file/i), { target: { files: [fictionalFile()] } });
    fireEvent.click(screen.getByRole("button", { name: /save & exit/i }));
    const draft = currentState().sites.find((site) => site.name === "Peachtree porch rooftop");
    if (!draft) throw new Error("Expected a saved intake.");
    expect(draft.documents[0]).toMatchObject({ name: "Fictional evidence.pdf", version: 1, review: "unreviewed", disclosure: "owner_private" });
    expect(draft.evidenceRevision).toBe(1);
    first.unmount();

    render(<IntakeView initialSite={draft} onComplete={vi.fn()} onExit={vi.fn()} />);
    expect(screen.getByText("Step 3 of 4")).toBeInTheDocument();
    expect(screen.getByText("Fictional evidence.pdf")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Robin Example · owner@example.invalid")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit for screening" })).toBeDisabled();
  });

  it("carries profile goals into new sites without silently changing existing sites", () => {
    const profile = { ...defaultProfile(), completed: true, name: "Fictional Site Steward", ownerGoals: ["Support community ownership"] };
    dispatch({ type: "profile", profile });
    const before = siteFrom(currentState(), "sweet-auburn");
    render(<IntakeView onComplete={vi.fn()} onExit={vi.fn()} />);
    expect(screen.getByLabelText(/contact name/i)).toHaveValue("Fictional Site Steward");
    fireEvent.click(screen.getByRole("button", { name: "Use example data" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("checkbox", { name: "Support community ownership" })).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Reduce site energy costs" }));
    fireEvent.click(screen.getByRole("button", { name: /save & exit/i }));
    expect(currentState().sites.find((site) => site.name === "Peachtree porch rooftop")?.ownerGoals).toEqual(["Support community ownership", "Reduce site energy costs"]);
    expect(siteFrom(currentState(), "sweet-auburn")).toEqual(before);
    expect(currentState().profile?.ownerGoals).toEqual(["Support community ownership"]);
  });

  it("conditions evidence guidance instead of requiring organization records or a year of bills", () => {
    render(<IntakeView onComplete={vi.fn()} onExit={vi.fn()} />);
    reachDocuments();
    expect(screen.getByText(/No evidence has been requested for this site/i)).toBeInTheDocument();
    expect(screen.queryByText("Required documents")).not.toBeInTheDocument();
    expect(screen.queryByText(/Organization authority or financial evidence/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/An existing installation may need a technical record/i)).not.toBeInTheDocument();
    expect(screen.getByText(/no universal 12-month minimum/i)).toBeInTheDocument();

    act(() => { dispatch({ type: "profile", profile: { ...defaultProfile(), participant: "organization", organization: "Fictional Community Trust" } }); });
    expect(screen.getByText(/Organization authority or financial evidence is only considered/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /already solar/i }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText(/An existing installation may need a technical record/i)).toBeInTheDocument();
  });

  it("provides a non-executing utility explanation and a manual bill metadata path", () => {
    render(<IntakeView onComplete={vi.fn()} onExit={vi.fn()} />);
    reachDocuments();
    fireEvent.click(screen.getByText("What utility consent would cover"));
    expect(screen.getByText("Duration and revocation")).toBeInTheDocument();
    expect(screen.getByText(/Nothing has been authorized here/i)).toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Use manual bill metadata" }));
    expect(screen.getByLabelText("Document type")).toHaveValue("electricity_bill");
    fireEvent.change(screen.getByLabelText(/choose a file/i), { target: { files: [fictionalFile("Partial bill history.pdf")] } });
    fireEvent.click(screen.getByRole("button", { name: /save & exit/i }));
    const draft = currentState().sites.find((site) => site.name === "Peachtree porch rooftop");
    expect(draft?.documents[0]).toMatchObject({ kind: "electricity_bill", disclosure: "owner_private", review: "unreviewed" });
    expect(draft?.acknowledgement).toBeNull();
    expect(draft?.consent).toBe(false);
    expect(JSON.stringify(draft)).not.toContain("CONTENT_MUST_NOT_BE_STORED");
  });

  it("refuses off-scope intake and preserves concurrent operator changes", () => {
    const hidden = siteFrom(currentState(), "preview-07");
    const onExit = vi.fn();
    const view = render(<IntakeView initialSite={hidden} onComplete={vi.fn()} onExit={onExit} />);
    expect(screen.getByText("Site unavailable in this owner view")).toBeInTheDocument();
    expect(screen.queryByText(hidden.name)).not.toBeInTheDocument();
    const site = siteFrom(currentState(), "east-point");
    view.rerender(<IntakeView initialSite={site} onComplete={vi.fn()} onExit={onExit} />);
    act(() => { dispatch({ type: "document", id: site.id, document: documentFixture(), actor: "operator" }); });
    fireEvent.click(screen.getByRole("button", { name: /save & exit/i }));
    expect(screen.getByRole("alert")).toHaveTextContent("This site changed while you were editing");
    expect(onExit).not.toHaveBeenCalled();
    expect(siteFrom(currentState(), site.id).documents.some((doc) => doc.id === "document-fixture")).toBe(true);
  });
});

describe("owner collection and canonical actions", () => {
  it("uses only the smaller owner projection in sites, inbox, and documents", () => {
    const state = currentState();
    expect(state.sites).toHaveLength(50);
    expect(roleSites(state, "site-owner")).toHaveLength(6);
    const hidden = siteFrom(state, "preview-07");
    const view = render(<OwnerSitesView onOpen={vi.fn()} onEdit={vi.fn()} onNew={vi.fn()} />);
    expect(screen.getByText(/6 owner-visible sites/i)).toBeInTheDocument();
    expect(screen.queryByText(hidden.name)).not.toBeInTheDocument();
    view.rerender(<OwnerInboxView onOpen={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.queryByText(hidden.name)).not.toBeInTheDocument();
    view.rerender(<DocumentsView role="site-owner" onOpen={vi.fn()} />);
    expect(screen.getByText("All 6 permitted fictional projects")).toBeInTheDocument();
    expect(screen.queryByText(hidden.name)).not.toBeInTheDocument();
  });

  it("routes the canonical project/request and ignores stale outstanding text", () => {
    const site: Site = {
      ...makeDraft(), id: "request-site", name: "Fictional request site",
      outstanding: ["Obsolete list-only request"],
      tasks: [{ id: "request-ownership", title: "Confirm this site's control", kind: "evidence", status: "requested", documentKind: "ownership", requiredForStage: null, note: "A project-specific request." }],
    };
    dispatch({ type: "save-site", site });
    const onDocuments = vi.fn();
    const onOpen = vi.fn();
    const view = render(<OwnerInboxView onEdit={vi.fn()} onOpen={onOpen} onDocuments={onDocuments} />);
    const request = screen.getByRole("article", { name: "Fictional request site: Confirm this site's control" });
    fireEvent.click(within(request).getByRole("button", { name: "Open requested documents" }));
    expect(onDocuments).toHaveBeenCalledWith("request-site", "request-ownership");
    expect(screen.queryByText("Obsolete list-only request")).not.toBeInTheDocument();

    view.rerender(<OwnerInboxView onEdit={vi.fn()} onOpen={onOpen} />);
    fireEvent.click(within(screen.getByRole("article", { name: "Fictional request site: Confirm this site's control" })).getByRole("button", { name: "View request in project" }));
    expect(onOpen).toHaveBeenCalledWith(site.id);
  });

  it("separates minimal historical owner interest notices from publication and private investor events", () => {
    render(<OwnerInboxView onEdit={vi.fn()} onOpen={vi.fn()} />);
    const noticeArea = screen.getByRole("region", { name: "Owner interest notices" });
    expect(within(noticeArea).getByText("No owner interest notices have been recorded.")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Next step: Sweet Auburn rooftop" })).getByText("Published in demo portfolio")).toBeInTheDocument();

    act(() => { dispatch({ type: "interest", id: "sweet-auburn" }); dispatch({ type: "interest", id: "sweet-auburn" }); });
    expect(within(noticeArea).getAllByText("An investor expressed nonbinding interest in this fictional project.")).toHaveLength(1);
    expect(screen.queryByText("Interest expressed")).not.toBeInTheDocument();
    act(() => { dispatch({ type: "withdraw", id: "sweet-auburn" }); });
    expect(within(noticeArea).getAllByText("An investor expressed nonbinding interest in this fictional project.")).toHaveLength(1);
    expect(screen.queryByText("Interest withdrawn")).not.toBeInTheDocument();

    const state = currentState();
    siteFrom(state, "sweet-auburn").activity.push({
      id: "private-investor-event", at: "2026-09-19T12:00:00.000Z", actor: "investor", kind: "interest", scope: "investor",
      title: "Private Investor Identity", detail: "private-investor@example.invalid offered $987654",
    });
    restoreScenario(state);
    expect(screen.queryByText(/Private Investor Identity|private-investor@example|987654/)).not.toBeInTheDocument();
  });
});

describe("selected document requests and metadata", () => {
  it("scopes documents and report navigation to the selected project and task", () => {
    const site = siteFrom(currentState(), "east-point");
    const task = projectTasks(site)[0];
    if (!task) throw new Error("Expected the seeded evidence request.");
    dispatch({ type: "document", id: site.id, actor: "site-owner", document: documentFixture({ taskId: task.id }) });
    dispatch({ type: "document", id: site.id, actor: "site-owner", document: documentFixture({ id: "another-request-doc", name: "Different request.pdf", taskId: "different-request" }) });
    const onOpen = vi.fn();
    const onDraft = vi.fn();
    render(<DocumentsView role="site-owner" siteId={site.id} taskId={task.id} onOpen={onOpen} onDraft={onDraft} />);
    expect(screen.getByText("Fictional evidence.pdf")).toBeInTheDocument();
    expect(screen.queryByText("Different request.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText("Example electricity bill.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText("West End community canopy")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.click(screen.getByRole("button", { name: "Drafts & reports" }));
    expect(onOpen).toHaveBeenCalledWith(site.id);
    expect(onDraft).toHaveBeenCalledWith(site.id);
  });

  it("does not fall back to unrelated projects or documents for unavailable scope", () => {
    const view = render(<DocumentsView role="site-owner" siteId="preview-07" onOpen={vi.fn()} />);
    expect(screen.getByText("Project unavailable in this view")).toBeInTheDocument();
    expect(screen.queryByText("Preliminary site summary.pdf")).not.toBeInTheDocument();
    view.rerender(<DocumentsView role="site-owner" siteId="east-point" taskId="task-from-another-site" onOpen={vi.fn()} />);
    expect(screen.getByText("Document request unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Example electricity bill.pdf")).not.toBeInTheDocument();
    view.rerender(<DocumentsView role="site-owner" taskId="task-east-point-0" onOpen={vi.fn()} />);
    expect(screen.getByText("Document request unavailable")).toBeInTheDocument();
  });

  it("adds immediately unreviewed, request-linked metadata without reading bytes or completing anything", () => {
    const before = siteFrom(currentState(), "east-point");
    const task = projectTasks(before)[0];
    if (!task) throw new Error("Expected an evidence task.");
    render(<DocumentsView role="site-owner" siteId={before.id} taskId={task.id} onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add metadata" }));
    const dialog = screen.getByRole("dialog", { name: "Add document metadata" });
    expect(within(dialog).getByLabelText(/Link to project request/i)).toHaveValue(task.id);
    fireEvent.change(within(dialog).getByLabelText(/choose a file/i), { target: { files: [fictionalFile()] } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add metadata" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const after = siteFrom(currentState(), before.id);
    expect(after.documents.at(-1)).toMatchObject({ name: "Fictional evidence.pdf", taskId: task.id, version: 1, review: "unreviewed", disclosure: "owner_private" });
    expect(after.tasks).toEqual(before.tasks);
    expect(after.acknowledgement).toBeNull();
    expect(after.status).toBe(before.status);
    expect(after.stage).toBe(before.stage);
    expect(JSON.stringify(after)).not.toContain("CONTENT_MUST_NOT_BE_STORED");
    const snapshot = currentState();
    fireEvent.click(screen.getByText("Inspect metadata"));
    expect(currentState()).toEqual(snapshot);
    expect(screen.queryByRole("button", { name: /download|demo copy|review metadata/i })).not.toBeInTheDocument();
  });

  it("keeps version lineage, private audience, and old review while a replacement starts unreviewed", () => {
    dispatch({ type: "document-review", id: "sweet-auburn", documentId: "bill-sweet-auburn" });
    const before = siteFrom(currentState(), "sweet-auburn");
    render(<DocumentsView role="site-owner" siteId={before.id} onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add version of Example electricity bill.pdf" }));
    const dialog = screen.getByRole("dialog", { name: "Add a metadata version" });
    expect(within(dialog).getByRole("radio", { name: /Private metadata/i })).toBeChecked();
    expect(within(dialog).getByRole("radio", { name: /Shareable representation/i })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/choose a file/i), { target: { files: [fictionalFile("Corrected bill.pdf")] } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add metadata" }));
    const after = siteFrom(currentState(), before.id);
    expect(after.documents.at(-1)).toMatchObject({ name: "Corrected bill.pdf", replacesId: "bill-sweet-auburn", kind: "electricity_bill", version: 2, review: "unreviewed", disclosure: "owner_private" });
    expect(after.documents.at(-1)?.reviewedAt).toBeUndefined();
    expect(after.documents.find((doc) => doc.id === "bill-sweet-auburn")?.review).toBe("reviewed");
    expect(after.tasks).toEqual(before.tasks);
    expect(after.acknowledgement).toBeNull();
    expect(screen.getByText("Superseded metadata")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add version of Example electricity bill.pdf" })).not.toBeInTheDocument();
  });

  it("does not silently broaden a replacement audience if its source changes mid-edit", () => {
    render(<DocumentsView role="site-owner" siteId="sweet-auburn" onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add version of Example electricity bill.pdf" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/choose a file/i), { target: { files: [fictionalFile("Private replacement.pdf")] } });
    const state = currentState();
    const site = siteFrom(state, "sweet-auburn");
    const bill = site.documents.find((doc) => doc.id === "bill-sweet-auburn");
    if (!bill) throw new Error("Expected a seeded bill.");
    bill.disclosure = "investor_tier_1";
    restoreScenario(state);
    fireEvent.click(within(dialog).getByRole("button", { name: "Add metadata" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("audience changed while this form was open");
    expect(siteFrom(currentState(), site.id).documents).toHaveLength(site.documents.length);
    expect(screen.queryByRole("article", { name: "Document metadata: Private replacement.pdf" })).not.toBeInTheDocument();
  });

  it.each([
    ["unsupported extension", "Fictional evidence.txt", "text/plain", 12, /not a supported type/i],
    ["mismatched MIME", "Fictional evidence.pdf", "image/png", 12, /does not match/i],
    ["empty file", "Fictional evidence.pdf", "application/pdf", 0, /appears to be empty/i],
    ["oversized metadata", "Fictional evidence.pdf", "application/pdf", 10 * 1024 * 1024 + 1, /10,485,760 bytes/i],
  ] as const)("rejects %s without saving a metadata record", (_case, name, type, size, message) => {
    const before = currentState();
    render(<DocumentsView role="site-owner" siteId="east-point" onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add metadata" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/choose a file/i), { target: { files: [fictionalFile(name, type, size)] } });
    expect(within(dialog).getByRole("alert")).toHaveTextContent(message);
    expect(within(dialog).getByRole("button", { name: "Add metadata" })).toBeDisabled();
    expect(currentState()).toEqual(before);
  });

  it("accepts DOCX metadata at the exact displayed limit through the drop alternative", () => {
    render(<DocumentsView role="site-owner" siteId="east-point" onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add metadata" }));
    const dialog = screen.getByRole("dialog");
    const file = fictionalFile("Fictional authority.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 10 * 1024 * 1024);
    fireEvent.drop(within(dialog).getByLabelText(/choose a file/i), { dataTransfer: { files: [file] } });
    expect(within(dialog).getByRole("button", { name: "Add metadata" })).toBeEnabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add metadata" }));
    expect(siteFrom(currentState(), "east-point").documents.at(-1)).toMatchObject({ name: file.name, size: 10485760, review: "unreviewed" });
  });

  it("requires an explicit non-sensitive representation choice before sharing metadata", () => {
    render(<DocumentsView role="site-owner" siteId="sweet-auburn" onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add metadata" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/choose a file/i), { target: { files: [fictionalFile("Fictional redacted summary.pdf")] } });
    fireEvent.click(within(dialog).getByRole("radio", { name: /Shareable representation/i }));
    expect(within(dialog).getByRole("button", { name: "Add metadata" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /fictional, non-sensitive copy/i }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add metadata" }));
    expect(siteFrom(currentState(), "sweet-auburn").documents.at(-1)).toMatchObject({ disclosure: "investor_tier_1", review: "unreviewed" });
    expect(siteFrom(currentState(), "sweet-auburn").documents.find((doc) => doc.id === "bill-sweet-auburn")?.disclosure).toBe("owner_private");
  });

  it("discards unsaved modal context on a project or role change", () => {
    const before = currentState();
    const view = render(<DocumentsView role="site-owner" siteId="east-point" onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add metadata" }));
    fireEvent.change(within(screen.getByRole("dialog")).getByLabelText(/choose a file/i), { target: { files: [fictionalFile("Unsaved private selection.pdf")] } });
    view.rerender(<DocumentsView role="site-owner" siteId="west-end" onOpen={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(/Unsaved private selection/i)).not.toBeInTheDocument();
    expect(screen.queryByText("East Point neighborhood lot")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add metadata" }));
    view.rerender(<DocumentsView role="investor" siteId="west-end" onOpen={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add metadata" })).not.toBeInTheDocument();
    expect(currentState()).toEqual(before);
  });

  it("uses legacy task and version defaults without acknowledging or reviewing on open", () => {
    const state = createSeed();
    const site = siteFrom(state, "east-point");
    delete site.tasks;
    render(<DocumentsView role="site-owner" siteId={site.id} onOpen={vi.fn()} />);
    restoreScenario(state);
    expect(screen.getByRole("article", { name: "Request: Provide proof of site ownership" })).toBeInTheDocument();
    expect(screen.getAllByText("Version 1 (legacy)")).toHaveLength(2);
    expect(screen.getAllByText("Unreviewed metadata")).toHaveLength(2);
    expect(currentState()).toEqual(state);
  });

  it("shows operator metadata and task review results read-only to the owner", () => {
    const site = siteFrom(currentState(), "east-point");
    const task = projectTasks(site)[0];
    if (!task) throw new Error("Expected an evidence request.");
    const doc = documentFixture({ taskId: task.id });
    dispatch({ type: "document", id: site.id, actor: "site-owner", document: doc });
    dispatch({ type: "document-review", id: site.id, documentId: doc.id });
    dispatch({ type: "task-review", id: site.id, taskId: task.id, note: "Fictional metadata reviewed separately from contents." });
    const before = currentState();
    render(<DocumentsView role="site-owner" siteId={site.id} taskId={task.id} onOpen={vi.fn()} />);
    expect(screen.getByText("Operator-reviewed task (demo)")).toBeInTheDocument();
    expect(screen.getByText("Metadata reviewed (demo)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /review metadata|mark reviewed|approve/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Inspect metadata"));
    expect(currentState()).toEqual(before);
  });
});

describe("owner documents privacy", () => {
  it("shows owner-private files to the owner but never to an investor", () => {
    const { unmount } = render(<DocumentsView role="site-owner" onOpen={vi.fn()} />);
    expect(screen.getAllByText(/Example electricity bill\.pdf/i).length).toBeGreaterThan(0);
    unmount();

    render(<DocumentsView role="investor" onOpen={vi.fn()} />);
    expect(screen.queryByText(/Example electricity bill\.pdf/i)).toBeNull();
    expect(screen.getByText("Sweet Auburn rooftop")).toBeInTheDocument();
  });

  it("redacts private filenames, request links, acknowledgements, and lineage for investors", () => {
    dispatch({ type: "interest", id: "sweet-auburn" });
    const state = currentState();
    const site = siteFrom(state, "sweet-auburn");
    const summary = site.documents.find((doc) => doc.id === "summary-sweet-auburn");
    const bill = site.documents.find((doc) => doc.id === "bill-sweet-auburn");
    if (!summary || !bill) throw new Error("Expected seeded document metadata.");
    bill.name = "PRIVATE bank-account evidence.pdf";
    summary.replacesId = bill.id;
    summary.taskId = "private-request";
    site.tasks = [{ id: "private-request", title: "PRIVATE bank request", note: "PRIVATE account details", kind: "evidence", status: "requested", documentKind: "electricity_bill", requiredForStage: null }];
    site.acknowledgement = { name: "PRIVATE owner name", at: "2026-09-18T12:00:00.000Z" };
    const view = render(<DocumentsView role="investor" siteId={site.id} onOpen={vi.fn()} onDraft={vi.fn()} />);
    restoreScenario(state);
    expect(screen.getByText("Preliminary site summary.pdf")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Inspect metadata"));
    expect(screen.queryByText(/PRIVATE/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add metadata|add version|acknowledge|download|demo copy/i })).not.toBeInTheDocument();
    expect(currentState()).toEqual(state);

    view.rerender(<DocumentsView role="investor" siteId={site.id} taskId="private-request" onOpen={vi.fn()} />);
    expect(screen.getByText("Document request unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/PRIVATE/)).not.toBeInTheDocument();
  });

  it("removes shared metadata immediately after withdrawal or unpublication", () => {
    dispatch({ type: "interest", id: "sweet-auburn" });
    render(<DocumentsView role="investor" siteId="sweet-auburn" onOpen={vi.fn()} onDraft={vi.fn()} />);
    expect(screen.getByText("Preliminary site summary.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Drafts & reports" })).toBeInTheDocument();
    act(() => { dispatch({ type: "withdraw", id: "sweet-auburn" }); });
    expect(screen.queryByText("Preliminary site summary.pdf")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Drafts & reports" })).not.toBeInTheDocument();
    expect(screen.getByText("Interest needed for shared metadata")).toBeInTheDocument();

    act(() => { dispatch({ type: "visibility", id: "sweet-auburn", visible: false }); });
    expect(screen.getByText("Project unavailable in this view")).toBeInTheDocument();
    expect(screen.queryByText("Sweet Auburn rooftop")).not.toBeInTheDocument();
  });
});
