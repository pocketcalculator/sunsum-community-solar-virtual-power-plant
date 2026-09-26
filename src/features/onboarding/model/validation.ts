import { getUserType, isUserTypeId } from "@/domain/userTypes";
import {
  previewRoleFor,
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

export function validateProfileDetailsStep(
  draft: ProfileDraft,
): readonly FieldIssue[] {
  const issues: FieldIssue[] = [];

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
    ...validateProfileDetailsStep(draft),
    ...validateRepresentationStep(draft),
    ...validateUserTypeStep(draft),
    ...validateReviewStep(draft),
  ];

  if (issues.length > 0) {
    return null;
  }

  if (draft.userTypeId === null || draft.representation === null) {
    return null;
  }

  const userType = getUserType(draft.userTypeId);

  return {
    fullName: draft.fullName.trim(),
    email: draft.email.trim(),
    representation: draft.representation,
    organisationName:
      draft.representation === "organisation"
        ? draft.organisationName.trim()
        : null,
    userTypeId: userType.id,
    role: previewRoleFor(userType),
    intentOptionIds: draft.intentOptionIds,
  };
}
