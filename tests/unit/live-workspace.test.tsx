import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WS2_CONTRACT_REVISION } from "@/domain/connections";
import type { LiveReadConfiguration } from "@/domain/live-configuration";
import type * as LiveReadModule from "@/features/live-read";
import type { InvestorSnapshot, LiveExportManifest, LiveReadClient, LiveSnapshot, OwnerDetail, OwnerSnapshot, ReadDownload, ReadRecord, ReadResult } from "@/features/live-read";
import { LiveWorkspace } from "@/features/live-workspace";
import { workspaceContext } from "@/features/live-workspace/navigation";
import { compareSourceTimes, INITIAL_COLLECTION, selectReadRecords } from "@/features/live-workspace/presentation";

const mocks = vi.hoisted(() => ({
  factory: vi.fn(),
  snapshot: vi.fn<LiveReadClient["readSnapshot"]>(),
  detail: vi.fn<LiveReadClient["readDetail"]>(),
  identity: vi.fn<LiveReadClient["readIdentity"]>(),
  document: vi.fn<LiveReadClient["readDocument"]>(),
  exported: vi.fn<LiveReadClient["readExport"]>(),
  invalidate: vi.fn(),
  createURL: vi.fn<(blob: Blob) => string>(),
  revokeURL: vi.fn<(url: string) => void>(),
  click: vi.fn(),
}));
vi.mock("@/features/live-read", async (importOriginal) => ({
  ...await importOriginal<typeof LiveReadModule>(),
  createLiveReadClient: mocks.factory,
}));

const configuration: LiveReadConfiguration = {
  canAttemptReads: true, canAttemptExports: false, canAttemptDocumentDownloads: false,
  apiBasePath: "/api", source: "database-configured", reason: "Synthetic test admission only.",
};
const scope = { userId: "fixture-owner", role: "site-owner", generation: 1 } as const;
const provenance = {
  source: "WS2", contractRevision: WS2_CONTRACT_REVISION, deployedRevision: null,
  retrievedAt: "2026-09-20T16:00:00Z", operations: [],
} as const;
const identity = {
  userId: scope.userId, role: scope.role, onboarded: null,
  investorId: null, organizationName: null, scope, provenance,
} as const;

function record(index: number, changes: Partial<ReadRecord> = {}): ReadRecord {
  return {
    id: `fixture-site-${index}`, siteId: `fixture-site-${index}`, projectId: null,
    name: `Contract roof ${String(index).padStart(2, "0")}`, locality: "Fictional locality",
    siteType: "rooftop", submissionStatus: "submitted", projectStage: null, journeyStageId: "submitted",
    viabilityStatus: null, estimatedCapacityKw: null,
    estimatedSystemSizeKw: { low: null, high: null, unit: "kW" },
    estimatedAnnualGenerationKwh: { low: null, high: null, unit: "kWh/year" },
    preliminaryProjectType: null, engagementState: null, openFundingNeedsCount: null,
    updatedAt: null, detail: { kind: "owner-site", siteId: `fixture-site-${index}` }, ...changes,
  };
}
function snapshot(records = Array.from({ length: 50 }, (_, index) => record(index))): OwnerSnapshot {
  return {
    role: "site-owner", identity, scope, provenance, completeness: "complete", records, sites: records,
    summary: { recordCount: records.length, projectCount: null, totalEstimatedCapacityKw: null, mandateMatch: null },
    outstanding: { ok: true, data: [] },
  };
}
function detail(selected = record(0)): OwnerDetail {
  if (selected.siteId === null) throw new Error("An owner detail fixture needs a site ID.");
  return {
    role: "site-owner", kind: "owner-site", identity, scope, provenance, record: selected,
    completeness: "complete",
    site: {
      id: selected.siteId, ownerUserId: scope.userId, address: null, latitude: null, longitude: null,
      geocodeConfidence: null, siteType: "rooftop", ownershipStatus: null, approximateAreaSqm: null,
      electricityUsageKwhAnnual: null, hasExistingSolar: null, consentGivenAt: null,
      submissionStatus: "submitted", createdAt: null, updatedAt: null,
    },
    project: null, owner: null, contact: null, outstanding: null, acknowledgements: null,
    assessments: { current: null, original: null, human: null, entries: [], completeness: "unavailable" },
    documents: [], activity: null,
  };
}
function detailWithOriginal(): OwnerDetail {
  return { ...detail(), documents: [{
    id: "fixture-file", fileName: "fixture.pdf", contentType: "application/pdf", sizeBytes: 3,
    docType: "evidence", createdAt: null, disclosure: "owner-operator", siteId: "fixture-site-0",
    projectId: null, disclosureClass: "private", uploadedByUserId: null,
    download: { siteId: "fixture-site-0", documentId: "fixture-file", fileName: "fixture.pdf",
      contentType: "application/pdf", sizeBytes: 3 },
  }] };
}
function manifest(): LiveExportManifest {
  return {
    identity, scope, provenance, scopeLabel: "Synthetic export scope A", generatedAt: null,
    reportedProjectCount: 0, reportedDocumentCount: 0, projects: [], documents: [],
  };
}
function original(): ReadDownload {
  return {
    fileName: "fixture.pdf", contentType: "application/pdf", sizeBytes: 3,
    blob: new Blob(["pdf"], { type: "application/pdf" }), provenance,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createURL.mockImplementation(() => `blob:fixture-download-${mocks.createURL.mock.calls.length}`);
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = mocks.createURL;
    static revokeObjectURL = mocks.revokeURL;
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(mocks.click);
  window.history.replaceState(null, "", "/app");
  mocks.snapshot.mockResolvedValue({ ok: true, data: snapshot() });
  mocks.detail.mockResolvedValue({ ok: true, data: detail() });
  mocks.factory.mockReturnValue({ ok: true, data: {
    readSnapshot: mocks.snapshot, readDetail: mocks.detail, readIdentity: mocks.identity,
    readDocument: mocks.document, readExport: mocks.exported, invalidate: mocks.invalidate,
  } satisfies LiveReadClient });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("mocked frontend read workspace (not real service access)", () => {
  it("leaves browser-origin client creation until hydration", () => {
    const html = renderToString(<LiveWorkspace configuration={configuration} initialHref="/app" />);
    expect(html).toContain("Reading your permitted workspace");
    expect(mocks.factory).not.toHaveBeenCalled();
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });

  it("does not construct a client or call a reader while configuration is unadmitted", async () => {
    render(<LiveWorkspace configuration={{ ...configuration, canAttemptReads: false }} initialHref="/app" />);
    expect(await screen.findByRole("heading", { name: "Your service connection is out of reach right now" })).toBeInTheDocument();
    expect(mocks.factory).not.toHaveBeenCalled();
    expect(mocks.snapshot).not.toHaveBeenCalled();
    expect(Object.keys(localStorage).some((key) => key.startsWith("sunsum-design-lab"))).toBe(false);
  });

  it("loads one role and offers no client-side grant or workflow write", async () => {
    render(<LiveWorkspace configuration={configuration} initialHref="/app?role=operator" />);
    await screen.findByRole("heading", { level: 1, name: "Your sites, in context" });
    expect(screen.getByRole("radio", { name: "Site owner" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Operator" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Investor" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Records per page" })).toHaveValue("25");
    expect(screen.getByText("1-25 of 50 matching loaded records")).toBeInTheDocument();
    expect(mocks.document).not.toHaveBeenCalled();
    expect(mocks.exported).not.toHaveBeenCalled();
  });

  it("preserves list state and the focus target when returning from reports", async () => {
    render(<LiveWorkspace configuration={configuration} initialHref="/app?view=sites" />);
    const search = await screen.findByRole("textbox", { name: "Search permitted records" });
    fireEvent.change(search, { target: { value: "Contract roof" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Records per page" }), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Cards" }));
    search.focus();
    fireEvent.focus(search);
    fireEvent.click(within(screen.getByRole("navigation", { name: "Connected workspace" })).getByRole("button", { name: "Reports" }));
    await screen.findByRole("heading", { name: "One clearly scoped manifest" });
    expect(screen.queryByRole("textbox", { name: "Search permitted records" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to collection" }));
    expect(await screen.findByRole("textbox", { name: "Search permitted records" })).toHaveValue("Contract roof");
    expect(screen.getByRole("combobox", { name: "Records per page" })).toHaveValue("50");
    expect(screen.getByRole("button", { name: "Cards" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(search).toHaveFocus());
    expect(mocks.exported).not.toHaveBeenCalled();
  });

  it("restores selected-record focus when browser history returns from related views", async () => {
    window.history.replaceState(null, "", "/app?view=sites");
    mocks.detail.mockResolvedValue({ ok: true, data: detail(record(1)) });
    render(<LiveWorkspace configuration={configuration} initialHref="/app?view=sites" />);
    const selected = await screen.findByRole("button", { name: "Select Contract roof 01" });
    fireEvent.click(selected);
    const open = screen.getByRole("button", { name: "Open Contract roof 01" });
    open.focus();
    fireEvent.click(open);
    await screen.findByRole("region", { name: "Stored record detail" });
    const navigation = within(screen.getByRole("navigation", { name: "Connected workspace" }));
    for (const name of ["Documents", "Reports"]) {
      const control = navigation.getByRole("button", { name });
      control.focus();
      fireEvent.click(control);
    }
    await screen.findByRole("heading", { name: "One clearly scoped manifest" });
    act(() => { window.history.go(-3); });
    await screen.findByRole("heading", { level: 1, name: "Read your sites" });
    expect(selected).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(open).toHaveFocus());
    const search = screen.getByRole("textbox", { name: "Search permitted records" });
    search.focus();
    fireEvent.click(screen.getByRole("button", { name: "Refresh permitted reads" }));
    await waitFor(() => expect(mocks.snapshot).toHaveBeenCalledTimes(2));
    // An explicit identity recheck retires the subtree, not another history return.
    expect(search).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Open Contract roof 01" })).not.toHaveFocus();
  });

  it("restores the historical selected record rather than a more recently opened record", async () => {
    window.history.replaceState(null, "", "/app?view=sites");
    render(<LiveWorkspace configuration={configuration} initialHref="/app?view=sites" />);
    await screen.findByRole("heading", { level: 1, name: "Read your sites" });
    for (const index of [1, 2]) {
      mocks.detail.mockResolvedValue({ ok: true, data: detail(record(index)) });
      const name = `Contract roof 0${index}`;
      fireEvent.click(screen.getByRole("button", { name: `Select ${name}` }));
      const open = screen.getByRole("button", { name: `Open ${name}` });
      open.focus();
      fireEvent.click(open);
      await screen.findByRole("region", { name: "Stored record detail" });
      const documents = within(screen.getByRole("navigation", { name: "Connected workspace" }))
        .getByRole("button", { name: "Documents" });
      documents.focus();
      fireEvent.click(documents);
      await screen.findByRole("region", { name: "Permitted document metadata" });
      if (index === 1) {
        fireEvent.click(screen.getByRole("button", { name: "Back to collection" }));
        await screen.findByRole("heading", { level: 1, name: "Read your sites" });
      }
    }
    act(() => { window.history.go(-6); });
    await screen.findByRole("heading", { level: 1, name: "Read your sites" });
    expect(screen.getByRole("button", { name: "Select Contract roof 01" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(screen.getByRole("button", { name: "Open Contract roof 01" })).toHaveFocus());
  });

  it("keeps a deep-linked record selected across documents, activity and collection return", async () => {
    mocks.detail.mockResolvedValue({ ok: true, data: detailWithOriginal() });
    render(<LiveWorkspace configuration={configuration} initialHref="/app?view=sites&project=fixture-site-0" />);
    await screen.findByRole("region", { name: "Stored record detail" });
    await screen.findByText("fixture.pdf");
    const navigation = within(screen.getByRole("navigation", { name: "Connected workspace" }));
    fireEvent.click(navigation.getByRole("button", { name: "Documents" }));
    const documents = await screen.findByRole("region", { name: "Permitted document metadata" });
    await waitFor(() => expect(documents).toHaveTextContent("fixture.pdf"));
    expect(new URLSearchParams(window.location.search).get("scope")).toBe("fixture-site-0");
    expect(new URLSearchParams(window.location.search).has("project")).toBe(false);
    const reads = mocks.detail.mock.calls.length;
    fireEvent.click(navigation.getByRole("button", { name: "Documents" }));
    expect(documents).toHaveTextContent("fixture.pdf");
    expect(mocks.detail).toHaveBeenCalledTimes(reads);
    fireEvent.click(navigation.getByRole("button", { name: "Activity" }));
    await screen.findByRole("region", { name: "Permitted record activity" });
    fireEvent.click(screen.getByRole("button", { name: "Back to collection" }));
    expect(await screen.findByRole("button", { name: "Select Contract roof 00" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("heading", { name: "Choose a permitted record first" })).not.toBeInTheDocument();
  });

  it("removes permitted data on a denied refresh instead of introducing fixtures", async () => {
    mocks.snapshot.mockResolvedValueOnce({ ok: true, data: snapshot([record(0)]) })
      .mockResolvedValueOnce({ ok: false, error: { kind: "unauthenticated", message: "Session expired.",
        status: 401, code: "unauthenticated", connectionId: null } });
    render(<LiveWorkspace configuration={configuration} initialHref="/app" />);
    await screen.findByText("Contract roof 00");
    fireEvent.click(screen.getByRole("button", { name: "Refresh permitted reads" }));
    await screen.findByText("Your existing service sign-in is needed");
    expect(screen.queryByText("Contract roof 00")).not.toBeInTheDocument();
    expect(screen.queryByText("Sweet Auburn rooftop")).not.toBeInTheDocument();
  });

  it("ignores a late aborted snapshot and does not recover retired identity data", async () => {
    let finish: ((value: ReadResult<LiveSnapshot>) => void) | undefined;
    mocks.snapshot.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { unmount } = render(<LiveWorkspace configuration={configuration} initialHref="/app" />);
    await waitFor(() => expect(mocks.snapshot).toHaveBeenCalledTimes(1));
    const signal = mocks.snapshot.mock.calls[0]?.[0]?.signal;
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => { finish?.({ ok: true, data: snapshot([record(0)]) }); });
    expect(screen.queryByText("Contract roof 00")).not.toBeInTheDocument();
  });

  it("keeps only the new identity and role when an old snapshot resolves after a mounted refresh", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(100_000);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const oldRead = Promise.withResolvers<ReadResult<LiveSnapshot>>();
    const nextScope = { userId: "fixture-investor-b", role: "investor", generation: 2 } as const;
    const nextRecord = record(1, {
      name: "Current investor roof", siteId: null, projectId: "fixture-project-b",
      detail: { kind: "deal-room", projectId: "fixture-project-b" },
    });
    const current: InvestorSnapshot = {
      role: "investor", scope: nextScope, provenance,
      identity: { ...identity, userId: nextScope.userId, role: "investor", investorId: "fixture-investor",
        scope: nextScope },
      completeness: "partial", records: [nextRecord],
      summary: { recordCount: 1, projectCount: 1, totalEstimatedCapacityKw: null, mandateMatch: null },
      profile: { ok: false, error: { kind: "unavailable", message: "Fixture profile unavailable.",
        status: null, code: null, connectionId: null } },
      engagements: { ok: true, data: [] },
    };
    mocks.snapshot.mockImplementationOnce(() => oldRead.promise).mockResolvedValueOnce({ ok: true, data: current });
    render(<LiveWorkspace configuration={configuration} initialHref="/app" />);
    await waitFor(() => expect(mocks.snapshot).toHaveBeenCalledTimes(1));
    const oldSignal = mocks.snapshot.mock.calls[0]?.[0]?.signal;
    clock.mockReturnValue(115_000);
    act(() => { window.dispatchEvent(new Event("focus")); });
    await screen.findByText("Current investor roof");
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => { oldRead.resolve({ ok: true, data: snapshot([record(0)]) }); });
    expect(screen.getByRole("radio", { name: "Investor" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Site owner" })).toBeDisabled();
    expect(screen.getByText("Current investor roof")).toBeInTheDocument();
    expect(screen.queryByText("Contract roof 00")).not.toBeInTheDocument();
  });

  it("bounds focus refreshes and fences a replaced in-flight snapshot without unmounting", async () => {
    let time = 100_000;
    vi.spyOn(Date, "now").mockImplementation(() => time);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const oldRead = Promise.withResolvers<ReadResult<LiveSnapshot>>();
    mocks.snapshot.mockImplementationOnce(() => oldRead.promise)
      .mockResolvedValueOnce({ ok: true, data: snapshot([record(1)]) });
    render(<LiveWorkspace configuration={configuration} initialHref="/app" />);
    await waitFor(() => expect(mocks.snapshot).toHaveBeenCalledTimes(1));
    act(() => { window.dispatchEvent(new Event("focus")); });
    expect(mocks.snapshot).toHaveBeenCalledTimes(1);
    time += 15_000;
    act(() => { window.dispatchEvent(new Event("focus")); });
    await screen.findByText("Contract roof 01");
    expect(mocks.snapshot.mock.calls[0]?.[0]?.signal?.aborted).toBe(true);
    await act(async () => { oldRead.resolve({ ok: true, data: snapshot([record(0)]) }); });
    expect(screen.getByText("Contract roof 01")).toBeInTheDocument();
    expect(screen.queryByText("Contract roof 00")).not.toBeInTheDocument();
  });

  it("discards late detail after history navigation to a different record", async () => {
    let finish: ((value: ReadResult<OwnerDetail>) => void) | undefined;
    mocks.detail.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
      .mockResolvedValueOnce({ ok: true, data: detail(record(1)) });
    render(<LiveWorkspace configuration={configuration} initialHref="/app?view=sites&project=fixture-site-0" />);
    await waitFor(() => expect(mocks.detail).toHaveBeenCalledTimes(1));
    const signal = mocks.detail.mock.calls[0]?.[1]?.signal;
    act(() => {
      window.history.pushState(null, "", "/app?view=sites&project=fixture-site-1");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await waitFor(() => expect(mocks.detail).toHaveBeenCalledTimes(2));
    expect(signal?.aborted).toBe(true);
    expect(await screen.findByRole("heading", { level: 1, name: "Contract roof 01" })).toBeInTheDocument();
    await act(async () => { finish?.({ ok: true, data: detail(record(0)) }); });
    expect(screen.getByRole("heading", { level: 1, name: "Contract roof 01" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Stored record detail" })).queryByText("Contract roof 00")).not.toBeInTheDocument();
  });

  it("keeps original disclosure independently off even when metadata is permitted", async () => {
    mocks.detail.mockResolvedValueOnce({ ok: true, data: detailWithOriginal() });
    render(<LiveWorkspace configuration={configuration} initialHref="/app?view=sites&project=fixture-site-0" />);
    await screen.findByText("fixture.pdf");
    fireEvent.click(screen.getByText("File history and original"));
    expect(screen.queryByRole("button", { name: "Download original: fixture.pdf" })).not.toBeInTheDocument();
    expect(mocks.document).not.toHaveBeenCalled();
  });

  it("cancels a late original when closing detail while retaining the same collection selection", async () => {
    let finish: ((value: ReadResult<ReadDownload>) => void) | undefined;
    mocks.document.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    mocks.detail.mockResolvedValueOnce({ ok: true, data: detailWithOriginal() });
    render(<LiveWorkspace configuration={{ ...configuration, canAttemptDocumentDownloads: true }}
      initialHref="/app?view=sites&project=fixture-site-0&scope=fixture-site-0" />);
    await screen.findByText("fixture.pdf");
    fireEvent.click(screen.getByText("File history and original"));
    fireEvent.click(screen.getByRole("button", { name: "Download original: fixture.pdf" }));
    await waitFor(() => expect(mocks.document).toHaveBeenCalledTimes(1));
    const signal = mocks.document.mock.calls[0]?.[1].signal;
    fireEvent.click(screen.getByRole("button", { name: "Back to collection" }));
    expect(signal?.aborted).toBe(true);
    await act(async () => { finish?.({ ok: true, data: {
      fileName: "fixture.pdf", contentType: "application/pdf", sizeBytes: 3,
      blob: new Blob(["pdf"], { type: "application/pdf" }), provenance,
    } }); });
    expect(mocks.createURL).not.toHaveBeenCalled();
    expect(screen.queryByText("Reading the permitted original...")).not.toBeInTheDocument();
  });

  it.each(["close and reopen", "same-context history"] as const)(
    "retires pending originals during %s and permits a fresh download",
    async (navigation) => {
      const oldRead = Promise.withResolvers<ReadResult<ReadDownload>>();
      mocks.document.mockImplementationOnce(() => oldRead.promise).mockResolvedValueOnce({ ok: true, data: original() });
      mocks.detail.mockResolvedValue({ ok: true, data: detailWithOriginal() });
      render(<LiveWorkspace configuration={{ ...configuration, canAttemptDocumentDownloads: true }}
        initialHref="/app?view=sites&project=fixture-site-0&scope=fixture-site-0" />);
      await screen.findByText("fixture.pdf");
      fireEvent.click(screen.getByText("File history and original"));
      fireEvent.click(screen.getByRole("button", { name: "Download original: fixture.pdf" }));
      await waitFor(() => expect(mocks.document).toHaveBeenCalledTimes(1));
      if (navigation === "close and reopen") {
        fireEvent.click(screen.getByRole("button", { name: "Back to collection" }));
        fireEvent.click(screen.getByRole("button", { name: "Open Contract roof 00" }));
      } else act(() => {
        window.history.pushState(null, "", "/app?view=sites&project=fixture-site-0&scope=fixture-site-0");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      await screen.findByText("fixture.pdf");
      expect(mocks.document.mock.calls[0]?.[1].signal?.aborted).toBe(true);
      expect(screen.queryByText("Reading the permitted original...")).not.toBeInTheDocument();
      fireEvent.click(screen.getByText("File history and original"));
      const download = screen.getByRole("button", { name: "Download original: fixture.pdf" });
      expect(download).toBeEnabled();
      fireEvent.click(download);
      await waitFor(() => expect(mocks.createURL).toHaveBeenCalledTimes(1));
      await act(async () => { oldRead.resolve({ ok: true, data: original() }); });
      expect(mocks.createURL).toHaveBeenCalledTimes(1);
      expect(mocks.click).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["navigation", "unmount"] as const)("revokes actual hook object URLs on %s", async (retire) => {
    mocks.detail.mockResolvedValue({ ok: true, data: detailWithOriginal() });
    mocks.document.mockResolvedValue({ ok: true, data: original() });
    const { unmount } = render(<LiveWorkspace configuration={{ ...configuration, canAttemptDocumentDownloads: true }}
      initialHref="/app?view=sites&project=fixture-site-0" />);
    await screen.findByText("fixture.pdf");
    fireEvent.click(screen.getByText("File history and original"));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Download original: fixture.pdf" }));
    });
    expect(mocks.click).toHaveBeenCalledTimes(1);
    expect(mocks.revokeURL).not.toHaveBeenCalled();
    if (retire === "navigation") fireEvent.click(screen.getByRole("button", { name: "Back to collection" }));
    else unmount();
    expect(mocks.revokeURL).toHaveBeenCalledExactlyOnceWith("blob:fixture-download-1");
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(mocks.revokeURL).toHaveBeenCalledTimes(1);
    expect(document.querySelector("a[download]")).toBeNull();
  });

  it.each(["clear project", "same-context history", "different-context history"] as const)(
    "cancels a pending export on %s before any late save",
    async (navigation) => {
      const oldRead = Promise.withResolvers<ReadResult<LiveExportManifest>>();
      mocks.exported.mockResolvedValueOnce({ ok: true, data: manifest() })
        .mockImplementationOnce(() => oldRead.promise);
      render(<LiveWorkspace configuration={{ ...configuration, canAttemptExports: true }}
        initialHref="/app?view=reports&project=fixture-site-0&scope=fixture-site-0" />);
      await screen.findByRole("heading", { name: "One clearly scoped manifest" });
      fireEvent.click(screen.getByRole("button", { name: "Load permitted export preview" }));
      await screen.findByText("Synthetic export scope A");
      fireEvent.click(screen.getByRole("button", { name: "Refresh and download JSON" }));
      await waitFor(() => expect(mocks.exported).toHaveBeenCalledTimes(2));
      if (navigation === "clear project") {
        fireEvent.click(within(screen.getByRole("navigation", { name: "Connected workspace" }))
          .getByRole("button", { name: "Reports" }));
      } else act(() => {
        window.history.pushState(null, "", navigation === "same-context history"
          ? "/app?view=reports&project=fixture-site-0&scope=fixture-site-0"
          : "/app?view=reports&project=fixture-site-1&scope=fixture-site-1");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(mocks.exported.mock.calls[1]?.[0].signal?.aborted).toBe(true);
      await act(async () => { oldRead.resolve({ ok: true, data: manifest() }); });
      expect(mocks.createURL).not.toHaveBeenCalled();
      expect(mocks.click).not.toHaveBeenCalled();
      expect(screen.queryByText("Synthetic export scope A")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Load permitted export preview" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Refresh and download JSON" })).toBeDisabled();
    },
  );

  it.each(["detail", "original", "export"] as const)(
    "retires pending %s work while hidden and refreshes a new owner before returning",
    async (kind) => {
      const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
      const nextScope = { ...scope, userId: "fixture-owner-b", generation: 2 };
      const nextIdentity = { ...identity, userId: nextScope.userId, scope: nextScope };
      const nextRecord = record(0, { name: "Current owner roof" });
      const nextSnapshot = { ...snapshot([nextRecord]), identity: nextIdentity, scope: nextScope };
      const currentDetail = detail(nextRecord);
      const nextDetail: OwnerDetail = { ...currentDetail, identity: nextIdentity, scope: nextScope,
        site: { ...currentDetail.site, ownerUserId: nextScope.userId } };
      const delayedDetail = Promise.withResolvers<ReadResult<OwnerDetail>>();
      const delayedOriginal = Promise.withResolvers<ReadResult<ReadDownload>>();
      const delayedExport = Promise.withResolvers<ReadResult<LiveExportManifest>>();
      mocks.snapshot.mockResolvedValueOnce({ ok: true, data: snapshot() })
        .mockResolvedValue({ ok: true, data: nextSnapshot });
      if (kind === "detail") mocks.detail.mockImplementationOnce(() => delayedDetail.promise);
      else mocks.detail.mockResolvedValueOnce({ ok: true, data: detailWithOriginal() });
      mocks.detail.mockResolvedValue({ ok: true, data: nextDetail });
      mocks.document.mockImplementationOnce(() => delayedOriginal.promise);
      mocks.exported.mockResolvedValueOnce({ ok: true, data: manifest() })
        .mockImplementationOnce(() => delayedExport.promise);
      render(<LiveWorkspace configuration={{ ...configuration, canAttemptDocumentDownloads: true, canAttemptExports: true }}
        initialHref={kind === "export" ? "/app?view=reports" : "/app?view=sites&project=fixture-site-0"} />);
      if (kind === "detail") await waitFor(() => expect(mocks.detail).toHaveBeenCalledTimes(1));
      else if (kind === "original") {
        await screen.findByText("fixture.pdf");
        fireEvent.click(screen.getByText("File history and original"));
        fireEvent.click(screen.getByRole("button", { name: "Download original: fixture.pdf" }));
        await waitFor(() => expect(mocks.document).toHaveBeenCalledTimes(1));
      } else {
        await screen.findByRole("heading", { name: "One clearly scoped manifest" });
        fireEvent.click(screen.getByRole("button", { name: "Load permitted export preview" }));
        await screen.findByText("Synthetic export scope A");
        fireEvent.click(screen.getByRole("button", { name: "Refresh and download JSON" }));
        await waitFor(() => expect(mocks.exported).toHaveBeenCalledTimes(2));
      }
      const oldSignal = kind === "detail" ? mocks.detail.mock.calls[0]?.[1].signal :
        kind === "original" ? mocks.document.mock.calls[0]?.[1].signal : mocks.exported.mock.calls[1]?.[0].signal;
      act(() => {
        visibility.mockReturnValue("hidden");
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(oldSignal?.aborted).toBe(true);
      expect(screen.queryByText("Contract roof 00")).not.toBeInTheDocument();
      expect(screen.queryByText("fixture.pdf")).not.toBeInTheDocument();
      expect(screen.queryByText("Synthetic export scope A")).not.toBeInTheDocument();
      act(() => {
        visibility.mockReturnValue("visible");
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await waitFor(() => expect(mocks.snapshot).toHaveBeenCalledTimes(2));
      if (kind !== "export") await screen.findByRole("heading", { level: 1, name: "Current owner roof" });
      else await screen.findByRole("heading", { name: "One clearly scoped manifest" });
      await act(async () => {
        delayedDetail.resolve({ ok: true, data: detailWithOriginal() });
        delayedOriginal.resolve({ ok: true, data: original() });
        delayedExport.resolve({ ok: true, data: manifest() });
      });
      expect(mocks.createURL).not.toHaveBeenCalled();
      expect(screen.queryByText("Contract roof 00")).not.toBeInTheDocument();
      expect(screen.queryByText("fixture.pdf")).not.toBeInTheDocument();
      expect(screen.queryByText("Synthetic export scope A")).not.toBeInTheDocument();
    },
  );

  it("restores the collection origin belonging to an older history entry", async () => {
    window.history.replaceState({ fixtureFrameworkState: "retained" }, "", "/app?view=sites");
    render(<LiveWorkspace configuration={configuration} initialHref="/app?view=sites" />);
    await screen.findByRole("heading", { level: 1, name: "Read your sites" });
    const navigation = within(screen.getByRole("navigation", { name: "Connected workspace" }));
    fireEvent.click(navigation.getByRole("button", { name: "Documents" }));
    expect(window.history.state).toMatchObject({ fixtureFrameworkState: "retained", sunsumCollectionView: "sites" });
    fireEvent.click(navigation.getByRole("button", { name: "Overview" }));
    fireEvent.click(navigation.getByRole("button", { name: "Reports" }));
    expect(window.history.state.sunsumCollectionView).toBe("overview");
    act(() => { window.history.back(); });
    await screen.findByRole("heading", { level: 1, name: "Your sites, in context" });
    act(() => { window.history.back(); });
    await screen.findByRole("heading", { level: 1, name: "Documents, with the right context" });
    fireEvent.click(screen.getByRole("button", { name: "Back to collection" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Read your sites" })).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("view")).toBe("sites");
  });

  it("accepts only collection names from history and never treats history as role authority", () => {
    expect(workspaceContext("/app?role=operator", { sunsumCollectionView: "reports", role: "operator" }))
      .toEqual({ view: null, projectId: null, scopeId: null, taskId: null, collectionView: null });
    expect(workspaceContext("/app?view=documents", { sunsumCollectionView: "pipeline" }).collectionView)
      .toBe("pipeline");
  });
});

describe("read collection phase order", () => {
  it("orders canonical lifecycle phases in both directions with unknown last and stable ties", () => {
    const records = [
      record(4, { journeyStageId: null }), record(3, { journeyStageId: "operations" }),
      record(2, { journeyStageId: "submitted" }), record(1, { journeyStageId: "submitted" }),
    ];
    expect(selectReadRecords(records, INITIAL_COLLECTION).map((row) => row.id))
      .toEqual(["fixture-site-1", "fixture-site-2", "fixture-site-3", "fixture-site-4"]);
    expect(selectReadRecords(records, { ...INITIAL_COLLECTION, sort: "stage-desc" }).map((row) => row.id))
      .toEqual(["fixture-site-3", "fixture-site-1", "fixture-site-2", "fixture-site-4"]);
  });

  it("does not invent midnight or a timezone when ordering source updates", () => {
    expect(compareSourceTimes("2026-09-22", "2026-09-21T12:00:00Z")).toBeGreaterThan(0);
    expect(compareSourceTimes("2026-09-22T12:00:00", "2026-09-21T12:00:00Z")).toBeGreaterThan(0);
    expect(compareSourceTimes("2026-09-21T12:00:00+02:00", "2026-09-21T11:00:00Z")).toBeGreaterThan(0);
    expect(compareSourceTimes(null, "not a date")).toBe(0);
  });
});
