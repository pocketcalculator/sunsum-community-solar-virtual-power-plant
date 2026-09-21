// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Viewer } from "@/backend/core/identity";
import {
  createParticipantProfile,
  DEFAULT_PROFILE_LIMIT,
  listParticipantProfiles,
  MAX_PROFILE_LIMIT,
} from "@/backend/core/participants";
import { createMemoryBackendStore, type BackendStore } from "@/backend/core/store";
import {
  handleGetParticipantProfiles,
  handlePostParticipantProfile,
  parseParticipantProfile,
  parseParticipantProfileQuery,
} from "@/backend/handlers";

/**
 * `POST /api/profiles` — the `/join` sign-up form.
 *
 * Until this endpoint existed the form assembled a profile and threw it away,
 * so every person who filled it in was lost. These tests are mostly about what
 * it refuses: it is the only unauthenticated write in the service, which makes
 * the parser the entire perimeter.
 */

const operator: Viewer = {
  role: "operator",
  userId: "3f8b6c21-9d44-4e15-8a27-6b5c1d9e4f02",
};

const siteOwner: Viewer = {
  role: "site_owner",
  userId: "9c2d5e14-7a38-4b96-8f21-3e7a6d4c8b15",
};

const completeBody = {
  full_name: "Jackie Jackson",
  email: "jackie@example.org",
  account_method: "email",
  representation: "individual",
  user_type_id: "property-owner",
  intent_option_ids: ["i-am-property-owner"],
  consent_accepted: true,
} as const;

function request(body: unknown): Request {
  return new Request("http://localhost/api/profiles", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function post(body: unknown) {
  const store = createMemoryBackendStore();
  const response = await handlePostParticipantProfile(request(body), store);
  return { store, response, body: (await response.json()) as Record<string, unknown> };
}

/** The operator read, unwrapped, for assertions that only care about the rows. */
async function readProfiles(store: BackendStore) {
  const result = await listParticipantProfiles(operator, { limit: MAX_PROFILE_LIMIT }, store);
  return result.ok ? result.value : [];
}

/** Writes `count` profiles in order, so the newest is `Participant <count>`. */
async function seedProfiles(store: BackendStore, count: number) {
  for (let index = 1; index <= count; index += 1) {
    await createParticipantProfile(
      {
        fullName: `Participant ${index}`,
        email: `participant${index}@example.org`,
        accountMethod: "email",
        representation: "individual",
        organisationName: null,
        userTypeId: "property-owner",
        intentOptionIds: [],
        consentAccepted: true,
      },
      store,
    );
  }
}

function getRequest(query = ""): Request {
  return new Request(`http://localhost/api/profiles${query}`);
}

describe("storing a completed sign-up form", () => {
  it("persists the profile and answers 201 with what it stored", async () => {
    const { store, response, body } = await post(completeBody);

    expect(response.status).toBe(201);
    expect(body.full_name).toBe("Jackie Jackson");
    expect(body.email).toBe("jackie@example.org");
    expect(body.account_method).toBe("email");
    expect(body.representation).toBe("individual");
    expect(body.organisation_name).toBeNull();
    expect(body.user_type_id).toBe("property-owner");
    expect(body.intent_option_ids).toStrictEqual(["i-am-property-owner"]);
    expect(body.consent_accepted).toBe(true);
    expect(typeof body.id).toBe("string");
    expect(typeof body.created_at).toBe("string");

    const stored = await store.listParticipantProfiles();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.email).toBe("jackie@example.org");
  });

  /**
   * The security invariant behind the whole shape. The form validates a
   * password in component state and must never send it; if a future client
   * starts doing so, the request has to fail loudly rather than have the
   * credential quietly accepted and written down.
   */
  it("refuses a body carrying a password rather than ignoring it", async () => {
    const { store, response, body } = await post({
      ...completeBody,
      password: "hunter2",
    });

    expect(response.status).toBe(400);
    expect(body.code).toBe("invalid_body");
    expect(body.details).toMatchObject({ field: "password" });
    expect(await store.listParticipantProfiles()).toHaveLength(0);
  });

  it("refuses a caller that tries to choose its own workspace", async () => {
    const { response, body } = await post({ ...completeBody, role_id: "operator" });

    expect(response.status).toBe(400);
    expect(body.details).toMatchObject({ field: "role_id" });
  });

  it("derives the workspace from the user type", async () => {
    const owner = await post(completeBody);
    expect(owner.body.role_id).toBe("site-owner");

    const financier = await post({ ...completeBody, user_type_id: "impact-investor" });
    expect(financier.body.role_id).toBe("financier");
  });

  /**
   * Null is a real answer, not a missing one: someone still working out
   * whether community solar is for them belongs to no workspace, and recording
   * that is better than assigning one they did not ask for.
   */
  it("records no workspace for someone who is only learning more", async () => {
    const { response, body } = await post({
      ...completeBody,
      user_type_id: "learning-more",
    });

    expect(response.status).toBe(201);
    expect(body.role_id).toBeNull();
  });

  it("keeps an organisation name and requires one", async () => {
    const named = await post({
      ...completeBody,
      representation: "organisation",
      organisation_name: "Re-volv",
    });
    expect(named.response.status).toBe(201);
    expect(named.body.organisation_name).toBe("Re-volv");

    const missing = await post({ ...completeBody, representation: "organisation" });
    expect(missing.response.status).toBe(400);
    expect(missing.body.details).toMatchObject({ field: "organisation_name" });

    const blank = await post({
      ...completeBody,
      representation: "organisation",
      organisation_name: "   ",
    });
    expect(blank.response.status).toBe(400);
  });

  /**
   * An individual has no organisation, so a name sent alongside one is dropped
   * rather than stored. The column would otherwise hold a value the
   * representation says does not exist, and the database CHECK refuses that
   * row outright.
   */
  it("drops an organisation name an individual should not have", async () => {
    const { response, body } = await post({
      ...completeBody,
      representation: "individual",
      organisation_name: "Re-volv",
    });

    expect(response.status).toBe(201);
    expect(body.organisation_name).toBeNull();
  });

  it("refuses to store anything without consent", async () => {
    const absent = await post({
      full_name: completeBody.full_name,
      email: completeBody.email,
      account_method: completeBody.account_method,
      representation: completeBody.representation,
      user_type_id: completeBody.user_type_id,
    });
    expect(absent.response.status).toBe(400);
    expect(absent.body.details).toMatchObject({ field: "consent_accepted" });

    const refused = await post({ ...completeBody, consent_accepted: false });
    expect(refused.response.status).toBe(422);
    expect(refused.body.code).toBe("validation_failed");
    expect(await refused.store.listParticipantProfiles()).toHaveLength(0);
  });

  /**
   * Core repeats the consent check because seeding and tests call it directly,
   * and neither should be able to write a row the HTTP path would refuse.
   */
  it("refuses consent-free writes made straight through core", async () => {
    const store = createMemoryBackendStore();
    const result = await createParticipantProfile(
      {
        fullName: "Jackie Jackson",
        email: "jackie@example.org",
        accountMethod: "email",
        representation: "individual",
        organisationName: null,
        userTypeId: "property-owner",
        intentOptionIds: [],
        consentAccepted: false,
      },
      store,
    );

    expect(result.ok).toBe(false);
    expect(await readProfiles(store)).toHaveLength(0);
  });

  it("refuses vocabulary it does not recognise", async () => {
    for (const [field, patch] of [
      ["account_method", { account_method: "carrier-pigeon" }],
      ["representation", { representation: "cooperative" }],
      ["user_type_id", { user_type_id: "space-pirate" }],
      ["intent_option_ids", { intent_option_ids: ["i-am-a-teapot"] }],
    ] as const) {
      const { response, body } = await post({ ...completeBody, ...patch });
      expect(response.status, field).toBe(400);
      expect(body.details, field).toMatchObject({ field });
    }
  });

  it("refuses an address that cannot be an email", async () => {
    for (const email of ["jackie", "jackie@", "@example.org", "jackie@example"]) {
      const { response } = await post({ ...completeBody, email });
      expect(response.status, email).toBe(400);
    }
  });

  /**
   * Unauthenticated writes are a spam vector, and PostgreSQL `text` will store
   * whatever it is given. The bound is the only thing between the table and a
   * caller posting a megabyte.
   */
  it("refuses oversized free text", async () => {
    const { response, body } = await post({
      ...completeBody,
      full_name: "a".repeat(200),
    });

    expect(response.status).toBe(400);
    expect(body.details).toMatchObject({ field: "full_name", limit: 120 });
  });

  it("treats a missing intent list as no selections", async () => {
    const { response, body } = await post({
      full_name: completeBody.full_name,
      email: completeBody.email,
      account_method: completeBody.account_method,
      representation: completeBody.representation,
      user_type_id: completeBody.user_type_id,
      consent_accepted: true,
    });

    expect(response.status).toBe(201);
    expect(body.intent_option_ids).toStrictEqual([]);
  });

  it("collapses a repeated intent option", async () => {
    const { body } = await post({
      ...completeBody,
      intent_option_ids: ["i-am-property-owner", "i-am-property-owner"],
    });

    expect(body.intent_option_ids).toStrictEqual(["i-am-property-owner"]);
  });

  /**
   * Append-only, deliberately. Deduplicating on an unverified email would let
   * anyone displace a stranger's submission by typing their address; two rows
   * an operator reconciles is recoverable, a silent overwrite is not.
   */
  it("keeps both submissions when the same address signs up twice", async () => {
    const store = createMemoryBackendStore();
    await handlePostParticipantProfile(request(completeBody), store);
    await handlePostParticipantProfile(
      request({ ...completeBody, full_name: "Jacqueline Jackson" }),
      store,
    );

    const stored = await store.listParticipantProfiles();
    expect(stored).toHaveLength(2);
    expect(stored.map((profile) => profile.fullName)).toStrictEqual([
      "Jackie Jackson",
      "Jacqueline Jackson",
    ]);
    expect(stored[0]?.id).not.toBe(stored[1]?.id);
  });

  it("trims the values it stores", async () => {
    const { body } = await post({
      ...completeBody,
      full_name: "  Jackie Jackson  ",
      email: "  jackie@example.org  ",
    });

    expect(body.full_name).toBe("Jackie Jackson");
    expect(body.email).toBe("jackie@example.org");
  });

  it("rejects a body that is not a JSON object", async () => {
    const store = createMemoryBackendStore();
    const response = await handlePostParticipantProfile(
      new Request("http://localhost/api/profiles", { method: "POST", body: "not json" }),
      store,
    );

    expect(response.status).toBe(400);
    expect(await store.listParticipantProfiles()).toHaveLength(0);
  });
});

describe("the sign-up parser", () => {
  it("accepts an explicit null organisation name for an individual", () => {
    const parsed = parseParticipantProfile({
      ...completeBody,
      organisation_name: null,
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.organisationName).toBeNull();
  });

  it("refuses an intent list longer than anyone could have chosen", () => {
    const parsed = parseParticipantProfile({
      ...completeBody,
      intent_option_ids: Array.from({ length: 40 }, () => "i-am-property-owner"),
    });

    expect(parsed.ok).toBe(false);
  });
});

/**
 * `GET /api/profiles` — the operator read.
 *
 * The write is open to the world, so these tests are about the half that is
 * not: who may read the list, and how much of it one request can ask for.
 */
describe("reading the sign-up list", () => {
  it("returns the stored profiles to an operator, newest first", async () => {
    const store = createMemoryBackendStore();
    await seedProfiles(store, 3);

    const response = await handleGetParticipantProfiles(getRequest(), operator, store);
    const body = (await response.json()) as { full_name: string }[];

    expect(response.status).toBe(200);
    expect(body.map((profile) => profile.full_name)).toStrictEqual([
      "Participant 3",
      "Participant 2",
      "Participant 1",
    ]);
  });

  /**
   * The rows are unverified contact details for people with no account, so
   * every other role is refused — including the site owner, who is
   * authenticated and still has no reason to read a list of strangers.
   */
  it("refuses every role but the operator", async () => {
    const store = createMemoryBackendStore();
    await seedProfiles(store, 1);

    const response = await handleGetParticipantProfiles(getRequest(), siteOwner, store);

    expect(response.status).toBe(403);
    expect(await readProfiles(store)).toHaveLength(1);
  });

  it("refuses the read in core as well as at the route", async () => {
    const store = createMemoryBackendStore();
    await seedProfiles(store, 1);

    const result = await listParticipantProfiles(siteOwner, { limit: 10 }, store);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("forbidden_role");
  });

  it("returns the most recent page rather than the oldest rows", async () => {
    const store = createMemoryBackendStore();
    await seedProfiles(store, 5);

    const response = await handleGetParticipantProfiles(
      getRequest("?limit=2"),
      operator,
      store,
    );
    const body = (await response.json()) as { full_name: string }[];

    expect(body.map((profile) => profile.full_name)).toStrictEqual([
      "Participant 5",
      "Participant 4",
    ]);
  });

  it("answers with an empty list when nobody has signed up", async () => {
    const store = createMemoryBackendStore();

    const response = await handleGetParticipantProfiles(getRequest(), operator, store);

    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual([]);
  });

  it("defaults to a bounded page", () => {
    const parsed = parseParticipantProfileQuery(new URLSearchParams());

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.limit).toBe(DEFAULT_PROFILE_LIMIT);
  });

  /**
   * `Number` would read every one of these as a limit the caller never wrote,
   * and `1e9` in particular would defeat the cap the bound exists to impose.
   */
  it("refuses a limit that is not written as digits", () => {
    for (const value of ["1e3", "0x10", " 5 ", "Infinity", "-1", "2.5", "many"]) {
      const parsed = parseParticipantProfileQuery(new URLSearchParams({ limit: value }));
      expect(parsed.ok, `limit=${value}`).toBe(false);
    }
  });

  it("refuses a limit outside the supported range", () => {
    for (const value of ["0", String(MAX_PROFILE_LIMIT + 1)]) {
      const parsed = parseParticipantProfileQuery(new URLSearchParams({ limit: value }));
      expect(parsed.ok, `limit=${value}`).toBe(false);
    }
  });

  it("refuses an unknown query parameter rather than ignoring it", () => {
    const parsed = parseParticipantProfileQuery(new URLSearchParams({ email: "a@b.co" }));

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.failure.code).toBe("invalid_query");
  });
});
