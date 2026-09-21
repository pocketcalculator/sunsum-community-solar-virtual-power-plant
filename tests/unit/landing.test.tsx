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

  it("sends the primary call to action into the fictional participation preview", () => {
    render(<LandingPage />);
    expect(
      screen.getByRole("link", { name: "Explore participation" }),
    ).toHaveAttribute("href", "/join");
  });

  it("offers an explicit workspace entrance without replacing the public arrival", () => {
    render(<LandingPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Community solar, with communities at the center.");
    expect(screen.getByRole("link", { name: "Open Sunroom workspace", exact: true })).toHaveAttribute("href", "/app");
    expect(screen.getByRole("link", { name: "Why local needs come first" })).toHaveAttribute("href", "/need");
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

  it("keeps the introduction counts tied to the explanations they describe", () => {
    render(<LandingPage />);
    const scope = screen.getByRole("list", { name: "Introduction guide" });

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

  it("distinguishes public no-save pages from scoped authorized workspace actions", () => {
    const { container } = render(<LandingPage />);
    expect(container.querySelector("form")).toBeNull();
    expect(screen.getByText("No project records are requested by these public pages")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open workspace" })).toHaveAttribute("href", "/app");
    expect(container.textContent).not.toMatch(/workspaces themselves are not built|nowhere to store/);
    expect(screen.getByRole("heading", { name: "Scoped service actions" })).toBeVisible();
    expect(container.textContent).toContain("nonbinding-interest action requires service permission");
  });

  it("links the illustration to the actual story routes and supplies About and FAQ anchors", () => {
    render(<LandingPage />);
    const illustration = screen.getByRole("img").closest("figure");
    if (!illustration) throw new Error("The community illustration is missing.");
    for (const [label, href] of [
      ["Why local needs come first", "/need"],
      ["How separate sites work together", "/opportunity"],
      ["What shared impact could mean", "/impact"],
    ] as const) {
      expect(within(illustration).getByRole("link", { name: label })).toHaveAttribute("href", href);
    }
    expect(document.getElementById("about")).toBeVisible();
    expect(document.getElementById("faq")).toBeVisible();
    expect(screen.getByText("Learning and help (optional)").closest("details")).not.toHaveAttribute("open");
  });
});
