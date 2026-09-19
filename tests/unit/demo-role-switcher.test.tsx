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
