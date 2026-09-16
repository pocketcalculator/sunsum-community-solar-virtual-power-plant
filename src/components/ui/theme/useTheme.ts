"use client";

import { useSyncExternalStore } from "react";
import type { ThemePreference } from "./theme";
import {
  getServerThemePreference,
  getServerThemeStoreReady,
  getThemePreference,
  getThemeStoreReady,
  setThemePreference,
  subscribeToThemePreference,
} from "./themeStore";

export interface ThemeControl {
  /** The choice on record, which may be "follow the device". */
  readonly preference: ThemePreference;
  readonly setPreference: (preference: ThemePreference) => void;
  /**
   * False until the store is live. Until then a choice cannot be applied, and a
   * control that looks usable would be lying about what it does.
   */
  readonly ready: boolean;
}

/**
 * Reads and changes the chosen theme.
 *
 * `useSyncExternalStore` is what makes the server render and the first client
 * render agree: the server has no way to know the choice, so both start from
 * the default and React re-renders once with the real one. Reading storage
 * during the first render instead would hydrate a control that contradicts the
 * markup React just matched.
 *
 * What is painted never waits for any of this. The pre-paint script settled it
 * before React existed; this only keeps the control honest about it.
 */
export function useTheme(): ThemeControl {
  const preference = useSyncExternalStore(
    subscribeToThemePreference,
    getThemePreference,
    getServerThemePreference,
  );
  const ready = useSyncExternalStore(
    subscribeToThemePreference,
    getThemeStoreReady,
    getServerThemeStoreReady,
  );

  return { preference, ready, setPreference: setThemePreference };
}
