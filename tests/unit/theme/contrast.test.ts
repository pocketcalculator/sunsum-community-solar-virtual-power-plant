// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The contrast half of "WCAG 2.1 AA for contrast, labels, focus order,
 * keyboard" (design document section 10), measured against the tokens as they
 * are actually declared rather than against a table kept beside them.
 *
 * A second theme doubles the number of ways that promise can be broken, and the
 * failure is silent: nothing throws when muted text on a pale surface drops to
 * three to one. So the stylesheet is read, `var()` chains are followed,
 * translucent tokens are composited onto what sits behind them, and the pairs
 * that carry meaning are measured.
 */

const tokensPath = fileURLToPath(
  new URL("../../../src/styles/tokens.css", import.meta.url),
);

const LIGHT_SELECTOR = ':root[data-theme="light"]';

/** Text against its background. WCAG 1.4.3, taking every size as small. */
const TEXT_MINIMUM = 4.5;

/** Meaningful non-text: focus rings, state borders, control marks. WCAG 1.4.11. */
const NON_TEXT_MINIMUM = 3;

interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

type Tokens = ReadonlyMap<string, string>;

function readBlocks(): Map<string, Map<string, string>> {
  const css = readFileSync(tokensPath, "utf8").replaceAll(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  const blocks = new Map<string, Map<string, string>>();

  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (rule[1] ?? "").trim().replaceAll(/\s+/g, " ");
    const declarations = blocks.get(selector) ?? new Map<string, string>();

    for (const line of (rule[2] ?? "").split(";")) {
      const separator = line.indexOf(":");
      if (separator === -1) continue;

      const name = line.slice(0, separator).trim();
      if (!name.startsWith("--")) continue;

      declarations.set(name, line.slice(separator + 1).trim());
    }

    blocks.set(selector, declarations);
  }

  return blocks;
}

const blocks = readBlocks();
const baseTokens = blocks.get(":root");
const lightOverrides = blocks.get(LIGHT_SELECTOR);

if (!baseTokens) throw new Error("tokens.css declares no :root block.");
if (!lightOverrides) {
  throw new Error(`tokens.css declares no ${LIGHT_SELECTOR} block.`);
}

const THEME_TOKENS = new Map<string, Tokens>([
  ["dark", baseTokens],
  ["light", new Map([...baseTokens, ...lightOverrides])],
]);

/** Follows `var()` to a literal, refusing to loop forever on a cycle. */
function resolve(
  name: string,
  tokens: Tokens,
  seen: readonly string[] = [],
): string {
  if (seen.includes(name)) {
    throw new Error(`Token cycle: ${[...seen, name].join(" -> ")}`);
  }

  const value = tokens.get(name);
  if (value === undefined) throw new Error(`Undeclared token: ${name}`);

  return value.replaceAll(
    /var\(\s*(--[\w-]+)\s*\)/g,
    (_match, reference: string) => resolve(reference, tokens, [...seen, name]),
  );
}

function parseColor(value: string): Rgba | null {
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(value.trim());
  const digits = hex?.[1];

  if (digits !== undefined) {
    const expanded =
      digits.length === 3
        ? [...digits].map((digit) => digit + digit).join("")
        : digits;

    return {
      r: Number.parseInt(expanded.slice(0, 2), 16),
      g: Number.parseInt(expanded.slice(2, 4), 16),
      b: Number.parseInt(expanded.slice(4, 6), 16),
      a: 1,
    };
  }

  const functional =
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:\/\s*([\d.]+)(%?))?\s*\)$/i.exec(
      value.trim(),
    );

  if (!functional) return null;

  const [, red, green, blue, alpha, percent] = functional;

  return {
    r: Number(red),
    g: Number(green),
    b: Number(blue),
    a: alpha === undefined ? 1 : Number(alpha) / (percent === "%" ? 100 : 1),
  };
}

function colorOf(name: string, tokens: Tokens): Rgba {
  const resolved = resolve(name, tokens);
  const color = parseColor(resolved);

  if (!color) throw new Error(`${name} is not a single colour: ${resolved}`);

  return color;
}

/** Paints a translucent colour onto an opaque one, as the browser would. */
function composite(top: Rgba, bottom: Rgba): Rgba {
  const blend = (over: number, under: number) =>
    over * top.a + under * (1 - top.a);

  return {
    r: blend(top.r, bottom.r),
    g: blend(top.g, bottom.g),
    b: blend(top.b, bottom.b),
    a: 1,
  };
}

function luminance({ r, g, b }: Rgba): number {
  const channel = (value: number) => {
    const ratio = value / 255;

    return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(foreground: Rgba, background: Rgba): number {
  const first = luminance(foreground);
  const second = luminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Every opaque surface a component can sit on, and every translucent tint that
 * can be laid over one. The check is a superset on purpose: listing only the
 * pairs that exist today drifts the moment a component is restyled, and gives
 * false confidence in the meantime. This measures every combination the tokens
 * make possible, so a new pairing is covered before anyone writes it.
 */
const OPAQUE_SURFACES = [
  "--surface-page",
  "--surface-raised",
  "--surface-sunken",
  "--surface-raised-strong",
  "--surface-field",
] as const;

const TRANSLUCENT_SURFACES = [
  "--surface-accent-soft",
  "--surface-positive-soft",
  "--surface-critical-soft",
  "--surface-neutral-soft",
  "--surface-neutral-hover",
  "--surface-neutral-muted",
  "--surface-neutral-highlight",
  "--surface-field-disabled",
  "--surface-overlay",
  "--surface-section-veil",
] as const;

/**
 * The site header stacks two translucent layers over the page, which the
 * single-tint combinations above never produce. The theme control lives here,
 * so its selected state is judged against this and not against the page.
 */
const HEADER_TRACK = [
  "--surface-neutral-soft",
  "--surface-overlay",
  "--surface-page",
] as const;

const TEXT_TOKENS = [
  "--text-primary",
  "--text-secondary",
  "--text-muted",
  "--text-accent",
  "--text-positive",
  "--text-critical",
] as const;

/** Opaque non-text that has to be seen: rings, state edges, control marks. */
const VISIBLE_NON_TEXT_TOKENS = [
  "--focus-ring-color",
  "--accent-community",
  "--accent-solar-line",
  "--control-mark",
  "--border-interactive-hover",
] as const;

/**
 * An edge is painted over the element's own fill before anything can be
 * compared with it, so a translucent border is never as strong as its declared
 * colour suggests. Measuring one without saying what it sits on is exactly how
 * a 1.78:1 input outline can be certified as 18:1.
 */
interface LinePairing {
  readonly token: string;
  /** What the edge is painted over: the element's own background. */
  readonly fill: string;
  /**
   * What can actually sit next to it. Unlike text, which can be placed on any
   * surface in the system, a component's chrome only ever meets the few
   * surfaces it is nested in, so measuring against all of them would reject
   * combinations that cannot be built.
   */
  readonly against: readonly (readonly string[])[];
  readonly description: string;
}

const LINE_PAIRINGS: readonly LinePairing[] = [
  {
    token: "--border-field",
    fill: "--surface-field",
    // Fields appear on the page and inside panels, never inside a tinted badge.
    against: OPAQUE_SURFACES.map((surface) => [surface]),
    description: "a text field's outline, which is all that marks it as one",
  },
  {
    token: "--accent-solar-line",
    fill: "--accent-solar",
    against: [HEADER_TRACK],
    description: "the selected theme pill against the header track",
  },
];

/**
 * A fill is measured against the text it carries rather than the surface behind
 * it. WCAG 1.4.11 exempts a component whose boundary is not needed to identify
 * it, and a filled button is identified by its label. `--accent-solar` is
 * therefore absent from the list above; where brand gold has to read as a line
 * instead, `--accent-solar-line` is the token, and that one is measured.
 */
const FILL_PAIRINGS = [
  { foreground: "--text-on-accent", background: "--accent-solar" },
  { foreground: "--text-on-accent", background: "--accent-solar-hover" },
] as const;

interface Backdrop {
  readonly name: string;
  readonly color: Rgba;
}

/**
 * Refuses a translucent foreground rather than measuring its declared colour,
 * which would overstate the contrast of every alpha token in the file.
 */
function foregroundColor(name: string, tokens: Tokens): Rgba {
  const color = colorOf(name, tokens);

  if (color.a < 1) {
    throw new Error(
      `${name} is translucent; measure it as a line over a named fill instead.`,
    );
  }

  return color;
}

function stack(names: readonly string[], tokens: Tokens): Rgba {
  return [...names]
    .reverse()
    .map((name) => colorOf(name, tokens))
    .reduce((beneath, above) => composite(above, beneath));
}

function backdropsFor(tokens: Tokens): readonly Backdrop[] {
  const opaque = OPAQUE_SURFACES.map((name) => ({
    name,
    color: colorOf(name, tokens),
  }));

  return [
    ...opaque,
    ...TRANSLUCENT_SURFACES.flatMap((tint) =>
      opaque.map((base) => ({
        name: `${tint} over ${base.name}`,
        color: composite(colorOf(tint, tokens), base.color),
      })),
    ),
    { name: HEADER_TRACK.join(" over "), color: stack(HEADER_TRACK, tokens) },
  ];
}

describe.each([...THEME_TOKENS.keys()])("the %s theme", (themeName) => {
  const tokens = THEME_TOKENS.get(themeName);
  if (!tokens) throw new Error(`No tokens collected for ${themeName}.`);

  it("meets WCAG 2.1 AA on every surface a token can land on", () => {
    const failures: string[] = [];

    const measure = (
      foreground: string,
      color: Rgba,
      minimum: number,
      backdrop: Backdrop,
    ) => {
      const measured = contrast(color, backdrop.color);

      if (measured < minimum) {
        failures.push(
          `${foreground} on ${backdrop.name} is ${measured.toFixed(2)}:1, below ${minimum}:1`,
        );
      }
    };

    for (const backdrop of backdropsFor(tokens)) {
      for (const token of TEXT_TOKENS) {
        measure(token, foregroundColor(token, tokens), TEXT_MINIMUM, backdrop);
      }

      for (const token of VISIBLE_NON_TEXT_TOKENS) {
        measure(
          token,
          foregroundColor(token, tokens),
          NON_TEXT_MINIMUM,
          backdrop,
        );
      }

    }

    for (const line of LINE_PAIRINGS) {
      // The edge takes the colour of the fill beneath it before it is seen.
      const painted = composite(
        colorOf(line.token, tokens),
        colorOf(line.fill, tokens),
      );

      for (const surfaces of line.against) {
        measure(
          `${line.token} over ${line.fill} (${line.description})`,
          painted,
          NON_TEXT_MINIMUM,
          { name: surfaces.join(" over "), color: stack(surfaces, tokens) },
        );
      }
    }

    expect(failures).toEqual([]);
  });

  it("keeps enough contrast on the text a filled control carries", () => {
    const failures = FILL_PAIRINGS.flatMap(({ foreground, background }) => {
      const measured = contrast(
        foregroundColor(foreground, tokens),
        colorOf(background, tokens),
      );

      return measured >= TEXT_MINIMUM
        ? []
        : [
            `${foreground} on ${background} is ${measured.toFixed(2)}:1, below ${TEXT_MINIMUM}:1`,
          ];
    });

    expect(failures).toEqual([]);
  });
});

/**
 * Brand gold is the identity of the product and is the one colour that should
 * not change with the theme. It never carries text contrast itself — dark text
 * sits on it either way — which is why its text partner is shared too.
 */
const SHARED_COLOUR_TOKENS: readonly string[] = [
  "--accent-solar",
  "--text-on-accent",
];

describe("the light theme's coverage of the dark baseline", () => {
  it("answers for every semantic colour, or says why it does not have to", () => {
    const unanswered = [...baseTokens.keys()]
      .filter((name) => !name.startsWith("--palette-"))
      .filter((name) => parseColor(resolve(name, baseTokens)) !== null)
      .filter((name) => !lightOverrides.has(name))
      .filter((name) => !SHARED_COLOUR_TOKENS.includes(name));

    expect(unanswered).toEqual([]);
  });

  it("keeps raw palette entries out of the themed block", () => {
    const palette = [...lightOverrides.keys()].filter((name) =>
      name.startsWith("--palette-"),
    );

    expect(palette).toEqual([]);
  });
});

/**
 * The trap this closes: brand gold reads clearly on navy, so using it for a
 * state edge looks correct until a light theme exists, at which point the
 * current step and the caution callout quietly lose their only distinguishing
 * mark. `--accent-solar-line` exists for that job and is measured above.
 */
describe("brand gold's two jobs", () => {
  it("is never the colour of an edge a component depends on being seen", () => {
    const styleRoot = fileURLToPath(new URL("../../../src", import.meta.url));
    const files = readdirSync(styleRoot, {
      recursive: true,
      encoding: "utf8",
      withFileTypes: false,
    }).filter((file) => file.endsWith(".css"));

    expect(files.length).toBeGreaterThan(0);

    // Every way a component's chrome can draw an edge, not just the `*-color`
    // longhand: the shorthand, an outline and a shadow all paint a line too.
    //
    // SVG `stroke` is deliberately not included. The illustrations are single
    // `role="img"` graphics with their own text alternative, and WCAG 1.4.11
    // does not reach inside one of those — brand gold is the right colour for a
    // sun, and the rule here is about component state, not paint.
    const edgeDeclaration =
      /(border[\w-]*|outline[\w-]*|box-shadow)\s*:[^;}]*var\(\s*--accent-solar\s*\)/;

    const violations = files.filter((file) =>
      edgeDeclaration.test(readFileSync(join(styleRoot, file), "utf8")),
    );

    expect(violations).toEqual([]);
  });
});
