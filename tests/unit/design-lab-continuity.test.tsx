import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DesignLab } from "@/features/design-lab/DesignLab";
import { resetQueuePreferences } from "@/features/design-lab/OperatorViews";
import { resetCollectionPreferences } from "@/features/design-lab/ProjectCollection";
import { resetPortfolioPreferences } from "@/features/design-lab/InvestorViews";
import { resetThemeStoreForTests } from "@/components/ui/theme/themeStore";
import { dispatch, STORAGE_KEY } from "@/features/design-lab/store";

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  resetQueuePreferences();
  resetCollectionPreferences();
  resetPortfolioPreferences();
  resetThemeStoreForTests();
  dispatch({ type: "reset" });
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } },
  });
  afterEach(() => vi.unstubAllGlobals());
});

describe("demo workspace context", () => {
  it("starts operators with work and returns exact filters, sort, page, selection and focus through Documents and Reports", async () => {
    const transport = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected demo network call"));
    render(<DesignLab initialRole="operator" initialView="overview" />);
    const work = await screen.findByRole("list", { name: "Submissions awaiting a manual action" });
    const figures = screen.getByRole("region", { name: "Pipeline figures" });
    expect(work.compareDocumentPosition(figures) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Operator" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Dark appearance" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open notifications" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search submissions"), { target: { value: "Community" } });
    fireEvent.change(screen.getByLabelText("Submission status"), { target: { value: "accepted" } });
    fireEvent.change(screen.getByLabelText("Sort submissions"), { target: { value: "stage-desc" } });
    fireEvent.click(screen.getByRole("button", { name: "More filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Next submissions" }));
    const row = within(work).getAllByRole("button")[2]!;
    const recordId = row.getAttribute("data-record-id");
    if (!recordId) throw new Error("The collection open button needs a stable record locator.");
    const label = row.getAttribute("aria-label")!;
    const name = label.slice("Review ".length);
    row.focus();
    const before = localStorage.getItem(STORAGE_KEY);
    fireEvent.click(row);
    fireEvent.click(screen.getByRole("tab", { name: "Tasks & evidence" }));
    fireEvent.click(screen.getByRole("button", { name: "Open project documents" }));
    expect(screen.getByRole("heading", { level: 1, name: "Documents" })).toBeVisible();
    const navigation = screen.getByRole("navigation", { name: "Platform operator workspace" });
    fireEvent.click(within(navigation).getByRole("button", { name: "Drafts & reports" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to the selected project" }));
    expect(screen.getByRole("dialog", { name })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `Close ${name}` }));
    await waitFor(() => expect(screen.getByRole("button", { name: label })).toHaveFocus());
    expect(screen.getByLabelText("Search submissions")).toHaveValue("Community");
    expect(screen.getByLabelText("Submission status")).toHaveValue("accepted");
    expect(screen.getByLabelText("Sort submissions")).toHaveValue("stage-desc");
    expect(screen.getByRole("button", { name: "Fewer filters" })).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2")).toBeVisible();
    expect(screen.getByRole("button", { name: label }).parentElement).toHaveAttribute("data-selected", "true");
    expect(screen.getByRole("button", { name: label })).toHaveAttribute("data-record-id", recordId);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
    expect(transport).not.toHaveBeenCalled();
  });

  it("preserves unfinished profile and funding choices in memory through optional learning without storage", async () => {
    render(<DesignLab initialRole="site-owner" initialView="profile" />);
    await screen.findByLabelText(/Fictional display name/);
    const before = localStorage.getItem(STORAGE_KEY);
    fireEvent.change(screen.getByLabelText(/Fictional display name/), { target: { value: "Unfinished fictional name" } });
    fireEvent.click(screen.getByRole("button", { name: "Step 2: Your intentions" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "a funder, investor or philanthropy" }));
    fireEvent.click(screen.getByRole("button", { name: "Step 3: Preferences" }));
    fireEvent.change(screen.getByLabelText("Investor type"), { target: { value: "philanthropy" } });
    fireEvent.change(screen.getByLabelText("Capital type"), { target: { value: "recoverable_grant" } });
    fireEvent.click(screen.getByText("Optional learning (keeps this draft)"));
    expect(screen.getByRole("region", { name: "Virtual power plant learning" })).toBeVisible();
    expect(screen.getByText("Five relationships, not one flow")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Skip orientation" }));
    fireEvent.click(screen.getByRole("button", { name: "Revisit orientation" }));
    fireEvent.click(screen.getByRole("button", { name: "Explore the journey" }));
    expect(screen.getByText(/introduction is optional/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Offer a place/ }));
    expect(screen.getByText("Step 3 of 4")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Preferences", level: 2 })).toHaveFocus();
    expect(screen.getByLabelText("Investor type")).toHaveValue("philanthropy");
    expect(screen.getByLabelText("Capital type")).toHaveValue("recoverable_grant");
    fireEvent.click(screen.getByRole("button", { name: "Step 1: About you" }));
    expect(screen.getByLabelText(/Fictional display name/)).toHaveValue("Unfinished fictional name");
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });

  it("routes a deliberately completed learning profile to help without adding a workspace", async () => {
    render(<DesignLab initialRole="site-owner" initialView="profile" />);
    await screen.findByLabelText(/Fictional display name/);
    fireEvent.click(screen.getByRole("button", { name: "Step 2: Your intentions" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "someone with a roof, building or land" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "understand how this works before deciding" }));
    fireEvent.click(screen.getByRole("button", { name: "Step 4: Review" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /I agree to save fictional profile preferences/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(screen.getByRole("heading", { name: "Human help, not automated outreach" })).toBeVisible();
    expect(screen.getByRole("group", { name: "Demo role" }).querySelectorAll('input[type="radio"]')).toHaveLength(3);
    expect(screen.getByRole("radio", { name: "Site owner" })).toBeChecked();
  });
});
