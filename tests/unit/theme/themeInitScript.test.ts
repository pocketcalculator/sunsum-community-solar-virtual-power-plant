import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DARK_THEME,
  LIGHT_SCHEME_QUERY,
  LIGHT_THEME,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
} from "@/components/ui/theme/theme";
import { THEME_INIT_SCRIPT } from "@/components/ui/theme/themeInitScript";

/**
 * The script runs before anything else on the page and cannot be debugged from
 * inside the application, so it is exercised the way the browser will run it:
 * evaluated against a real document, with the browser APIs it depends on taken
 * away one at a time.
 */
function runInitScript(): void {
  new Function(THEME_INIT_SCRIPT)();
}

function stubSystemPrefersLight(prefersLight: boolean): void {
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

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
});

describe("the pre-paint script as text", () => {
  it("cannot close the script element that carries it", () => {
    expect(THEME_INIT_SCRIPT).not.toContain("</");
    expect(THEME_INIT_SCRIPT).not.toContain("<!--");
  });

  it("is written from the shared constants rather than its own copies", () => {
    expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(THEME_STORAGE_KEY));
    expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(THEME_ATTRIBUTE));
    expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(LIGHT_SCHEME_QUERY));
  });
});

describe("the pre-paint script as behaviour", () => {
  it.each([LIGHT_THEME, DARK_THEME])("honours a stored %j", (stored) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, stored);
    // The opposite of what the device asks for, to prove the choice wins.
    stubSystemPrefersLight(stored === DARK_THEME);

    runInitScript();

    expect(paintedTheme()).toBe(stored);
  });

  it("follows the device when nothing has been chosen", () => {
    stubSystemPrefersLight(true);

    runInitScript();

    expect(paintedTheme()).toBe(LIGHT_THEME);
  });

  it("paints dark when the device does not ask for light", () => {
    stubSystemPrefersLight(false);

    runInitScript();

    expect(paintedTheme()).toBe(DARK_THEME);
  });

  it.each(["system", "", "Light", "__proto__", "solarized"])(
    "falls back to the device for a stored %j",
    (stored) => {
      window.localStorage.setItem(THEME_STORAGE_KEY, stored);
      stubSystemPrefersLight(true);

      runInitScript();

      expect(paintedTheme()).toBe(LIGHT_THEME);
    },
  );

  it("still decides when storage refuses to be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage is blocked for this site.");
    });
    stubSystemPrefersLight(true);

    expect(runInitScript).not.toThrow();
    expect(paintedTheme()).toBe(LIGHT_THEME);
  });

  it("paints dark when the browser cannot be asked about colour schemes", () => {
    vi.stubGlobal("matchMedia", undefined);

    expect(runInitScript).not.toThrow();
    expect(paintedTheme()).toBe(DARK_THEME);
  });

  /**
   * The attribute being absent is meaningful: `tokens.css` paints the dark
   * baseline for exactly that case, so failing without setting anything leaves
   * the interface as it was before themes existed.
   */
  it("leaves no attribute behind when the document refuses the write", () => {
    vi.stubGlobal("matchMedia", undefined);
    vi.spyOn(document.documentElement, "setAttribute").mockImplementation(
      () => {
        throw new Error("The document is locked down.");
      },
    );

    expect(runInitScript).not.toThrow();
    expect(paintedTheme()).toBeNull();
  });
});
