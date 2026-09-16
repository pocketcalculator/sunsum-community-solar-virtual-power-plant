import { Callout } from "@/components/ui/Callout";
import styles from "./PortfolioView.module.css";

interface PortfolioUnavailableProps {
  /** The service's own explanation, shown as written. */
  message: string;
}

/**
 * Shown when the service declines to return a portfolio.
 *
 * The service's message is displayed rather than replaced with a generic
 * apology: "Complete investor onboarding to see the portfolio" tells someone
 * what to do next, and "Something went wrong" does not. The refusal is a valid
 * answer, so this is a normal page rather than an error boundary.
 */
export function PortfolioUnavailable({ message }: PortfolioUnavailableProps) {
  return (
    <section className={styles.section} aria-labelledby="portfolio-title">
      <div className={styles.inner}>
        <header className={styles.head}>
          <p className={styles.eyebrow}>Investor workspace</p>
          <h1 className={styles.title} id="portfolio-title">
            Your portfolio
          </h1>
        </header>

        <Callout title="This portfolio is not available" tone="caution">
          <p>{message}</p>
        </Callout>
      </div>
    </section>
  );
}
