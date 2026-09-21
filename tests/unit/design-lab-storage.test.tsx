import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSeed, defaultProfile } from "@/features/design-lab/model";
import { dispatch, LEGACY_STORAGE_KEY, serializePreview, STORAGE_KEY, useLab } from "@/features/design-lab/store";

function Probe() {
  const { state, notice } = useLab();
  return <><p data-testid="count">{state.sites.length}</p><p data-testid="name">{state.sites[0]?.name}</p><p data-testid="notice">{notice}</p></>;
}

function refreshStorage(key: string | null = STORAGE_KEY) {
  act(() => { window.dispatchEvent(new StorageEvent("storage", { key })); });
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  dispatch({ type: "reset" });
});
afterEach(() => vi.restoreAllMocks());

describe("browser preview persistence", () => {
  it("migrates validated legacy progress once and retains its original payload", () => {
    render(<Probe />);
    const seed = createSeed();
    const legacy = JSON.stringify({ version: 1, sites: seed.sites.slice(0, 6), engagements: [], mandate: seed.mandate });
    localStorage.setItem(LEGACY_STORAGE_KEY, legacy);
    localStorage.removeItem(STORAGE_KEY);
    refreshStorage();
    expect(screen.getByTestId("count")).toHaveTextContent("6");
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBe(legacy);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toMatchObject({ schemaVersion: 2, mode: "synthetic" });
  });
  it("does not overwrite an unreadable save during ordinary actions", () => {
    render(<Probe />);
    const corrupt = '{"schemaVersion":2,"mode":"synthetic","state":null}';
    localStorage.setItem(STORAGE_KEY, corrupt);
    refreshStorage();
    act(() => { dispatch({ type: "profile", profile: { ...defaultProfile(), name: "Fictional correction" } }); });
    expect(localStorage.getItem(STORAGE_KEY)).toBe(corrupt);
    expect(screen.getByTestId("notice")).toHaveTextContent("Updated in memory only");
    localStorage.setItem(LEGACY_STORAGE_KEY, "retained original");
    localStorage.setItem("sunsum.theme", "light");
    act(() => { dispatch({ type: "reset" }); });
    const recoveryKey = Object.keys(localStorage).find((key) => key.startsWith(`${STORAGE_KEY}-recovery-`));
    expect(recoveryKey).toBeTruthy();
    expect(localStorage.getItem(recoveryKey!)).toBe(corrupt);
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBe("retained original");
    expect(localStorage.getItem("sunsum.theme")).toBe("light");
  });
  it("reports quota failure as memory-only, not successful persistence", () => {
    render(<Probe />);
    const before = localStorage.getItem(STORAGE_KEY);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
    act(() => { dispatch({ type: "note", id: "sweet-auburn", note: "Fictional note" }, "Saved"); });
    expect(screen.getByTestId("notice")).toHaveTextContent("Updated in memory only");
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });
  it("applies validated cross-tab updates and an explicit storage clear", () => {
    render(<Probe />);
    const state = createSeed();
    state.sites[0]!.name = "Cross-tab fictional update";
    localStorage.setItem(STORAGE_KEY, serializePreview(state));
    refreshStorage();
    expect(screen.getByTestId("name")).toHaveTextContent("Cross-tab fictional update");
    localStorage.clear();
    refreshStorage(null);
    expect(screen.getByTestId("name")).toHaveTextContent("Sweet Auburn rooftop");
  });
});
