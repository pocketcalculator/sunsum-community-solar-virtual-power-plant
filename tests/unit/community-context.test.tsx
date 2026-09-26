import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublicLearning, PublicStoryPage, VppEducation } from "@/features/community-context";

describe("public community stories", () => {
  it.each([
    ["need", "The Need Page", "/opportunity"],
    ["opportunity", "The Opportunity", "/impact"],
    ["impact", "The Impact", "/need"],
  ] as const)("renders %s with return and onward navigation", (topic, title, next) => {
    const { container } = render(<PublicStoryPage topic={topic} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { name: title })).toBeVisible();
    expect(screen.getByRole("link", { name: "Return to SunSum" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /^Read the / })).toHaveAttribute("href", next);
    expect(screen.getByRole("link", { name: "About SunSum" })).toHaveAttribute("href", "/#about");
    expect(screen.getByRole("link", { name: "Common questions" })).toHaveAttribute("href", "/#faq");
    expect(screen.getByRole("link", { name: "Open workspace" })).toHaveAttribute("href", "/app");
    expect(container.querySelector("main")).toBeNull();
    expect(container.querySelector("audio, video, iframe, form")).toBeNull();
    expect(container.textContent).not.toMatch(/docx|attachment key|source:|P00[1-9]|100 percent|one hundred percent/i);
  });

  it("keeps the Need's community-needs-first, surplus-second sequence", () => {
    render(<PublicStoryPage topic="need" />);
    const article = screen.getByRole("article");
    expect(article.textContent).toMatch(/their own needs first, and then contribute the surplus/);
    expect(article.textContent).toMatch(/solar and other renewable sources/);
    expect(article.textContent).toMatch(/Ownership and partnerships would depend/);
  });

  it("uses the four updated Opportunity mechanisms in authored order", () => {
    render(<PublicStoryPage topic="opportunity" />);
    const approach = screen.getByRole("region", { name: "How the approach works" });
    const list = within(approach).getByRole("list");
    expect(list.tagName).toBe("OL");
    expect(within(list).getAllByRole("heading").map((heading) => heading.textContent)).toEqual([
      "Underused assets become solar projects",
      "Individual projects aggregate into a virtual power plant",
      "A cooperative structure holds the ownership",
      "The platform coordinates everyone",
    ]);
    expect(screen.getByRole("article").textContent).not.toMatch(/bird|resilien|outage/i);
  });

  it("keeps Impact conditional and ordered people, economy, environment", () => {
    render(<PublicStoryPage topic="impact" />);
    const article = screen.getByRole("article");
    expect(within(article).getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "For people", "For the economy", "For the environment",
    ]);
    expect(article.textContent).toMatch(/If communities generate/);
    expect(article.textContent).toMatch(/not guaranteed results/);
    expect(article.textContent).toMatch(/not a report of achieved displacement/);
  });
});

describe("reusable VPP education", () => {
  it("separates five relationships in native accessible text without controls or services", () => {
    const { container } = render(<VppEducation />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("How a virtual power plant fits together");
    expect(screen.getAllByRole("term").map((term) => term.textContent)).toEqual([
      "Energy", "Renewable energy certificates (RECs)", "Capital", "Information and data", "Responsibilities",
    ]);
    expect(screen.getAllByRole("definition")).toHaveLength(5);
    expect(screen.getByText(/Grid-tied solar alone is not backup power/)).toBeVisible();
    expect(screen.getByText(/not the physical electricity itself/)).toBeVisible();
    expect(screen.getByText(/An expression of interest is not funding/)).toBeVisible();
    expect(container.querySelector("button, input, audio, video, iframe")).toBeNull();
  });

  it("supports embedding at heading level three", () => {
    render(<VppEducation headingLevel={3} />);
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("How a virtual power plant fits together");
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("keeps orientation optional and revisitable with an explicit return", () => {
    render(
      <>
        <h1 id="preview-heading" tabIndex={-1}>Profile preview</h1>
        <PublicLearning returnFocusId="preview-heading" />
      </>,
    );
    const summary = screen.getByText("Learning and help (optional)");
    const details = summary.closest("details");
    expect(details).not.toHaveAttribute("open");
    fireEvent.click(summary);
    expect(details).toHaveAttribute("open");
    expect(screen.getByRole("region", { name: "Website orientation" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Virtual power plant learning" })).toBeVisible();
    expect(screen.getByText(/Opening help does not contact a project manager/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Return to profile preview" }));
    expect(details).not.toHaveAttribute("open");
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    fireEvent.click(summary);
    expect(details).toHaveAttribute("open");
  });
});
