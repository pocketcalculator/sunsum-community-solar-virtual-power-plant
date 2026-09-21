import { isIntentOptionId } from "@/domain/intents";
import { isUserTypeId } from "@/domain/userTypes";

import type { Viewer } from "../../core/identity";
import {
  createParticipantProfile,
  DEFAULT_PROFILE_LIMIT,
  isAccountMethod,
  isRepresentation,
  listParticipantProfiles,
  MAX_EMAIL_LENGTH,
  MAX_FULL_NAME_LENGTH,
  MAX_INTENT_OPTIONS,
  MAX_ORGANISATION_NAME_LENGTH,
  MAX_PROFILE_LIMIT,
  type ParticipantProfileInput,
  type ParticipantProfileQuery,
} from "../../core/participants";
import { failure, ok, type Result } from "../../core/shared";
import { demoBackendStore, type BackendStore } from "../../core/store";
import { requireRole } from "../identity";
import {
  failureResponse,
  jsonResponse,
  readJsonObject,
  rejectCrossSiteRequest,
  rejectUnknownKeys,
  type JsonObject,
} from "../shared";

/**
 * The `/join` sign-up form.
 *
 * The only unauthenticated write in the service, and necessarily so: this is
 * how a person who has no account tells us they exist. That makes the parser
 * the whole perimeter, so it is stricter than the authenticated ones — every
 * field is bounded, and an unknown key is refused rather than ignored.
 */

/**
 * The complete set of accepted fields.
 *
 * `password` is absent, and that absence is enforced rather than assumed:
 * `rejectUnknownKeys` turns a body carrying one into a 400, so a future client
 * that starts sending a credential is told no instead of having it silently
 * accepted and logged. `role_id` is absent for a different reason — it is
 * derived from `user_type_id`, so accepting it would let a request claim a
 * workspace its user type does not map to.
 */
const PARTICIPANT_PROFILE_KEYS = [
  "full_name",
  "email",
  "account_method",
  "representation",
  "organisation_name",
  "user_type_id",
  "intent_option_ids",
  "consent_accepted",
] as const;

/**
 * Exported with the store as a parameter so the validation paths can be tested
 * directly against either store. The route wrapper below supplies the real one.
 */
export async function handlePostParticipantProfile(
  request: Request,
  store: BackendStore = demoBackendStore,
): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body.ok) return failureResponse(body.failure);
  const input = parseParticipantProfile(body.value);
  if (!input.ok) return failureResponse(input.failure);
  const result = await createParticipantProfile(input.value, store);
  return result.ok ? jsonResponse(result.value, 201) : failureResponse(result.failure);
}

/**
 * No identity is required, so the cross-site check is made here rather than
 * inherited from one.
 *
 * Every other write route gets it from `requireRole`, which calls
 * `rejectCrossSiteWrite` on the way to resolving a viewer. This route resolves
 * nobody, so without this line it would be the one state-changing endpoint any
 * page on the internet could post to.
 */
export async function postParticipantProfileRoute(request: Request): Promise<Response> {
  const crossSite = rejectCrossSiteRequest(request);
  if (crossSite !== null) return failureResponse(crossSite);
  return handlePostParticipantProfile(request, demoBackendStore);
}

/**
 * The operator read of the sign-up list.
 *
 * The write is open to the world, so the read is the half that needs a role.
 * These rows are names, email addresses and stated intentions that nobody has
 * verified, collected from people who have no account and therefore cannot
 * themselves come back and read them; the only caller with a reason to see the
 * list is the operator reconciling it.
 */
export async function handleGetParticipantProfiles(
  request: Request,
  viewer: Viewer,
  store: BackendStore = demoBackendStore,
): Promise<Response> {
  const query = parseParticipantProfileQuery(new URL(request.url).searchParams);
  if (!query.ok) return failureResponse(query.failure);
  const result = await listParticipantProfiles(viewer, query.value, store);
  return result.ok ? jsonResponse(result.value) : failureResponse(result.failure);
}

export async function getParticipantProfilesRoute(request: Request): Promise<Response> {
  const viewer = await requireRole(request, "operator");
  if (!viewer.ok) return failureResponse(viewer.failure);
  return handleGetParticipantProfiles(request, viewer.value);
}

export function parseParticipantProfileQuery(
  params: URLSearchParams,
): Result<ParticipantProfileQuery> {
  const unknown = [...params.keys()].find((key) => key !== "limit");
  if (unknown !== undefined) {
    return failure("invalid_query", "Unknown query parameter.", { parameter: unknown });
  }

  const raw = params.get("limit");
  if (raw === null) return ok({ limit: DEFAULT_PROFILE_LIMIT });

  /**
   * Matched as digits rather than passed to `Number`, which accepts `1e3`,
   * `0x10`, ` 5 ` and `Infinity` — all of which would read as a limit the
   * caller did not write.
   */
  if (!/^\d+$/.test(raw)) {
    return failure("invalid_query", "Expected a positive integer.", {
      parameter: "limit",
      value: raw,
    });
  }

  const limit = Number(raw);
  if (limit < 1 || limit > MAX_PROFILE_LIMIT) {
    return failure("invalid_query", "Limit is out of range.", {
      parameter: "limit",
      limit: MAX_PROFILE_LIMIT,
    });
  }

  return ok({ limit });
}

export function parseParticipantProfile(
  body: JsonObject,
): Result<ParticipantProfileInput> {
  const keys = rejectUnknownKeys(body, PARTICIPANT_PROFILE_KEYS);
  if (!keys.ok) return keys;

  const fullName = boundedString(body.full_name, "full_name", MAX_FULL_NAME_LENGTH);
  if (!fullName.ok) return fullName;

  const email = boundedString(body.email, "email", MAX_EMAIL_LENGTH);
  if (!email.ok) return email;
  if (!looksLikeEmail(email.value)) {
    return failure("invalid_body", "Expected an email address.", { field: "email" });
  }

  const accountMethod = boundedString(body.account_method, "account_method", 32);
  if (!accountMethod.ok) return accountMethod;
  if (!isAccountMethod(accountMethod.value)) {
    return failure("invalid_body", "Unknown account method.", {
      field: "account_method",
      value: accountMethod.value,
    });
  }

  const representation = boundedString(body.representation, "representation", 32);
  if (!representation.ok) return representation;
  if (!isRepresentation(representation.value)) {
    return failure("invalid_body", "Unknown representation.", {
      field: "representation",
      value: representation.value,
    });
  }

  /**
   * Absent and null mean the same thing here: an individual, who has no
   * organisation to name. The form omits the key rather than sending an empty
   * string, and both spellings should behave alike.
   */
  const organisationName =
    body.organisation_name === undefined || body.organisation_name === null
      ? ok<string | null>(null)
      : mapToNullable(
          boundedString(
            body.organisation_name,
            "organisation_name",
            MAX_ORGANISATION_NAME_LENGTH,
          ),
        );
  if (!organisationName.ok) return organisationName;
  if (representation.value === "organisation" && organisationName.value === null) {
    return failure("invalid_body", "Expected a non-empty string.", {
      field: "organisation_name",
    });
  }

  const userTypeId = boundedString(body.user_type_id, "user_type_id", 64);
  if (!userTypeId.ok) return userTypeId;
  if (!isUserTypeId(userTypeId.value)) {
    return failure("invalid_body", "Unknown user type.", {
      field: "user_type_id",
      value: userTypeId.value,
    });
  }

  const intentOptionIds = parseIntentOptionIds(body.intent_option_ids);
  if (!intentOptionIds.ok) return intentOptionIds;

  /**
   * A missing consent is a 400 here and not a 422 from core, because the field
   * is absent rather than false. Core still refuses an explicit `false`, so
   * neither spelling can write a row.
   */
  if (typeof body.consent_accepted !== "boolean") {
    return failure("invalid_body", "Expected a boolean.", { field: "consent_accepted" });
  }

  return ok({
    fullName: fullName.value,
    email: email.value,
    accountMethod: accountMethod.value,
    representation: representation.value,
    organisationName: organisationName.value,
    userTypeId: userTypeId.value,
    intentOptionIds: intentOptionIds.value,
    consentAccepted: body.consent_accepted,
  });
}

function parseIntentOptionIds(
  value: unknown,
): Result<ParticipantProfileInput["intentOptionIds"]> {
  /**
   * Optional: the form lets someone skip the intent questions, and an empty
   * list is the honest record of that. Treating absent as `[]` keeps the
   * client from having to send an empty array to mean "nothing selected".
   */
  if (value === undefined) return ok([]);
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return failure("invalid_body", "Expected an array of strings.", {
      field: "intent_option_ids",
    });
  }
  if (value.length > MAX_INTENT_OPTIONS) {
    return failure("invalid_body", "Too many intent options.", {
      field: "intent_option_ids",
      limit: MAX_INTENT_OPTIONS,
    });
  }
  const unknown = (value as string[]).find((item) => !isIntentOptionId(item));
  if (unknown !== undefined) {
    return failure("invalid_body", "Unknown intent option.", {
      field: "intent_option_ids",
      value: unknown,
    });
  }
  /**
   * Deduplicated because the same option arriving twice is a client bug, not a
   * stronger preference, and nothing downstream counts occurrences.
   */
  return ok([...new Set(value as string[])].filter(isIntentOptionId));
}

/**
 * A non-empty string within a length bound.
 *
 * The bound is the part that matters on an unauthenticated endpoint: without
 * it a single request can put an arbitrary amount of text into the table, and
 * `text` in PostgreSQL will accept all of it.
 */
function boundedString(value: unknown, field: string, max: number): Result<string> {
  if (typeof value !== "string" || value.trim() === "") {
    return failure("invalid_body", "Expected a non-empty string.", { field });
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    return failure("invalid_body", "Value is too long.", { field, limit: max });
  }
  return ok(trimmed);
}

function mapToNullable(result: Result<string>): Result<string | null> {
  return result.ok ? ok<string | null>(result.value) : result;
}

/**
 * Deliberately shallow. Address syntax is not deliverability, and a stricter
 * pattern would reject real addresses while still not proving the mailbox
 * exists. This catches the typo that loses the participant — a missing `@` or
 * domain — and leaves proof to a verification step that does not exist yet.
 */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value);
}
