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
import { handlePostInvestorProfile } from "@/backend/handlers/investors/portfolio";
import * as routes from "@/backend";

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

  function switchTo(role: string, into: BackendStore = store): Promise<Response> {
    return handlePostDemoSwitch(
      new Request("https://sunsum.test/api/auth/demo-switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      }),
      into,
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

  /*
   * The flip side of reading the role from the row: the role asked for at
   * sign-in is only a claim about that row. Were the seeded investor ever set
   * to `operator`, asking for an investor session would otherwise hand back an
   * operator one — a way up for anyone who can reach the endpoint.
   */
  it("refuses to sign in when the demo account holds a different role", async () => {
    const promoted = new Proxy(store, {
      get(target, property) {
        if (property === "getUser") {
          return (id: string) =>
            Promise.resolve({ id, role: "operator" as const });
        }
        const member = Reflect.get(target, property, target) as unknown;
        return typeof member === "function" ? member.bind(target) : member;
      },
    });

    const response = await switchTo("investor", promoted);

    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
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
    if (!identity.ok) return;
    expect(identity.value.role).toBe("investor");

    const created = await handlePostInvestorProfile(
      new Request("https://sunsum.test/api/investors/me/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organization_name: "First Light Fund",
          investor_type: "impact_investor",
          capital_type: "concessionary_debt",
          funding_stage_focus: [],
          ticket_size_min: null,
          ticket_size_max: null,
          geographies: [],
          investment_objectives: [],
          impact_priorities: [],
          decision_criteria: [],
        }),
      }),
      identity.value,
      fresh,
    );

    expect(created.status).toBe(201);

    /*
     * The profile has to be readable afterwards, and by the id the response
     * gave out: a 201 carrying an id that was never stored is the failure the
     * concurrent-onboarding path can otherwise produce.
     */
    const payload = (await created.json()) as { id: string };
    const stored = await fresh.getInvestorProfileByUserId(identity.value.userId);
    expect(stored?.id).toBe(payload.id);
    expect(stored?.organizationName).toBe("First Light Fund");

    const me = await handleGetMe(withCookie(signedIn), fresh);
    expect(await me.json()).toMatchObject({ onboarded: true });
  });

  /*
   * Login CSRF.
   *
   * `SameSite=Lax` keeps an existing cookie from being *sent* on a cross-site
   * POST; it says nothing about a response that *sets* one. Sign-in takes no
   * credential, so without this an attacker's form could put a victim's browser
   * into a role of the attacker's choosing and the victim would go on using the
   * demo as that role.
   */
  describe("a cross-site caller", () => {
    function switchFrom(headers: Record<string, string>): Promise<Response> {
      return handlePostDemoSwitch(
        new Request("https://sunsum.test/api/auth/demo-switch", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            host: "sunsum.test",
            ...headers,
          },
          body: JSON.stringify({ role: "operator" }),
        }),
        store,
      );
    }

    it.each([["cross-site"], ["same-site"]])(
      "is refused when Sec-Fetch-Site is %s",
      async (site) => {
        const response = await switchFrom({ "sec-fetch-site": site });

        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({
          code: "forbidden_origin",
        });
        expect(response.headers.get("set-cookie")).toBeNull();
      },
    );

    it.each([["same-origin"], ["none"]])(
      "is allowed when Sec-Fetch-Site is %s",
      async (site) => {
        const response = await switchFrom({ "sec-fetch-site": site });

        expect(response.status).toBe(200);
        expect(response.headers.get("set-cookie")).toContain(
          SESSION_COOKIE_NAME,
        );
      },
    );

    it("is refused on an Origin from somewhere else", async () => {
      const response = await switchFrom({ origin: "https://attacker.test" });

      expect(response.status).toBe(403);
      expect(response.headers.get("set-cookie")).toBeNull();
    });

    it("is allowed on our own Origin", async () => {
      const response = await switchFrom({ origin: "https://sunsum.test" });

      expect(response.status).toBe(200);
    });

    /*
     * curl, a server-to-server call and this test suite send neither header.
     * They are not browsers and cannot be steered by a page, so refusing them
     * would cost the demo its simplest client for no security gain.
     */
    it("is allowed when it sends neither header", async () => {
      expect((await switchTo("operator")).status).toBe(200);
    });

    /*
     * A literal `Origin: null` is not an absent header. A sandboxed iframe, a
     * `data:` document and a `file:` page all send it, and all of them are
     * browsers running markup the attacker chose — which is the exact case
     * this guard exists for. Treating it as "no header" would have reopened
     * the hole for any browser that does not send `Sec-Fetch-Site`.
     */
    it("is refused on an opaque Origin", async () => {
      const response = await switchFrom({ origin: "null" });

      expect(response.status).toBe(403);
      expect(response.headers.get("set-cookie")).toBeNull();
    });

    it("cannot sign a victim out from another site", () => {
      const response = handlePostLogout(
        new Request("https://sunsum.test/api/auth/logout", {
          method: "POST",
          headers: { "sec-fetch-site": "cross-site", host: "sunsum.test" },
        }),
      );

      expect(response.status).toBe(403);
      expect(response.headers.get("set-cookie")).toBeNull();
    });
  });
});

/*
 * The production fail-closed branch.
 *
 * Inventing a secret per process would work locally and then, in production,
 * sign everyone out on each restart and reject the other instance's cookies —
 * an intermittent logout nobody would trace back to a missing variable. The
 * refusal is what makes that impossible, so it needs a test of its own: the
 * development path exercised everywhere else would never notice it disappear.
 */
describe("a deployment with no usable session secret", () => {
  let store: BackendStore;
  let previous: BackendStore;

  beforeEach(() => {
    vi.stubEnv("SUNSUM_DEMO_AUTH", "enabled");
    store = createMemoryBackendStore({ seedDemoProjects: true });
    previous = setActiveStore(store);
  });

  afterEach(() => {
    setActiveStore(previous);
    vi.unstubAllEnvs();
  });

  function signIn(): Promise<Response> {
    return handlePostDemoSwitch(
      new Request("https://sunsum.test/api/auth/demo-switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "operator" }),
      }),
      store,
    );
  }

  it("refuses to issue a cookie in production when the secret is unset", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SUNSUM_SESSION_SECRET", "");

    const response = await signIn();

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "service_unavailable",
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("refuses a protected request in production when the secret is unset", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SUNSUM_SESSION_SECRET", "");

    const refused = await requireRole(
      new Request("https://sunsum.test/api/portfolio", {
        headers: { cookie: `${SESSION_COOKIE_NAME}=anything` },
      }),
      "investor",
      store,
    );

    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.failure.code).toBe("service_unavailable");
  });

  /*
   * A secret that is present but too short is refused everywhere, not only in
   * production: a development deployment that sets one is asking for it to be
   * used, and quietly falling back to the per-process secret would hide the
   * mistake until it shipped.
   */
  it.each([["production"], ["development"]])(
    "refuses a secret that is too short in %s",
    async (environment) => {
      vi.stubEnv("NODE_ENV", environment);
      vi.stubEnv("SUNSUM_SESSION_SECRET", "too-short");

      const response = await signIn();

      expect(response.status).toBe(503);
      expect(response.headers.get("set-cookie")).toBeNull();
    },
  );

  it("works in production once the secret is long enough", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SUNSUM_SESSION_SECRET", SECRET);

    const response = await signIn();
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(cookie).toContain(SESSION_COOKIE_NAME);
    /*
     * `Secure` is production-only, so this is the only place it can be
     * asserted. Without it the session cookie would travel over plain HTTP,
     * and a test that only checks the cookie exists would not notice.
     */
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });
});

/*
 * Every gate, not just one.
 *
 * The gate lives in the route wrapper, one line per route, and a wrapper that
 * omitted it would still pass every core test beneath it — which is exactly
 * how an anonymous POST /api/sites once returned 201. Driving all of them from
 * here is the only place that shows up, so the table is exhaustive on purpose:
 * a new route without an entry is a route nobody proved refuses an anonymous
 * caller.
 *
 * The wrong-role case is a contract test rather than a wrapper test. Core
 * refuses the wrong role too, so it passes whether the wrapper names the right
 * role or core catches it a layer down; what it pins is the answer a client
 * sees, which is the thing that must not change.
 */
describe("every protected route", () => {
  /*
 * Strictly valid: the path validator checks the version and variant nibbles,
 * so an id that merely looks UUID-shaped is refused as a bad request before
 * the role check ever runs — which would quietly hollow out the table below.
 */
const SITE_ID = "11111111-2222-4333-8444-555555555555";

  type Gate = "site_owner" | "operator" | "investor" | "any";
  type Route = (request: Request, context: RouteContext) => unknown;
  interface RouteContext {
    readonly params: Promise<{ readonly id: string }>;
  }

  /** A role the gate must refuse, for each role the gate accepts. */
  const WRONG_ROLE: Record<Exclude<Gate, "any">, string> = {
    site_owner: "investor",
    operator: "site_owner",
    investor: "operator",
  };

  const ROUTES: ReadonlyArray<readonly [string, Route, Gate, "POST" | "GET"]> = [
    ["postSite", routes.postSiteRoute as Route, "site_owner", "POST"],
    ["patchSite", routes.patchSiteRoute as Route, "site_owner", "POST"],
    ["postSiteSubmit", routes.postSiteSubmitRoute as Route, "site_owner", "POST"],
    ["getOwnerSites", routes.getOwnerSitesRoute as Route, "site_owner", "GET"],
    [
      "getOwnerOutstanding",
      routes.getOwnerOutstandingRoute as Route,
      "site_owner",
      "GET",
    ],
    ["getSubmissions", routes.getSubmissionsRoute as Route, "operator", "GET"],
    [
      "getSubmissionDetail",
      routes.getSubmissionDetailRoute as Route,
      "operator",
      "GET",
    ],
    [
      "postSubmissionDecision",
      routes.postSubmissionDecisionRoute as Route,
      "operator",
      "POST",
    ],
    ["postProjectStage", routes.postProjectStageRoute as Route, "operator", "POST"],
    [
      "patchProjectVisibility",
      routes.patchProjectVisibilityRoute as Route,
      "operator",
      "POST",
    ],
    ["patchProject", routes.patchProjectRoute as Route, "operator", "POST"],
    ["getPipeline", routes.getPipelineRoute as Route, "operator", "GET"],
    [
      "getProjectEngagements",
      routes.getProjectEngagementsRoute as Route,
      "operator",
      "GET",
    ],
    ["getPortfolio", routes.getPortfolioRoute as Route, "investor", "GET"],
    [
      "getInvestorProfile",
      routes.getInvestorProfileRoute as Route,
      "investor",
      "GET",
    ],
    [
      "postInvestorProfile",
      routes.postInvestorProfileRoute as Route,
      "investor",
      "POST",
    ],
    ["postEngagement", routes.postEngagementRoute as Route, "investor", "POST"],
    ["getMyEngagements", routes.getMyEngagementsRoute as Route, "investor", "GET"],
    ["getDealRoom", routes.getDealRoomRoute as Route, "investor", "GET"],
    ["postSiteDocument", routes.postSiteDocumentRoute as Route, "any", "POST"],
    [
      "getProjectFundingNeeds",
      routes.getProjectFundingNeedsRoute as Route,
      "any",
      "GET",
    ],
  ];

  let store: BackendStore;
  let previous: BackendStore;

  beforeEach(() => {
    vi.stubEnv("SUNSUM_DEMO_AUTH", "enabled");
    store = createMemoryBackendStore({ seedDemoProjects: true });
    previous = setActiveStore(store);
  });

  afterEach(() => {
    setActiveStore(previous);
    vi.unstubAllEnvs();
  });

  async function cookieFor(role: string): Promise<string> {
    const response = await handlePostDemoSwitch(
      new Request("https://sunsum.test/api/auth/demo-switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      }),
      store,
    );
    return (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  }

  function call(
    route: Route,
    method: "POST" | "GET",
    cookie?: string,
  ): Promise<Response> {
    const request = new Request("https://sunsum.test/api/whatever", {
      method,
      headers: {
        "content-type": "application/json",
        ...(cookie === undefined ? {} : { cookie }),
      },
      ...(method === "POST" ? { body: "{}" } : {}),
    });
    return Promise.resolve(
      route(request, { params: Promise.resolve({ id: SITE_ID }) }),
    ) as Promise<Response>;
  }

  it.each(ROUTES.map(([name, route, , method]) => ({ name, route, method })))(
    "refuses $name without a session",
    async ({ route, method }) => {
      const response = await call(route, method);

      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: "unauthenticated" });
    },
  );

  it.each(
    ROUTES.filter(([, , gate]) => gate !== "any").map(
      ([name, route, gate, method]) => ({
        name,
        route,
        method,
        wrong: WRONG_ROLE[gate as Exclude<Gate, "any">],
      }),
    ),
  )("refuses $name to a signed-in $wrong", async ({ route, method, wrong }) => {
    const response = await call(route, method, await cookieFor(wrong));

    expect(response.status).toBe(403);
  });

  /*
   * The two multi-role routes are not open to everyone, and the roles differ
   * between them: site documents are for the owner or an operator, funding
   * needs for an investor or an operator. Their wrappers gate on "signed in"
   * and core decides the role a layer down, so the allowed set is recorded
   * per route rather than shared.
   */
  const MULTI_ROLE: Record<string, readonly string[]> = {
    postSiteDocument: ["site_owner", "operator"],
    getProjectFundingNeeds: ["investor", "operator"],
  };

  /*
   * `postSiteDocument` validates its body before it reaches the role check, so
   * a refused role answers 400 rather than 403 for the empty body used here.
   * The wrapper's own contract — anonymous is refused — is still covered by
   * the table above; only the role matrix is left to core's own tests.
   */
  const BODY_VALIDATED_FIRST: ReadonlySet<string> = new Set(["postSiteDocument"]);

  it.each(
    ROUTES.filter(([, , gate]) => gate === "any").flatMap(
      ([name, route, , method]) =>
        (MULTI_ROLE[name] ?? []).map((role) => ({ name, route, method, role })),
    ),
  )(
    "lets a signed-in $role past the gate on $name",
    async ({ route, method, role }) => {
      const response = await call(route, method, await cookieFor(role));

      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    },
  );

  it.each(
    ROUTES.filter(
      ([name, , gate]) => gate === "any" && !BODY_VALIDATED_FIRST.has(name),
    ).flatMap(([name, route, , method]) =>
      (["site_owner", "operator", "investor"] as const)
        .filter((role) => !(MULTI_ROLE[name] ?? []).includes(role))
        .map((role) => ({ name, route, method, role })),
    ),
  )("refuses $name to a signed-in $role", async ({ route, method, role }) => {
    const response = await call(route, method, await cookieFor(role));

    expect(response.status).toBe(403);
  });
});

/*
 * The other half of the CSRF problem.
 *
 * `SameSite=Lax` is scoped to the site, not the origin, so a sibling origin
 * under the same registrable domain still has the session cookie attached to
 * a forged POST — Lax alone was never a CSRF defence for the write routes.
 * The check therefore sits in `resolveIdentity`, which every gated route goes
 * through, so a route cannot be added without it.
 */
describe("a cookie-authenticated write from another site", () => {
  let store: BackendStore;
  let previous: BackendStore;
  let cookie: string;

  beforeEach(async () => {
    vi.stubEnv("SUNSUM_DEMO_AUTH", "enabled");
    vi.stubEnv("SUNSUM_SESSION_SECRET", SECRET);
    store = createMemoryBackendStore({ seedDemoProjects: true });
    previous = setActiveStore(store);

    const signIn = await handlePostDemoSwitch(
      new Request("https://sunsum.test/api/auth/demo-switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "site_owner" }),
      }),
      store,
    );
    cookie = (signIn.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  });

  afterEach(() => {
    setActiveStore(previous);
    vi.unstubAllEnvs();
  });

  function write(headers: Record<string, string>): Promise<Response> {
    return routes.postSiteRoute(
      new Request("https://sunsum.test/api/sites", {
        method: "POST",
        headers: { "content-type": "application/json", cookie, ...headers },
        body: JSON.stringify({ name: "A site" }),
      }),
    );
  }

  it.each([["cross-site"], ["same-site"]])(
    "is refused from a %s origin",
    async (site) => {
      const response = await write({ "sec-fetch-site": site });

      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: "forbidden_origin" });
    },
  );

  it("is refused on a foreign Origin", async () => {
    const response = await write({
      origin: "https://attacker.test",
      host: "sunsum.test",
    });

    expect(response.status).toBe(403);
  });

  it("is allowed from our own page", async () => {
    const response = await write({ "sec-fetch-site": "same-origin" });

    expect(response.status).not.toBe(403);
  });

  /*
   * A cross-site GET is a read the caller could have made anyway, so refusing
   * it would break legitimate embedding and buy nothing. Only the methods that
   * can change state are guarded.
   */
  it("does not refuse a cross-site read", async () => {
    const response = await routes.getOwnerSitesRoute(
      new Request("https://sunsum.test/api/sites", {
        headers: { cookie, "sec-fetch-site": "cross-site" },
      }),
    );

    expect(response.status).not.toBe(403);
  });

  /*
   * Ordered after the cookie check: a request with no session has nothing to
   * forge with, and `unauthenticated` is both true and more useful than naming
   * an origin rule it never reached.
   */
  it("answers an anonymous cross-site write as unauthenticated", async () => {
    const response = await routes.postSiteRoute(
      new Request("https://sunsum.test/api/sites", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "sec-fetch-site": "cross-site",
        },
        body: "{}",
      }),
    );

    expect(response.status).toBe(401);
  });
});