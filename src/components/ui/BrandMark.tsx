import type { SVGProps } from "react";

type BrandMarkProps = Omit<SVGProps<SVGSVGElement>, "children" | "viewBox">;

/**
 * Sunsum mark: a half sun over two shared rooflines. Decorative — the wordmark
 * next to it carries the accessible name.
 */
export function BrandMark(props: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      width="1em"
      height="1em"
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <circle cx="16" cy="13" r="6" fill="var(--accent-solar)" />
      <g
        stroke="var(--accent-solar)"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.75"
      >
        <path d="M16 1.5v2.6" />
        <path d="M26.2 4.8 24.4 6.6" />
        <path d="M5.8 4.8 7.6 6.6" />
        <path d="M30.5 13h-2.6" />
        <path d="M4.1 13H1.5" />
      </g>
      <path
        d="M2.5 24.5 9.5 19l7 5.5"
        stroke="var(--accent-community)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15.5 24.5 22.5 19l7 5.5"
        stroke="var(--brand-roof-secondary)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.8"
      />
      <path
        d="M2.5 29.5h27"
        stroke="var(--brand-baseline)"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}
