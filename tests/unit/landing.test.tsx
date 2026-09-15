import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JOURNEY_STAGES } from "@/domain/journey";
import {
  ENTRY_PATHS,
  LandingPage,
  entryPathHref,
} from "@/features/participation";

describe("landing page", () => {
  it("leads with a single page heading", () => {
    render(<LandingPage />);
    expect(screen.getByRole("heading", { level: 1 })).toBeVisible();
  });

  it("offers a working link for each way to take part", () => {
    render(<LandingPage />);

    for (const path of ENTRY_PATHS) {
      const link = screen.getByRole("link", {
        name: `Start with ${path.label.toLowerCase()}`,
      });
      expect(link).toHaveAttribute("href", entryPathHref(path));
    }
  });

  it("sends the primary call to action into the create-profile flow", () => {
    render(<LandingPage />);
    expect(
      screen.getByRole("link", { name: /create your profile/i }),
    ).toHaveAttribute("href", "/join");
  });

  it("explains the delivery journey as an ordered list of stages", () => {
    render(<LandingPage />);
    const journey = document.getElementById("journey");
    if (!journey) throw new Error("The delivery journey section is missing.");

    const list = within(journey).getByRole("list");
    expect(list.tagName).toBe("OL");
    expect(within(list).getAllByRole("listitem")).toHaveLength(
      JOURNEY_STAGES.length,
    );

    for (const stage of JOURNEY_STAGES) {
      expect(
        within(journey).getByText(stage.name, { exact: true }),
      ).toBeVisible();
    }
  });

  it("keeps the build-scope counts tied to the data they describe", () => {
    render(<LandingPage />);
    const scope = screen.getByRole("list", { name: "Build scope" });

    expect(
      within(scope).getByText("ways to start taking part").closest("li"),
    ).toHaveTextContent(
      new RegExp(`^${ENTRY_PATHS.length}\\s*ways to start taking part$`),
    );
    expect(
      within(scope).getByText("delivery stages described").closest("li"),
    ).toHaveTextContent(
      new RegExp(`^${JOURNEY_STAGES.length}\\s*delivery stages described$`),
    );
  });

  it("does not claim any project data is connected", () => {
    const { container } = render(<LandingPage />);
    expect(container.querySelector("form")).toBeNull();
    expect(screen.getByText(/no project records/i)).toBeVisible();
  });
});
