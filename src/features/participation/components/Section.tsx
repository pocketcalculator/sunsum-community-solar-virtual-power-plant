import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import styles from "./Section.module.css";

interface SectionProps {
  /** Stable fragment id — also used to link the heading to the section. */
  id: string;
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  footnote?: ReactNode;
  tone?: "default" | "sunken";
  children: ReactNode;
}

/** Page section with a consistent heading rhythm and a stable anchor target. */
export function Section({
  id,
  title,
  eyebrow,
  description,
  footnote,
  tone = "default",
  children,
}: SectionProps) {
  const headingId = `${id}-title`;

  return (
    <section
      className={cx(styles.section, tone === "sunken" && styles.sunken)}
      id={id}
      aria-labelledby={headingId}
    >
      <div className={styles.inner}>
        <div className={styles.head}>
          {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
          <h2 className={styles.title} id={headingId}>
            {title}
          </h2>
          {description ? (
            <div className={styles.description}>{description}</div>
          ) : null}
        </div>

        <div className={styles.body}>{children}</div>

        {footnote ? <p className={styles.footnote}>{footnote}</p> : null}
      </div>
    </section>
  );
}
