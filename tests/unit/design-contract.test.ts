// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceRoot = fileURLToPath(new URL("../../src", import.meta.url));

describe("the implemented semantic color boundary", () => {
  it("keeps direct palette and RGB color definitions out of consumers", () => {
    const files = readdirSync(sourceRoot, {
      recursive: true,
      encoding: "utf8",
      withFileTypes: false,
    })
      .filter((file) => /\.(css|tsx)$/.test(file))
      .filter((file) => file.replaceAll("\\", "/") !== "styles/tokens.css");
    expect(files.length).toBeGreaterThan(0);

    const violations = files.filter((file) =>
      /var\(\s*--palette-|\brgba?\(/.test(
        readFileSync(join(sourceRoot, file), "utf8"),
      ),
    );
    expect(violations).toEqual([]);
  });
});

describe("the implemented responsive-width boundary", () => {
  /**
   * A grid with no `grid-template-columns` sizes its column to the content's
   * min-content width, which can exceed the container once the root font size
   * is enlarged — the page then scrolls sideways. `overflow-wrap: break-word`
   * does not prevent it, because it wraps painted text without reducing the
   * intrinsic minimum.
   *
   * This reached CI once: the landing page overflowed at 360px with 32px root
   * text on Linux, while passing locally on Windows, because font metrics
   * decided whether the excess was big enough to push the document.
   */
  it("gives every grid an explicit column template", () => {
    const files = readdirSync(sourceRoot, {
      recursive: true,
      encoding: "utf8",
      withFileTypes: false,
    }).filter((file) => file.endsWith(".css"));
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];

    for (const file of files) {
      const css = readFileSync(join(sourceRoot, file), "utf8");
      const rules = css.matchAll(/([^{}]+)\{([^{}]*)\}/g);

      for (const rule of rules) {
        const selector = (rule[1] ?? "").trim().replaceAll(/\s+/g, " ");
        const body = rule[2] ?? "";

        if (!/display:\s*(inline-)?grid/.test(body)) continue;
        if (/grid-template-columns|grid-template\s*:|grid-area/.test(body)) {
          continue;
        }

        violations.push(`${file.replaceAll("\\", "/")} { ${selector} }`);
      }
    }

    expect(violations).toEqual([]);
  });
});
