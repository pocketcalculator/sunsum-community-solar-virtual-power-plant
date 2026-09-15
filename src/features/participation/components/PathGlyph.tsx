import type { SVGProps } from "react";
import type { EntryPathId } from "../paths";

type GlyphProps = Omit<SVGProps<SVGSVGElement>, "children" | "viewBox">;

interface PathGlyphProps extends GlyphProps {
  path: EntryPathId;
}

const SHARED_SVG_PROPS = {
  viewBox: "0 0 24 24",
  width: "1em",
  height: "1em",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
} as const;

/**
 * One glyph per entry path, so the cards are distinguishable by shape as well as
 * by wording. Always decorative; the path label sits beside it.
 */
export function PathGlyph({ path, ...props }: PathGlyphProps) {
  if (path === "rooftop") {
    return (
      <svg {...SHARED_SVG_PROPS} {...props}>
        <path d="M3.5 10.5 12 4l8.5 6.5" />
        <path d="M5.5 9.8V20h13V9.8" />
        <path d="M9 12.5h6v5H9z" fill="var(--surface-accent-soft)" />
        <path d="M12 12.5v5M9 15h6" />
      </svg>
    );
  }

  if (path === "land") {
    return (
      <svg {...SHARED_SVG_PROPS} {...props}>
        <path d="M2.5 19.5h19" />
        <path d="M4.5 16.5h6l1.5-5h-6z" fill="var(--surface-accent-soft)" />
        <path d="M13.5 16.5h6l-1.5-5h-6z" fill="var(--surface-accent-soft)" />
        <path d="M7 16.5v3M16.5 16.5v3" />
        <path d="M6 8.5 8 6.5M18 8.5 16 6.5M12 5.5v-2" />
      </svg>
    );
  }

  if (path === "funding") {
    return (
      <svg {...SHARED_SVG_PROPS} {...props}>
        <path d="M3.5 19.5h17" />
        <path d="M6 19.5v-5.2M11 19.5V9.8M16 19.5v-7.4" />
        <path d="m4.5 9 5-3.5 4 2.5 6-4.5" />
        <path d="M16.5 3h3.5v3.4" />
      </svg>
    );
  }

  const unreachablePath: never = path;
  throw new Error(`Missing glyph for entry path: ${String(unreachablePath)}`);
}
