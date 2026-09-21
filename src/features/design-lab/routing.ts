export const STATIC_NAVIGATION_EVENT = "sunsum:route-change";
export const SUNROOM_PATH = "/concepts/sunroom";

interface RouteLocation {
  pathname: string;
  search: string;
  hash: string;
}

export function readAppRoute(location: RouteLocation, hashRouting: boolean) {
  const path = hashRouting
    ? location.hash.startsWith("#/") ? location.hash.slice(1) : `/${location.hash}`
    : `${location.pathname}${location.search}${location.hash}`;
  const route = new URL(path, "https://sunsum.invalid");
  if (hashRouting && /^\/app\/?$/.test(route.pathname)) route.pathname = SUNROOM_PATH;
  if (/^\/concepts(?:\/(?:sunroom|gridline))?\/?$/.test(route.pathname)) route.pathname = SUNROOM_PATH;
  return route;
}

export function sunroomHref(query: Record<string, string | string[] | undefined> = {}) {
  const params = new URLSearchParams();
  for (const key of ["role", "view", "project", "scope", "task"]) {
    const value = query[key];
    if (typeof value === "string") params.append(key, value);
    else if (Array.isArray(value)) for (const item of value) params.append(key, item);
  }
  const search = params.toString();
  return search ? `${SUNROOM_PATH}?${search}` : SUNROOM_PATH;
}

export function staticHref(href: string) {
  return href.startsWith("/") && !href.startsWith("//") ? `#${href}` : href;
}

function usesHashRouting() {
  return document.documentElement.dataset.sunsumRouting === "hash";
}

export function currentRouteSearch() {
  return readAppRoute(window.location, usesHashRouting()).searchParams;
}

export function pushAppRoute(path: string) {
  const hashRouting = usesHashRouting();
  window.history.pushState(null, "", hashRouting ? staticHref(path) : path);
  if (hashRouting) window.dispatchEvent(new Event(STATIC_NAVIGATION_EVENT));
}
