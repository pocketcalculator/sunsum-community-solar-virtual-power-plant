// @vitest-environment node
import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import OwnerPage from "../../app/dashboard/site-owner/page";
import OperatorPage from "../../app/dashboard/operator/page";
import InvestorPage from "../../app/dashboard/investor/page";

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((destination: string): never => { throw new Error(`Redirect: ${destination}`); }),
}));
vi.mock("next/navigation", () => ({ redirect }));

describe("one canonical public and workspace route owner", () => {
  it.each(["", "join/", "need/", "opportunity/", "impact/"])("owns /%s only in the public route group", (path) => {
    expect(existsSync(new URL(`../../app/(public)/${path}page.tsx`, import.meta.url))).toBe(true);
    expect(existsSync(new URL(`../../app/${path}page.tsx`, import.meta.url))).toBe(false);
  });

  it.each([
    ["owner", OwnerPage, "sites"],
    ["operator", OperatorPage, "queue"],
    ["investor", InvestorPage, "portfolio"],
  ] as const)("the %s alias cannot pass persona or redirect authority", async (_role, Page, view) => {
    redirect.mockClear();
    await expect(Page({ searchParams: Promise.resolve({
      role: "operator", next: "https://outside.invalid", project: "one&role=operator", scope: "one",
    }) })).rejects.toThrow(`Redirect: /app?view=${view}&project=one%26role%3Doperator&scope=one`);
    expect(redirect).toHaveBeenCalledTimes(1);
  });
});
