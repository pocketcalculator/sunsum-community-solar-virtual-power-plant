import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteOwnerDashboard } from "@/features/site-owner-dashboard";

describe("site owner dashboard", () => {
  it("identifies the page as a prototype with illustrative values", () => {
    render(<SiteOwnerDashboard />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /explore a community solar scenario/i,
      }),
    ).toBeVisible();
    expect(screen.getAllByText(/illustrative mock data/i).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getByRole("button", { name: /run simulation/i }),
    ).toBeEnabled();
  });

  it("starts with the three locations selected in the supplied design", () => {
    render(<SiteOwnerDashboard />);

    expect(screen.getByText(/3 selected · maximum 5/i)).toBeVisible();
    expect(screen.getAllByRole("checkbox")).toHaveLength(10);
    expect(
      within(
        screen.getByRole("region", { name: /location comparison cards/i }),
      ).getAllByRole("article"),
    ).toHaveLength(10);
    expect(screen.getByRole("checkbox", { name: /123 oak street/i })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: /456 maple avenue/i }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: /321 cedar drive/i }),
    ).toBeChecked();
  });

  it("lets a site owner change the selected mock locations", () => {
    render(<SiteOwnerDashboard />);

    const pineMarker = screen.getByRole("button", {
      name: /select 789 pine lane/i,
    });
    const tooltipId = pineMarker.getAttribute("aria-describedby");
    expect(tooltipId).not.toBeNull();
    expect(document.getElementById(tooltipId ?? "")).toHaveTextContent(
      "789 Pine LaneMechanicsville",
    );

    fireEvent.click(pineMarker);
    expect(screen.getByText(/4 selected · maximum 5/i)).toBeVisible();

    fireEvent.click(screen.getByRole("checkbox", { name: /123 oak street/i }));
    expect(screen.getByText(/3 selected · maximum 5/i)).toBeVisible();
  });

  it("filters the available locations without changing the selection", () => {
    render(<SiteOwnerDashboard />);

    fireEvent.change(
      screen.getByRole("searchbox", {
        name: /search address, neighborhood, or property type/i,
      }),
      { target: { value: "Pine" } },
    );

    const availableLocations = screen.getByRole("region", {
      name: /available locations/i,
    });
    expect(within(availableLocations).getByText("789 Pine Lane")).toBeVisible();
    expect(
      within(availableLocations).queryByText("123 Oak Street"),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/3 selected · maximum 5/i)).toBeVisible();
  });

  it("adds an entered address as a selected local draft", () => {
    render(<SiteOwnerDashboard />);

    fireEvent.change(
      screen.getByRole("searchbox", {
        name: /search address, neighborhood, or property type/i,
      }),
      { target: { value: "987 Solar Way" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /add location/i }));

    expect(
      screen.getByRole("checkbox", { name: /987 solar way/i }),
    ).toBeChecked();
    expect(screen.getByText(/location pending validation/i)).toBeVisible();
    expect(screen.getByText(/4 selected · maximum 5/i)).toBeVisible();
    expect(
      within(
        screen.getByRole("region", { name: /location comparison cards/i }),
      ).getAllByRole("article"),
    ).toHaveLength(11);
    expect(
      screen.getByText(/comparison pending location validation/i),
    ).toBeVisible();
  });

  it("updates the illustrative comparison from selected modeled locations", () => {
    render(<SiteOwnerDashboard />);

    const comparison = screen.getByRole("region", {
      name: /location comparison cards/i,
    });
    const cedarCard = within(comparison)
      .getByRole("heading", { level: 3, name: "Cedar Dr" })
      .closest("article");
    if (!cedarCard) throw new Error("Cedar comparison card is missing.");

    fireEvent.click(
      screen.getByRole("checkbox", { name: /321 cedar drive/i }),
    );
    expect(
      screen.getByText(/location selections changed/i),
    ).toBeVisible();
    expect(within(cedarCard).getByText(/included in latest simulation/i)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));

    const roi = screen
      .getByRole("heading", { level: 2, name: /roi analysis/i })
      .closest("section");
    if (!roi) throw new Error("ROI analysis section is missing.");

    expect(within(roi).getByText("$34,000")).toBeVisible();
    expect(within(roi).getByText("$52,000")).toBeVisible();
    expect(within(roi).getByText("+53%")).toBeVisible();
    expect(within(roi).getByText(/include 2 modeled locations/i)).toBeVisible();
    expect(
      screen.queryByText(/location selections changed/i),
    ).not.toBeInTheDocument();
    expect(
      within(cedarCard).getByText(/not included in latest simulation/i),
    ).toBeVisible();

    const includedCards = within(comparison)
      .getAllByText(/included in latest simulation/i)
      .filter((node) => !node.textContent?.startsWith("Not "));
    expect(includedCards).toHaveLength(2);
  });
});
