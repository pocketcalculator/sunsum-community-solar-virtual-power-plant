import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { isIntentOptionId } from "@/domain/intents";
import { Assistant } from "@/features/assistant";
import { DesignLab, allowedView, isRole, readAppRoute, resolveConfiguration, staticHref, sunroomHref, SUNROOM_PATH, STATIC_NAVIGATION_EVENT } from "@/features/design-lab";
import { CreateProfileFlow } from "@/features/onboarding";
import { ENTRY_PATHS, LandingPage, PageAudioPlayer, PageAudioProvider, PublicShell, entryPathHref, pageAudio } from "@/features/participation";
import { SiteOwnerDashboard } from "@/features/site-owner-dashboard";
import { PublicStoryPage } from "@/features/community-context";
import StaticLink from "./Link";
import "../app/globals.css";

const configuration = resolveConfiguration({
  SUNSUM_PUBLIC_DATA_MODE: import.meta.env.SUNSUM_PUBLIC_DATA_MODE,
  SUNSUM_PUBLIC_API_BASE_URL: import.meta.env.SUNSUM_PUBLIC_API_BASE_URL,
});

function subscribeRoute(listener: () => void) {
  window.addEventListener("hashchange", listener);
  window.addEventListener("popstate", listener);
  window.addEventListener(STATIC_NAVIGATION_EVENT, listener);
  return () => {
    window.removeEventListener("hashchange", listener);
    window.removeEventListener("popstate", listener);
    window.removeEventListener(STATIC_NAVIGATION_EVENT, listener);
  };
}

function PublicPage({ children }: { children: ReactNode }) {
  const options = ENTRY_PATHS.map((path) => ({ href: entryPathHref(path), label: path.label }));
  return <PageAudioProvider><PublicShell headerAction={<Assistant options={options} />}
    footerAction={<StaticLink href="/dashboard/site-owner">Site owner illustration</StaticLink>}
    workspaceLinks={[
      { id: "site-owner", href: sunroomHref({ role: "site-owner", view: "sites" }), label: "Fictional site owner workspace" },
      { id: "financier", href: sunroomHref({ role: "investor", view: "portfolio" }), label: "Fictional investor workspace" },
      { id: "operator", href: sunroomHref({ role: "operator", view: "queue" }), label: "Fictional operator workspace" },
    ]}>{children}</PublicShell></PageAudioProvider>;
}

function StaticApp() {
  const hash = useSyncExternalStore(subscribeRoute, () => window.location.hash, () => "");
  const route = readAppRoute({ pathname: "/", search: "", hash }, true);
  const pathname = route.pathname;
  const anchor = route.hash;
  const title = pathname === SUNROOM_PATH ? "Sunroom - SunSum Preview" : "SunSum";
  const canonicalHash = staticHref(`${pathname}${route.search}${anchor}`);
  useEffect(() => {
    if (hash.startsWith("#/") && hash !== canonicalHash) {
      window.history.replaceState(window.history.state, "", canonicalHash);
      window.dispatchEvent(new Event(STATIC_NAVIGATION_EVENT));
    }
  }, [hash, canonicalHash]);
  useEffect(() => {
    if (anchor) document.getElementById(anchor.slice(1))?.scrollIntoView();
    else window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname, anchor]);
  return <><title>{title}</title><StaticScene route={route} /></>;
}

function StaticScene({ route }: { route: URL }) {
  const pathname = route.pathname;
  if (pathname === SUNROOM_PATH) {
    const candidate = route.searchParams.get("role") ?? "site-owner";
    const role = isRole(candidate) ? candidate : "site-owner";
    return <DesignLab initialRole={role}
      initialView={allowedView(role, route.searchParams.get("view") ?? "overview")}
      initialProject={route.searchParams.get("project") ?? undefined}
      initialScope={route.searchParams.get("scope") ?? undefined}
      initialTask={route.searchParams.get("task") ?? undefined} configuration={configuration} />;
  }
  if (pathname === "/") return <PublicPage><LandingPage /></PublicPage>;
  if (pathname === "/need" || pathname === "/opportunity" || pathname === "/impact") {
    const topic = pathname === "/need" ? "need" : pathname === "/opportunity" ? "opportunity" : "impact";
    return <PublicPage><PublicStoryPage topic={topic}
      audio={<PageAudioPlayer audio={pageAudio(topic, import.meta.env.BASE_URL)} />} /></PublicPage>;
  }
  if (pathname === "/join") {
    const intents = [...new Set(route.searchParams.getAll("start").filter(isIntentOptionId))];
    return <PublicPage><CreateProfileFlow key={route.search} initialIntentOptionIds={intents} /></PublicPage>;
  }
  if (pathname === "/dashboard/site-owner") return <PublicPage><SiteOwnerDashboard /></PublicPage>;
  return <PublicPage><h1>That preview page does not exist.</h1><p><StaticLink href={SUNROOM_PATH}>Return to Sunroom</StaticLink></p></PublicPage>;
}

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const link = event.target.closest("a");
  const href = link?.getAttribute("href");
  if (!href?.startsWith("#") || href.startsWith("#/")) return;
  const target = document.getElementById(href.slice(1));
  if (!target) return;
  event.preventDefault();
  target.focus({ preventScroll: true });
  target.scrollIntoView();
});

const root = document.getElementById("root");
if (!root) throw new Error("The static demo root is missing.");
createRoot(root).render(<StaticApp />);
