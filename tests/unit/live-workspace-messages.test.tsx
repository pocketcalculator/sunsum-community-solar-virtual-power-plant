import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReadFacts, ReadFailure, StoredTime, WriteBoundary } from "@/features/live-workspace/ReadStatus";

describe("live-read presentation states", () => {
  it("keeps unknown source times unknown and labels real times with their timezone", () => {
    const { rerender } = render(<StoredTime value={null} />);
    expect(screen.getByText("Time not supplied")).toBeInTheDocument();
    rerender(<StoredTime value="not-a-source-time" />);
    expect(screen.getByText("Time not supplied")).toBeInTheDocument();
    rerender(<StoredTime value="2026-09-20T17:31:00Z" />);
    const time = screen.getByText(/Sep 20, 2026.*5:31:00 PM UTC/);
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("datetime", "2026-09-20T17:31:00Z");
    rerender(<StoredTime value="2026-09-20" />);
    expect(screen.getByText("2026-09-20 (time not supplied)")).toBeInTheDocument();
  });

  it("keeps a service denial distinct from missing configuration or a successful empty result", () => {
    render(<ReadFailure error={{
      kind: "denied", message: "Existing service access is required.",
      status: 403, code: "forbidden_role", connectionId: null,
    }} />);
    expect(screen.getByRole("status")).toHaveTextContent("outside your current access");
    expect(screen.getByRole("status")).toHaveTextContent("does not grant permission");
    expect(screen.queryByText("No projects")).not.toBeInTheDocument();
  });

  it("renders source strings as text and does not replace null values with zero", () => {
    const { container } = render(<ReadFacts items={[
      { label: "Source", value: "<script>unsafe()</script>" },
      { label: "Capacity", value: null },
      { label: "Reported count", value: 0 },
    ]} />);
    expect(screen.getByText("<script>unsafe()</script>")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText("Not supplied")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("states the absent frontend write without calling a teammate's service unfinished", () => {
    render(<WriteBoundary action="Saving an investor mandate" />);
    expect(screen.getByText(/not implemented in this live-read frontend/)).toHaveTextContent("existing service workflow remains unchanged");
  });
});
