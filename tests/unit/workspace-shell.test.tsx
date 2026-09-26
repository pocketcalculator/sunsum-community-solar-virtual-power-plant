import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceShell } from "@/features/live-workspace/WorkspaceShell";

const props = {
  role: null, view: "overview" as const, navigation: [],
  onNavigate: vi.fn(), onRefresh: vi.fn(), refreshing: false, canRefresh: false,
};

describe("source-aware workspace shell", () => {
  it("defaults to server-controlled connected role presentation, not a demo adapter", () => {
    const { rerender } = render(<WorkspaceShell {...props}><h1>Current workspace</h1></WorkspaceShell>);
    expect(screen.getByText("Connected workspace", { exact: true })).toBeVisible();
    const group = screen.getByRole("group", { name: "Workspace role" });
    expect(within(group).getAllByRole("radio").every((radio) => radio.hasAttribute("disabled"))).toBe(true);
    expect(screen.queryByText("Developer/demo sign-in")).toBeNull();
    rerender(<WorkspaceShell {...props} role="operator"><h1>Current workspace</h1></WorkspaceShell>);
    expect(screen.getByRole("radio", { name: "Operator" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Investor" })).toBeDisabled();
    expect(screen.getByRole("main")).toHaveAttribute("id", "workspace-content");
  });

  it("uses one injected session control in explicitly labeled developer/demo mode", () => {
    render(<WorkspaceShell {...props} sourceMode="server-demo"
      roleControl={<div role="group" aria-label="Injected session control">Existing session adapter</div>}>
      <h1>Demo workspace</h1>
    </WorkspaceShell>);
    expect(screen.getByText("Developer/demo mode", { exact: true })).toBeVisible();
    expect(screen.getByText(/Server-backed fictional mock data/)).toBeVisible();
    expect(screen.getByRole("group", { name: "Injected session control" })).toBeVisible();
    expect(screen.queryByRole("group", { name: "Workspace role" })).toBeNull();
    const row = screen.getByRole("group", { name: "Injected session control" }).closest<HTMLElement>("[data-header-appearance-row]");
    expect(row).not.toBeNull();
    if (!row) throw new Error("The shared perspective/theme row is missing.");
    expect(within(row).getByRole("switch", { name: "Dark appearance" })).toBeInTheDocument();
    expect(row.children).toHaveLength(2);
  });

  it("labels unavailable configuration without claiming service data or an all-read-only release", () => {
    const { container } = render(<WorkspaceShell {...props} sourceMode="unavailable"><h1>Unavailable</h1></WorkspaceShell>);
    expect(screen.getByText("Connection unavailable", { exact: true })).toBeVisible();
    expect(screen.getByText(/never replaced with fictional records/)).toBeVisible();
    expect(container.textContent).not.toMatch(/Live reads only|Workflow writes are not implemented/);
  });
});
