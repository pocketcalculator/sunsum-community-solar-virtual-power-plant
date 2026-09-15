import type { ReactNode } from "react";
import { cx } from "./cx";
import styles from "./Badge.module.css";

export type BadgeTone = "neutral" | "accent";

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  icon?: ReactNode;
  className?: string | undefined;
}

// CSS Module keys resolve to `string | undefined` under noUncheckedIndexedAccess.
const TONE_CLASS = {
  neutral: styles.neutral,
  accent: styles.accent,
} satisfies Record<BadgeTone, string | undefined>;

/** Small status or category label. Tone is always paired with text. */
export function Badge({
  children,
  tone = "neutral",
  icon,
  className,
}: BadgeProps) {
  return (
    <span className={cx(styles.badge, TONE_CLASS[tone], className)}>
      {icon ? <span className={styles.icon}>{icon}</span> : null}
      <span>{children}</span>
    </span>
  );
}
