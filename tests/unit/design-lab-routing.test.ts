import { afterEach, describe, expect, it, vi } from "vitest";
import { currentRouteSearch, pushAppRoute, readAppRoute, staticHref, sunroomHref, STATIC_NAVIGATION_EVENT } from "@/features/design-lab/routing";

afterEach(() => {
  delete document.documentElement.dataset.sunsumRouting;
  window.history.replaceState(null, "", "/");
});

describe("portable demo routing", () => {
  it("preserves Next.js Sunroom query and fragment routes", () => {
    const route = readAppRoute({ pathname: "/concepts/sunroom", search: "?role=operator&view=queue", hash: "#lab-content" }, false);
    expect(route.pathname).toBe("/concepts/sunroom");
    expect(route.search).toBe("?role=operator&view=queue");
    expect(route.hash).toBe("#lab-content");
  });

  it("reads a direct hosted link without losing the project or role", () => {
    const route = readAppRoute({ pathname: "/app/sunsum-ui-demo/", search: "", hash: "#/concepts/sunroom?role=investor&project=sweet-auburn#lab-content" }, true);
    expect(route.pathname).toBe("/concepts/sunroom");
    expect(route.searchParams.get("role")).toBe("investor");
    expect(route.searchParams.get("project")).toBe("sweet-auburn");
    expect(route.hash).toBe("#lab-content");
  });

  it.each(["/app", "/app/"])("aliases %s only in the explicitly static entry", (pathname) => {
    const query = "?role=investor&view=portfolio";
    expect(readAppRoute({ pathname: "/sunsum-ui-demo/", search: "", hash: `#${pathname}${query}` }, true).pathname)
      .toBe("/concepts/sunroom");
    expect(readAppRoute({ pathname, search: query, hash: "" }, false).pathname).toBe(pathname);
  });

  it.each(["", "#about", "#faq", "#lab-content"])("opens the public arrival for a bare hosted URL or fragment %j", (hash) => {
    const route = readAppRoute({ pathname: "/app/demo/", search: "", hash }, true);
    expect(route.pathname).toBe("/");
    expect(route.hash).toBe(hash);
  });

  it("keeps an explicit hosted #/ on the original public landing", () => {
    const route = readAppRoute({ pathname: "/app/sunsum-ui-demo/", search: "", hash: "#/" }, true);
    expect(route.pathname).toBe("/");
    expect(route.search).toBe("");
    expect(route.hash).toBe("");
  });

  describe.each([
    { mode: "Next.js", hashRouting: false },
    { mode: "hosted", hashRouting: true },
  ])("$mode route normalization", ({ hashRouting }) => {
    it.each(["/concepts", "/concepts/", "/concepts/gridline", "/concepts/gridline/", "/concepts/sunroom/"])(
      "canonicalizes %s without changing query values or the fragment",
      (pathname) => {
        const search = "?role=operator&view=documents&project=sweet-auburn&scope=sweet-auburn&task=roof%2Barea+review&ref=first&ref=second";
        const hash = "#lab-content";
        const location = hashRouting
          ? { pathname: "/app/sunsum-ui-demo/", search: "", hash: `#${pathname}${search}${hash}` }
          : { pathname, search, hash };
        const route = readAppRoute(location, hashRouting);
        expect(route.pathname).toBe("/concepts/sunroom");
        expect(route.search).toBe(search);
        expect(route.hash).toBe(hash);
        expect(route.searchParams.get("role")).toBe("operator");
        expect(route.searchParams.get("project")).toBe("sweet-auburn");
        expect(route.searchParams.get("task")).toBe("roof+area review");
        expect(route.searchParams.getAll("ref")).toEqual(["first", "second"]);
      },
    );

    it.each([
      { pathname: "/", search: "", hash: "#journey" },
      { pathname: "/join", search: "?start=i-have-roof", hash: "" },
      { pathname: "/dashboard/site-owner", search: "", hash: "" },
    ])("keeps $pathname as an original public route", ({ pathname, search, hash }) => {
      const location = hashRouting
        ? { pathname: "/app/sunsum-ui-demo/", search: "", hash: `#${pathname}${search}${hash}` }
        : { pathname, search, hash };
      const route = readAppRoute(location, hashRouting);
      expect(route.pathname).toBe(pathname);
      expect(route.search).toBe(search);
      expect(route.hash).toBe(hash);
    });

    it.each(["/concepts/unknown", "/concepts/gridline/details", "/concepts/sunroom-extra"])(
      "does not turn the unknown concept path %s into Sunroom",
      (pathname) => {
        const location = hashRouting
          ? { pathname: "/app/sunsum-ui-demo/", search: "", hash: `#${pathname}?role=operator` }
          : { pathname, search: "?role=operator", hash: "" };
        const route = readAppRoute(location, hashRouting);
        expect(route.pathname).toBe(pathname);
        expect(route.searchParams.get("role")).toBe("operator");
      },
    );
  });

  it("keeps external destinations external and preserves page anchors", () => {
    expect(staticHref("/")).toBe("#/");
    expect(staticHref("/concepts/sunroom?role=operator&view=pipeline#lab-content")).toBe("#/concepts/sunroom?role=operator&view=pipeline#lab-content");
    expect(staticHref("/join?start=i-have-roof")).toBe("#/join?start=i-have-roof");
    expect(staticHref("/#journey")).toBe("#/#journey");
    expect(staticHref("https://github.com/pocketcalculator")).toBe("https://github.com/pocketcalculator");
    expect(staticHref("//example.invalid/page")).toBe("//example.invalid/page");
    expect(staticHref("#lab-content")).toBe("#lab-content");
  });

  it("updates hosted routes without escaping the project's hosting directory", () => {
    document.documentElement.dataset.sunsumRouting = "hash";
    window.history.replaceState(null, "", "/app/sunsum-ui-demo/");
    const listener = vi.fn();
    window.addEventListener(STATIC_NAVIGATION_EVENT, listener);
    pushAppRoute("/concepts/sunroom?role=operator&view=pipeline&project=sweet-auburn");
    expect(window.location.pathname).toBe("/app/sunsum-ui-demo/");
    expect(window.location.hash).toBe("#/concepts/sunroom?role=operator&view=pipeline&project=sweet-auburn");
    expect(currentRouteSearch().get("role")).toBe("operator");
    expect(currentRouteSearch().get("view")).toBe("pipeline");
    expect(currentRouteSearch().get("project")).toBe("sweet-auburn");
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(STATIC_NAVIGATION_EVENT, listener);
  });

  it("does not change the existing local Next.js navigation mode", () => {
    pushAppRoute("/concepts/sunroom?role=site-owner&view=sites");
    expect(window.location.pathname).toBe("/concepts/sunroom");
    expect(window.location.hash).toBe("");
    expect(currentRouteSearch().get("view")).toBe("sites");
  });
});

describe("Sunroom redirect destinations", () => {
  it("defaults to the single Sunroom preview", () => {
    expect(sunroomHref()).toBe("/concepts/sunroom");
  });

  it("preserves and URL-encodes all five permitted context parameters", () => {
    expect(sunroomHref({
      task: "task #1?", scope: "roof/a+b", project: "Sweet Auburn & solar", view: "documents", role: "operator",
    })).toBe("/concepts/sunroom?role=operator&view=documents&project=Sweet+Auburn+%26+solar&scope=roof%2Fa%2Bb&task=task+%231%3F");
  });

  it.each(["role", "view", "project", "scope", "task"])("appends every %s array value, including empty and repeated values", (key) => {
    expect(sunroomHref({ [key]: ["first value", "", "a+b", "first value"] }))
      .toBe(`/concepts/sunroom?${key}=first+value&${key}=&${key}=a%2Bb&${key}=first+value`);
  });

  it("omits undefined parameters and empty arrays without a dangling query delimiter", () => {
    expect(sunroomHref({ role: undefined, view: [], project: undefined, scope: [], task: undefined }))
      .toBe("/concepts/sunroom");
  });

  it("retains an explicitly empty string value", () => {
    expect(sunroomHref({ scope: "" })).toBe("/concepts/sunroom?scope=");
  });

  it("discards arbitrary redirects and all non-context parameters", () => {
    expect(sunroomHref({
      role: "operator", view: "queue", redirect: "https://example.invalid/", next: "//example.invalid/",
      returnTo: "/join", ignored: ["first", "second"],
    })).toBe("/concepts/sunroom?role=operator&view=queue");
    expect(sunroomHref({ redirect: "/join", ignored: "discard" })).toBe("/concepts/sunroom");
  });
});
