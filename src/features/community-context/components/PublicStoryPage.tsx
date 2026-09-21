import Link from "next/link";
import type { ReactNode } from "react";
import { ActionLink } from "@/components/ui/ActionLink";
import { PUBLIC_STORIES, STORY_LINKS, type PublicStoryTopic } from "../content/stories";
import { VppEducation } from "./VppEducation";
import styles from "./CommunityContext.module.css";

interface PublicStoryPageProps {
  topic: PublicStoryTopic;
  audio?: ReactNode;
}

export function PublicStoryPage({ topic, audio }: PublicStoryPageProps) {
  const story = PUBLIC_STORIES[topic];

  return (
    <div className={styles.page}>
      <nav className={styles.storyNav} aria-label="Public stories">
        <Link className={styles.textLink} href="/">Return to SunSum</Link>
        <ul className={styles.linkList} role="list">
          {STORY_LINKS.map((link) => (
            <li key={link.topic}>
              <Link
                className={styles.textLink}
                href={link.href}
                aria-current={topic === link.topic ? "page" : undefined}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <article className={styles.story}>
        <header className={styles.storyHeader}>
          <p className={styles.eyebrow}>SunSum Solar</p>
          <h1 className={styles.title}>{story.title}</h1>
          <p className={styles.scopeNote}>
            A proposed community-energy approach. Goals and potential benefits
            below are not a claim of current projects or guaranteed outcomes.
          </p>
        </header>
        {audio}

        <div className={styles.prose}>
          {story.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </div>

        {story.orderedSections ? (
          <section className={styles.storySection} aria-label={story.sectionHeading}>
            <h2 className={styles.sectionTitle}>{story.sectionHeading}</h2>
            <ol className={styles.mechanisms}>
              {story.sections.map((section) => (
                <li key={section.heading}>
                  <h3 className={styles.itemTitle}>{section.heading}</h3>
                  <p>{section.body}</p>
                </li>
              ))}
            </ol>
          </section>
        ) : story.sections.map((section) => (
          <section className={styles.storySection} key={section.heading}>
            <h2 className={styles.sectionTitle}>{section.heading}</h2>
            <p>{section.body}</p>
          </section>
        ))}

        {story.closing ? <p className={styles.closing}>{story.closing}</p> : null}
      </article>

      <details className={styles.disclosure}>
        <summary className={styles.summary}>
          Learn how a virtual power plant works
        </summary>
        <div className={styles.disclosureBody}>
          <VppEducation />
          <p>Close this section to return to the story. You can revisit it anytime.</p>
        </div>
      </details>

      <nav className={styles.continueNav} aria-label="Continue exploring">
        <div className={styles.actions}>
          <ActionLink href={`/${story.next}`} showArrow>Read the {story.next}</ActionLink>
          <ActionLink href="/" variant="secondary">Back to the public home</ActionLink>
        </div>
        <ul className={styles.linkList} role="list">
          <li><Link className={styles.textLink} href="/#about">About SunSum</Link></li>
          <li><Link className={styles.textLink} href="/#faq">Common questions</Link></li>
          <li><Link className={styles.textLink} href="/app">Open workspace</Link></li>
        </ul>
      </nav>
    </div>
  );
}
