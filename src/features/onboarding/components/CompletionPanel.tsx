import { Callout } from "@/components/ui/Callout";
import type { ProfileSummary } from "../model/profile";
import { ProfileSummaryList } from "./ProfileSummaryList";
import buttons from "./buttons.module.css";
import styles from "./CompletionPanel.module.css";

interface CompletionPanelProps {
  summary: ProfileSummary;
  onEdit: () => void;
}

/**
 * What actually happened at the end: a profile was assembled in the browser and
 * nothing more. No account id, no confirmation message, no claim of success.
 */
export function CompletionPanel({ summary, onEdit }: CompletionPanelProps) {
  return (
    <div className={styles.panel}>
      <Callout title="Assembled, but not saved" tone="caution">
        <p>
          Your answers were put together in this browser only. Sunsum has no
          identity or profile service connected yet, so no account was created,
          no email will arrive, and nothing was sent anywhere.
        </p>
        <p>Leaving or reloading this page clears everything below.</p>
      </Callout>

      <section className={styles.details}>
        <h3 className={styles.title}>The profile you assembled</h3>
        <ProfileSummaryList summary={summary} />
        {summary.accountMethodId === "email" ? (
          <p className={styles.note}>
            Your password is not in this list. It stayed in the sign-in step,
            was never part of your profile, and was cleared when you finished,
            so you would be asked for it again.
          </p>
        ) : null}
      </section>

      <button className={buttons.secondary} onClick={onEdit} type="button">
        Go back and edit
      </button>
    </div>
  );
}
