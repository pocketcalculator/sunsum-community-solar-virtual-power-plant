import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BrowserContext, Page, Request } from "@playwright/test";

interface StaticRequest {
  readonly url: string;
  readonly method: string;
  readonly resourceType: string;
}

export function admitsStaticRequest(
  request: StaticRequest, root: URL, assets: ReadonlySet<string>,
): boolean {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== root.origin ||
    url.username || url.password || url.search) return false;
  if (request.resourceType === "document") {
    return url.pathname === root.pathname || url.href === new URL("index.html", root).href;
  }
  if (!assets.has(url.href)) return false;
  switch (request.resourceType) {
    case "script": return url.pathname.endsWith(".js");
    case "stylesheet": return url.pathname.endsWith(".css");
    case "image": return /\.(?:svg|png|jpg|jpeg|webp|avif|ico)$/.test(url.pathname);
    case "font": return /\.(?:woff2?|ttf|otf)$/.test(url.pathname);
    case "media": return ["need", "opportunity", "impact"]
      .some((topic) => url.href === new URL(`audio/${topic}.mp3`, root).href);
    default: return false;
  }
}

export async function installStaticNetworkGuard(context: BrowserContext, root: URL) {
  const stamp: unknown = JSON.parse(readFileSync(
    join(process.cwd(), "build", "vibehub", "demo-build.json"), "utf8",
  ));
  if (!stamp || typeof stamp !== "object" || !("files" in stamp) ||
    !stamp.files || typeof stamp.files !== "object" || Array.isArray(stamp.files)) {
    throw new Error("Static transport guard requires the generated artifact inventory.");
  }
  const assets = new Set(Object.keys(stamp.files).map((path) => {
    if (path.startsWith("/") || /[\\?#]/.test(path) ||
      path.split("/").some((part) => part === "" || part === "." || part === "..")) {
      throw new Error("Unsafe path in the static artifact inventory.");
    }
    return new URL(path, root).href;
  }));
  const observed: string[] = [];
  const blocked: string[] = [];
  const details = (request: Request): StaticRequest => ({
    url: request.url(), method: request.method(), resourceType: request.resourceType(),
  });
  const label = (request: Request) => `${request.method()} ${request.url()}`;

  // Observation remains independent of the routing handler's abort result.
  context.on("request", (request) => {
    if (!admitsStaticRequest(details(request), root, assets)) observed.push(label(request));
  });
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (!admitsStaticRequest(details(request), root, assets)) {
      blocked.push(label(request));
      await route.abort("blockedbyclient");
    } else {
      await route.continue();
    }
  });
  const observeSockets = (page: Page) => page.on("websocket", (socket) => {
    observed.push(`WEBSOCKET ${socket.url()}`);
  });
  context.pages().forEach(observeSockets);
  context.on("page", observeSockets);
  await context.routeWebSocket("**/*", async (socket) => {
    blocked.push(`WEBSOCKET ${socket.url()}`);
    await socket.close({ code: 1008, reason: "Static demo has no socket transport." });
  });
  return { observed, blocked };
}
