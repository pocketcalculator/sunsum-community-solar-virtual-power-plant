import { getUserType, isUserTypeId } from "@/domain/userTypes";
import {
  getAccountMethod,
  type FieldIssue,
  type ProfileDraft,
  type ProfileSummary,
} from "./profile";

/**
 * Pure validation. No React, no DOM, no network — so every rule below is
 * directly testable and the UI never becomes the only place a rule exists.
 */

export const NAME_MAX = 120;
export const EMAIL_MAX = 254; // RFC 5321 practical address limit.
export const ORGANISATION_MAX = 160;
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

/**
 * Deliberately permissive: a single @, non-empty local part, and a dotted domain
 * with no whitespace. Real deliverability is proven by sending mail, not by a
 * stricter regular expression, and over-strict patterns reject valid addresses.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

/**
 * Zero-width joiners, bidi marks and friends. They survive `trim()`, so without
 * this a "name" of only invisible characters would pass as filled in.
 */
const FORMAT_CHARS = /\p{Cf}/u;

function visibleLength(value: string): number {
  return value.replace(/\p{Cf}/gu, "").trim().length;
}

export function validateFullName(value: string): FieldIssue | null {
  const trimmed = value.trim();

  if (visibleLength(value) === 0) {
    return {
      field: "fullName",
      message: "Enter the name you want to be known by.",
    };
  }

  if (trimmed.length > NAME_MAX) {
    return {
      field: "fullName",
      message: `Use ${NAME_MAX} characters or fewer.`,
    };
  }

  return null;
}

export function validateEmail(value: string): FieldIssue | null {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return { field: "email", message: "Enter an email address." };
  }

  if (trimmed.length > EMAIL_MAX) {
    return {
      field: "email",
      message: `Use ${EMAIL_MAX} characters or fewer.`,
    };
  }

  if (FORMAT_CHARS.test(trimmed) || !EMAIL_PATTERN.test(trimmed)) {
    return {
      field: "email",
      message: "Enter an email address in the format name@example.com.",
    };
  }

  return null;
}

/**
 * Script-aware on purpose. ASCII-only classes would make this rule impossible
 * to satisfy in Greek, Cyrillic, Arabic, Hebrew or CJK: those letters would all
 * collapse into "symbols", capping the count below the threshold. Caseless
 * scripts get their own class so they are not penalised for lacking capitals.
 */
const CHARACTER_CLASSES = [
  /\p{Ll}/u,
  /\p{Lu}/u,
  /\p{Lo}/u,
  /\p{N}/u,
  /[^\p{L}\p{N}]/u,
] as const;

export const PASSWORD_MIN_VARIETY = 3;
export const PASSWORD_CLASS_COUNT = CHARACTER_CLASSES.length;

/**
 * Shortest name that is worth looking for inside a password. Below this, common
 * fragments produce more false accusations than real warnings.
 */
const NAME_MATCH_MIN = 3;

/**
 * The same idea for an email local part, but stricter. Short local parts are
 * ordinary words — "sun@" would otherwise reject "MySunPower!23" on a solar
 * platform, blaming the person for a word the product itself is named after.
 */
const EMAIL_MATCH_MIN = 5;

/**
 * Strips case, accents-as-written and every separator, so a match does not
 * depend on how the person spaced or punctuated their own name. Without this,
 * "Ada Lovelace" is caught but "AdaLovelace" is not, which makes the rule read
 * as stricter than it behaves.
 *
 * Deliberately whole-string, never per-word: rejecting each name token would
 * fail someone called Ann, Lee, Kim or Rose for a password they cannot see the
 * problem with.
 */
function comparableText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export interface PasswordAssessment {
  readonly issue: FieldIssue | null;
  /**
   * How many kinds of character were used, 0 to the number of classes. Shown as
   * wording, never as a score, and never as a claim about real strength.
   */
  readonly variety: number;
}

/**
 * Length first, variety second, and a check that the password does not simply
 * repeat the name or email the person just typed.
 */
export function assessPassword(
  value: string,
  context: { readonly fullName: string; readonly email: string },
): PasswordAssessment {
  const variety = CHARACTER_CLASSES.filter((pattern) =>
    pattern.test(value),
  ).length;

  const issue = ((): FieldIssue | null => {
    if (value.length === 0) {
      return { field: "password", message: "Create a password." };
    }

    if (value.length < PASSWORD_MIN) {
      return {
        field: "password",
        message: `Use at least ${PASSWORD_MIN} characters.`,
      };
    }

    if (value.length > PASSWORD_MAX) {
      return {
        field: "password",
        message: `Use ${PASSWORD_MAX} characters or fewer.`,
      };
    }

    if (value.trim().length !== value.length) {
      return {
        field: "password",
        message: "Remove the space at the start or end.",
      };
    }

    if (variety < PASSWORD_MIN_VARIETY) {
      return {
        field: "password",
        message:
          "Mix at least three kinds of character, such as lower case, upper case, numbers and symbols.",
      };
    }

    const comparablePassword = comparableText(value);
    const namePart = comparableText(context.fullName);
    const emailLocalPart = comparableText(
      context.email.trim().split("@")[0] ?? "",
    );

    if (
      namePart.length >= NAME_MATCH_MIN &&
      comparablePassword.includes(namePart)
    ) {
      return {
        field: "password",
        message: "Do not include your name in your password.",
      };
    }

    if (
      emailLocalPart.length >= EMAIL_MATCH_MIN &&
      comparablePassword.includes(emailLocalPart)
    ) {
      return {
        field: "password",
        message: "Do not include your email address in your password.",
      };
    }

    return null;
  })();

  return { issue, variety };
}

export function validateOrganisationName(
  value: string,
  representation: ProfileDraft["representation"],
): FieldIssue | null {
  if (representation !== "organisation") {
    return null;
  }

  const trimmed = value.trim();

  // Same rule as a personal name: invisible formatting characters survive
  // trim(), so without this an organisation of only zero-width joiners would
  // count as filled in and reach the summary looking blank.
  if (visibleLength(value) === 0) {
    return {
      field: "organisationName",
      message: "Enter the organisation you represent.",
    };
  }

  if (trimmed.length > ORGANISATION_MAX) {
    return {
      field: "organisationName",
      message: `Use ${ORGANISATION_MAX} characters or fewer.`,
    };
  }

  return null;
}

export function validateAccountStep(
  draft: ProfileDraft,
): readonly FieldIssue[] {
  const issues: FieldIssue[] = [];

  if (draft.accountMethodId === null) {
    issues.push({
      field: "accountMethodId",
      message: "Choose how you want to sign in.",
    });
  }

  const name = validateFullName(draft.fullName);
  if (name) issues.push(name);

  const email = validateEmail(draft.email);
  if (email) issues.push(email);

  return issues;
}

export function validateRepresentationStep(
  draft: ProfileDraft,
): readonly FieldIssue[] {
  const issues: FieldIssue[] = [];

  if (draft.representation === null) {
    issues.push({
      field: "representation",
      message:
        "Tell us whether you are taking part as yourself or for an organisation.",
    });
  }

  const organisation = validateOrganisationName(
    draft.organisationName,
    draft.representation,
  );
  if (organisation) issues.push(organisation);

  return issues;
}

export function validateUserTypeStep(
  draft: ProfileDraft,
): readonly FieldIssue[] {
  if (draft.userTypeId === null || !isUserTypeId(draft.userTypeId)) {
    return [
      {
        field: "userTypeId",
        message: "Choose the description that fits you best.",
      },
    ];
  }

  return [];
}

export function validateReviewStep(draft: ProfileDraft): readonly FieldIssue[] {
  if (!draft.consentAccepted) {
    return [
      {
        field: "consentAccepted",
        message: "Confirm you understand what happens with these details.",
      },
    ];
  }

  return [];
}

/**
 * Builds the summary only from a draft that passes every step. Returning null
 * rather than a partial object keeps an incomplete profile from being displayed
 * as if it were ready.
 */
export function buildProfileSummary(
  draft: ProfileDraft,
): ProfileSummary | null {
  const issues = [
    ...validateAccountStep(draft),
    ...validateRepresentationStep(draft),
    ...validateUserTypeStep(draft),
    ...validateReviewStep(draft),
  ];

  if (issues.length > 0 || draft.accountMethodId === null) {
    return null;
  }

  if (draft.userTypeId === null || draft.representation === null) {
    return null;
  }

  // Throws on an unrecognised method id, so an unknown value cannot reach a
  // summary that is presented as complete.
  getAccountMethod(draft.accountMethodId);
  const userType = getUserType(draft.userTypeId);

  return {
    fullName: draft.fullName.trim(),
    email: draft.email.trim(),
    accountMethodId: draft.accountMethodId,
    representation: draft.representation,
    organisationName:
      draft.representation === "organisation"
        ? draft.organisationName.trim()
        : null,
    userTypeId: userType.id,
    role: userType.role,
    intentOptionIds: draft.intentOptionIds,
  };
}
