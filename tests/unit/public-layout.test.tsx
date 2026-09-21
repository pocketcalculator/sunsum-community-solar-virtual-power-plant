import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PublicLayout, { dynamic } from "../../app/(public)/layout";

const configuration = vi.hoisted(() => ({ mode: "unavailable" }));
vi.mock("../../app/app/configuration", () => ({
  getWorkspaceConfiguration: () => ({ mode: configuration.mode }),
}));
vi.mock("@/features/demo-auth", () => ({
  DemoRoleSwitcher: () => <div role="group" aria-label="Existing developer/demo adapter">Demo adapter</div>,
}));

describe("public server composition", () => {
  it("opts runtime-aware public chrome out of default-mode prerendering", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it.each(["connected", "server-demo", "unavailable"])("admits the adapter only for server-demo, not merely %s settings", (mode) => {
    configuration.mode = mode;
    render(<PublicLayout><h1>Public content</h1></PublicLayout>);
    expect(screen.getAllByRole("main")).toHaveLength(1);
    if (mode === "server-demo") {
      expect(screen.getByRole("group", { name: "Existing developer/demo adapter" })).toBeVisible();
    } else {
      expect(screen.queryByRole("group", { name: "Existing developer/demo adapter" })).toBeNull();
    }
  });

  it("re-reads admission instead of retaining a module-level source-mode snapshot", () => {
    configuration.mode = "server-demo";
    const { rerender } = render(<PublicLayout><h1>Public content</h1></PublicLayout>);
    expect(screen.getByRole("group", { name: "Existing developer/demo adapter" })).toBeVisible();
    for (const mode of ["connected", "unavailable", "server-demo"]) {
      configuration.mode = mode;
      rerender(<PublicLayout><h1>Public content</h1></PublicLayout>);
      if (mode === "server-demo") {
        expect(screen.getByRole("group", { name: "Existing developer/demo adapter" })).toBeVisible();
      } else {
        expect(screen.queryByRole("group", { name: "Existing developer/demo adapter" })).toBeNull();
      }
    }
  });
});
