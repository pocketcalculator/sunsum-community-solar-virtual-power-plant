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

export function ChatIcon(props: IconProps) {
  return (
    <svg {...strokeIconProps(props)}>
      <path d="M2.25 3.25h11.5v8H7l-3.5 2.5v-2.5H2.25v-8Z" />
      <path d="M5 6.25h6M5 8.5h4" />
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

export function CloseIcon(props: IconProps) {
  return (
    <svg {...strokeIconProps(props)}>
      <path d="m4 4 8 8M12 4l-8 8" />
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

export function PaperclipIcon(props: IconProps) {
  return (
    <svg {...strokeIconProps(props)}>
      <path d="m6 8.75 4.15-4.15a2.12 2.12 0 0 1 3 3l-5.3 5.3a3.18 3.18 0 0 1-4.5-4.5l5-5" />
    </svg>
  );
}

export function MicrophoneIcon(props: IconProps) {
  return (
    <svg {...strokeIconProps(props)}>
      <rect x="5.5" y="2" width="5" height="8" rx="2.5" />
      <path d="M3.5 8.25a4.5 4.5 0 0 0 9 0M8 12.75V15M5.75 15h4.5" />
    </svg>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <svg {...strokeIconProps(props)}>
      <path d="m2 2 12 6-12 6 2-6-2-6Z" />
      <path d="M4 8h10" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...strokeIconProps(props)}>
      <path d="M3 4.5h10M6 4.5V2.75h4V4.5M4.5 4.5l.6 9h5.8l.6-9M6.75 7v4M9.25 7v4" />
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
