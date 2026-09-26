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
