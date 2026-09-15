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
