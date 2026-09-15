/**
 * Public interface of the participation feature.
 *
 * Routes import from here only — component files, content and styles stay
 * internal so the feature can be reshaped without breaking callers. Everything
 * exported is browser-safe: this feature has no server-only data access.
 */

export { LandingPage } from "./components/LandingPage";
export { PublicShell } from "./components/PublicShell";
export { ENTRY_PATHS, entryPathHref, type EntryPath } from "./paths";
