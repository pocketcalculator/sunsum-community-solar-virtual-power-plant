// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SESSION_MAX_AGE_MS,
  signSession,
  verifySession,
} from "@/backend/core/identity";
import {
  createMemoryBackendStore,
  setActiveStore,
  type BackendStore,
} from "@/backend/core/store";
import {
  DEMO_INVESTOR_USER_ID,
  DEMO_OPERATOR_USER_ID,
  DEMO_SITE_OWNER_USER_ID,
} from "@/backend/demo-principals";
import {
  SESSION_COOKIE_NAME,
  handleGetMe,
  handlePostDemoSwitch,
  handlePostLogout,
  requireInvestorIdentity,
  requireRole,
  resolveViewer,
} from "@/backend/handlers/identity";

const SECRET = "a-test-secret-that-is-long-enough-to-pass";
const NOW = Date.UTC(2026, 8, 18, 12, 0, 0);

/*
 * The token, on its own.
 *
 * Every rejection here is the difference between a signature we minted and one
 * someone else supplied, so each branch gets its own test rather than being
 * folded into a single "rejects bad input" case.
 */
describe("a session token", () => {
  it("round-trips the user it was signed for", () => {
    const token = signSession({ userId: "abc", issuedAt: NOW }, SECRET);
    const payload = verifySession(token, SECRET, NOW);

    expect(payload.ok).toBe(true);
    if (payload.ok) expect(payload.value.userId).toBe("abc");
  });

  it("refuses a token signed with a different secret", () => {
    const token = signSession({ userId: "abc", issuedAt: NOW }, "another-secret-long-enough-to-use");

    expect(verifySession(token, SECRET, NOW).ok).toBe(false);
  });

  it("refuses a token whose payload was edited after signing", () => {
    const token = signSession({ userId: "abc", issuedAt: NOW }, SECRET);
    const [, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ userId: "someone-else", issuedAt: NOW }),
    ).toString("base64url");

    expect(verifySession(`${forged}.${signature}`, SECRET, NOW).ok).toBe(false);
  });

  it("refuses a token that has aged out", () => {
    const token = signSession({ userId: "abc", issuedAt: NOW }, SECRET);
    const afterExpiry = NOW + SESSION_MAX_AGE_MS + 1;

    expect(verifySession(token, SECRET, afterExpiry).ok).toBe(false);
  });

  it("accepts a token that is one millisecond from expiring", () => {
    const token = signSession({ userId: "abc", issuedAt: NOW }, SECRET);

    expect(verifySession(token, SECRET, NOW + SESSION_MAX_AGE_MS - 1).ok).toBe(
      true,
    );
  });

  // A clock that ran backwards, or an issuedAt someone chose. Either way the
  // token is not one we can reason about, so it is not honoured.
  it("refuses a token issued in the future", () => {
    const token = signSession(
      { userId: "abc", issuedAt: NOW + 60_000 },
      SECRET,
    );

    expect(verifySession(token, SECRET, NOW).ok).toBe(false);
  });

  it.each([
    ["empty", ""],
    ["one segment", "onlyonesegment"],
    ["three segments", "a.b.c"],
    ["payload that is not base64", "!!!.!!!"],
    ["payload that is not an object", `${Buffer.from("42").toString("base64url")}.x`],
  ])("refuses a malformed token: %s", (_name, token) => {
    expect(verifySession(token, SECRET, NOW).ok).toBe(false);
  });

  // Nothing about *why* a token failed reaches the caller: a probe must not be
  // able to tell a forged signature from an expired one.
  it("says the same thing however it failed", () => {
    const expired = verifySession(
      signSession({ userId: "abc", issuedAt: NOW }, SECRET),
      SECRET,
      NOW + SESSION_MAX_AGE_MS + 1,
    );
    const forged = verifySession("garbage.garbage", SECRET, NOW);

    expect(expired.ok).toBe(false);
    expect(forged.ok).toBe(false);
    if (!expired.ok && !forged.ok) {
      expect(expired.failure).toEqual(forged.failure);
    }
  });
});

describe("signing in and out", () => {
  let store: BackendStore;
  let previous: BackendStore;

  beforeEach(() => {
    // The demo sign-in is opt-in, so a test that signs in has to ask for it.
    vi.stubEnv("SUNSUM_DEMO_AUTH", "enabled");
    store = createMemoryBackendStore({ seedDemoProjects: true });
    previous = setActiveStore(store);
  });

  afterEach(() => {
    setActiveStore(previous);
    vi.unstubAllEnvs();
  });

  function switchTo(role: string): Promise<Response> {
    return handlePostDemoSwitch(
      new Request("https://sunsum.test/api/auth/demo-switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      }),
      store,
    );
  }

  function withCookie(response: Response): Request {
    const header = response.headers.get("set-cookie") ?? "";
    return new Request("https://sunsum.test/api/me", {
      headers: { cookie: header.split(";")[0] ?? "" },
    });
  }

  it.each([
    ["site_owner", DEMO_SITE_OWNER_USER_ID],
    ["operator", DEMO_OPERATOR_USER_ID],
    ["investor", DEMO_INVESTOR_USER_ID],
  ])("hands out the seeded %s", async (role, userId) => {
    const response = await switchTo(role);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ role, user_id: userId });
  });

  it("sets a cookie that is not readable from script", async () => {
    const cookie = (await switchTo("operator")).headers.get("set-cookie") ?? "";

    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("refuses a role it does not recognise", async () => {
    expect((await switchTo("administrator")).status).toBe(400);
  });

  it("answers /me with the identity just issued", async () => {
    const signedIn = await switchTo("investor");
    const me = await handleGetMe(withCookie(signedIn), store);

    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({
      role: "investor",
      user_id: DEMO_INVESTOR_USER_ID,
    });
  });

  it("refuses /me without a session", async () => {
    const response = await handleGetMe(
      new Request("https://sunsum.test/api/me"),
      store,
    );

    expect(response.status).toBe(401);
  });

  it("clears the cookie on the way out", () => {
    const cookie = handlePostLogout().headers.get("set-cookie") ?? "";

    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(cookie).toContain("Max-Age=0");
  });

  /*
   * The role rides on the user row, not the token, so a role that changes in
   * the database takes effect on the very next request. The store answers with
   * a different role than the one signed in as; a resolver that trusted the
   * token would still say "operator" here.
   */
  it("follows a role that changed in the database", async () => {
    const signedIn = await switchTo("operator");
    const demoted = new Proxy(store, {
      get(target, property) {
        if (property === "getUser") {
          return (id: string) =>
            Promise.resolve({ id, role: "site_owner" as const });
        }
        const member = Reflect.get(target, property, target) as unknown;
        return typeof member === "function" ? member.bind(target) : member;
      },
    });

    const viewer = await resolveViewer(withCookie(signedIn), demoted);

    expect(viewer.ok && viewer.value.role).toBe("site_owner");
  });

  it("refuses the wrong role with 403, not 401", async () => {
    const signedIn = await switchTo("operator");
    const refused = await requireRole(
      withCookie(signedIn),
      "site_owner",
      store,
    );

    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.failure.code).toBe("forbidden_role");
  });

  it("refuses an anonymous caller with 401, not 403", async () => {
    const refused = await requireRole(
      new Request("https://sunsum.test/api/me"),
      "site_owner",
      store,
    );

    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.failure.code).toBe("unauthenticated");
  });

  /*
   * The fallback this replaced returned a hardcoded profile when the store had
   * none, so an investor account that was never onboarded still read as fully
   * onboarded. Sign-in now succeeds and says so plainly, but no profile is
   * invented: a profile-gated read is still refused.
   */
  it("reports an investor with no profile as not onboarded", async () => {
    const unonboarded = createMemoryBackendStore({ seedDemoProjects: false });
    const response = await handlePostDemoSwitch(
      new Request("https://sunsum.test/api/auth/demo-switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "investor" }),
      }),
      unonboarded,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      role: "investor",
      onboarded: false,
    });
  });

  it("refuses a profile-gated read for an investor who has not onboarded", async () => {
    const unonboarded = createMemoryBackendStore({ seedDemoProjects: false });
    const signedIn = await handlePostDemoSwitch(
      new Request("https://sunsum.test/api/auth/demo-switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "investor" }),
      }),
      unonboarded,
    );

    const viewer = await resolveViewer(withCookie(signedIn), unonboarded);

    expect(viewer.ok).toBe(false);
    if (!viewer.ok) expect(viewer.failure.code).toBe("forbidden_role");
  });

  // An unseeded database is a setup problem, and it is much cheaper to find it
  // at sign-in than one request later on a session that looked valid.
  it("refuses to sign in against a database with no demo accounts", async () => {
    const empty = new Proxy(store, {
      get(target, property) {
        if (property === "getUser") return () => Promise.resolve(null);
        const member = Reflect.get(target, property, target) as unknown;
        return typeof member === "function" ? member.bind(target) : member;
      },
    });
    const response = await handlePostDemoSwitch(
      new Request("https://sunsum.test/api/auth/demo-switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "investor" }),
      }),
      empty,
    );

    expect(response.status).toBe(503);
  });

  /*
   * The demo sign-in hands out an operator session to anyone who asks for one,
   * so leaving it on by default would have reopened, through the front door,
   * exactly the anonymous access the session layer exists to close.
   */
  it("refuses the demo sign-in unless a deployment opts in", async () => {
    vi.stubEnv("SUNSUM_DEMO_AUTH", "");

    const response = await switchTo("operator");

    expect(response.status).toBe(404);
  });

  /*
   * Onboarding has to be reachable by the account it onboards: sign-in must
   * work without a profile, and the profile write must accept that session.
   * `requireRole` resolves a full viewer, which needs the very profile the
   * request is about to create.
   */
  it("lets an investor with no profile create one", async () => {
    const fresh = createMemoryBackendStore({ seedDemoProjects: false });
    const signedIn = await handlePostDemoSwitch(
      new Request("https://sunsum.test/api/auth/demo-switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "investor" }),
      }),
      fresh,
    );
    expect(signedIn.status).toBe(200);

    const identity = await requireInvestorIdentity(
      withCookie(signedIn),
      fresh,
    );

    expect(identity.ok).toBe(true);
    if (identity.ok) expect(identity.value.role).toBe("investor");
  });
});
