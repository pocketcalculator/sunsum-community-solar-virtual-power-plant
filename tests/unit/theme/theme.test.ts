import { describe, expect, it } from "vitest";
import {
  DARK_THEME,
  DEFAULT_THEME_PREFERENCE,
  LIGHT_SCHEME_QUERY,
  LIGHT_THEME,
  SYSTEM_PREFERENCE,
  THEME_PREFERENCES,
  isTheme,
  isThemePreference,
  resolveTheme,
} from "@/components/ui/theme/theme";

describe("theme vocabulary", () => {
  it("offers exactly the three choices the toggle presents, in order", () => {
    expect(THEME_PREFERENCES).toEqual([
      LIGHT_THEME,
      DARK_THEME,
      SYSTEM_PREFERENCE,
    ]);
  });

  it("defaults to following the device rather than imposing a theme", () => {
    expect(DEFAULT_THEME_PREFERENCE).toBe(SYSTEM_PREFERENCE);
  });

  it.each([LIGHT_THEME, DARK_THEME, SYSTEM_PREFERENCE])(
    "accepts %j as a choice",
    (value) => {
      expect(isThemePreference(value)).toBe(true);
    },
  );

  it.each(["", "Light", "auto", "solarized", "__proto__", "constructor"])(
    "rejects %j as a choice",
    (value) => {
      expect(isThemePreference(value)).toBe(false);
    },
  );

  it.each([LIGHT_THEME, DARK_THEME])("accepts %j as a painted theme", (value) => {
    expect(isTheme(value)).toBe(true);
  });

  it("does not accept the system choice as something that can be painted", () => {
    expect(isTheme(SYSTEM_PREFERENCE)).toBe(false);
  });
});

describe("resolving a choice into a theme", () => {
  it.each([
    [LIGHT_THEME, true],
    [LIGHT_THEME, false],
    [DARK_THEME, true],
    [DARK_THEME, false],
  ] as const)(
    "paints %j whatever the device reports (light: %j)",
    (preference, systemPrefersLight) => {
      expect(resolveTheme(preference, systemPrefersLight)).toBe(preference);
    },
  );

  it("follows the device when the choice is to follow it", () => {
    expect(resolveTheme(SYSTEM_PREFERENCE, true)).toBe(LIGHT_THEME);
    expect(resolveTheme(SYSTEM_PREFERENCE, false)).toBe(DARK_THEME);
  });

  /**
   * The polarity matters. A browser that cannot answer the question reports
   * false, and false has to mean dark, because dark is what the stylesheet
   * paints when no attribute is set.
   */
  it("asks the device about light, so an unanswerable question means dark", () => {
    expect(LIGHT_SCHEME_QUERY).toBe("(prefers-color-scheme: light)");
    expect(resolveTheme(SYSTEM_PREFERENCE, false)).toBe(DARK_THEME);
  });
});
