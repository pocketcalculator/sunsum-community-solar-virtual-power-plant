import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isIntentOptionId } from "@/domain/intents";
import { ProfileView } from "@/features/design-lab/ProfileView";
import { createSeed, defaultProfile } from "@/features/design-lab/model";
import { STORAGE_KEY, dispatch, parseStoredState, serializePreview } from "@/features/design-lab/store";

function currentState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const state = raw ? parseStoredState(raw) : null;
  if (!state) throw new Error("Expected a saved fictional preview.");
  return state;
}

function step(index: number, title: string) {
  fireEvent.click(screen.getByRole("button", { name: `Step ${index}: ${title}` }));
}

function consent() {
  fireEvent.click(screen.getByRole("checkbox", { name: /I agree to save fictional profile preferences in this browser/i }));
}

function finish() {
  step(4, "Review");
  consent();
  fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
}

beforeEach(() => {
  localStorage.clear();
  dispatch({ type: "reset" });
});

describe("fictional profile persistence and corrections", () => {
  it("requires explicit local-save consent and never collects a password or grants roles", () => {
    const before = currentState();
    const onDone = vi.fn();
    render(<ProfileView onDone={onDone} />);
    expect(screen.getByText("Sign-in is not connected.")).toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Fictional display name/i), { target: { value: "Fictional Profile Example" } });
    step(4, "Review");
    expect(screen.getByRole("button", { name: "Save profile" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(currentState()).toEqual(before);
    expect(onDone).not.toHaveBeenCalled();
    consent();
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(onDone).toHaveBeenCalledOnce();
    expect(currentState().profile).toMatchObject({ name: "Fictional Profile Example", completed: true });
    expect(currentState().sites).toEqual(before.sites);
    expect(currentState().engagements).toEqual(before.engagements);
  });

  it("saves canonical multiple intentions and lets a later visit correct the same profile", () => {
    const onDone = vi.fn();
    const first = render(<ProfileView onDone={onDone} />);
    fireEvent.change(screen.getByLabelText(/Fictional display name/i), { target: { value: "  Fictional Steward  " } });
    step(2, "Your intentions");
    fireEvent.click(screen.getByRole("checkbox", { name: "representing a community group, campus or institution" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "an existing project or opportunity" }));
    finish();
    const saved = currentState().profile;
    expect(saved).toMatchObject({ name: "Fictional Steward", completed: true });
    expect(saved?.intents).toEqual(["i-am-property-owner", "i-am-community", "i-have-project"]);
    expect(saved?.intents.every(isIntentOptionId)).toBe(true);
    first.unmount();

    render(<ProfileView onDone={onDone} />);
    expect(screen.getByText("Step 4 of 4")).toBeInTheDocument();
    expect(screen.getByText("Fictional Steward")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save profile" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Edit participant" }));
    expect(screen.getByLabelText(/Fictional display name/i)).toHaveValue("Fictional Steward");
    fireEvent.change(screen.getByLabelText(/Fictional display name/i), { target: { value: "Corrected Fictional Steward" } });
    finish();
    expect(currentState().profile?.name).toBe("Corrected Fictional Steward");
    expect(currentState().profile?.intents).toEqual(saved?.intents);
    expect(onDone).toHaveBeenCalledTimes(2);
  });

  it("saves a partial profile as a draft without claiming profile completion", () => {
    const onDone = vi.fn();
    const first = render(<ProfileView onDone={onDone} />);
    fireEvent.change(screen.getByLabelText(/Fictional display name/i), { target: { value: "Unfinished Fictional Profile" } });
    step(2, "Your intentions");
    fireEvent.click(screen.getByRole("checkbox", { name: "someone with a roof, building or land" }));
    consent();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(currentState().profile).toMatchObject({ name: "Unfinished Fictional Profile", completed: false, intents: [] });
    expect(onDone).not.toHaveBeenCalled();
    first.unmount();

    render(<ProfileView onDone={onDone} />);
    expect(screen.getByLabelText(/Fictional display name/i)).toHaveValue("Unfinished Fictional Profile");
    finish();
    expect(screen.getByRole("alert")).toHaveTextContent("Choose at least one intention");
    expect(currentState().profile?.completed).toBe(false);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("requires organization details only for an organization and retains inactive answers", () => {
    render(<ProfileView onDone={vi.fn()} />);
    expect(screen.queryByLabelText(/Fictional organization name/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Organization" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a fictional organization name");
    fireEvent.change(screen.getByLabelText(/Fictional organization name/i), { target: { value: "Fictional Community Group" } });
    fireEvent.click(screen.getByRole("radio", { name: "Individual" }));
    expect(screen.queryByLabelText(/Fictional organization name/i)).not.toBeInTheDocument();
    expect(screen.getByText(/previous organization name is retained/i)).toBeInTheDocument();
    finish();
    expect(currentState().profile).toMatchObject({ participant: "individual", organization: "Fictional Community Group", completed: true });
    step(1, "About you");
    fireEvent.click(screen.getByRole("radio", { name: "Organization" }));
    expect(screen.getByLabelText(/Fictional organization name/i)).toHaveValue("Fictional Community Group");
  });

  it("preserves owner goals, co-ownership, and energy answers when their intentions become inactive", () => {
    dispatch({
      type: "profile",
      profile: {
        ...defaultProfile(), completed: true, intents: ["i-am-property-owner", "i-am-utility"],
        ownerGoals: ["Support community ownership"], coOwnership: "co_owned", purchaseMwhPerYear: 12.5,
      },
    });
    const first = render(<ProfileView onDone={vi.fn()} />);
    step(2, "Your intentions");
    fireEvent.click(screen.getByRole("checkbox", { name: "someone with a roof, building or land" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "with a utility or energy buyer" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "understand how this works before deciding" }));
    step(3, "Preferences");
    expect(screen.queryByRole("group", { name: "What would you like this site to do?" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Annual energy purchase/i)).not.toBeInTheDocument();
    expect(screen.getByText(/earlier energy-purchase preference is retained but inactive/i)).toBeInTheDocument();
    finish();
    expect(currentState().profile).toMatchObject({ intents: ["i-would-learn"], ownerGoals: ["Support community ownership"], coOwnership: "co_owned", purchaseMwhPerYear: 12.5 });
    first.unmount();

    render(<ProfileView onDone={vi.fn()} />);
    step(2, "Your intentions");
    fireEvent.click(screen.getByRole("checkbox", { name: "someone with a roof, building or land" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "with a utility or energy buyer" }));
    step(3, "Preferences");
    expect(screen.getByRole("checkbox", { name: "Support community ownership" })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Co-owned project/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Cooperative option/i })).not.toBeChecked();
    expect(screen.getByLabelText(/Annual energy purchase/i)).toHaveValue(12.5);
  });

  it("keeps co-owned and cooperative choices distinct and non-executing", () => {
    render(<ProfileView onDone={vi.fn()} />);
    step(3, "Preferences");
    fireEvent.click(screen.getByRole("radio", { name: /Co-owned project/i }));
    expect(screen.getByText(/This does not imply a cooperative/i)).toBeInTheDocument();
    finish();
    expect(currentState().profile?.coOwnership).toBe("co_owned");
    step(3, "Preferences");
    fireEvent.click(screen.getByRole("radio", { name: /Cooperative option/i }));
    step(4, "Review");
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(currentState().profile?.coOwnership).toBe("cooperative");
    expect(currentState().engagements).toHaveLength(0);
    expect(currentState().sites.every((site) => site.acknowledgement === null)).toBe(true);
  });

  it("uses MWh/year for purchasers and keeps unknown, zero, and invalid energy values distinct", () => {
    const onDone = vi.fn();
    render(<ProfileView onDone={onDone} />);
    step(3, "Preferences");
    expect(screen.queryByLabelText(/Annual energy purchase/i)).not.toBeInTheDocument();
    step(2, "Your intentions");
    fireEvent.click(screen.getByRole("checkbox", { name: "with a utility or energy buyer" }));
    step(3, "Preferences");
    const amount = screen.getByLabelText(/Annual energy purchase \(MWh\/year\)/i);
    expect(amount).toHaveValue(null);
    expect(screen.queryByRole("spinbutton", { name: /^(?:Purchase budget|Purchase amount \(USD\)|Financing limit)/i })).not.toBeInTheDocument();
    fireEvent.change(amount, { target: { value: "-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent("non-negative number in MWh/year");
    consent();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(currentState().profile?.purchaseMwhPerYear).toBeNull();
    fireEvent.change(amount, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("0 MWh/year")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(currentState().profile?.purchaseMwhPerYear).toBe(0);
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("conditions investor fields and updates only those preferences in the existing mandate", () => {
    const base = currentState().mandate;
    dispatch({ type: "mandate", mandate: { ...base, minimum: 100000, maximum: 200000 } });
    render(<ProfileView onDone={vi.fn()} />);
    step(3, "Preferences");
    expect(screen.queryByLabelText("Investor type")).not.toBeInTheDocument();
    step(2, "Your intentions");
    fireEvent.click(screen.getByRole("checkbox", { name: "a funder, investor or philanthropy" }));
    step(3, "Preferences");
    fireEvent.change(screen.getByLabelText("Investor type"), { target: { value: "impact_investor" } });
    fireEvent.change(screen.getByLabelText("Capital type"), { target: { value: "senior_debt" } });
    finish();
    expect(currentState().mandate).toEqual({ ...base, minimum: 100000, maximum: 200000, investorType: "impact_investor", capitalType: "senior_debt" });
    expect(currentState().engagements).toEqual([]);
    step(3, "Preferences");
    fireEvent.change(screen.getByLabelText("Investor type"), { target: { value: "" } });
    step(4, "Review");
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(currentState().mandate.completed).toBe(false);
  });

  it("uses the shared default when a legacy browser save has no profile", () => {
    render(<ProfileView onDone={vi.fn()} />);
    const legacy = createSeed();
    delete legacy.profile;
    const raw = serializePreview(legacy);
    localStorage.setItem(STORAGE_KEY, raw);
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: raw })); });
    expect(screen.getByLabelText(/Fictional display name/i)).toHaveValue(defaultProfile().name);
    finish();
    expect(currentState().profile).toMatchObject({ ...defaultProfile(), completed: true });
  });

  it("reports memory-only saving if browser storage fails rather than claiming a durable save", () => {
    render(<ProfileView onDone={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Fictional display name/i), { target: { value: "Memory-only Fictional Profile" } });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Quota reached", "QuotaExceededError"); });
    finish();
    expect(screen.getByRole("status")).toHaveTextContent("Updated in memory only");
    expect(currentState().profile?.name).not.toBe("Memory-only Fictional Profile");
  });
});
