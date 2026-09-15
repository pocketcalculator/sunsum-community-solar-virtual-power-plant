import type { ParticipantRoleId } from "@/domain/roles";
import type { IntentOptionId } from "@/domain/intents";
import type { UserTypeId } from "@/domain/userTypes";

/**
 * The profile a new participant is assembling.
 *
 * Deliberately excludes any credential. A password is validated in the account
 * step and held only in that component's state, so it cannot reach this draft,
 * the review summary, or anything serialised from it.
 */

export const ACCOUNT_METHODS = [
  {
    id: "microsoft",
    label: "Continue with Microsoft",
    kind: "federated",
  },
  { id: "google", label: "Continue with Google", kind: "federated" },
  { id: "apple", label: "Continue with Apple", kind: "federated" },
  { id: "email", label: "Use an email address and password", kind: "email" },
] as const;

export type AccountMethodId = (typeof ACCOUNT_METHODS)[number]["id"];
export type AccountMethodKind = (typeof ACCOUNT_METHODS)[number]["kind"];

export interface AccountMethod {
  readonly id: AccountMethodId;
  readonly label: string;
  readonly kind: AccountMethodKind;
}

export const ACCOUNT_METHOD_LIST: readonly AccountMethod[] = ACCOUNT_METHODS;

export function isAccountMethodId(value: string): value is AccountMethodId {
  return ACCOUNT_METHODS.some((method) => method.id === value);
}

export function getAccountMethod(id: AccountMethodId): AccountMethod {
  const method = ACCOUNT_METHODS.find((candidate) => candidate.id === id);

  if (!method) {
    throw new Error(`Unknown account method: ${id}`);
  }

  return method;
}

export type RepresentationKind = "individual" | "organisation";

export interface ProfileDraft {
  readonly intentOptionIds: readonly IntentOptionId[];
  readonly accountMethodId: AccountMethodId | null;
  readonly fullName: string;
  readonly email: string;
  readonly representation: RepresentationKind | null;
  readonly organisationName: string;
  readonly userTypeId: UserTypeId | null;
  readonly consentAccepted: boolean;
}

export const EMPTY_PROFILE_DRAFT: ProfileDraft = {
  intentOptionIds: [],
  accountMethodId: null,
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
  | "accountMethodId"
  | "fullName"
  | "email"
  | "password"
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
  readonly accountMethodId: AccountMethodId;
  readonly representation: RepresentationKind;
  readonly organisationName: string | null;
  readonly userTypeId: UserTypeId;
  readonly role: ParticipantRoleId | null;
  readonly intentOptionIds: readonly IntentOptionId[];
}
