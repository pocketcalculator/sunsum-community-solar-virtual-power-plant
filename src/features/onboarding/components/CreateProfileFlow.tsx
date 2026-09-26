"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ErrorSummary } from "@/components/ui/form/ErrorSummary";
import {
  Stepper,
  type StepperStatus,
  type StepperStep,
} from "@/components/ui/form/Stepper";
import { suggestedUserTypes, type IntentOptionId } from "@/domain/intents";
import { PublicLearning } from "@/features/community-context";
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
  type ProfileStepId,
} from "../model/steps";
import { buildProfileSummary } from "../model/validation";
import { ProfileDetailsStep } from "./ProfileDetailsStep";
import { CompletionPanel } from "./CompletionPanel";
import { GuidedStartStep } from "./GuidedStartStep";
import { ParticipantTypeStep } from "./ParticipantTypeStep";
import { RepresentationStep } from "./RepresentationStep";
import { ReviewStep } from "./ReviewStep";
import { messageFor, toSummaryItems } from "./fieldIssues";
import buttons from "./buttons.module.css";
import styles from "./CreateProfileFlow.module.css";

const HEADING_ID = "create-profile-heading";

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
 * The fictional public profile preview.
 *
 * Holds the draft, decides what may happen next by asking the model, and leaves
 * every step to render its own questions. Learning opens alongside the same
 * mounted draft; nothing is persisted or submitted.
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
  const [finished, setFinished] = useState(false);
  const [focusIntent, setFocusIntent] = useState<FocusIntent | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const learningRef = useRef<HTMLDivElement>(null);

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

  const openLearning = () => {
    const details = learningRef.current?.querySelector("details");
    if (details) {
      details.open = true;
      details.querySelector("summary")?.focus();
    }
  };

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

      const live = validateStep(stepId, updated);

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
    setIssues(validateStep(target, draft));
    requestFocus("errors");
  };

  const handleContinue = () => {
    const stepIssues = validateStep(stepId, draft);

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
    const blocking = firstBlockingStep(draft);

    if (blocking !== null || summary === null) {
      goToBlockingStep(blocking ?? FIRST_STEP);
      return;
    }

    setIssues([]);
    setFinished(true);
    requestFocus("heading");
  };

  const handleEditAfterFinishing = () => {
    const blocking = firstBlockingStep(draft);

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
    canEnterStep(target, draft);

  const handleSelectStep = (id: string) => {
    if (!isProfileStepId(id) || !canSelectStep(id)) return;
    goToStep(id);
  };

  const stepStatus = (target: ProfileStepId): StepperStatus => {
    if (!finished && target === stepId) return "current";
    if (!canSelectStep(target)) return "blocked";

    const answered =
      visited.includes(target) && validateStep(target, draft).length === 0;

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
    details: (
      <ProfileDetailsStep
        email={draft.email}
        fullName={draft.fullName}
        issues={issues}
        onEmailChange={(email) => updateDraft({ email })}
        onFullNameChange={(fullName) => updateDraft({ fullName })}
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
        draft={draft}
        issues={issues}
        onConsentChange={(consentAccepted) => updateDraft({ consentAccepted })}
        onEditStep={handleSelectStep}
      />
    ),
  };

  const headingText = finished
    ? "Your fictional profile is assembled"
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
        <p className={styles.eyebrow}>Public preview</p>
        <h1 className={styles.title}>Explore your participation</h1>
        <p className={styles.lede}>
          {PROFILE_STEP_LIST.length} short steps, and every answer can be
          changed before you finish. Use fictional details. Nothing is saved or
          sent, and no account, sign-in or verification code is created.
        </p>
      </header>

      <div ref={learningRef}>
        <PublicLearning returnFocusId={HEADING_ID} />
      </div>

      <Stepper
        label="Profile preview steps"
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
            onLearn={openLearning}
            summary={summary}
          />
        ) : (
          <form
            className={styles.form}
            autoComplete="off"
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
              moving back and forward never discards an unfinished answer.
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
              Continuing never creates an account or requests a code. The last
              step only shows your fictional answers back to you. Leaving or
              reloading this preview clears them.
            </p>
          </form>
        )}
      </section>
    </div>
  );
}
