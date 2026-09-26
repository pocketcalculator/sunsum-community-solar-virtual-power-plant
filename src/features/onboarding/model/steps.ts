import type { FieldIssue, ProfileDraft } from "./profile";
import {
  validateProfileDetailsStep,
  validateRepresentationStep,
  validateReviewStep,
  validateUserTypeStep,
} from "./validation";

/**
 * Step order and the rules for moving between steps.
 *
 * Pure: given the profile draft and a step it answers what is valid and what comes
 * next, with no React state involved, so navigation is testable on its own.
 */

export const PROFILE_STEPS = [
  {
    id: "start",
    title: "Tell us about you",
    shortTitle: "About you",
    description:
      "Answer as much or as little as you like. This only suggests a starting point.",
  },
  {
    id: "details",
    title: "Try fictional profile details",
    shortTitle: "Preview details",
    description:
      "Use an invented name and example email address. This is not sign-in.",
  },
  {
    id: "representation",
    title: "Who are you taking part as?",
    shortTitle: "Representation",
    description: "Yourself, or on behalf of an organisation.",
  },
  {
    id: "user-type",
    title: "Choose your participant type",
    shortTitle: "Participant type",
    description: "Explore a participation context. This does not assign access.",
  },
  {
    id: "review",
    title: "Review your fictional profile",
    shortTitle: "Review",
    description: "Check the details before finishing.",
  },
] as const;

export type ProfileStepId = (typeof PROFILE_STEPS)[number]["id"];

export interface ProfileStep {
  readonly id: ProfileStepId;
  readonly title: string;
  readonly shortTitle: string;
  readonly description: string;
}

export const PROFILE_STEP_LIST: readonly ProfileStep[] = PROFILE_STEPS;

export const FIRST_STEP: ProfileStepId = "start";

export function isProfileStepId(value: string): value is ProfileStepId {
  return PROFILE_STEPS.some((step) => step.id === value);
}

export function getProfileStep(id: ProfileStepId): ProfileStep {
  const step = PROFILE_STEPS.find((candidate) => candidate.id === id);

  if (!step) {
    throw new Error(`Unknown profile step: ${id}`);
  }

  return step;
}

export function stepIndex(id: ProfileStepId): number {
  return PROFILE_STEPS.findIndex((step) => step.id === id);
}

/** The guided opening is optional, so it reports no issues of its own. */
export function validateStep(
  step: ProfileStepId,
  draft: ProfileDraft,
): readonly FieldIssue[] {
  switch (step) {
    case "start":
      return [];
    case "details":
      return validateProfileDetailsStep(draft);
    case "representation":
      return validateRepresentationStep(draft);
    case "user-type":
      return validateUserTypeStep(draft);
    case "review":
      return validateReviewStep(draft);
    default: {
      const unreachable: never = step;
      throw new Error(`Unhandled profile step: ${String(unreachable)}`);
    }
  }
}

export function nextStep(current: ProfileStepId): ProfileStepId | null {
  const next = PROFILE_STEPS[stepIndex(current) + 1];
  return next ? next.id : null;
}

export function previousStep(current: ProfileStepId): ProfileStepId | null {
  const index = stepIndex(current);
  const previous = index > 0 ? PROFILE_STEPS[index - 1] : undefined;
  return previous ? previous.id : null;
}

/**
 * A step may be opened once every earlier step passes, so the stepper never
 * advertises a destination the flow would immediately reject.
 */
export function canEnterStep(
  target: ProfileStepId,
  draft: ProfileDraft,
): boolean {
  return PROFILE_STEPS.slice(0, stepIndex(target)).every(
    (step) => validateStep(step.id, draft).length === 0,
  );
}

/**
 * The earliest step still holding the flow up, or null when every step passes.
 * Finishing consults this, so an incomplete draft cannot reach the summary no
 * matter which route the person took back to the last step.
 */
export function firstBlockingStep(
  draft: ProfileDraft,
): ProfileStepId | null {
  const blocking = PROFILE_STEPS.find(
    (step) => validateStep(step.id, draft).length > 0,
  );

  return blocking ? blocking.id : null;
}
