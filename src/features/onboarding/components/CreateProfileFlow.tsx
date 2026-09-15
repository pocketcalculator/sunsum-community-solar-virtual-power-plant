"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ErrorSummary } from "@/components/ui/form/ErrorSummary";
import {
  Stepper,
  type StepperStatus,
  type StepperStep,
} from "@/components/ui/form/Stepper";
import { suggestedUserTypes, type IntentOptionId } from "@/domain/intents";
import {
  EMPTY_PROFILE_DRAFT,
  type FieldIssue,
  type ProfileDraft,
} from "../model/profile";
import {
  FIRST_STEP,
  PROFILE_STEP_LIST,
  canEnterStep,
  firstBlockingStep,
  getProfileStep,
  isProfileStepId,
  nextStep,
  previousStep,
  stepIndex,
  validateStep,
  type ProfileFlowState,
  type ProfileStepId,
} from "../model/steps";
import { buildProfileSummary } from "../model/validation";
import { AccountStep } from "./AccountStep";
import { CompletionPanel } from "./CompletionPanel";
import { GuidedStartStep } from "./GuidedStartStep";
import { ParticipantTypeStep } from "./ParticipantTypeStep";
import { RepresentationStep } from "./RepresentationStep";
import { ReviewStep } from "./ReviewStep";
import { messageFor, toSummaryItems } from "./fieldIssues";
import buttons from "./buttons.module.css";
import styles from "./CreateProfileFlow.module.css";

const HEADING_ID = "create-profile-heading";

/**
 * Finishing discards the password, so no usable credential is held afterwards.
 * Saying so through the same channel the sign-in step uses keeps one answer to
 * "is the credential ready", rather than a second rule that only finishing knows.
 */
const CREDENTIAL_DISCARDED: FieldIssue = {
  field: "password",
  message: "Choose a password again. It was cleared when you finished.",
};

/** Which element to move focus to once the next render has committed. */
interface FocusIntent {
  readonly target: "heading" | "errors";
  readonly nonce: number;
}

export interface CreateProfileFlowProps {
  /**
   * Guided answers carried in from a landing page link, already ticked on the
   * first step and free to change or clear. A starting value only: it never
   * skips the guided step and never stands in for a participant type, which the
   * person still has to choose. Absent or empty means nothing is pre-selected.
   */
  initialIntentOptionIds?: readonly IntentOptionId[] | undefined;
}

/**
 * The "New User / Create Profile" flow.
 *
 * Holds the draft, decides what may happen next by asking the model, and leaves
 * every step to render its own questions. One deliberate exception to that rule:
 * the password never enters the draft, so the sign-in step keeps it in its own
 * state and reports only whether it is acceptable.
 *
 * Field ids are fixed rather than generated, because error summaries and page
 * anchors link to them; the flow is therefore meant to appear once per page.
 */
export function CreateProfileFlow({
  initialIntentOptionIds = [],
}: CreateProfileFlowProps) {
  // Seeded once, on mount: from here on the selections belong to the person,
  // so a re-render can never re-tick something they cleared.
  const [draft, setDraft] = useState<ProfileDraft>(() => ({
    ...EMPTY_PROFILE_DRAFT,
    intentOptionIds: initialIntentOptionIds,
  }));
  const [stepId, setStepId] = useState<ProfileStepId>(FIRST_STEP);
  const [visited, setVisited] = useState<readonly ProfileStepId[]>([
    FIRST_STEP,
  ]);
  const [issues, setIssues] = useState<readonly FieldIssue[]>([]);
  const [passwordIssue, setPasswordIssue] = useState<FieldIssue | null>(null);
  const [finished, setFinished] = useState(false);
  const [focusIntent, setFocusIntent] = useState<FocusIntent | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusIntent === null) return;
    const node =
      focusIntent.target === "errors"
        ? errorSummaryRef.current
        : headingRef.current;
    node?.focus();
  }, [focusIntent]);

  const currentStep = getProfileStep(stepId);
  const currentIndex = stepIndex(stepId);
  const summary = buildProfileSummary(draft);
  const isLastStep = nextStep(stepId) === null;

  // One reading of the flow, shared by navigation, step status and finishing,
  // so they cannot reach different conclusions about the same answers.
  const flowState: ProfileFlowState = { draft, credentialIssue: passwordIssue };

  const requestFocus = (target: FocusIntent["target"]) => {
    setFocusIntent((current) => ({
      target,
      nonce: (current?.nonce ?? 0) + 1,
    }));
  };

  const goToStep = (target: ProfileStepId) => {
    setFinished(false);
    setStepId(target);
    setVisited((current) =>
      current.includes(target) ? current : [...current, target],
    );
    setIssues([]);
    requestFocus("heading");
  };

  const updateDraft = (patch: Partial<ProfileDraft>) => {
    const updated = { ...draft, ...patch };
    setDraft(updated);

    // Drop messages the change has answered — including ones whose field is no
    // longer even asked for, whose error-summary link would otherwise point at
    // an element that has gone. Never raises new messages: those belong to
    // Continue, so the person is not corrected while they are still typing.
    setIssues((shown) => {
      if (shown.length === 0) return shown;

      const live = validateStep(stepId, {
        draft: updated,
        credentialIssue: passwordIssue,
      });

      return shown
        .map(
          (issue) =>
            live.find((candidate) => candidate.field === issue.field) ?? null,
        )
        .filter((issue): issue is FieldIssue => issue !== null);
    });
  };

  const handleIntentToggle = (optionId: IntentOptionId, selected: boolean) => {
    setDraft((current) => {
      const without = current.intentOptionIds.filter((id) => id !== optionId);

      return {
        ...current,
        intentOptionIds: selected ? [...without, optionId] : without,
      };
    });
  };

  /** Sends the person to the step that is holding things up, with its reasons. */
  const goToBlockingStep = (target: ProfileStepId) => {
    setFinished(false);
    setStepId(target);
    setVisited((current) =>
      current.includes(target) ? current : [...current, target],
    );
    setIssues(validateStep(target, flowState));
    requestFocus("errors");
  };

  const handleContinue = () => {
    const stepIssues = validateStep(stepId, flowState);

    if (stepIssues.length > 0) {
      setIssues(stepIssues);
      requestFocus("errors");
      return;
    }

    const next = nextStep(stepId);

    if (next !== null) {
      goToStep(next);
      return;
    }

    // Finishing re-checks every step, not just this one. Answers can be edited
    // in any order, so passing the last step is not evidence the rest still pass.
    const blocking = firstBlockingStep(flowState);

    if (blocking !== null || summary === null) {
      goToBlockingStep(blocking ?? FIRST_STEP);
      return;
    }

    setIssues([]);
    setFinished(true);
    setPasswordIssue(CREDENTIAL_DISCARDED);
    requestFocus("heading");
  };

  const handleEditAfterFinishing = () => {
    const blocking = firstBlockingStep(flowState);

    if (blocking !== null) {
      goToBlockingStep(blocking);
      return;
    }

    goToStep("review");
  };

  const handleBack = () => {
    const previous = previousStep(stepId);
    // Deliberately no validation: going back never rejects or clears an answer.
    if (previous !== null) goToStep(previous);
  };

  const canSelectStep = (target: ProfileStepId): boolean =>
    canEnterStep(target, flowState);

  const handleSelectStep = (id: string) => {
    if (!isProfileStepId(id) || !canSelectStep(id)) return;
    goToStep(id);
  };

  const stepStatus = (target: ProfileStepId): StepperStatus => {
    if (!finished && target === stepId) return "current";
    if (!canSelectStep(target)) return "blocked";

    const answered =
      visited.includes(target) && validateStep(target, flowState).length === 0;

    return answered ? "completed" : "upcoming";
  };

  const stepperSteps: readonly StepperStep[] = PROFILE_STEP_LIST.map(
    (step) => ({
      id: step.id,
      label: step.shortTitle,
      status: stepStatus(step.id),
      selectable: canSelectStep(step.id),
    }),
  );

  const stepPanels: Record<ProfileStepId, ReactNode> = {
    start: (
      <GuidedStartStep
        onToggle={handleIntentToggle}
        selected={draft.intentOptionIds}
      />
    ),
    account: (
      <AccountStep
        accountMethodId={draft.accountMethodId}
        email={draft.email}
        fullName={draft.fullName}
        issues={issues}
        onAccountMethodChange={(accountMethodId) =>
          updateDraft({ accountMethodId })
        }
        onEmailChange={(email) => updateDraft({ email })}
        onFullNameChange={(fullName) => updateDraft({ fullName })}
        onPasswordIssueChange={setPasswordIssue}
      />
    ),
    representation: (
      <RepresentationStep
        issues={issues}
        onOrganisationNameChange={(organisationName) =>
          updateDraft({ organisationName })
        }
        onRepresentationChange={(representation) =>
          updateDraft({ representation })
        }
        organisationName={draft.organisationName}
        representation={draft.representation}
      />
    ),
    "user-type": (
      <ParticipantTypeStep
        error={messageFor(issues, "userTypeId")}
        onUserTypeChange={(userTypeId) => updateDraft({ userTypeId })}
        suggestedTypeIds={suggestedUserTypes(draft.intentOptionIds)}
        userTypeId={draft.userTypeId}
      />
    ),
    review: (
      <ReviewStep
        issues={issues}
        onConsentChange={(consentAccepted) => updateDraft({ consentAccepted })}
        onEditStep={handleSelectStep}
        state={flowState}
      />
    ),
  };

  const headingText = finished
    ? "Your profile is assembled"
    : currentStep.title;
  const descriptionText = finished
    ? "Nothing was saved. This is the profile you assembled, shown back to you."
    : currentStep.description;
  const announcement = finished
    ? "Profile assembled. Nothing has been saved."
    : `Step ${currentIndex + 1} of ${PROFILE_STEP_LIST.length}, ${currentStep.title}`;

  return (
    <div className={styles.flow}>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>New participant</p>
        <h1 className={styles.title}>Create your Sunsum profile</h1>
        <p className={styles.lede}>
          {PROFILE_STEP_LIST.length} short steps, and every answer can be
          changed before you finish. Nothing you enter is saved or sent: Sunsum
          has no identity or profile service connected yet.
        </p>
      </header>

      <Stepper
        label="Create profile steps"
        onSelect={handleSelectStep}
        steps={stepperSteps}
      />

      <p aria-live="polite" className={styles.announcement}>
        {announcement}
      </p>

      <section aria-labelledby={HEADING_ID} className={styles.panel}>
        <header className={styles.head}>
          {finished ? null : (
            <p className={styles.progress}>
              Step {currentIndex + 1} of {PROFILE_STEP_LIST.length}
            </p>
          )}
          <h2
            className={styles.heading}
            id={HEADING_ID}
            ref={headingRef}
            tabIndex={-1}
          >
            {headingText}
          </h2>
          <p className={styles.description}>{descriptionText}</p>
        </header>

        {finished && summary !== null ? (
          <CompletionPanel
            onEdit={handleEditAfterFinishing}
            summary={summary}
          />
        ) : (
          <form
            className={styles.form}
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              handleContinue();
            }}
          >
            {issues.length > 0 ? (
              <ErrorSummary
                items={toSummaryItems(issues)}
                ref={errorSummaryRef}
                title="Check these before you continue"
              />
            ) : null}

            {/*
              Every step stays mounted and the inactive ones are hidden, so
              moving back and forward never discards what was typed — including
              the password, which lives in the sign-in step alone.
            */}
            <div className={styles.steps}>
              {PROFILE_STEP_LIST.map((step) => (
                <div
                  className={styles.step}
                  hidden={stepId !== step.id}
                  key={step.id}
                >
                  {stepPanels[step.id]}
                </div>
              ))}
            </div>

            <div className={styles.actions}>
              {previousStep(stepId) !== null ? (
                <button
                  className={buttons.secondary}
                  onClick={handleBack}
                  type="button"
                >
                  Back
                </button>
              ) : null}
              <button className={buttons.primary} type="submit">
                {isLastStep ? "Finish and review your answers" : "Continue"}
              </button>
            </div>

            <p className={styles.footnote}>
              Continuing never creates an account. The last step only shows your
              answers back to you; Sunsum has nowhere to store a profile yet.
            </p>
          </form>
        )}
      </section>
    </div>
  );
}
