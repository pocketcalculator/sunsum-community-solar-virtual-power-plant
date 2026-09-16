import {
  DARK_THEME,
  LIGHT_SCHEME_QUERY,
  LIGHT_THEME,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
} from "./theme";

/**
 * The script that decides the theme before the first paint.
 *
 * It has to run synchronously, ahead of the document body, because the
 * alternative is painting the wrong theme and correcting it once React has
 * hydrated — the white flash that makes dark mode feel broken. Nothing that
 * arrives with the bundle can be that early, so this is a string rather than a
 * module.
 *
 * It is written from the same constants the rest of the module uses, so the
 * storage key, the attribute and the media query cannot drift from the store
 * that reads them afterwards. It is deliberately old-fashioned JavaScript: it
 * is inlined untranspiled, so it has to parse in whatever the visitor is
 * running, including a browser too old for the interface it is introducing.
 *
 * Every step is inside a `try`. A refused storage read, a missing `matchMedia`
 * or a locked-down document all end the same way — the attribute is never set,
 * and the dark `:root` baseline in `tokens.css` paints exactly as it did before
 * themes existed.
 */

/**
 * Safe to inline: every argument is a module constant declared in `theme.ts`,
 * none contains `<`, and `tests/unit/theme/themeInitScript.test.ts` holds that
 * true, so the result cannot close the surrounding script element.
 */
function literal(value: string): string {
  return JSON.stringify(value);
}

export const THEME_INIT_SCRIPT = `(function () {
  try {
    var stored = null;
    try {
      stored = window.localStorage.getItem(${literal(THEME_STORAGE_KEY)});
    } catch (storageError) {
      stored = null;
    }
    var prefersLight =
      typeof window.matchMedia === "function" &&
      window.matchMedia(${literal(LIGHT_SCHEME_QUERY)}).matches;
    var theme =
      stored === ${literal(LIGHT_THEME)} || stored === ${literal(DARK_THEME)}
        ? stored
        : prefersLight
          ? ${literal(LIGHT_THEME)}
          : ${literal(DARK_THEME)};
    document.documentElement.setAttribute(${literal(THEME_ATTRIBUTE)}, theme);
  } catch (error) {}
})();`;
