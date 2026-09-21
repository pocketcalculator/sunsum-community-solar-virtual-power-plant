// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  const fetchMock = vi.fn().mockResolvedValue({
    json: () => Promise.resolve({}),
    status: 200,
    ...response,
  });
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
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

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
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

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

  /**
   * The header instance is told nothing, because asking on the server would
   * make every route dynamic. It has to find out for itself.
   */
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

  it("marks the role it just signed in as, without being re-rendered", async () => {
    stubFetch({ ok: true });
    render(<DemoRoleSwitcher variant="pill" />);

    fireEvent.click(screen.getByRole("button", { name: "Financier" }));

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
