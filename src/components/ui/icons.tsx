import type { SVGProps } from "react";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "children">;

/**
 * Domain-neutral line icons drawn on a 16px grid and sized in `em`, so they
 * scale with surrounding text. They are decorative by default; callers that
 * need a standalone meaning pass `aria-hidden={false}` plus a label.
 */
function strokeIconProps(props: IconProps): SVGProps<SVGSVGElement> {
  return {
    viewBox: "0 0 16 16",
    width: "1em",
    height: "1em",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    focusable: false,
    ...props,
  };
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...strokeIconProps(props)}>
      <path d="M2.75 8h10.5" />
      <path d="M9.25 4 13.25 8l-4 4" />
    </svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <svg {...strokeIconProps(props)}>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.25v4" />
      <path d="M8 4.75h.01" />
    </svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <svg {...strokeIconProps(props)}>
      <path d="M8 2.25 14.5 13.5h-13L8 2.25Z" />
      <path d="M8 6.5v3.25" />
      <path d="M8 11.75h.01" />
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg {...strokeIconProps(props)}>
      <path d="m3.5 6 4.5 4.5L12.5 6" />
    </svg>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <svg {...strokeIconProps(props)}>
      <circle cx="8" cy="8" r="3.25" />
      <path d="M8 1.25v1.5" />
      <path d="M8 13.25v1.5" />
      <path d="M1.25 8h1.5" />
      <path d="M13.25 8h1.5" />
      <path d="m3.4 3.4 1.06 1.06" />
      <path d="m11.54 11.54 1.06 1.06" />
      <path d="m12.6 3.4-1.06 1.06" />
      <path d="m4.46 11.54-1.06 1.06" />
    </svg>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <svg {...strokeIconProps(props)}>
      <path d="M13.4 9.65A5.75 5.75 0 0 1 6.35 2.6 5.75 5.75 0 1 0 13.4 9.65Z" />
    </svg>
  );
}

export function DisplayIcon(props: IconProps) {
  return (
    <svg {...strokeIconProps(props)}>
      <rect height="8.5" rx="1.25" width="12.5" x="1.75" y="2.25" />
      <path d="M8 10.75v3" />
      <path d="M5.75 13.75h4.5" />
    </svg>
  );
}
