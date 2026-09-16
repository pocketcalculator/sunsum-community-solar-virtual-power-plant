import {
  DEFAULT_THEME_PREFERENCE,
  LIGHT_SCHEME_QUERY,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
  isThemePreference,
  resolveTheme,
  type ThemePreference,
} from "./theme";

/**
 * The one place that owns the chosen theme in the browser.
 *
 * A module-level store rather than React state, for three reasons: the choice
 * already exists in the document before React runs, because the pre-paint
 * script wrote it; it has to survive being read by more than one component
 * without any of them becoming the owner; and it changes from outside React
 * entirely — another tab, or the device switching to night mode. Pairing this
 * with `useSyncExternalStore` lets React observe all of that without a provider
 * and without a second copy of the truth that could disagree with the document.
 *
 * Every browser API used here is treated as refusable. Storage throws in
 * private-mode Safari and wherever site data is blocked, and `matchMedia` is
 * absent in some test environments. Neither is worth an error page for: the
 * cost of losing them is that the choice is not remembered, which is smaller
 * than the cost of an unreadable page.
 */

const listeners = new Set<() => void>();

let cachedPreference: ThemePreference | null = null;
let cachedQuery: MediaQueryList | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function readStoredPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);

    return stored !== null && isThemePreference(stored)
      ? stored
      : DEFAULT_THEME_PREFERENCE;
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

function writeStoredPreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Refusing to persist only costs the choice its memory. This visit is
    // already correct, so there is nothing to report and nothing to undo.
  }
}

function lightSchemeQuery(): MediaQueryList | null {
  if (!isBrowser() || typeof window.matchMedia !== "function") return null;

  cachedQuery ??= window.matchMedia(LIGHT_SCHEME_QUERY);

  return cachedQuery;
}

function applyResolvedTheme(preference: ThemePreference): void {
  if (!isBrowser()) return;

  document.documentElement.setAttribute(
    THEME_ATTRIBUTE,
    resolveTheme(preference, lightSchemeQuery()?.matches ?? false),
  );
}

function notify(): void {
  for (const listener of listeners) listener();
}

function handleStorage(event: StorageEvent): void {
  // A null key means the whole store was cleared, which also drops the choice.
  if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;

  cachedPreference = null;
  applyResolvedTheme(getThemePreference());
  notify();
}

/** Only changes what is painted while the choice is still "follow the device". */
function handleSchemeChange(): void {
  applyResolvedTheme(getThemePreference());
  notify();
}

function watchSystemScheme(): () => void {
  const query = lightSchemeQuery();

  if (!query) return () => {};

  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", handleSchemeChange);

    return () => query.removeEventListener("change", handleSchemeChange);
  }

  /*
   * Safari only grew `addEventListener` on a media query list in 14, and the
   * versions before it are pinned to hardware that cannot move. Without this
   * branch the theme still works and is still remembered there; it just stops
   * noticing the device switching to night mode, which is the entire job of
   * "follow the device".
   */
  if (typeof query.addListener === "function") {
    query.addListener(handleSchemeChange);

    return () => query.removeListener(handleSchemeChange);
  }

  // Neither shape: some test environments stub the list with no listeners.
  return () => {};
}

let stopWatchingSystemScheme: (() => void) | null = null;

function startWatching(): void {
  if (!isBrowser()) return;

  // Re-apply on the way in. The pre-paint script normally did this already, but
  // it can be blocked — by a content security policy, or by a browser that
  // refuses inline scripts — and this is the first moment the interface can
  // notice and put the document right.
  applyResolvedTheme(getThemePreference());

  window.addEventListener("storage", handleStorage);
  stopWatchingSystemScheme = watchSystemScheme();
}

function stopWatching(): void {
  if (!isBrowser()) return;

  window.removeEventListener("storage", handleStorage);
  stopWatchingSystemScheme?.();
  stopWatchingSystemScheme = null;
}

export function getThemePreference(): ThemePreference {
  if (!isBrowser()) return DEFAULT_THEME_PREFERENCE;

  cachedPreference ??= readStoredPreference();

  return cachedPreference;
}

/**
 * Whether the store is live and a choice would actually be applied.
 *
 * False while the server renders and through hydration, true once React has
 * subscribed. The control uses it to stay disabled until then, because a native
 * radio will happily change its own checked state with no script running and
 * claim a theme the document never adopted.
 */
export function getThemeStoreReady(): boolean {
  return true;
}

export function getServerThemeStoreReady(): boolean {
  return false;
}

/**
 * What the server renders. It cannot know the choice, so it names the default
 * and lets the client correct the control after hydration. Returning anything
 * else would make the server and the first client render disagree.
 */
export function getServerThemePreference(): ThemePreference {
  return DEFAULT_THEME_PREFERENCE;
}

export function setThemePreference(preference: ThemePreference): void {
  if (getThemePreference() === preference) return;

  cachedPreference = preference;
  writeStoredPreference(preference);
  applyResolvedTheme(preference);
  notify();
}

export function subscribeToThemePreference(listener: () => void): () => void {
  listeners.add(listener);

  if (listeners.size === 1) startWatching();

  return () => {
    listeners.delete(listener);

    if (listeners.size === 0) stopWatching();
  };
}

/** Test seam: drops the memoised reads so a case can start from a clean page. */
export function resetThemeStoreForTests(): void {
  cachedPreference = null;
  cachedQuery = null;
}
