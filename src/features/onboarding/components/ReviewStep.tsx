import { CheckboxField } from "@/components/ui/form/CheckboxField";
import type { FieldIssue } from "../model/profile";
import {
  PROFILE_STEP_LIST,
  validateStep,
  type ProfileFlowState,
  type ProfileStepId,
} from "../model/steps";
import { buildProfileSummary } from "../model/validation";
import { FIELD_ANCHOR, messageFor } from "./fieldIssues";
import { ProfileSummaryList } from "./ProfileSummaryList";
import buttons from "./buttons.module.css";
import styles from "./ReviewStep.module.css";

interface ReviewStepProps {
  state: ProfileFlowState;
  issues: readonly FieldIssue[];
  onConsentChange: (accepted: boolean) => void;
  onEditStep: (step: ProfileStepId) => void;
}

/**
 * Last look before finishing.
 *
 * The summary is built as though consent were already given, because nobody
 * should have to agree before seeing what they are agreeing to. Consent itself
 * stays a separate gate, checked when the step is submitted.
 */
export function ReviewStep({
  state,
  issues,
  onConsentChange,
  onEditStep,
}: ReviewStepProps) {
  const { draft } = state;
  const summary = buildProfileSummary({ ...draft, consentAccepted: true });

  const outstanding = PROFILE_STEP_LIST.filter((step) => step.id !== "review")
    .map((step) => ({ step, stepIssues: validateStep(step.id, state) }))
    .filter((entry) => entry.stepIssues.length > 0);

  // Earliest unfinished step: every step before it already passes, so it is
  // always one the flow will let the person open.
  const firstOutstanding = outstanding[0];

  return (
    <div className={styles.step}>
      {summary ? (
        <div className={styles.summary}>
          <ProfileSummaryList summary={summary} />
          <p className={styles.amend}>
            To change anything, use Back or pick a step above. Nothing is sent
            while you do.
          </p>
        </div>
      ) : (
        <div className={styles.outstanding}>
          <h3 className={styles.outstandingTitle}>Still to finish</h3>
          <p>
            Your profile is not complete, so there is nothing to review yet.
            These answers are missing:
          </p>
          <ul className={styles.outstandingList}>
            {outstanding.map(({ step, stepIssues }) => (
              <li className={styles.outstandingItem} key={step.id}>
                <p className={styles.outstandingStep}>{step.title}</p>
                <ul className={styles.messages}>
                  {stepIssues.map((issue) => (
                    <li key={issue.field}>{issue.message}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {firstOutstanding ? (
            <button
              className={buttons.quiet}
              onClick={() => onEditStep(firstOutstanding.step.id)}
              type="button"
            >
              Go to {firstOutstanding.step.shortTitle}
            </button>
          ) : null}
        </div>
      )}

      <CheckboxField
        checked={draft.consentAccepted}
        error={messageFor(issues, "consentAccepted")}
        hint="Sunsum cannot store this profile yet. Finishing only shows your answers back to you."
        id={FIELD_ANCHOR.consentAccepted}
        label="I understand that these details are not saved or sent anywhere today."
        onCheckedChange={onConsentChange}
      />
    </div>
  );
}
