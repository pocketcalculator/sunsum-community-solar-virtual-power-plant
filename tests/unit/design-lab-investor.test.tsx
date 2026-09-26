import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EngagementsView,
  MandateView,
  PortfolioView,
  RoadmapView,
  UnderwritingPreview,
  investorInformationPriorities,
  resetPortfolioPreferences,
} from "@/features/design-lab/InvestorViews";
import { resetCollectionPreferences } from "@/features/design-lab/ProjectCollection";
import { FinancialSummary } from "@/features/design-lab/FinancialSummary";
import {
  capacity, createSeed, defaultProfile, isInterested, reduceLab, roleSites,
  visibleActivity, visibleDocuments, type LabState, type Role, type Site,
} from "@/features/design-lab/model";
import { STORAGE_KEY, dispatch, parseStoredState, serializePreview } from "@/features/design-lab/store";

function siteIn(state: LabState, id = "sweet-auburn"): Site {
  const site = state.sites.find((entry) => entry.id === id);
  if (!site) throw new Error(`Missing seed site ${id}`);
  return site;
}

function savedState() {
  const state = parseStoredState(localStorage.getItem(STORAGE_KEY) ?? "null");
  if (!state) throw new Error("Expected a persisted preview state");
  return state;
}

function replacePreview(state: LabState) {
  act(() => {
    localStorage.setItem(STORAGE_KEY, serializePreview(state));
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
  });
}

function renderPortfolio() {
  const onOpen = vi.fn();
  const onMandate = vi.fn();
  const view = render(<PortfolioView onOpen={onOpen} onMandate={onMandate} />);
  const broaden = screen.queryByRole("checkbox", { name: "Broaden matches to all permitted projects" });
  if (broaden instanceof HTMLInputElement && !broaden.checked) fireEvent.click(broaden);
  fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]!);
  return { ...view, onOpen, onMandate };
}

beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true;
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.open = false;
    };
  }
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

beforeEach(() => {
  localStorage.clear();
  resetCollectionPreferences();
  resetPortfolioPreferences();
  act(() => { dispatch({ type: "reset" }); });
});

describe("PortfolioView / shared scoped collection", () => {
  it("shows 47 deliberately broadened published records with a 25-row page and a filtered-set map", () => {
    renderPortfolio();
    expect(screen.getByRole("status")).toHaveTextContent("47 of 47 permitted fictional projects");
    expect(screen.getByText(/Of 50 fictional sites in this browser/)).toBeVisible();
    const list = screen.getByRole("region", { name: "Project results" });
    const map = screen.getByRole("region", { name: "Linked illustrative map" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(25);
    expect(within(map).getAllByRole("button", { name: /^View / })).toHaveLength(47);
    expect(map.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(/Page 1 of 2/)).toBeVisible();
  });

  it("deliberately broadens an unmatched mandate without unlocking any private project", () => {
    dispatch({ type: "mandate", mandate: { ...createSeed().mandate, geographies: ["TN"] } });
    render(<PortfolioView onOpen={vi.fn()} onMandate={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("8 of 8");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search projects" }), { target: { value: "Sweet Auburn" } });
    expect(screen.queryByRole("button", { name: "Open Sweet Auburn rooftop" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Broaden matches to all permitted projects" }));
    expect(screen.getByRole("button", { name: "Open Sweet Auburn rooftop" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("1 of 47");
    expect(screen.getByText(/No private projects or documents are unlocked/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search projects" }), { target: { value: "Grove Park" } });
    expect(screen.getByRole("status")).toHaveTextContent("0 of 47");
  });

  it("changes information priorities for two investor types without assigning a score or access", () => {
    const permitted = roleSites(createSeed(), "investor");
    const philanthropy = investorInformationPriorities("philanthropy", permitted);
    const equity = investorInformationPriorities("energy_equity_fund", permitted);
    const debtOriented = investorInformationPriorities("cdfi_cde", permitted);
    expect(philanthropy[0]?.label).toBe("Community purpose");
    expect(equity[0]?.label).toBe("Project readiness");
    expect(debtOriented[0]?.label).toBe("Program eligibility");
    expect(debtOriented[0]?.detail).toContain("No tax-credit, tract, lender, or program eligibility has been verified");
    expect(equity[1]?.detail).toContain("47 of 47 permitted projects");
    expect(philanthropy.map((item) => item.detail).join(" ")).toContain("not verified outcomes");
    expect(roleSites(createSeed(), "investor").map((site) => site.id)).toEqual(permitted.map((site) => site.id));
  });

  it("marks unscoped funding amounts as unknown, not a confirmed mandate fit", () => {
    dispatch({ type: "mandate", mandate: { ...createSeed().mandate, minimum: 100000, maximum: 500000 } });
    renderPortfolio();
    expect(screen.getByText(/0 within stated preferences; \d+ need more information/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("47 of 47");
  });

  it("never renders or searches hidden sites, owner contacts or private evidence", () => {
    renderPortfolio();
    const search = screen.getByRole("searchbox", { name: "Search projects" });
    for (const value of ["Grove Park", "Old Fourth Ward", "East Point", "owner@example.invalid", "100 Example Street"]) {
      fireEvent.change(search, { target: { value } });
      expect(screen.getByRole("status")).toHaveTextContent("0 of 47");
    }
    const body = document.body.textContent ?? "";
    for (const site of createSeed().sites) {
      expect(body).not.toContain(site.contactEmail);
      expect(body).not.toContain(site.address);
      expect(body).not.toContain(site.contactName);
    }
    expect(body).not.toContain("Example electricity bill.pdf");
    expect(body).not.toContain("Grove Park warehouse");
  });

  it("combines query, stage, geography, screening and capacity filters and clears them", () => {
    renderPortfolio();
    fireEvent.change(screen.getByLabelText("Project stage"), { target: { value: "development" } });
    fireEvent.change(screen.getByLabelText("Geography"), { target: { value: "GA" } });
    fireEvent.change(screen.getByLabelText("Screening outcome"), { target: { value: "potentially_viable" } });
    fireEvent.change(screen.getByLabelText("Illustrative capacity"), { target: { value: "large" } });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search projects" }), { target: { value: "Community" } });
    const expected = roleSites(createSeed(), "investor").filter((site) =>
      site.stage === "development" && site.region === "GA" && capacity(site) >= 250 &&
      site.name.toLowerCase().includes("community"));
    expect(screen.getByRole("status")).toHaveTextContent(`${expected.length} of 47`);
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("status")).toHaveTextContent("47 of 47");
    expect(screen.getByLabelText("Project stage")).toHaveValue("");
    expect(screen.getByLabelText("Geography")).toHaveValue("");
    expect(screen.getByLabelText("Screening outcome")).toHaveValue("");
    expect(screen.getByLabelText("Illustrative capacity")).toHaveValue("");
    expect(screen.getByRole("searchbox", { name: "Search projects" })).toHaveValue("");
  });

  it("keeps unknown geography and missing screening/capacity explicit and selectable", () => {
    renderPortfolio();
    const seed = createSeed();
    const unknown: Site = { ...siteIn(seed), region: "unknown", assessments: [] };
    replacePreview({ ...seed, sites: seed.sites.map((site) => site.id === unknown.id ? unknown : site) });
    fireEvent.change(screen.getByLabelText("Geography"), { target: { value: "unknown" } });
    fireEvent.change(screen.getByLabelText("Screening outcome"), { target: { value: "unscreened" } });
    fireEvent.change(screen.getByLabelText("Illustrative capacity"), { target: { value: "unknown" } });
    expect(screen.getByRole("status")).toHaveTextContent("1 of 47");
    const list = screen.getByRole("region", { name: "Project results" });
    expect(within(list).getByText("Not calculated")).toBeVisible();
    expect(within(list).getByText("Not screened")).toBeVisible();
    expect(within(list).getByText(/Location unknown/)).toBeVisible();
  });

  it("sorts known capacity high to low and puts unknown capacity last", () => {
    renderPortfolio();
    const seed = createSeed();
    replacePreview({ ...seed, sites: seed.sites.slice(0, 3).map((site) =>
      site.id === "sweet-auburn" ? { ...site, assessments: [] } : site) });
    fireEvent.change(screen.getByLabelText("Sort projects"), { target: { value: "capacity" } });
    const buttons = within(screen.getByRole("region", { name: "Project results" })).getAllByRole("button", { name: /^Select / });
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Select West End community canopy", "Select Mechanicsville school roof", "Select Sweet Auburn rooftop",
    ]);
    expect(screen.getByRole("status")).toHaveTextContent("3 of 3");
  });

  it("filters actual recorded flags separately from the screening outcome", () => {
    renderPortfolio();
    const seed = createSeed();
    const flagged = siteIn(seed);
    replacePreview({ ...seed, sites: seed.sites.map((site) => site.id === flagged.id
      ? { ...site, assessments: site.assessments.map((assessment) => ({ ...assessment, flags: ["Example roof evidence pending"] })) }
      : site) });
    fireEvent.change(screen.getByLabelText("Screening flag"), { target: { value: "flag:Example roof evidence pending" } });
    expect(screen.getByLabelText("Screening outcome")).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent("1 of 47");
    expect(screen.getByRole("button", { name: "Open Sweet Auburn rooftop" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByLabelText("Screening flag")).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent("47 of 47");
  });

  it("remembers an opened row even when it was not selected first", () => {
    const view = renderPortfolio();
    const list = screen.getByRole("region", { name: "Project results" });
    const row = within(list).getAllByRole("button", { name: /^Select / })[2]!;
    const name = (row.getAttribute("aria-label") ?? "").slice("Select ".length);
    expect(row).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: `Open ${name}` }));
    expect(view.onOpen).toHaveBeenCalledTimes(1);
    view.unmount();
    render(<PortfolioView onOpen={vi.fn()} onMandate={vi.fn()} />);
    expect(screen.getByRole("button", { name: `Select ${name}` })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: `View ${name}` })).toHaveAttribute("aria-pressed", "true");
  });

  it("retains sort, page, search and reciprocal selection when returning from detail", () => {
    const view = renderPortfolio();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search projects" }), { target: { value: "Community" } });
    fireEvent.change(screen.getByLabelText("Sort projects"), { target: { value: "capacity" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const list = screen.getByRole("region", { name: "Project results" });
    const selectButton = within(list).getAllByRole("button", { name: /^Select / })[2]!;
    const name = (selectButton.getAttribute("aria-label") ?? "").slice("Select ".length);
    fireEvent.click(screen.getByRole("button", { name: `View ${name}` }));
    expect(selectButton).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: `Open ${name}` }));
    expect(view.onOpen).toHaveBeenCalledTimes(1);
    view.unmount();

    render(<PortfolioView onOpen={vi.fn()} onMandate={vi.fn()} />);
    expect(screen.getByRole("searchbox", { name: "Search projects" })).toHaveValue("Community");
    expect(screen.getByLabelText("Sort projects")).toHaveValue("capacity");
    expect(screen.getByText(/Page 2 of/)).toBeVisible();
    expect(screen.getByRole("button", { name: `View ${name}` })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: `Select ${name}` })).toHaveAttribute("aria-pressed", "true");
  });

  it("does not claim fifty records for a restored smaller scenario", () => {
    renderPortfolio();
    const seed = createSeed();
    replacePreview({ version: 1, sites: seed.sites.slice(0, 6), engagements: [], mandate: seed.mandate });
    expect(screen.getByRole("status")).toHaveTextContent("3 of 3");
    expect(screen.getByText(/Of 6 fictional sites in this browser/)).toBeVisible();
    expect(screen.queryByText(/Of 50 fictional sites/)).not.toBeInTheDocument();
  });

  it("allows browsing with an incomplete mandate and exposes the setup action", () => {
    dispatch({ type: "mandate", mandate: { ...createSeed().mandate, completed: false } });
    const view = renderPortfolio();
    expect(screen.getByRole("status")).toHaveTextContent("47 of 47");
    fireEvent.click(screen.getByRole("button", { name: "Set mandate" }));
    expect(view.onMandate).toHaveBeenCalledTimes(1);
  });
});

describe("MandateView", () => {
  it("shows Not specified for saved empty types and saves those same values unchanged", () => {
    dispatch({ type: "mandate", mandate: { ...createSeed().mandate, organization: "", investorType: "", capitalType: "" } });
    const onDone = vi.fn();
    const first = render(<MandateView onDone={onDone} />);
    expect(screen.getByLabelText("Investor type")).toHaveValue("");
    expect(screen.getByLabelText("Capital type")).toHaveValue("");
    expect(within(screen.getByLabelText("Investor type")).getByRole("option", { selected: true })).toHaveTextContent("Not specified");
    expect(within(screen.getByLabelText("Capital type")).getByRole("option", { selected: true })).toHaveTextContent("Not specified");
    fireEvent.click(screen.getByRole("button", { name: "Save mandate" }));
    expect(savedState().mandate).toMatchObject({ organization: "", investorType: "", capitalType: "" });
    first.unmount();
    render(<MandateView onDone={onDone} />);
    expect(screen.getByLabelText("Investor type")).toHaveValue("");
    expect(screen.getByLabelText("Capital type")).toHaveValue("");
  });
  it("rejects a reversed ticket range and does not persist or complete", () => {
    const onDone = vi.fn();
    render(<MandateView onDone={onDone} />);

    fireEvent.change(screen.getByLabelText(/Minimum ticket/), { target: { value: "5000" } });
    fireEvent.change(screen.getByLabelText(/Maximum ticket/), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Save mandate" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/less than or equal/);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("requires at least one geography", () => {
    const onDone = vi.fn();
    render(<MandateView onDone={onDone} />);

    fireEvent.click(screen.getByRole("button", { name: "Georgia" }));
    fireEvent.click(screen.getByRole("button", { name: "Save mandate" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/at least one geography/i);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("persists a valid mandate as integer cents", () => {
    const onDone = vi.fn();
    render(<MandateView onDone={onDone} />);

    fireEvent.change(screen.getByLabelText(/Minimum ticket/), { target: { value: "50000" } });
    fireEvent.change(screen.getByLabelText(/Maximum ticket/), { target: { value: "250000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save mandate" }));

    expect(onDone).toHaveBeenCalledTimes(1);
    const stored = parseStoredState(localStorage.getItem(STORAGE_KEY) ?? "");
    expect(stored?.mandate.minimum).toBe(5000000);
    expect(stored?.mandate.maximum).toBe(25000000);
    expect(Number.isSafeInteger(stored?.mandate.minimum ?? NaN)).toBe(true);
    expect(stored?.mandate.completed).toBe(true);
  });

  it("preserves exact cents, including the maximum safe stored value", () => {
    render(<MandateView onDone={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Minimum ticket/), { target: { value: "0.29" } });
    fireEvent.change(screen.getByLabelText(/Maximum ticket/), { target: { value: "90071992547409.91" } });
    fireEvent.click(screen.getByRole("button", { name: "Save mandate" }));
    expect(savedState().mandate.minimum).toBe(29);
    expect(savedState().mandate.maximum).toBe(Number.MAX_SAFE_INTEGER);
  });

  it.each(["-1", "1.005", "1e6", "90071992547409.92"])("rejects an invalid USD ticket %s without rounding or saving", (value) => {
    const onDone = vi.fn();
    render(<MandateView onDone={onDone} />);
    fireEvent.change(screen.getByLabelText(/Minimum ticket/), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Save mandate" }));
    expect(screen.getByRole("alert")).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent("minimum ticket in USD");
    expect(onDone).not.toHaveBeenCalled();
    expect(savedState().mandate.minimum).toBeNull();
  });

  it("keeps purchaser MWh/year and unconfigured REC constraints separate from USD", () => {
    dispatch({ type: "profile", profile: { ...defaultProfile(), purchaseMwhPerYear: 125.5 } });
    render(<MandateView onDone={vi.fn()} />);
    expect(screen.getByText("125.5 MWh/year (self-declared)")).toBeVisible();
    expect(screen.getByText("REC quantity / price constraints").parentElement).toHaveTextContent("Not configured");
    fireEvent.change(screen.getByLabelText(/Minimum ticket/), { target: { value: "25000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save mandate" }));
    expect(savedState().mandate.minimum).toBe(2500000);
    expect(savedState().profile?.purchaseMwhPerYear).toBe(125.5);
    expect(savedState().engagements).toEqual([]);
  });

  it("keeps zero distinct from an unspecified maximum and cancels unsaved edits", () => {
    const onDone = vi.fn();
    const view = render(<MandateView onDone={onDone} />);
    fireEvent.change(screen.getByLabelText(/Minimum ticket/), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save mandate" }));
    expect(savedState().mandate.minimum).toBe(0);
    expect(savedState().mandate.maximum).toBeNull();
    view.unmount();
    render(<MandateView onDone={onDone} />);
    expect(screen.getByLabelText(/Minimum ticket/)).toHaveValue("0.00");
    fireEvent.change(screen.getByLabelText(/Minimum ticket/), { target: { value: "99" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(savedState().mandate.minimum).toBe(0);
  });
});

describe("EngagementsView", () => {
  it("lets an investor withdraw with explicit confirmation and revokes the tier", () => {
    dispatch({ type: "interest", id: "sweet-auburn" });
    render(<EngagementsView role="investor" onOpen={vi.fn()} />);

    expect(screen.getByText("Sweet Auburn rooftop")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/interest-gated preview access immediately/i)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Withdraw interest" }));

    expect(screen.getByRole("heading", { name: "Withdrawn" })).toBeVisible();
    const stored = parseStoredState(localStorage.getItem(STORAGE_KEY) ?? "");
    expect(stored?.engagements.find((entry) => entry.siteId === "sweet-auburn")?.state).toBe("withdrawn");
    expect(visibleDocuments(savedState(), siteIn(savedState()), "investor")).toEqual([]);
    expect(siteIn(savedState()).activity.filter((event) => event.kind === "owner_interest")).toHaveLength(1);
  });

  it("lets a revoked investor withdraw without revealing the unpublished project, even in an open dialog", () => {
    dispatch({ type: "interest", id: "sweet-auburn", fundingNeedId: "need-sweet-auburn" });
    render(<EngagementsView role="investor" onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    act(() => { dispatch({ type: "visibility", id: "sweet-auburn", visible: false }); });
    expect(screen.getByRole("heading", { name: "Project no longer available" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Sweet Auburn rooftop" })).not.toBeInTheDocument();
    const body = document.body.textContent ?? "";
    for (const text of ["Sweet Auburn", "Feasibility study", "Pre-development", "owner@example.invalid", "100 Example Street"]) {
      expect(body).not.toContain(text);
    }
    expect(within(screen.getByRole("dialog")).getByText("this unavailable project")).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Withdraw interest" }));
    expect(isInterested(savedState(), "sweet-auburn")).toBe(false);
    expect(screen.getByRole("heading", { name: "Withdrawn" })).toBeVisible();
    expect(siteIn(savedState()).activity.filter((event) => event.kind === "owner_interest")).toHaveLength(1);
    expect(visibleDocuments(savedState(), siteIn(savedState()), "investor")).toEqual([]);
  });

  it("retains an active revoked interest on initial render, without offering an open action", () => {
    dispatch({ type: "interest", id: "sweet-auburn" });
    dispatch({ type: "visibility", id: "sweet-auburn", visible: false });
    const onOpen = vi.fn();
    render(<EngagementsView role="investor" onOpen={onOpen} />);
    expect(screen.getByRole("button", { name: "Withdraw" })).toBeEnabled();
    expect(screen.getByText("Interested")).toBeVisible();
    expect(screen.queryByText("Sweet Auburn rooftop")).not.toBeInTheDocument();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("gives the operator actor-specific read-only history, including unpublished projects", () => {
    dispatch({ type: "interest", id: "sweet-auburn" });
    dispatch({ type: "visibility", id: "sweet-auburn", visible: false });
    render(<EngagementsView role="operator" onOpen={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Understand investor interest.");
    expect(screen.getByText("Sweet Auburn rooftop")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Withdraw" })).toBeNull();
    expect(screen.getByText("Investor engagement")).toBeVisible();
    expect(screen.getByText("Investor activity / private")).toBeInTheDocument();
    expect(screen.getByText("Owner notice / minimal disclosure")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Your engagement");
    expect(document.body.textContent).not.toContain("1 live");
  });

  it("does not expose owner notices, private documents or operator notes in investor history", () => {
    dispatch({ type: "interest", id: "sweet-auburn" });
    dispatch({ type: "save-note", id: "sweet-auburn", text: "Private operator-only rationale" });
    render(<EngagementsView role="investor" onOpen={vi.fn()} />);
    expect(screen.getByText("Investor activity / private")).toBeInTheDocument();
    expect(screen.queryByText("Owner notice / minimal disclosure")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Private operator-only rationale");
    expect(document.body.textContent).not.toContain("Example electricity bill.pdf");
    expect(screen.getByText(/Actual files are unavailable/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /download/i })).not.toBeInTheDocument();
  });

  it("does not expose private engagement history if accidentally mounted for an owner", () => {
    dispatch({ type: "interest", id: "sweet-auburn" });
    render(<EngagementsView role="site-owner" onOpen={vi.fn()} />);
    expect(screen.getByText("Interest management is role-specific")).toBeVisible();
    expect(screen.queryByText("Sweet Auburn rooftop")).not.toBeInTheDocument();
    expect(screen.queryByText("Interest expressed")).not.toBeInTheDocument();
  });

  it("preserves a missing-source record honestly instead of dropping it or offering a false withdrawal", () => {
    dispatch({ type: "interest", id: "sweet-auburn" });
    render(<EngagementsView role="investor" onOpen={vi.fn()} />);
    const state = savedState();
    replacePreview({ ...state, sites: state.sites.filter((site) => site.id !== "sweet-auburn") });
    expect(screen.getByRole("button", { name: "Withdraw" })).toBeDisabled();
    expect(screen.getByText(/source record is missing/)).toBeVisible();
    expect(screen.getByText("Interested")).toBeVisible();
  });
});

describe("interest transition contract", () => {
  it("creates distinct private investor activity and a minimal owner notice exactly once per transition", () => {
    const initial = createSeed();
    const interested = reduceLab(initial, { type: "interest", id: "sweet-auburn" }, "2026-09-20T10:00:00.000Z");
    const site = siteIn(interested);
    const investorEvents = site.activity.filter((event) => event.kind === "interest");
    const ownerEvents = site.activity.filter((event) => event.kind === "owner_interest");
    expect(investorEvents).toHaveLength(1);
    expect(ownerEvents).toHaveLength(1);
    expect(investorEvents[0]).toMatchObject({ actor: "investor", scope: "investor" });
    expect(ownerEvents[0]).toMatchObject({ actor: "investor", scope: "owner" });
    expect(ownerEvents[0]?.id).not.toBe(investorEvents[0]?.id);
    expect(visibleActivity(site, "site-owner").some((event) => event.kind === "interest")).toBe(false);
    expect(JSON.stringify(ownerEvents)).not.toContain(initial.mandate.organization);
    expect(JSON.stringify(ownerEvents)).not.toContain("$");
    expect(site.stage).toBe(siteIn(initial).stage);
    expect(site.fundingNeeds).toEqual(siteIn(initial).fundingNeeds);
    expect(reduceLab(interested, { type: "interest", id: "sweet-auburn" })).toBe(interested);

    const withdrawn = reduceLab(interested, { type: "withdraw", id: "sweet-auburn" }, "2026-09-20T11:00:00.000Z");
    expect(siteIn(withdrawn).activity).toEqual(expect.arrayContaining(ownerEvents));
    expect(visibleDocuments(withdrawn, siteIn(withdrawn), "investor")).toEqual([]);
    const again = reduceLab(withdrawn, { type: "interest", id: "sweet-auburn" }, "2026-09-20T12:00:00.000Z");
    expect(siteIn(again).activity.filter((event) => event.kind === "owner_interest")).toHaveLength(2);
    expect(siteIn(again).activity.filter((event) => event.kind === "interest")).toHaveLength(3);
  });
});

describe("UnderwritingPreview", () => {
  it("is deterministic, has explicit source units and never records a credit or project decision", () => {
    dispatch({ type: "interest", id: "sweet-auburn" });
    const before = savedState();
    render(<UnderwritingPreview site={siteIn(before)} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/no AI model connected/i)).toBeInTheDocument();
    expect(within(dialog).getAllByText(/credit decision/i).length).toBeGreaterThan(0);
    expect(within(dialog).getByText(/awaiting your review/i)).toBeVisible();
    expect(within(dialog).getByText("180\u2013240 kW")).toBeVisible();
    expect(within(dialog).getByText("243\u2013324 MWh/year")).toBeVisible();
    expect(within(dialog).getByText("design-fixture-v1")).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Mark example reviewed" }));
    expect(within(dialog).getByText("Example marked reviewed (local only)")).toBeVisible();
    expect(savedState()).toEqual(before);
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Editable example diligence note/ }), { target: { value: "My temporary example" } });
    expect(within(dialog).getByText(/awaiting your review/)).toBeVisible();
    expect(savedState()).toEqual(before);
  });

  it("removes the draft immediately after withdrawal, even with a stale site prop", () => {
    dispatch({ type: "interest", id: "sweet-auburn" });
    render(<UnderwritingPreview site={siteIn(savedState())} onClose={vi.fn()} />);
    act(() => { dispatch({ type: "withdraw", id: "sweet-auburn" }); });
    expect(screen.getByRole("dialog", { name: "Example guidance unavailable" })).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Sweet Auburn");
  });

  it("treats an absent assessment as unknown instead of a negative screening or zero generation", () => {
    dispatch({ type: "interest", id: "sweet-auburn" });
    render(<UnderwritingPreview site={siteIn(savedState())} onClose={vi.fn()} />);
    const current = savedState();
    const site = { ...siteIn(current), assessments: [] };
    replacePreview({ ...current, sites: current.sites.map((entry) => entry.id === site.id ? site : entry) });
    expect(screen.getByText("No screening result is available. Gather evidence for a human review.")).toBeVisible();
    expect(screen.getAllByText("Not calculated")).toHaveLength(2);
    expect(document.body.textContent).not.toContain("0 MWh/year");
  });

  it("clears temporary edits and reviewed state when the source changes", () => {
    dispatch({ type: "interest", id: "sweet-auburn" });
    render(<UnderwritingPreview site={siteIn(savedState())} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: /Editable example diligence note/ }), { target: { value: "Old source note" } });
    fireEvent.click(screen.getByRole("button", { name: "Mark example reviewed" }));
    act(() => { dispatch({ type: "rerun", id: "sweet-auburn", result: "more_information_required", reason: "Changed example evidence" }); });
    expect(screen.getByRole("textbox", { name: /Editable example diligence note/ })).not.toHaveValue("Old source note");
    expect(screen.getByText(/awaiting your review/)).toBeVisible();
    expect(screen.getByText("Clarify the missing information before a human review.")).toBeVisible();
  });

  it("identifies retained last-good screening after an example failure", () => {
    dispatch({ type: "interest", id: "sweet-auburn" });
    dispatch({ type: "screen-failure", id: "sweet-auburn" });
    render(<UnderwritingPreview site={siteIn(savedState())} onClose={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("last retained screening fixture, not a new result");
    expect(screen.getByText("180\u2013240 kW")).toBeVisible();
  });
});

describe("FinancialSummary", () => {
  it.each<Role>(["site-owner", "operator", "investor"])("keeps distinct unknown project financial measures for %s", (role) => {
    render(<FinancialSummary site={{ ...siteIn(createSeed()), stage: "operations" }} role={role} />);
    const summary = screen.getByRole("region", { name: "Selected project financial summary" });
    for (const label of ["Project costs", "Owner benefit", "Project payback", "Investor return", "Utility bill savings"]) {
      expect(within(summary).getByText(label).parentElement).toHaveTextContent("Not calculated");
    }
    for (const label of ["Actual generation", "Owner payments", "Avoided emissions", "Households served"]) {
      expect(within(summary).getByText(label).parentElement).toHaveTextContent("Unmeasured");
    }
    expect(summary).toHaveTextContent("one fictional project, not a portfolio total");
    expect(summary).toHaveTextContent("design-fixture-v1");
    expect(summary).toHaveTextContent("MWh/year");
    expect(summary).toHaveTextContent("USD/year");
    expect(summary).toHaveTextContent("Reporting period and dataset vintage: not supplied");
    expect(summary).not.toHaveTextContent("$0");
    expect(summary).not.toHaveTextContent("owner@example.invalid");
    expect(summary).not.toHaveTextContent("100 Example Street");
  });

  it("withholds financial context for a revoked investor project or a different owner's example", () => {
    const site = siteIn(createSeed());
    const view = render(<FinancialSummary site={{ ...site, visible: false }} role="investor" />);
    expect(screen.getByText("Project financial context unavailable")).toBeVisible();
    expect(document.body.textContent).not.toContain(site.name);
    view.rerender(<FinancialSummary site={{ ...site, ownerVisible: false }} role="site-owner" />);
    expect(document.body.textContent).not.toContain(site.name);
  });
});

describe("RoadmapView", () => {
  it("keeps later legal and funding states explicitly deferred and noninteractive", () => {
    render(<RoadmapView />);
    expect(screen.getAllByText("Deferred design")).toHaveLength(4);
    expect(screen.getByText("Local preview")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText("Built (MVP)")).not.toBeInTheDocument();
    expect(document.body.textContent).toContain("Only local interest and withdrawal are available");
  });
});
