import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { CollectionResults, RoleControl, type ProjectReadRow, type WorkspaceRole } from "@/components/workspace";

const roles: readonly WorkspaceRole[] = ["site-owner", "operator", "investor"];
const rows: readonly ProjectReadRow[] = [
  { id: "one", title: "Permitted project", subtitle: "General location", stage: "Development", capacity: "Unknown", screening: "Needs review", screeningTone: "warning" },
  { id: "two", title: "Second project", subtitle: "Location withheld", stage: "Unknown", capacity: "125 kW, stored estimate", screening: "Not supplied" },
];

describe("shared controlled role presentation", () => {
  it("exposes three labeled native radios, with clicks and keyboard choosing the same context", () => {
    function Controlled() {
      const [value, setValue] = useState<WorkspaceRole | null>("site-owner");
      return <RoleControl value={value} allowedRoles={roles} mode="demo" onChange={setValue} />;
    }
    render(<Controlled />);
    const group = screen.getByRole("group", { name: "Demo role" });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    fireEvent.click(screen.getByRole("radio", { name: "Operator" }));
    expect(screen.getByRole("radio", { name: "Operator" })).toBeChecked();
    fireEvent.keyDown(screen.getByRole("radio", { name: "Operator" }), { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "Investor" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Investor" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("radio", { name: "Investor" }), { key: "Home" });
    expect(screen.getByRole("radio", { name: "Site owner" })).toBeChecked();
  });

  it("visibly disables unauthorized live roles and never grants a role through keyboard or click", () => {
    const change = vi.fn();
    const { rerender } = render(<RoleControl value="operator" allowedRoles={["operator"]} mode="live" onChange={change} />);
    expect(screen.getAllByText("Not granted")).toHaveLength(2);
    expect(screen.getByRole("radio", { name: "Site owner" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Investor" }));
    fireEvent.keyDown(screen.getByRole("radio", { name: "Operator" }), { key: "ArrowRight" });
    expect(change).not.toHaveBeenCalled();
    rerender(<RoleControl value="operator" allowedRoles={[]} mode="live" onChange={change} />);
    expect(screen.queryAllByRole("radio", { checked: true })).toHaveLength(0);
    expect(screen.getAllByRole("radio").every((radio) => radio.hasAttribute("disabled"))).toBe(true);
  });

  it("commits a permitted horizontal drag only on release, and cancels outside or on interruption", () => {
    const change = vi.fn();
    const { container } = render(<RoleControl value="site-owner" allowedRoles={roles} mode="demo" onChange={change} />);
    const labels = container.querySelectorAll<HTMLLabelElement>("[data-role]");
    labels.forEach((label, index) => vi.spyOn(label, "getBoundingClientRect").mockReturnValue(new DOMRect(index * 100, 0, 100, 44)));
    const start = screen.getByRole("radio", { name: "Site owner" });
    fireEvent.pointerDown(start, { pointerId: 1, button: 0, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(start, { pointerId: 1, clientX: 220, clientY: 20 });
    expect(change).not.toHaveBeenCalled();
    fireEvent.pointerUp(start, { pointerId: 1, clientX: 220, clientY: 20 });
    expect(change).toHaveBeenCalledExactlyOnceWith("investor");
    change.mockClear();
    fireEvent.pointerDown(start, { pointerId: 2, button: 0, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(start, { pointerId: 2, clientX: 150, clientY: 20 });
    fireEvent.pointerCancel(start, { pointerId: 2, clientX: 150, clientY: 20 });
    fireEvent.pointerUp(start, { pointerId: 2, clientX: 150, clientY: 20 });
    fireEvent.pointerDown(start, { pointerId: 3, button: 0, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(start, { pointerId: 3, clientX: 320, clientY: 20 });
    fireEvent.pointerUp(start, { pointerId: 3, clientX: 320, clientY: 20 });
    expect(change).not.toHaveBeenCalled();
  });

  it("cannot drag into an ungranted live perspective", () => {
    const change = vi.fn();
    const { container } = render(<RoleControl value="site-owner" allowedRoles={["site-owner"]} mode="live" onChange={change} />);
    container.querySelectorAll<HTMLLabelElement>("[data-role]").forEach((label, index) =>
      vi.spyOn(label, "getBoundingClientRect").mockReturnValue(new DOMRect(index * 100, 0, 100, 44)));
    const owner = screen.getByRole("radio", { name: "Site owner" });
    fireEvent.pointerDown(owner, { pointerId: 1, button: 0, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(owner, { pointerId: 1, clientX: 220, clientY: 20 });
    fireEvent.pointerUp(owner, { pointerId: 1, clientX: 220, clientY: 20 });
    expect(change).not.toHaveBeenCalled();
    expect(owner).toBeChecked();
    expect(screen.getByRole("radio", { name: "Investor" })).toBeDisabled();
  });

  it("Escape cancels a drag including the following pointer click", () => {
    const change = vi.fn();
    const { container } = render(<RoleControl value="site-owner" allowedRoles={roles} mode="demo" onChange={change} />);
    container.querySelectorAll<HTMLElement>("[data-role]").forEach((label, index) =>
      vi.spyOn(label, "getBoundingClientRect").mockReturnValue(new DOMRect(index * 100, 0, 100, 44)));
    const owner = screen.getByRole("radio", { name: "Site owner" });
    fireEvent.pointerDown(owner, { pointerId: 9, button: 0, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(owner, { pointerId: 9, clientX: 220, clientY: 20 });
    fireEvent.keyDown(owner, { key: "Escape" });
    fireEvent.pointerUp(owner, { pointerId: 9, clientX: 220, clientY: 20 });
    fireEvent.click(screen.getByRole("radio", { name: "Investor" }), { detail: 1 });
    expect(change).not.toHaveBeenCalled();
    expect(owner).toBeChecked();
  });

  it("separates the decorative thin track from native full-size role targets", () => {
    const { container } = render(<RoleControl value="operator" allowedRoles={roles} mode="demo" onChange={vi.fn()} />);
    const track = container.querySelector("[data-role-visual-track]");
    expect(track).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll("[data-role-control]")).toHaveLength(3);
    expect(screen.getByRole("group", { name: "Demo role" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Operator" })).toBeChecked();
  });

  it("tracks fractional pointer movement without changing the controlled role and returns on cancel", () => {
    const change = vi.fn();
    const { container } = render(<RoleControl value="site-owner" allowedRoles={roles} mode="demo" onChange={change} />);
    container.querySelectorAll<HTMLElement>("[data-role]").forEach((label, index) =>
      vi.spyOn(label, "getBoundingClientRect").mockReturnValue(new DOMRect(index * 100, 0, 100, 44)));
    const indicator = container.querySelector("[data-role-indicator]")!;
    const track = container.querySelector<HTMLElement>("[data-role-hit-track]")!;
    const owner = screen.getByRole("radio", { name: "Site owner" });
    fireEvent.pointerDown(owner, { pointerId: 13, button: 0, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(owner, { pointerId: 13, clientX: 170, clientY: 20 });
    expect(track.style.getPropertyValue("--role-index")).toBe("1.5");
    expect(indicator).toHaveAttribute("data-role-state", "preview");
    expect(owner).toBeChecked();
    expect(change).not.toHaveBeenCalled();
    fireEvent.pointerMove(owner, { pointerId: 13, clientX: 180, clientY: 20 });
    expect(track.style.getPropertyValue("--role-index")).toBe("1.6");
    fireEvent.pointerCancel(owner, { pointerId: 13, clientX: 180, clientY: 20 });
    expect(track.style.getPropertyValue("--role-index")).toBe("0");
    expect(indicator).toHaveAttribute("data-role-state", "confirmed");
    expect(change).not.toHaveBeenCalled();
  });

  it("keeps one indicator node across pending, refusal and authoritative role changes", () => {
    const change = vi.fn();
    const { container, rerender } = render(<RoleControl value="site-owner" allowedRoles={roles} mode="server-demo" onChange={change} />);
    container.querySelectorAll<HTMLElement>("[data-role]").forEach((button, index) =>
      vi.spyOn(button, "getBoundingClientRect").mockReturnValue(new DOMRect(index * 100, 0, 100, 44)));
    const indicator = container.querySelector("[data-role-indicator]")!;
    const track = container.querySelector<HTMLElement>("[data-role-hit-track]")!;
    const owner = screen.getByRole("button", { name: "Site owner" });
    fireEvent.pointerDown(owner, { pointerId: 15, button: 0, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(owner, { pointerId: 15, clientX: 170, clientY: 20 });
    fireEvent.pointerUp(owner, { pointerId: 15, clientX: 170, clientY: 20 });
    expect(change).toHaveBeenCalledExactlyOnceWith("operator");
    expect(track.style.getPropertyValue("--role-index")).toBe("0");
    expect(owner).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "Operator" })).not.toHaveAttribute("aria-current");
    rerender(<RoleControl value={null} allowedRoles={roles} mode="server-demo" onChange={change} pendingRole="operator" />);
    expect(container.querySelector("[data-role-indicator]")).toBe(indicator);
    expect(indicator).toHaveAttribute("data-role-state", "hidden");
    expect(container.querySelectorAll('[aria-current="true"]')).toHaveLength(0);
    rerender(<RoleControl value="site-owner" allowedRoles={roles} mode="server-demo" onChange={change} error="Switch refused" />);
    expect(indicator).toHaveAttribute("data-role-state", "confirmed");
    expect(track.style.getPropertyValue("--role-index")).toBe("0");
    expect(screen.getByRole("alert")).toHaveTextContent("Switch refused");
    rerender(<RoleControl value="investor" allowedRoles={roles} mode="server-demo" onChange={change} />);
    expect(container.querySelector("[data-role-indicator]")).toBe(indicator);
    expect(track.style.getPropertyValue("--role-index")).toBe("2");
    expect(screen.getByRole("button", { name: "Financier" })).toHaveAttribute("aria-current", "true");
  });

  it("retires a gesture across disable/re-enable even when the role returns unchanged", () => {
    const change = vi.fn();
    const { container, rerender } = render(<RoleControl value="site-owner" allowedRoles={roles} mode="demo" onChange={change} />);
    container.querySelectorAll<HTMLElement>("[data-role]").forEach((label, index) =>
      vi.spyOn(label, "getBoundingClientRect").mockReturnValue(new DOMRect(index * 100, 0, 100, 44)));
    const owner = screen.getByRole("radio", { name: "Site owner" });
    fireEvent.pointerDown(owner, { pointerId: 16, button: 0, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(owner, { pointerId: 16, clientX: 170, clientY: 20 });
    rerender(<RoleControl value="site-owner" allowedRoles={roles} mode="demo" onChange={change} disabled />);
    rerender(<RoleControl value="site-owner" allowedRoles={roles} mode="demo" onChange={change} />);
    fireEvent.pointerUp(owner, { pointerId: 16, clientX: 170, clientY: 20 });
    expect(change).not.toHaveBeenCalled();
    expect(owner).toBeChecked();
    expect(container.querySelector<HTMLElement>("[data-role-hit-track]")?.style.getPropertyValue("--role-index")).toBe("0");
  });
});

describe("shared permitted collection presentation", () => {
  it.each(["list", "cards"] as const)("renders the same fields and selection/open contract in %s form", (display) => {
    const select = vi.fn();
    const open = vi.fn();
    render(<CollectionResults rows={rows} selectedId="two" onSelect={select} onOpen={open} display={display} label="Permitted results" />);
    const region = screen.getByRole("region", { name: "Permitted results" });
    for (const row of rows) {
      for (const field of [row.title, row.subtitle, row.stage, row.capacity, row.screening]) {
        expect(within(region).getAllByText(field).length).toBeGreaterThan(0);
      }
    }
    expect(screen.getByRole("button", { name: "Select Second project" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Select Permitted project" }));
    expect(select).toHaveBeenCalledExactlyOnceWith("one");
    expect(screen.getByRole("button", { name: "Select Second project" })).toHaveAttribute("aria-pressed", "true");
    const openButton = screen.getByRole("button", { name: "Open Permitted project" });
    expect(openButton).toHaveAttribute("data-record-id", "one");
    expect(openButton).toHaveAttribute("data-project-open", "one");
    fireEvent.click(openButton);
    expect(open).toHaveBeenCalledExactlyOnceWith("one");
  });

  it("preserves the exact open button when its parent is mounted but hidden, including display changes", () => {
    const select = vi.fn();
    const open = vi.fn();
    function Parent({ hidden, display }: { hidden: boolean; display: "list" | "cards" }) {
      return <div hidden={hidden}><CollectionResults rows={rows} selectedId="one" onSelect={select} onOpen={open} display={display} label="Retained results" /></div>;
    }
    const { rerender } = render(<Parent hidden={false} display="list" />);
    const button = screen.getByRole("button", { name: "Open Permitted project" });
    rerender(<Parent hidden display="list" />);
    expect(button.isConnected).toBe(true);
    expect(button).not.toBeVisible();
    rerender(<Parent hidden={false} display="cards" />);
    expect(screen.getByRole("button", { name: "Open Permitted project" })).toBe(button);
    expect(button).toHaveAttribute("data-record-id", "one");
    button.focus();
    expect(button).toHaveFocus();
    expect(select).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it("does not manufacture a record or count when the supplied view is empty", () => {
    render(<CollectionResults rows={[]} selectedId={null} onSelect={vi.fn()} onOpen={vi.fn()} display="list" label="Results" />);
    expect(screen.getByRole("status")).toHaveTextContent("No projects in this view.");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
