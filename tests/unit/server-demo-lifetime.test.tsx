import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceConfiguration } from "@/domain/live-configuration";
import type { LiveRole } from "@/features/live-read";
import { WorkspaceEntry } from "../../app/app/WorkspaceEntry";
import { createSyntheticLiveReadFixtures } from "../fixtures/live-read-contracts";

const routerRefresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}));

const configuration: WorkspaceConfiguration = {
  mode: "server-demo", canAttemptReads: true, canAttemptInterest: false,
  canAttemptExports: false, canAttemptDocumentDownloads: false,
  apiBasePath: "/api", source: "mock-configured",
  reason: "SYNTHETIC composed session lifetime; no real service or session.",
  syntheticIdentities: { userIds: [], investorIds: [] },
};

function requestUrl(input: Parameters<typeof fetch>[0]): URL {
  return new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    window.location.href);
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function service(role: LiveRole = "site-owner") {
  const fixtures = createSyntheticLiveReadFixtures(role, { origin: window.location.origin });
  const post = Promise.withResolvers<Response>();
  const reply = (url: string, method?: string) => {
    const value = fixtures.responseFor(url, method);
    return new Response(value.body, {
      status: value.status, headers: { ...value.headers, "content-type": value.contentType },
    });
  };
  const read = vi.fn<typeof fetch>(async (input, init) => reply(requestUrl(input).href, init?.method));
  const fetcher = vi.fn<typeof fetch>((input, init) =>
    requestUrl(input).pathname === "/api/auth/demo-switch" ? post.promise : read(input, init));
  return { fixtures, post, reply, read, fetcher };
}

beforeEach(() => {
  routerRefresh.mockReset();
  window.history.replaceState(null, "", "/app");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("actual composed server-demo lifetime with synthetic transport", () => {
  it("retires records immediately while the same indicator survives pending, refusal and original-actor reconciliation", async () => {
    const current = service();
    vi.stubGlobal("fetch", current.fetcher);
    const { container } = render(<WorkspaceEntry configuration={configuration} initialHref="/app" />);
    const name = current.fixtures.records[0]!.name;
    const record = await screen.findByRole("button", { name: `Select ${name}` });
    const main = screen.getByRole("main");
    const group = screen.getByRole("group", { name: "Developer/demo sign-in" });
    const indicator = container.querySelector("[data-role-indicator]");
    expect(indicator).toHaveAttribute("data-role-state", "confirmed");
    const identity = Promise.withResolvers<Response>();
    current.read.mockImplementationOnce(() => identity.promise);
    fireEvent.click(within(group).getByRole("button", { name: "Operator" }));
    expect(record).not.toBeInTheDocument();
    expect(screen.queryByText(name, { exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toBe(main);
    expect(screen.getByRole("group", { name: "Developer/demo sign-in" })).toBe(group);
    expect(container.querySelector("[data-role-indicator]")).toBe(indicator);
    expect(indicator).toHaveAttribute("data-role-state", "hidden");
    expect(within(group).getByRole("button", { name: "Signing in..." })).toBeDisabled();
    expect(within(group).getAllByRole("button").every((button) => !button.hasAttribute("aria-current"))).toBe(true);
    expect(current.fetcher).toHaveBeenLastCalledWith("/api/auth/demo-switch", expect.objectContaining({
      method: "POST", body: JSON.stringify({ role: "operator" }),
    }));
    await act(async () => { current.post.resolve(json({ message: "Synthetic switch refused." }, 403)); });
    const refusal = await screen.findByRole("alert");
    expect(refusal).toBeVisible();
    expect(refusal).toHaveTextContent("Synthetic switch refused.");
    expect(container.querySelector("[data-role-indicator]")).toBe(indicator);
    expect(indicator).toHaveAttribute("data-role-state", "hidden");
    expect(screen.queryByText(name, { exact: true })).not.toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "Operator" })).toBeDisabled();
    expect(current.read).toHaveBeenLastCalledWith(`${window.location.origin}/api/me`,
      expect.objectContaining({ method: "GET" }));
    await act(async () => { identity.resolve(current.reply("/api/me")); });
    await screen.findByRole("button", { name: `Select ${name}` });
    expect(screen.getByRole("main")).toBe(main);
    expect(screen.getByRole("group", { name: "Developer/demo sign-in" })).toBe(group);
    expect(container.querySelector("[data-role-indicator]")).toBe(indicator);
    expect(indicator).toHaveAttribute("data-role-state", "confirmed");
    expect(within(group).getByRole("button", { name: "Site owner" })).toHaveAttribute("aria-current", "true");
    expect(within(group).getByRole("button", { name: "Operator" })).toBeEnabled();
    expect(within(group).getByRole("button", { name: "Operator" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("alert")).toBe(refusal);
    expect(refusal).toBeVisible();
    expect(routerRefresh).not.toHaveBeenCalled();
    expect(current.fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(current.read.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });

  it.each(["success", "refusal"] as const)(
    "does not restart reads or rewrite the next page when a %s settles after whole-owner unmount",
    async (outcome) => {
      const current = service();
      vi.stubGlobal("fetch", current.fetcher);
      const { unmount } = render(<WorkspaceEntry configuration={configuration} initialHref="/app" />);
      await screen.findByRole("button", { name: `Select ${current.fixtures.records[0]!.name}` });
      fireEvent.click(screen.getByRole("button", { name: "Operator" }));
      unmount();
      const reads = current.read.mock.calls.length;
      current.read.mockImplementation(async (input, init) => requestUrl(input).pathname === "/api/me/sites"
        ? json({ code: "forbidden_role", message: "Synthetic access retired." }, 403)
        : current.reply(requestUrl(input).href, init?.method));
      const nextPage = { fixtureFrameworkState: "new page" };
      window.history.replaceState(nextPage, "", "/need?from=workspace");
      const replace = vi.spyOn(window.history, "replaceState");
      const push = vi.spyOn(window.history, "pushState");
      await act(async () => {
        current.post.resolve(json({ message: "Synthetic terminal response." }, outcome === "success" ? 200 : 403));
      });
      expect(current.read).toHaveBeenCalledTimes(reads);
      expect(replace).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
      expect(`${window.location.pathname}${window.location.search}`).toBe("/need?from=workspace");
      expect(window.history.state).toEqual(nextPage);
      expect(routerRefresh).not.toHaveBeenCalled();
      expect(current.fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    },
  );

  it("reconciles through the current client when only the adapter retires during a source change", async () => {
    const original = service();
    vi.stubGlobal("fetch", original.fetcher);
    const { rerender } = render(<WorkspaceEntry configuration={configuration} initialHref="/app" />);
    const record = await screen.findByRole("button", { name: `Select ${original.fixtures.records[0]!.name}` });
    const main = screen.getByRole("main");
    fireEvent.click(screen.getByRole("button", { name: "Operator" }));
    const originalReads = original.read.mock.calls.length;
    const replacement = service("operator");
    vi.stubGlobal("fetch", replacement.fetcher);
    rerender(<WorkspaceEntry configuration={{ ...configuration, mode: "connected", source: "database-configured" }}
      initialHref="/app" />);
    expect(screen.getByRole("main")).toBe(main);
    expect(record).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Developer/demo sign-in" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Workspace role" })).toBeInTheDocument();
    expect(replacement.read).not.toHaveBeenCalled();
    await act(async () => { original.post.resolve(json({})); });
    await waitFor(() => expect(screen.getByRole("radio", { name: "Operator" })).toBeChecked());
    expect(await screen.findByRole("button", { name: `Select ${replacement.fixtures.records[0]!.name}` }))
      .toBeInTheDocument();
    expect(screen.getByRole("main")).toBe(main);
    expect(screen.getByText("Connected workspace", { exact: true })).toBeVisible();
    expect(original.read).toHaveBeenCalledTimes(originalReads);
    expect(replacement.read).toHaveBeenCalledWith(`${window.location.origin}/api/me`,
      expect.objectContaining({ method: "GET" }));
    expect(replacement.fetcher.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
    expect(original.fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(routerRefresh).not.toHaveBeenCalled();
  });
});
