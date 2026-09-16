import Link from "next/link";
import { Callout } from "@/components/ui/Callout";
import {
  formatCapacity,
  type PortfolioView as PortfolioViewModel,
} from "../model/view";
import { ProjectCard } from "./ProjectCard";
import styles from "./PortfolioView.module.css";

interface PortfolioViewProps {
  view: PortfolioViewModel;
}

/** Widening the mandate is a query parameter, so it is a plain link. */
const ALL_PROJECTS_HREF = "/portfolio?mandate_match=false";
const MANDATE_HREF = "/portfolio";

/**
 * The investor's tier 0 portfolio.
 *
 * Takes an already-resolved view and renders it. It performs no fetching and
 * makes no decision about what an investor is allowed to see — by the time a
 * project reaches this component the service has already decided it may be
 * shown, which is why nothing here filters.
 */
export function PortfolioView({ view }: PortfolioViewProps) {
  const { projects, totalEstimatedCapacityKw, mandateMatch } = view;

  const summary = [
    { term: "Projects", detail: String(projects.length) },
    {
      term: "Estimated capacity",
      detail: formatCapacity(totalEstimatedCapacityKw),
    },
    {
      term: "Filter",
      detail: mandateMatch ? "Matching your mandate" : "All visible projects",
    },
  ] as const;

  return (
    <section className={styles.section} aria-labelledby="portfolio-title">
      <div className={styles.inner}>
        <header className={styles.head}>
          <p className={styles.eyebrow}>Investor workspace</p>
          <h1 className={styles.title} id="portfolio-title">
            Your portfolio
          </h1>
          <p className={styles.description}>
            Projects you are entitled to see, at the disclosure tier your
            onboarding allows. Location is given as a neighbourhood, and
            capacity and generation as estimates rather than commitments.
          </p>
        </header>

        <dl className={styles.summary}>
          {summary.map((item) => (
            <div className={styles.metric} key={item.term}>
              <dt className={styles.metricTerm}>{item.term}</dt>
              <dd className={styles.metricValue}>{item.detail}</dd>
            </div>
          ))}
        </dl>

        <p className={styles.toggle}>
          {mandateMatch ? (
            <Link href={ALL_PROJECTS_HREF}>
              Show every project open to me, including those outside my mandate
            </Link>
          ) : (
            <Link href={MANDATE_HREF}>Show only projects matching my mandate</Link>
          )}
        </p>

        {projects.length === 0 ? (
          <Callout title="Nothing to show yet" tone="info">
            <p>
              No project currently matches. That is an answer, not an error:
              either nothing is open to this mandate, or no project has been
              published to investors.
            </p>
          </Callout>
        ) : (
          <ul className={styles.grid} role="list" aria-label="Projects">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </ul>
        )}

        <p className={styles.footnote}>
          Sign-in is not built yet, so every visitor is shown the same
          demonstration investor. What each investor may see is already decided
          by the service rather than by this page.
        </p>
      </div>
    </section>
  );
}
