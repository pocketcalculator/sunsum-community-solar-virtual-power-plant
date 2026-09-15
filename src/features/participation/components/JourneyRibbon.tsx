import type { CSSProperties } from "react";
import { JOURNEY_STAGES } from "@/domain/journey";
import styles from "./JourneyRibbon.module.css";

const columns: CSSProperties & { "--stage-count": number } = {
  "--stage-count": JOURNEY_STAGES.length,
};

/**
 * The project journey, numbered and explained.
 *
 * Deliberately has no options. Role emphasis and a summary-free variant were
 * both written for workspace pages that do not exist yet; they are better added
 * with the first real caller than kept here as untested branches.
 */
export function JourneyRibbon() {
  return (
    <ol className={styles.ribbon} role="list" style={columns}>
      {JOURNEY_STAGES.map((stage, index) => (
        <li className={styles.stage} key={stage.id}>
          <span className={styles.marker} aria-hidden="true">
            {index + 1}
          </span>
          <div className={styles.content}>
            <h3 className={styles.name}>{stage.name}</h3>
            <p className={styles.summary}>{stage.summary}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
