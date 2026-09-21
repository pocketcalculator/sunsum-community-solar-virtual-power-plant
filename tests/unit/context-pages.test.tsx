// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  CONTEXT_PAGES,
  ContextPage,
  contextPage,
  PublicShell,
} from "@/features/participation";

afterEach(cleanup);

describe("the context pages", () => {
  it("publishes exactly the Need, Opportunity and Impact pages", () => {
    expect(CONTEXT_PAGES.map((page) => page.id)).toEqual([
      "need",
      "opportunity",
      "impact",
    ]);
  });

  it("gives every page a route, a nav label and a summary", () => {
    for (const page of CONTEXT_PAGES) {
      expect(page.href).toBe(`/${page.id}`);
      expect(page.navLabel.length).toBeGreaterThan(0);
      expect(page.summary.length).toBeGreaterThan(0);
      expect(page.sections.length).toBeGreaterThan(0);
    }
  });

  /**
   * `Section` renders every section's heading, and a page whose sections had
   * no heading would produce empty or duplicated ones.
   */
  it("gives every section a heading", () => {
    for (const page of CONTEXT_PAGES) {
      for (const section of page.sections) {
        expect(section.heading.length).toBeGreaterThan(0);
        expect(section.paragraphs.length).toBeGreaterThan(0);
      }
    }
  });

  it("uses a section heading only once per page, so anchors stay distinct", () => {
    for (const page of CONTEXT_PAGES) {
      const headings = page.sections.map((section) => section.heading);
      expect(new Set(headings).size).toBe(headings.length);
    }
  });

  /**
   * The landing page promises "no generation, savings or financial figures",
   * and the project's rules forbid inventing tariff or market claims. The
   * supplied copy is qualitative, and it has to stay that way: a currency
   * amount or a modelled percentage here would be a figure nothing backs.
   */
  it("states no monetary or modelled figures", () => {
    for (const page of CONTEXT_PAGES) {
      const prose = [
        page.summary,
        ...page.sections.flatMap((section) => [
          ...section.paragraphs,
          ...section.points.flatMap((point) => [point.title, point.detail]),
        ]),
      ].join(" ");

      expect(prose).not.toMatch(/[$£€]\s?\d/);
      expect(prose).not.toMatch(/\bkWh?\b/);
      /** "100% solar" is the stated goal, and the only percentage allowed. */
      for (const match of prose.match(/\d+%/g) ?? []) {
        expect(match).toBe("100%");
      }
    }
  });

  /**
   * Each page is meant to carry a music clip, but the clips discussed are
   * commercial recordings this repository has no licence for. Shipping a
   * placeholder path would render a broken player.
   */
  it("ships no audio until a licensed file is configured", () => {
    for (const page of CONTEXT_PAGES) {
      expect(page.audio).toBeNull();
    }
  });

  it("renders a page's heading, summary and prose", () => {
    render(<ContextPage content={contextPage("need")} />);

    expect(
      screen.getByRole("heading", { level: 1, name: /data centres/i }),
    ).toBeTruthy();
    expect(screen.getByText(/Two hard realities/)).toBeTruthy();
    expect(screen.getByText(/Getting off fossil fuels/)).toBeTruthy();
  });

  it("renders a section's points as a list", () => {
    render(<ContextPage content={contextPage("opportunity")} />);

    expect(screen.getByText("Feed three birds with one seed")).toBeTruthy();
    expect(
      screen.getByText(/Communities generate their own energy/),
    ).toBeTruthy();
  });

  it("renders no audio player while no clip is configured", () => {
    render(<ContextPage content={contextPage("impact")} />);
    expect(screen.queryByRole("button", { name: /Play/ })).toBeNull();
  });
});

describe("the primary navigation", () => {
  it("links to each context page", () => {
    render(
      <PublicShell>
        <p>body</p>
      </PublicShell>,
    );

    for (const page of CONTEXT_PAGES) {
      expect(
        screen.getByRole("link", { name: page.navLabel }).getAttribute("href"),
      ).toBe(page.href);
    }
  });

  /**
   * Review removed these: both pointed at sections the landing page already
   * shows as cards, so they navigated to something already on screen.
   */
  it("no longer offers the anchors review asked to drop", () => {
    render(
      <PublicShell>
        <p>body</p>
      </PublicShell>,
    );

    expect(screen.queryByRole("link", { name: "Participation paths" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Delivery journey" })).toBeNull();
  });

  it("keeps the FAQ anchor", () => {
    render(
      <PublicShell>
        <p>body</p>
      </PublicShell>,
    );

    expect(
      screen.getByRole("link", { name: "FAQ" }).getAttribute("href"),
    ).toBe("/#faq");
  });

  /** Each role's link must reach that role's workspace, not the sign-up form. */
  it("points every role link at its workspace", () => {
    render(
      <PublicShell>
        <p>body</p>
      </PublicShell>,
    );

    expect(
      screen.getByRole("link", { name: "Site Owner" }).getAttribute("href"),
    ).toBe("/dashboard/site-owner");
    expect(
      screen.getByRole("link", { name: "Investor" }).getAttribute("href"),
    ).toBe("/dashboard/investor");
    expect(
      screen.getByRole("link", { name: "Platform Operator" }).getAttribute("href"),
    ).toBe("/dashboard/operator");
  });

  it("renders the demo control it is given, and nothing when there is none", () => {
    const { unmount } = render(
      <PublicShell demoControl={<p>demo pill</p>}>
        <p>body</p>
      </PublicShell>,
    );
    expect(screen.getByText("demo pill")).toBeTruthy();
    unmount();

    render(
      <PublicShell>
        <p>body</p>
      </PublicShell>,
    );
    expect(screen.queryByText("demo pill")).toBeNull();
  });
});
