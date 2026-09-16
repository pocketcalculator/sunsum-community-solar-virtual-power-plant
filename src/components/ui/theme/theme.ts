/**
 * Theme vocabulary.
 *
 * Pure data and pure functions: no DOM, no React, no storage. Everything that
 * has to agree on what a theme is — the pre-paint script, the store, the
 * toggle and the tests — reads its constants from here, so there is one
 * spelling of the storage key, the attribute and the media query rather than
 * four that have to be kept in step by hand.
 *
 * Two ideas are deliberately kept apart:
 *
 * - a `ThemePreference` is what the person chose, and "system" is a real
 *   choice that means "keep following the device";
 * - a `Theme` is what is actually painted, and is only ever light or dark.
 *
 * Collapsing them loses the ability to return to the device setting once an
 * explicit choice has been made.
 */

export const LIGHT_THEME = "light";
export const DARK_THEME = "dark";

/** What is painted. `data-theme` on `<html>` always holds one of these. */
export type Theme = typeof LIGHT_THEME | typeof DARK_THEME;

export const SYSTEM_PREFERENCE = "system";

/** What the person chose, which may be "follow the device". */
export type ThemePreference = Theme | typeof SYSTEM_PREFERENCE;

/** Listed in the order the toggle presents them. */
export const THEME_PREFERENCES: readonly ThemePreference[] = [
  LIGHT_THEME,
  DARK_THEME,
  SYSTEM_PREFERENCE,
];

/**
 * No stored choice means the device decides, which is the only default that
 * cannot be wrong for somebody who has already told their operating system
 * what they want.
 */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = SYSTEM_PREFERENCE;

export const THEME_STORAGE_KEY = "sunsum.theme";
export const THEME_ATTRIBUTE = "data-theme";

/**
 * Asked as "light?" rather than "dark?" so that a browser without
 * `prefers-color-scheme`, or without `matchMedia` at all, answers false and
 * lands on dark — the baseline `:root` already paints. Asking the other way
 * round would make an unanswerable question mean "light", and the stylesheet
 * would disagree with the attribute.
 */
export const LIGHT_SCHEME_QUERY = "(prefers-color-scheme: light)";

export function isThemePreference(value: string): value is ThemePreference {
  return THEME_PREFERENCES.some((preference) => preference === value);
}

export function isTheme(value: string): value is Theme {
  return value === LIGHT_THEME || value === DARK_THEME;
}

/** Turns a choice into the theme to paint, given what the device reports. */
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersLight: boolean,
): Theme {
  if (preference !== SYSTEM_PREFERENCE) return preference;

  return systemPrefersLight ? LIGHT_THEME : DARK_THEME;
}
