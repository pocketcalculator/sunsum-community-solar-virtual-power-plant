import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DARK_THEME,
  LIGHT_SCHEME_QUERY,
  LIGHT_THEME,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
} from "@/components/ui/theme/theme";
import { resetThemeStoreForTests } from "@/components/ui/theme/themeStore";
import { ThemeToggle } from "@/components/ui/theme/ThemeToggle";

/**
 * The store's rules are tested against the store. This covers what only the
 * assembled control can show: that the three choices are reachable, named, and
 * connected to what the document actually paints.
 */

function stubDevice(prefersLight: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query === LIGHT_SCHEME_QUERY && prefersLight,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function paintedTheme(): string | null {
  return document.documentElement.getAttribute(THEME_ATTRIBUTE);
}

function choose(name: RegExp): void {
  fireEvent.click(screen.getByRole("radio", { name }));
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
  resetThemeStoreForTests();
  stubDevice(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
  resetThemeStoreForTests();
});

describe("the theme toggle", () => {
  it("updates the compact state when the device changes until a preference is chosen", () => {
    let light = true;
    let changed = () => {};
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      get matches() { return query === LIGHT_SCHEME_QUERY && light; },
      media: query,
      addEventListener: (_event: string, listener: () => void) => { changed = listener; },
      removeEventListener: vi.fn(),
    })));
    render(<ThemeToggle compact />);
    const toggle = screen.getByRole("switch", { name: "Dark appearance" });
    expect(toggle).not.toBeChecked();
    act(() => { light = false; changed(); });
    expect(toggle).toBeChecked();
    expect(paintedTheme()).toBe(DARK_THEME);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    act(() => { light = true; changed(); light = false; changed(); });
    expect(toggle).not.toBeChecked();
    expect(paintedTheme()).toBe(LIGHT_THEME);
  });

  it("offers a compact binary switch initialized from the device without saving a default", () => {
    stubDevice(true);
    render(<ThemeToggle compact />);
    const toggle = screen.getByRole("switch", { name: "Dark appearance" });
    expect(toggle).not.toBeChecked();
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    expect(paintedTheme()).toBe(DARK_THEME);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(DARK_THEME);
    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(paintedTheme()).toBe(LIGHT_THEME);
  });

  it("presents the three choices as one named group of radios", () => {
    render(<ThemeToggle />);

    const group = screen.getByRole("group", { name: /colour theme/i });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);

    for (const name of [/^light$/i, /^dark$/i, /^system$/i]) {
      expect(within(group).getByRole("radio", { name })).toBeEnabled();
    }
  });

  it("starts on the device setting when nothing has been chosen", () => {
    render(<ThemeToggle />);

    expect(screen.getByRole("radio", { name: /^system$/i })).toBeChecked();
  });

  it.each([
    [/^light$/i, LIGHT_THEME],
    [/^dark$/i, DARK_THEME],
  ] as const)("paints and remembers the chosen theme", (name, expected) => {
    render(<ThemeToggle />);

    choose(name);

    expect(screen.getByRole("radio", { name })).toBeChecked();
    expect(paintedTheme()).toBe(expected);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(expected);
  });

  it("never leaves two choices selected at once", () => {
    render(<ThemeToggle />);

    choose(/^light$/i);
    choose(/^dark$/i);

    expect(screen.getAllByRole("radio", { checked: true })).toHaveLength(1);
    expect(screen.getByRole("radio", { name: /^dark$/i })).toBeChecked();
  });

  /**
   * The point of keeping "System" on the list: an explicit choice has to be
   * undoable, or the device setting is lost for good after one click.
   */
  it("can hand control back to the device after a choice was made", () => {
    vi.unstubAllGlobals();
    stubDevice(true);
    render(<ThemeToggle />);

    choose(/^dark$/i);
    expect(paintedTheme()).toBe(DARK_THEME);

    choose(/^system$/i);

    expect(screen.getByRole("radio", { name: /^system$/i })).toBeChecked();
    expect(paintedTheme()).toBe(LIGHT_THEME);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
  });

  it("shows the stored choice rather than the default", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, LIGHT_THEME);
    resetThemeStoreForTests();

    render(<ThemeToggle />);

    expect(screen.getByRole("radio", { name: /^light$/i })).toBeChecked();
  });

  it("accepts a layout class without losing its own styling", () => {
    const { container } = render(<ThemeToggle className="from-the-outside" />);
    const group = container.querySelector("fieldset");

    expect(group).toHaveClass("from-the-outside");
    expect(group?.className.split(" ").length).toBeGreaterThan(1);
  });

  it("is usable once the client store is live", () => {
    const { container } = render(<ThemeToggle />);

    expect(container.querySelector("fieldset")).not.toBeDisabled();
    expect(screen.getByRole("radio", { name: /^light$/i })).toBeEnabled();
  });

  it("gives each control a name that does not depend on the icon", () => {
    render(<ThemeToggle />);

    for (const label of ["Light", "Dark", "System"]) {
      expect(screen.getByLabelText(label)).toBeInstanceOf(HTMLInputElement);
    }
  });
});
