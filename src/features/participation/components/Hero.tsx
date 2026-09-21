import { ActionLink } from "@/components/ui/ActionLink";
import { Badge } from "@/components/ui/Badge";
import { InfoIcon } from "@/components/ui/icons";
import { JOURNEY_STAGES } from "@/domain/journey";
import { ENTRY_PATHS } from "../paths";
import { CommunitySolarIllustration } from "./CommunitySolarIllustration";
import styles from "./Hero.module.css";

/** Counts of the explanations below, not energy or portfolio metrics. */
const GUIDE_COUNTS = [
  { value: ENTRY_PATHS.length, label: "ways to start taking part" },
  { value: JOURNEY_STAGES.length, label: "delivery stages described" },
] as const;

export function Hero() {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.inner}>
        <div className={styles.copy}>
          <Badge tone="accent">A community-energy proposal</Badge>

          <h1 className={styles.title} id="hero-title">
            Community solar, with communities at the center.
          </h1>

          <p className={styles.lead}>
            Explore a proposed way to connect community solar projects, local
            participation and shared information.
          </p>

          <div className={styles.actions}>
            <ActionLink href="/join" showArrow>
              Explore participation
            </ActionLink>
            <ActionLink href="/app" variant="secondary">
              Open Sunroom workspace
            </ActionLink>
          </div>

          <p className={styles.note}>
            <InfoIcon className={styles.noteIcon} />
            <span>
              Start with a fictional profile preview: nothing is saved or sent.
              The separate workspace labels its mode, connection and access
              status.
            </span>
          </p>
        </div>

        <div className={styles.art}>
          <CommunitySolarIllustration />
        </div>

        <div className={styles.scope}>
          <p className={styles.scopeLabel}>Explore at your own pace</p>
          <ul className={styles.scopeList} role="list" aria-label="Introduction guide">
            {GUIDE_COUNTS.map((item) => (
              <li className={styles.scopeItem} key={item.label}>
                <span className={styles.scopeValue}>{item.value}</span>
                <span className={styles.scopeText}>{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
