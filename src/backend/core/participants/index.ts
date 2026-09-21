import type { IntentOptionId } from "@/domain/intents";
import type { ParticipantRoleId } from "@/domain/roles";
import { getUserType, type UserTypeId } from "@/domain/userTypes";

import { failure, ok, type Result } from "../shared";
import { demoBackendStore, type BackendStore } from "../store";

/**
 * The record behind the `/join` form.
 *
 * This is a pre-account record, not a user. Nobody is authenticated when it is
 * written — the form is a participant's first contact with the platform, so
 * there is no session to attribute it to and no `users` row to hang it off.
 * Keeping it in its own table rather than writing a half-populated `users` row
 * keeps that distinction enforceable: a participant profile grants no access,
 * and nothing in the authorization path reads it.
 */

/**
 * How the person said they intend to sign in later.
 *
 * An intention only. No credential is accepted, stored or transmitted here:
 * the account step validates a password in component state, `ProfileDraft`
 * deliberately excludes it, and the request parser rejects unknown keys so a
 * caller that starts sending one is refused rather than quietly obliged.
 */
export const ACCOUNT_METHODS = ["microsoft", "google", "apple", "email"] as const;

export type AccountMethod = (typeof ACCOUNT_METHODS)[number];

export function isAccountMethod(value: string): value is AccountMethod {
  return ACCOUNT_METHODS.some((method) => method === value);
}

/** Whether the person is acting for themselves or for an organisation. */
export const REPRESENTATIONS = ["individual", "organisation"] as const;

export type Representation = (typeof REPRESENTATIONS)[number];

export function isRepresentation(value: string): value is Representation {
  return REPRESENTATIONS.some((item) => item === value);
}

/**
 * Bounds on the free-text fields.
 *
 * This endpoint is unauthenticated, so these are the only thing standing
 * between the table and a caller posting a megabyte of text. They are set well
 * above any real name or organisation, so rejection means abuse rather than an
 * unusual participant.
 */
export const MAX_FULL_NAME_LENGTH = 120;
export const MAX_EMAIL_LENGTH = 254;
export const MAX_ORGANISATION_NAME_LENGTH = 160;
export const MAX_INTENT_OPTIONS = 16;

export interface ParticipantProfileRecord {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  readonly accountMethod: AccountMethod;
  readonly representation: Representation;
  readonly organisationName: string | null;
  readonly userTypeId: UserTypeId;
  readonly roleId: ParticipantRoleId | null;
  readonly intentOptionIds: readonly IntentOptionId[];
  readonly consentAccepted: boolean;
  readonly createdAt: string;
}

/**
 * What a caller supplies. `roleId` and `createdAt` are absent on purpose: both
 * are decided here, not sent.
 */
export interface ParticipantProfileInput {
  readonly fullName: string;
  readonly email: string;
  readonly accountMethod: AccountMethod;
  readonly representation: Representation;
  readonly organisationName: string | null;
  readonly userTypeId: UserTypeId;
  readonly intentOptionIds: readonly IntentOptionId[];
  readonly consentAccepted: boolean;
}

/** The snake_case wire shape, matching every other response in this service. */
export interface ParticipantProfilePayload {
  readonly id: string;
  readonly full_name: string;
  readonly email: string;
  readonly account_method: AccountMethod;
  readonly representation: Representation;
  readonly organisation_name: string | null;
  readonly user_type_id: UserTypeId;
  readonly role_id: ParticipantRoleId | null;
  readonly intent_option_ids: readonly IntentOptionId[];
  readonly consent_accepted: boolean;
  readonly created_at: string;
}

export function toParticipantProfilePayload(
  profile: ParticipantProfileRecord,
): ParticipantProfilePayload {
  return {
    id: profile.id,
    full_name: profile.fullName,
    email: profile.email,
    account_method: profile.accountMethod,
    representation: profile.representation,
    organisation_name: profile.organisationName,
    user_type_id: profile.userTypeId,
    role_id: profile.roleId,
    intent_option_ids: profile.intentOptionIds,
    consent_accepted: profile.consentAccepted,
    created_at: profile.createdAt,
  };
}

/**
 * Stores one completed `/join` form.
 *
 * Append-only, and deliberately not keyed on the email address. Collapsing
 * submissions onto an email would let an unverified value decide which row is
 * overwritten, so anyone could replace a stranger's submission by typing their
 * address. Nothing here is verified and nothing here grants access, so the
 * honest model is a log of submissions an operator reconciles later, not an
 * account store pretending the address was proven.
 *
 * `roleId` is derived rather than accepted. The user-type-to-workspace mapping
 * already exists in `@/domain/userTypes`, and letting the wire carry it would
 * allow a body to claim a workspace its user type does not map to. `null` is a
 * real answer: the "still learning" types have no workspace, and recording
 * that is better than inventing one.
 */
export async function createParticipantProfile(
  input: ParticipantProfileInput,
  store: BackendStore = demoBackendStore,
): Promise<Result<ParticipantProfilePayload>> {
  /**
   * Consent and the organisation name are checked here rather than only in the
   * parser because they are rules about the record, not about the request.
   * Seeding and tests call this function directly, and neither should be able
   * to write a row the HTTP path would have refused.
   */
  if (!input.consentAccepted) {
    return failure("validation_failed", "Consent is required to store a profile.", {
      missing_fields: [{ field: "consent_accepted", message: "Consent is required." }],
    });
  }

  const organisationName =
    input.representation === "organisation" ? input.organisationName?.trim() ?? "" : "";

  if (input.representation === "organisation" && organisationName === "") {
    return failure("validation_failed", "An organisation name is required.", {
      missing_fields: [
        { field: "organisation_name", message: "An organisation name is required." },
      ],
    });
  }

  const record: ParticipantProfileRecord = {
    id: store.nextId("participant_profile"),
    fullName: input.fullName,
    email: input.email,
    accountMethod: input.accountMethod,
    representation: input.representation,
    /**
     * Dropped for an individual rather than carried through, so the column
     * cannot hold a name that the representation says does not exist.
     */
    organisationName: input.representation === "organisation" ? organisationName : null,
    userTypeId: input.userTypeId,
    roleId: getUserType(input.userTypeId).role,
    intentOptionIds: input.intentOptionIds,
    consentAccepted: input.consentAccepted,
    createdAt: new Date().toISOString(),
  };

  await store.addParticipantProfile(record);
  return ok(toParticipantProfilePayload(record));
}

/**
 * The read side, for operators reconciling submissions.
 *
 * Intentionally without an HTTP route in this change: these rows are
 * unverified, self-reported contact details, so exposing them needs an
 * operator-authorized endpoint designed on purpose rather than added by
 * default. Keeping the port method means the two stores are held to the same
 * behaviour by test, which is where a past parity bug came from.
 */
export async function listParticipantProfiles(
  store: BackendStore = demoBackendStore,
): Promise<readonly ParticipantProfilePayload[]> {
  const profiles = await store.listParticipantProfiles();
  return profiles.map(toParticipantProfilePayload);
}
