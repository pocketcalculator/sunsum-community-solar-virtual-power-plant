import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetThemeStoreForTests } from "@/components/ui/theme/themeStore";
import { PublicShell } from "@/features/participation";

beforeEach(() => {
  resetThemeStoreForTests();
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetThemeStoreForTests();
});

describe("public shell", () => {
  it("keeps narrative navigation distinct from role workspaces", () => {
    render(<PublicShell><p>Public content</p></PublicShell>);
    const primary = screen.getByRole("navigation", { name: "Primary" });
    for (const [name, href] of [
      ["Need", "/need"], ["Opportunity", "/opportunity"], ["Impact", "/impact"],
      ["About", "/#about"], ["FAQ", "/#faq"], ["Workspace", "/app"],
    ] as const) {
      expect(within(primary).getByRole("link", { name })).toHaveAttribute("href", href);
    }
    const participation = screen.getByRole("navigation", { name: "Role workspaces" });
    expect(within(participation).getByRole("link", { name: "Site owner workspace" })).toHaveAttribute("href", "/dashboard/site-owner");
    expect(within(participation).getByRole("link", { name: "Investor workspace" })).toHaveAttribute("href", "/dashboard/investor");
    expect(within(participation).getByRole("link", { name: "Operator workspace" })).toHaveAttribute("href", "/dashboard/operator");
  });

  it("retains the default three-choice public theme control", () => {
    render(<PublicShell><p>Public content</p></PublicShell>);
    const theme = screen.getByRole("group", { name: /colour theme/i });
    expect(within(theme).getAllByRole("radio")).toHaveLength(3);
    for (const name of ["Light", "Dark", "System"]) {
      expect(within(theme).getByRole("radio", { name })).toBeEnabled();
    }
    expect(screen.queryByRole("switch", { name: "Dark appearance" })).toBeNull();
  });

  it("preserves the skip target and the existing visible-context projection", () => {
    render(<PublicShell visibleRoleIds={["site-owner"]}><h1>Public content</h1></PublicShell>);
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#main-content");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    const participation = screen.getByRole("navigation", { name: "Role workspaces" });
    expect(within(participation).getAllByRole("link")).toHaveLength(1);
  });

  it("keeps injected demo controls separate from static fictional role destinations", () => {
    render(<PublicShell demoControl={<span>Developer/demo control</span>}
      workspaceLinks={[{ id: "site-owner", href: "/concepts/sunroom?role=site-owner&view=sites", label: "Fictional owner workspace" }]}>
      <p>Public content</p>
    </PublicShell>);
    expect(screen.getByText("Developer/demo control")).toBeVisible();
    expect(screen.getByRole("link", { name: "Fictional owner workspace" }))
      .toHaveAttribute("href", "/concepts/sunroom?role=site-owner&view=sites");
  });
});
