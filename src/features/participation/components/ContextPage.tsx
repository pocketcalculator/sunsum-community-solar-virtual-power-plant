import { Section } from "./Section";
import { PageAudioPlayer } from "./PageAudio";
import type { ContextPageContent } from "../content/contextPages";
import styles from "./ContextPage.module.css";

export interface ContextPageProps {
  readonly content: ContextPageContent;
}

/**
 * One of the Need, Opportunity and Impact pages.
 *
 * Reuses `Section` so these read as part of the same site rather than as three
 * one-off layouts, and takes all of its prose from `content/contextPages.ts`
 * so wording changes never require touching a component.
 */
export function ContextPage({ content }: ContextPageProps) {
  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <p className={styles.eyebrow}>{content.eyebrow}</p>
          <h1 className={styles.title}>{content.title}</h1>
          <p className={styles.summary}>{content.summary}</p>
          {content.audio === null ? null : (
            <PageAudioPlayer audio={content.audio} />
          )}
        </div>
      </header>

      {content.sections.map((section, index) => (
        <Section
          id={`${content.id}-${index}`}
          key={section.heading}
          title={section.heading}
          tone={index % 2 === 1 ? "sunken" : "default"}
        >
          <div className={styles.prose}>
            {section.paragraphs.map((paragraph) => (
              <p className={styles.paragraph} key={paragraph.slice(0, 48)}>
                {paragraph}
              </p>
            ))}

            {section.points.length === 0 ? null : (
              <ul className={styles.points} role="list">
                {section.points.map((point) => (
                  <li className={styles.point} key={point.title}>
                    <h3 className={styles.pointTitle}>{point.title}</h3>
                    <p className={styles.pointDetail}>{point.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>
      ))}
    </>
  );
}
