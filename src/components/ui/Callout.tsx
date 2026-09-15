import type { ReactNode } from "react";
import { AlertIcon, InfoIcon } from "./icons";
import { cx } from "./cx";
import styles from "./Callout.module.css";

export type CalloutTone = "info" | "caution";

interface CalloutProps {
  title: string;
  children: ReactNode;
  tone?: CalloutTone;
  id?: string | undefined;
  className?: string | undefined;
}

const TONE_CLASS = {
  info: styles.info,
  caution: styles.caution,
} satisfies Record<CalloutTone, string | undefined>;

/** Compact framed note. The icon and title carry the meaning, not colour. */
export function Callout({
  title,
  children,
  tone = "info",
  id,
  className,
}: CalloutProps) {
  const Icon = tone === "caution" ? AlertIcon : InfoIcon;

  return (
    <div className={cx(styles.callout, TONE_CLASS[tone], className)} id={id}>
      <div className={styles.header}>
        <span className={styles.icon}>
          <Icon />
        </span>
        <h3 className={styles.title}>{title}</h3>
      </div>
      <div className={styles.body}>{children}</div>
    </div>
  );
}
