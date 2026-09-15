import { ActionLink } from "@/components/ui/ActionLink";
import { Badge } from "@/components/ui/Badge";
import { InfoIcon } from "@/components/ui/icons";
import { JOURNEY_STAGES } from "@/domain/journey";
import { ENTRY_PATHS } from "../paths";
import { CommunitySolarIllustration } from "./CommunitySolarIllustration";
import styles from "./Hero.module.css";

/** UI vocabulary and connection status, not a real portfolio's metrics. */
const BUILD_SCOPE = [
  { value: ENTRY_PATHS.length, label: "ways to start taking part" },
  { value: JOURNEY_STAGES.length, label: "delivery stages described" },
  { value: 0, label: "project records connected" },
] as const;

export function Hero() {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.inner}>
        <div className={styles.copy}>
          <Badge tone="accent">Community-owned solar</Badge>

          <h1 className={styles.title} id="hero-title">
            Community solar, coordinated from the first offer to steady
            operations.
          </h1>

          <p className={styles.lead}>
            Sunsum is being built as open software for community solar virtual
            power plants. The planned workspaces will give each group a shared
            view of a site&apos;s progress and the decisions that come next.
          </p>

          <div className={styles.actions}>
            <ActionLink href="/join" showArrow>
              Create your profile
            </ActionLink>
            <ActionLink href="#participate" variant="secondary">
              See the ways to take part
            </ActionLink>
          </div>

          <p className={styles.note}>
            <InfoIcon className={styles.noteIcon} />
            <span>
              This is the public interface foundation. Nothing here connects to
              real projects, accounts or devices yet.
            </span>
          </p>
        </div>

        <div className={styles.art}>
          <CommunitySolarIllustration />
        </div>

        <div className={styles.scope}>
          <p className={styles.scopeLabel}>Scope of this build</p>
          <ul className={styles.scopeList} role="list" aria-label="Build scope">
            {BUILD_SCOPE.map((item) => (
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
