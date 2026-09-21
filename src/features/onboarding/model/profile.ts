import type { ParticipantRoleId } from "@/domain/roles";
import type { IntentOptionId } from "@/domain/intents";
import type { UserType, UserTypeId } from "@/domain/userTypes";

/**
 * Fictional, in-memory answers for the public preview, never an account or a
 * request payload. Credentials and sign-in methods are not part of this flow.
 */
export type RepresentationKind = "individual" | "organisation";

export interface ProfileDraft {
  readonly intentOptionIds: readonly IntentOptionId[];
  readonly fullName: string;
  readonly email: string;
  readonly representation: RepresentationKind | null;
  readonly organisationName: string;
  readonly userTypeId: UserTypeId | null;
  readonly consentAccepted: boolean;
}

export const EMPTY_PROFILE_DRAFT: ProfileDraft = {
  intentOptionIds: [],
  fullName: "",
  email: "",
  representation: null,
  organisationName: "",
  userTypeId: null,
  consentAccepted: false,
};

/** Fields that can carry a validation message. */
export type ProfileField =
  | "intentOptionIds"
  | "fullName"
  | "email"
  | "representation"
  | "organisationName"
  | "userTypeId"
  | "consentAccepted";

export interface FieldIssue {
  readonly field: ProfileField;
  readonly message: string;
}

/**
 * A completed draft, resolved and ready to show back to the person.
 *
 * Not a wire format: no request shape has been agreed with the backend
 * workstream, so this is shaped for display and must not be mistaken for the
 * body of a future request.
 */
export interface ProfileSummary {
  readonly fullName: string;
  readonly email: string;
  readonly representation: RepresentationKind;
  readonly organisationName: string | null;
  readonly userTypeId: UserTypeId;
  /** Preview context only; public choices never grant a workspace role. */
  readonly role: ParticipantRoleId | null;
  readonly intentOptionIds: readonly IntentOptionId[];
}

/** Public learning takes precedence over the shared workforce role mapping. */
export function previewRoleFor(type: UserType): ParticipantRoleId | null {
  return type.id === "workforce-participant" ? null : type.role;
}
