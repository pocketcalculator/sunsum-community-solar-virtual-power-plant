import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRightIcon } from "./icons";
import { cx } from "./cx";
import styles from "./ActionLink.module.css";

export type ActionLinkVariant = "primary" | "secondary";

interface ActionLinkProps {
  href: string;
  children: ReactNode;
  variant?: ActionLinkVariant;
  /** Adds a trailing arrow. Decorative, so it never changes the link name. */
  showArrow?: boolean;
  className?: string | undefined;
}

const VARIANT_CLASS = {
  primary: styles.primary,
  secondary: styles.secondary,
} satisfies Record<ActionLinkVariant, string | undefined>;

/**
 * Link styled as an action. Same-page fragments render as a plain anchor so
 * they keep native browser scrolling without client-side routing.
 */
export function ActionLink({
  href,
  children,
  variant = "primary",
  showArrow = false,
  className,
}: ActionLinkProps) {
  const classNames = cx(styles.action, VARIANT_CLASS[variant], className);
  const content = (
    <>
      <span>{children}</span>
      {showArrow ? <ArrowRightIcon className={styles.arrow} /> : null}
    </>
  );

  if (href.startsWith("#")) {
    return (
      <a className={classNames} href={href}>
        {content}
      </a>
    );
  }

  return (
    <Link className={classNames} href={href}>
      {content}
    </Link>
  );
}
