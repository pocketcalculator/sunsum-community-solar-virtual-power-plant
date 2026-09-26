import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReadFacts, ReadFailure, StoredTime, WriteBoundary } from "@/features/live-workspace/ReadStatus";
import { MapLimit } from "@/features/live-workspace/MapLimit";

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
    expect(screen.getByText("forbidden_role", { exact: true }).tagName).toBe("CODE");
  });

  it.each([
    ["invalid_body", 400, "invalid"],
    ["validation_failed", 422, "invalid"],
    ["unauthenticated", 401, "unauthenticated"],
    ["forbidden_tier", 403, "denied"],
    ["forbidden_origin", 403, "denied"],
    ["not_found", 404, "missing"],
    ["service_unavailable", 503, "unavailable"],
  ] as const)("shows the safe %s service code alongside actionable human copy", (code, status, kind) => {
    render(<ReadFailure error={{
      kind, code, status, connectionId: null, message: "The service refused the request.",
    }} />);
    expect(screen.getByText(code, { exact: true }).tagName).toBe("CODE");
    expect(screen.getByRole("status")).toHaveTextContent("The service refused the request.");
  });

  it.each([null, "unrecognized-private-value", "invalid_body:PRIVATE-CANARY", "<script>PRIVATE-CANARY</script>"])(
    "does not echo arbitrary code content %s", (code) => {
      const { container } = render(<ReadFailure error={{
        kind: "invalid", code, status: 400, connectionId: null, message: "Use the accepted input contract.",
      }} />);
      expect(container.querySelector("code")).toBeNull();
      expect(container).not.toHaveTextContent("PRIVATE-CANARY");
      expect(container).not.toHaveTextContent("unrecognized-private-value");
      expect(container.querySelector("script")).toBeNull();
    },
  );

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
    expect(screen.getByText(/not implemented in this connected frontend/)).toHaveTextContent("existing service workflow remains unchanged");
  });

  it("explains seeded sign-in only in explicit server-demo mode", () => {
    render(<ReadFailure sourceMode="server-demo" error={{
      kind: "unauthenticated", message: "No fixture session yet.",
      status: 401, code: "unauthenticated", connectionId: null,
    }} />);
    expect(screen.getByRole("status")).toHaveTextContent("explicit server-demo control");
    expect(screen.getByRole("status")).toHaveTextContent("fictional");
    expect(screen.getByRole("status")).not.toHaveTextContent("owner-approved sign-in");
  });

  it("names the backend GeoJSON boundary without offering a credential or implying a live map", () => {
    render(<MapLimit />);
    const map = screen.getByRole("region", { name: "A permitted map source is out of reach right now" });
    expect(map).toHaveTextContent("GeoJSON FeatureCollection");
    expect(map).toHaveTextContent("EPSG:4326");
    expect(map).toHaveTextContent("This is not a live feed");
    expect(map).toHaveTextContent("authenticated site owners and operators");
    expect(map).toHaveTextContent("project-join contract still need configured admission");
    expect(map).toHaveTextContent("short-lived or referer-bound tokens");
    expect(map).toHaveTextContent("No automatic map polling");
    expect(map).toHaveTextContent("freshness metadata alone does not prove live GIS");
    expect(map).toHaveTextContent("SUNSUM-CONNECTION:MAPS-LOCATION");
    expect(map.querySelector("input, button")).toBeNull();
  });
});
