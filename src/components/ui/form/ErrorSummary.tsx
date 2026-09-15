import type { Ref } from "react";
import { AlertIcon } from "../icons";
import styles from "./ErrorSummary.module.css";

export interface ErrorSummaryItem {
  /** Id of the field or group the message belongs to. */
  readonly targetId: string;
  readonly message: string;
}

interface ErrorSummaryProps {
  title: string;
  items: readonly ErrorSummaryItem[];
  /** Accepted so the caller can move focus here after a failed attempt. */
  ref?: Ref<HTMLDivElement> | undefined;
  id?: string | undefined;
}

/**
 * List of what needs fixing, with a link to each control. Focusable so the
 * caller can move focus here, and announced for people who never see it.
 */
export function ErrorSummary({ title, items, ref, id }: ErrorSummaryProps) {
  return (
    <div
      className={styles.summary}
      id={id}
      ref={ref}
      role="alert"
      tabIndex={-1}
    >
      <h3 className={styles.title}>
        <AlertIcon className={styles.icon} />
        {title}
      </h3>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={`${item.targetId}:${item.message}`}>
            <a className={styles.link} href={`#${item.targetId}`}>
              {item.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
