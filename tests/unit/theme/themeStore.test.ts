import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DARK_THEME,
  DEFAULT_THEME_PREFERENCE,
  LIGHT_SCHEME_QUERY,
  LIGHT_THEME,
  SYSTEM_PREFERENCE,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
} from "@/components/ui/theme/theme";
import {
  getServerThemePreference,
  getServerThemeStoreReady,
  getThemePreference,
  getThemeStoreReady,
  resetThemeStoreForTests,
  setThemePreference,
  subscribeToThemePreference,
} from "@/components/ui/theme/themeStore";

/**
 * A device whose colour scheme can be changed mid-test, which is the only way
 * to check that "follow the device" keeps following after the page has loaded.
 */
function stubDevice(prefersLight: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: prefersLight,
    media: LIGHT_SCHEME_QUERY,
    addEventListener: (_type: string, listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: () => void) => {
      listeners.delete(listener);
    },
  };

  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => query),
  );

  return {
    switchTo(nextPrefersLight: boolean) {
      query.matches = nextPrefersLight;
      for (const listener of listeners) listener();
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

function paintedTheme(): string | null {
  return document.documentElement.getAttribute(THEME_ATTRIBUTE);
}

/** Subscribing is what starts the store watching, exactly as React does. */
function activate(): () => void {
  return subscribeToThemePreference(() => {});
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
  resetThemeStoreForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
  resetThemeStoreForTests();
});

describe("reading the chosen theme", () => {
  it("follows the device when nothing has been chosen", () => {
    expect(getThemePreference()).toBe(SYSTEM_PREFERENCE);
  });

  it("reports what the server can know, which is only the default", () => {
    expect(getServerThemePreference()).toBe(DEFAULT_THEME_PREFERENCE);
  });

  /**
   * The control is disabled until this turns true. A native radio will change
   * its own checked state with no script running, so anything that looks usable
   * before the store is live would claim a theme the document never adopted.
   */
  it("admits it cannot apply a choice until the client is running", () => {
    expect(getServerThemeStoreReady()).toBe(false);
    expect(getThemeStoreReady()).toBe(true);
  });

  it.each([LIGHT_THEME, DARK_THEME, SYSTEM_PREFERENCE])(
    "reads a stored %j back",
    (stored) => {
      window.localStorage.setItem(THEME_STORAGE_KEY, stored);
      resetThemeStoreForTests();

      expect(getThemePreference()).toBe(stored);
    },
  );

  it.each(["", "Light", "auto", "__proto__"])(
    "ignores a stored %j rather than trusting it",
    (stored) => {
      window.localStorage.setItem(THEME_STORAGE_KEY, stored);
      resetThemeStoreForTests();

      expect(getThemePreference()).toBe(SYSTEM_PREFERENCE);
    },
  );

  it("still answers when storage refuses to be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage is blocked for this site.");
    });
    resetThemeStoreForTests();

    expect(getThemePreference()).toBe(SYSTEM_PREFERENCE);
  });
});

describe("choosing a theme", () => {
  it("records the choice, paints it, and tells its listeners once", () => {
    stubDevice(false);
    const listener = vi.fn();
    const unsubscribe = subscribeToThemePreference(listener);

    setThemePreference(LIGHT_THEME);

    expect(getThemePreference()).toBe(LIGHT_THEME);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(LIGHT_THEME);
    expect(paintedTheme()).toBe(LIGHT_THEME);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("says nothing when the choice has not changed", () => {
    stubDevice(false);
    setThemePreference(DARK_THEME);

    const listener = vi.fn();
    const unsubscribe = subscribeToThemePreference(listener);
    listener.mockClear();

    setThemePreference(DARK_THEME);

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it.each([
    [true, LIGHT_THEME],
    [false, DARK_THEME],
  ])(
    "resolves the system choice against the device (light: %j)",
    (prefersLight, expected) => {
      stubDevice(prefersLight);
      setThemePreference(DARK_THEME);
      setThemePreference(SYSTEM_PREFERENCE);

      expect(paintedTheme()).toBe(expected);
    },
  );

  /**
   * The page has to be right for this visit even when it cannot be remembered
   * for the next one: private browsing and blocked site data both refuse the
   * write, and neither is a reason to leave the person on the wrong theme.
   */
  it("still paints the choice when storage refuses to keep it", () => {
    stubDevice(false);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage is full.");
    });

    expect(() => setThemePreference(LIGHT_THEME)).not.toThrow();
    expect(getThemePreference()).toBe(LIGHT_THEME);
    expect(paintedTheme()).toBe(LIGHT_THEME);
  });
});

describe("keeping up with the world outside the page", () => {
  it("repaints when the device changes and the choice is to follow it", () => {
    const device = stubDevice(false);
    const unsubscribe = activate();

    expect(paintedTheme()).toBe(DARK_THEME);

    device.switchTo(true);

    expect(paintedTheme()).toBe(LIGHT_THEME);
    unsubscribe();
  });

  it("ignores the device once a theme has been chosen outright", () => {
    const device = stubDevice(false);
    const unsubscribe = activate();
    setThemePreference(DARK_THEME);

    device.switchTo(true);

    expect(paintedTheme()).toBe(DARK_THEME);
    unsubscribe();
  });

  it("adopts a choice made in another tab", () => {
    stubDevice(false);
    const listener = vi.fn();
    const unsubscribe = subscribeToThemePreference(listener);

    window.localStorage.setItem(THEME_STORAGE_KEY, LIGHT_THEME);
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: THEME_STORAGE_KEY,
        newValue: LIGHT_THEME,
      }),
    );

    expect(getThemePreference()).toBe(LIGHT_THEME);
    expect(paintedTheme()).toBe(LIGHT_THEME);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it("re-reads when another tab clears site data entirely", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, LIGHT_THEME);
    resetThemeStoreForTests();
    stubDevice(false);
    const unsubscribe = activate();

    expect(getThemePreference()).toBe(LIGHT_THEME);

    window.localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: null }));

    expect(getThemePreference()).toBe(SYSTEM_PREFERENCE);
    expect(paintedTheme()).toBe(DARK_THEME);
    unsubscribe();
  });

  it("leaves an unrelated storage key alone", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, LIGHT_THEME);
    resetThemeStoreForTests();
    stubDevice(false);
    const listener = vi.fn();
    const unsubscribe = subscribeToThemePreference(listener);
    listener.mockClear();

    window.dispatchEvent(new StorageEvent("storage", { key: "something-else" }));

    expect(listener).not.toHaveBeenCalled();
    expect(getThemePreference()).toBe(LIGHT_THEME);
    unsubscribe();
  });

  /**
   * The pre-paint script normally settles this, but a content security policy
   * can stop it running. Subscribing is the first moment the interface can
   * notice the document is wrong and put it right.
   */
  it("puts the document right if the pre-paint script never ran", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, LIGHT_THEME);
    resetThemeStoreForTests();
    stubDevice(false);

    expect(paintedTheme()).toBeNull();

    const unsubscribe = activate();

    expect(paintedTheme()).toBe(LIGHT_THEME);
    unsubscribe();
  });

  it("stops listening to the device once nothing is subscribed", () => {
    const device = stubDevice(false);
    const unsubscribe = activate();

    expect(device.listenerCount).toBe(1);

    unsubscribe();

    expect(device.listenerCount).toBe(0);
  });

  it("works on a browser with no matchMedia at all", () => {
    vi.stubGlobal("matchMedia", undefined);

    const unsubscribe = activate();

    expect(paintedTheme()).toBe(DARK_THEME);
    expect(() => setThemePreference(LIGHT_THEME)).not.toThrow();
    expect(paintedTheme()).toBe(LIGHT_THEME);
    unsubscribe();
  });
});
