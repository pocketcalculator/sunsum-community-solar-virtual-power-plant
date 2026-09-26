// @vitest-environment node
import { describe, expect, it } from "vitest";
import { admitsStaticRequest } from "../fixtures/static-network-guard";

describe.each(["/sunsum-ui-demo/", "/app/sunsum-ui-demo/"])("static network admission at %s", (prefix) => {
  const root = new URL(prefix, "https://static.example.test");
  const assets = new Set([
    "assets/index-hash.js", "assets/index-hash.css", "icon.svg",
    "audio/need.mp3", "audio/opportunity.mp3", "audio/impact.mp3",
  ].map((path) => new URL(path, root).href));

  it.each([
    ["", "document"], ["index.html", "document"],
    ["assets/index-hash.js", "script"], ["assets/index-hash.css", "stylesheet"],
    ["icon.svg", "image"], ["audio/need.mp3", "media"],
    ["audio/opportunity.mp3", "media"], ["audio/impact.mp3", "media"],
  ])("admits the exact local %s %s request", (path, resourceType) => {
    expect(admitsStaticRequest({
      url: new URL(path, root).href, method: "GET", resourceType,
    }, root, assets)).toBe(true);
  });

  it.each([
    ["api/profiles", "POST", "fetch"], ["/api/me", "GET", "fetch"],
    ["api/me", "GET", "xhr"], ["assets/index-hash.js", "POST", "script"],
    ["assets/index-hash.js", "GET", "fetch"], ["assets/unlisted.js", "GET", "script"],
    ["/audio/need.mp3", "GET", "media"], ["audio/other.mp3", "GET", "media"],
    ["audio/need.mp3?token=canary", "GET", "media"],
    ["https://foreign.invalid/image.png", "GET", "image"],
    ["https://foreign.invalid/not-an-api", "GET", "fetch"],
  ])("refuses %s via %s/%s", (path, method, resourceType) => {
    expect(admitsStaticRequest({
      url: new URL(path, root).href, method, resourceType,
    }, root, assets)).toBe(false);
  });
});
