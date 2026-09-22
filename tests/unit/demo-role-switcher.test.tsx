// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DemoRoleSwitcher } from "@/features/demo-auth";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

beforeEach(() => {
  refresh.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFetch(response: Partial<Response> & { ok: boolean }) {
  const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve(url === "/api/me" ? {
    ok: true, status: 200, json: () => Promise.resolve({ role: "investor" }),
  } : {
    json: () => Promise.resolve({}),
    status: 200,
    ...response,
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("DemoRoleSwitcher", () => {
  it("offers all three demo roles", () => {
    stubFetch({ ok: true });
    render(<DemoRoleSwitcher />);

    expect(screen.getByRole("button", { name: /Site owner/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Operator/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Financier/ })).toBeTruthy();
  });

  it("posts the selected role to the demo sign-in endpoint", async () => {
    const fetchMock = stubFetch({ ok: true });
    render(<DemoRoleSwitcher />);

    fireEvent.click(screen.getByRole("button", { name: /Site owner/ }));
    await vi.waitFor(() => expect(fetchMock.mock.calls.filter((call) => call[0] === "/api/auth/demo-switch")).toHaveLength(1));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/demo-switch");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ role: "site_owner" }));
  });

  it("re-renders the server component after signing in", async () => {
    stubFetch({ ok: true });
    render(<DemoRoleSwitcher />);

    fireEvent.click(screen.getByRole("button", { name: /Operator/ }));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("marks the signed-in role and leaves the others unmarked", () => {
    stubFetch({ ok: true });
    render(<DemoRoleSwitcher activeRole="investor" />);

    expect(
      screen.getByRole("button", { name: /Financier/ }).getAttribute("aria-current"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: /Operator/ }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("shows the server's reason when sign-in is refused", async () => {
    stubFetch({
      ok: false,
      status: 404,
      json: () =>
        Promise.resolve({
          code: "not_found",
          message: "Demo sign-in is disabled on this deployment.",
        }),
    });
    render(<DemoRoleSwitcher />);

    fireEvent.click(screen.getByRole("button", { name: /Site owner/ }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Demo sign-in is disabled");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reports a network failure instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<DemoRoleSwitcher />);

    fireEvent.click(screen.getByRole("button", { name: /Site owner/ }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not reach the server");
  });

  it("still reports a refusal whose body is not JSON", async () => {
    stubFetch({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("not json")),
    });
    render(<DemoRoleSwitcher />);

    fireEvent.click(screen.getByRole("button", { name: /Site owner/ }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("HTTP 500");
  });
});

describe("DemoRoleSwitcher pill variant", () => {
  it("signs in through the same endpoint as the panel", async () => {
    const fetchMock = stubFetch({ ok: true });
    render(<DemoRoleSwitcher variant="pill" />);

    fireEvent.click(screen.getByRole("button", { name: "Operator" }));
    await vi.waitFor(() => expect(fetchMock.mock.calls.filter((call) => call[0] === "/api/auth/demo-switch")).toHaveLength(1));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/demo-switch");
    expect(init.body).toBe(JSON.stringify({ role: "operator" }));
  });

  it("marks the role it was told about", () => {
    stubFetch({ ok: true });
    render(<DemoRoleSwitcher activeRole="operator" variant="pill" />);

    expect(
      screen.getByRole("button", { name: "Operator" }).getAttribute("aria-current"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Financier" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  // A header without a supplied role observes the current service identity.
  it("resolves its own role from /api/me when asked to", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ user_id: "u1", role: "investor" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<DemoRoleSwitcher resolveOwnRole variant="pill" />);

    await vi.waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Financier" })
          .getAttribute("aria-current"),
      ).toBe("true"),
    );
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/me");
  });

  it("does not ask who is signed in unless told to", () => {
    const fetchMock = stubFetch({ ok: true });
    render(<DemoRoleSwitcher variant="pill" />);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  /**
   * A signed-out visitor gets a 401 here. That is the ordinary state of the
   * landing page, so it must leave a usable control rather than an error.
   */
  it("stays silent when nobody is signed in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ code: "unauthenticated" }),
      }),
    );

    render(<DemoRoleSwitcher resolveOwnRole variant="pill" />);

    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: "Site owner" })).toBeTruthy(),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Site owner" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("marks the role confirmed by a fresh identity read, not the requested role", async () => {
    stubFetch({ ok: true });
    render(<DemoRoleSwitcher variant="pill" />);

    fireEvent.click(screen.getByRole("button", { name: "Operator" }));

    await vi.waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Financier" })
          .getAttribute("aria-current"),
      ).toBe("true"),
    );
  });

  it("reports a refusal the same way the panel does", async () => {
    stubFetch({
      ok: false,
      status: 404,
      json: () =>
        Promise.resolve({
          code: "not_found",
          message: "Demo sign-in is disabled on this deployment.",
        }),
    });

    render(<DemoRoleSwitcher variant="pill" />);

    fireEvent.click(screen.getByRole("button", { name: "Site owner" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Demo sign-in is disabled");
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("composed session lifetime", () => {
  it("allows a deliberate re-selection of the current demo account without granting a different role", async () => {
    const fetchMock = stubFetch({ ok: true });
    const settled = vi.fn();
    render(<DemoRoleSwitcher activeRole="operator" variant="pill" onSwitchSettled={settled} />);
    fireEvent.click(screen.getByRole("button", { name: "Operator" }));
    await vi.waitFor(() => expect(settled).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/demo-switch", expect.objectContaining({
      method: "POST", body: JSON.stringify({ role: "operator" }),
    }));
    expect(screen.getByRole("button", { name: "Operator" })).toHaveAttribute("aria-current", "true");
  });

  it("calls start before a single POST and settled after success without shadowing authoritative props", async () => {
    let settle!: (value: { ok: boolean; status: number }) => void;
    const order: string[] = [];
    const fetchMock = vi.fn(() => {
      order.push("post");
      return new Promise<{ ok: boolean; status: number }>((resolve) => { settle = resolve; });
    });
    vi.stubGlobal("fetch", fetchMock);
    const start = vi.fn(() => order.push("start"));
    const settled = vi.fn(() => order.push("settled"));
    const { rerender } = render(<DemoRoleSwitcher activeRole="operator" variant="pill"
      resolveOwnRole onSwitchStart={start} onSwitchSettled={settled} />);
    expect(fetchMock).not.toHaveBeenCalled();
    const target = screen.getByRole("button", { name: "Financier" });
    fireEvent.click(target);
    fireEvent.click(target);
    expect(order).toEqual(["start", "post"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { settle({ ok: true, status: 200 }); });
    expect(order).toEqual(["start", "post", "settled"]);
    expect(screen.getByRole("button", { name: "Operator" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "Financier" })).not.toHaveAttribute("aria-current");
    rerender(<DemoRoleSwitcher activeRole="investor" variant="pill" />);
    expect(screen.getByRole("button", { name: "Financier" })).toHaveAttribute("aria-current", "true");
    rerender(<DemoRoleSwitcher activeRole={null} variant="pill" />);
    expect(screen.getAllByRole("button").every((button) => !button.hasAttribute("aria-current"))).toBe(true);
    rerender(<DemoRoleSwitcher activeRole="site_owner" variant="pill" />);
    expect(screen.getByRole("button", { name: "Site owner" })).toHaveAttribute("aria-current", "true");
  });

  it.each(["refusal", "network"] as const)("settles a %s and exposes it without a synthetic identity", async (outcome) => {
    const settled = vi.fn();
    const start = vi.fn();
    if (outcome === "refusal") stubFetch({ ok: false, status: 403 });
    else vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    render(<DemoRoleSwitcher activeRole={null} variant="pill" onSwitchStart={start} onSwitchSettled={settled} />);
    fireEvent.click(screen.getByRole("button", { name: "Site owner" }));
    await screen.findByRole("alert");
    expect(start).toHaveBeenCalledTimes(1);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("button").every((button) => !button.hasAttribute("aria-current"))).toBe(true);
  });

  it("honors the parent's disabled state for mouse and keyboard and labels the developer mode", () => {
    const fetchMock = stubFetch({ ok: true });
    render(<DemoRoleSwitcher activeRole="operator" disabled variant="pill" />);
    expect(screen.getByRole("group", { name: "Developer/demo sign-in" })).toBeVisible();
    const target = screen.getByRole("button", { name: "Financier" });
    expect(target).toBeDisabled();
    fireEvent.click(target);
    fireEvent.keyDown(screen.getByRole("button", { name: "Operator" }), { key: "ArrowRight" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/unavailable while the session or workspace updates/)).toBeVisible();
  });

  it("settles a dispatched operation even after the adapter unmounts", async () => {
    let complete!: (value: { ok: boolean; status: number }) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { complete = resolve; })));
    const settled = vi.fn();
    const { unmount } = render(<DemoRoleSwitcher activeRole={null} variant="pill" onSwitchSettled={settled} />);
    fireEvent.click(screen.getByRole("button", { name: "Operator" }));
    unmount();
    await act(async () => { complete({ ok: true, status: 200 }); });
    expect(settled).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });
});
