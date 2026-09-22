import { expect, test as base, type Page, type Request } from "@playwright/test";
import { MOCK_PROJECTS } from "../../src/backend/core/projects/mock-store";
import {
  DEMO_INVESTOR_ID, DEMO_INVESTOR_USER_ID, DEMO_OPERATOR_USER_ID, DEMO_SITE_OWNER_USER_ID,
} from "../../src/backend/demo-principals";
import {
  installSyntheticSaveAudit, readSyntheticSaveAudit, syntheticLocalOrigin,
  syntheticStorageState, SYNTHETIC_SAVE_CANARIES, type SyntheticStorageAttempt,
} from "../fixtures/live-read-contracts";
import { expectCompactPerspectiveRow, expectPerspectiveGlide } from "../e2e/perspective-layout";

type DemoRole = "site_owner" | "operator" | "investor";
interface DemoCall {
  readonly path: string;
  readonly method: string;
  readonly body: string | null;
  readonly violation: string | null;
}
interface HeldResponse {
  readonly started: Promise<void>;
  readonly settled: Promise<void>;
  release(): void;
}
interface DemoAudit {
  readonly calls: DemoCall[];
  readonly unexpected: DemoCall[];
  armRole(role: DemoRole): void;
  armInterest(projectId: string): void;
  clearWrites(): void;
  holdNextResponse(path: string, method?: "GET" | "POST"): HeldResponse;
}

function signal() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

const test = base.extend<{ demo: DemoAudit }>({
  storageState: async ({ baseURL }, provide) => {
    await provide(syntheticStorageState(syntheticLocalOrigin(baseURL)));
  },
  demo: [async ({ page, baseURL }, provide) => {
    const origin = syntheticLocalOrigin(baseURL);
    const context = page.context();
    const calls: DemoCall[] = [];
    const unexpected: DemoCall[] = [];
    const storageAttempts: SyntheticStorageAttempt[] = [];
    const errors: string[] = [];
    const writes = new Map<string, string>();
    const held = new Map<string, ReturnType<typeof heldResponse>>();
    const allHeld: ReturnType<typeof heldResponse>[] = [];
    const reads = new Set([
      "/api/me", "/api/me/sites", "/api/me/outstanding", "/api/submissions", "/api/pipeline",
      "/api/portfolio", "/api/investors/me/profile", "/api/me/engagements",
      ...MOCK_PROJECTS.flatMap((project) => [
        `/api/submissions/${project.siteId}`, `/api/projects/${project.id}/funding-needs`,
        `/api/projects/${project.id}/engagements`, `/api/projects/${project.id}/deal-room`,
      ]),
    ]);
    const frameworkDocuments = new Set([
      "/", "/app", "/join", "/need", "/opportunity", "/impact",
      "/dashboard/site-owner", "/dashboard/operator", "/dashboard/investor",
      "/concepts", "/concepts/sunroom", "/concepts/gridline",
    ]);
    function heldResponse() {
      const started = signal();
      const release = signal();
      const settled = signal();
      return { started, release, settled };
    }
    function observe(request: Request): DemoCall {
      const url = new URL(request.url());
      const method = request.method();
      const body = request.postData();
      let violation: string | null = null;
      if (url.origin !== origin || url.username || url.password) violation = "not-the-isolated-loopback-origin";
      else if (method === "POST") {
        if (url.search || writes.get(url.pathname) !== body || !writes.has(url.pathname)) violation = "unarmed-write";
      } else if (method !== "GET") violation = "non-admitted-method";
      else if (url.pathname.startsWith("/api/") && !reads.has(url.pathname)) violation = "unknown-api-read";
      else if (["fetch", "xhr"].includes(request.resourceType()) && !url.pathname.startsWith("/api/") &&
        !url.pathname.startsWith("/_next/") &&
        !(request.headers()["rsc"] === "1" && url.searchParams.has("_rsc") &&
          frameworkDocuments.has(url.pathname))) violation = "unknown-data-read";
      return { path: `${url.pathname}${url.search}`, method, body, violation };
    }
    context.on("request", (request) => {
      const entry = observe(request);
      if (new URL(request.url()).pathname.startsWith("/api/") || entry.violation) calls.push(entry);
      if (entry.violation) unexpected.push(entry);
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await context.exposeBinding("__sunsumRecordSyntheticStorageAttempt", (_source, attempt: SyntheticStorageAttempt) => {
      storageAttempts.push(attempt);
    });
    await context.addInitScript(installSyntheticSaveAudit, SYNTHETIC_SAVE_CANARIES);
    await context.route("**/*", async (route) => {
      const request = route.request();
      const entry = observe(request);
      if (entry.violation) {
        await route.abort("blockedbyclient");
        return;
      }
      const key = `${entry.method} ${new URL(request.url()).pathname}`;
      const pending = held.get(key);
      if (pending === undefined) {
        await route.continue();
        return;
      }
      held.delete(key);
      // Reach the actual local handler with the browser-issued cookie; delay only delivery.
      const response = await route.fetch({ maxRetries: 0, maxRedirects: 0 });
      pending.started.release();
      try {
        await pending.release.promise;
        await route.fulfill({ response });
      } finally {
        pending.settled.release();
      }
    });
    const audit: DemoAudit = {
      calls, unexpected,
      armRole(role) { writes.set("/api/auth/demo-switch", JSON.stringify({ role })); },
      armInterest(projectId) {
        if (!MOCK_PROJECTS.some((project) => project.id === projectId && project.visibleToInvestors)) {
          throw new Error("Only an existing visible mock project may be used by this isolated endpoint test.");
        }
        writes.set(`/api/projects/${projectId}/engagements`, "{}");
      },
      clearWrites() { writes.clear(); },
      holdNextResponse(path, method = "GET") {
        const pending = heldResponse();
        const key = `${method} ${path}`;
        if (held.has(key)) throw new Error("This isolated response is already held.");
        held.set(key, pending);
        allHeld.push(pending);
        return { started: pending.started.promise, settled: pending.settled.promise, release: pending.release.release };
      },
    };
    try {
      await provide(audit);
    } finally {
      for (const pending of allHeld) pending.release.release();
      const storage = await page.evaluate(readSyntheticSaveAudit);
      expect({ unexpected, storageAttempts, attempts: storage.attempts, canaries: storage.canaries, errors }).toEqual({
        unexpected: [], storageAttempts: [], attempts: [], canaries: SYNTHETIC_SAVE_CANARIES, errors: [],
      });
    }
  }, { auto: true }],
});

const roleTitle: Record<DemoRole, string> = {
  site_owner: "Your sites, in context",
  operator: "Your Action Center",
  investor: "Explore your permitted portfolio",
};
const roleLabel: Record<DemoRole, string> = { site_owner: "Site owner", operator: "Operator", investor: "Financier" };
const roleUser: Record<DemoRole, string> = {
  site_owner: DEMO_SITE_OWNER_USER_ID, operator: DEMO_OPERATOR_USER_ID, investor: DEMO_INVESTOR_USER_ID,
};

function demoRoleGroup(page: Page) {
  return page.getByRole("group", { name: "Developer/demo sign-in", exact: true });
}

function demoRoleControl(page: Page, role: DemoRole) {
  const value = role === "site_owner" ? "site-owner" : role;
  return demoRoleGroup(page).locator(`button[data-role-control="${value}"]`);
}

async function expectSelectedDemoRole(page: Page, role: DemoRole) {
  const group = demoRoleGroup(page);
  await expect(group).toHaveCount(1);
  await expect(demoRoleControl(page, role)).toHaveAccessibleName(roleLabel[role]);
  await expect(demoRoleControl(page, role)).toHaveAttribute("aria-current", "true");
  await expect(group.locator('button[aria-current="true"]')).toHaveCount(1);
}

function observeDemoSwitch(page: Page, role: DemoRole) {
  let postObserved = false;
  const posted = page.waitForResponse((response) => {
    const matches = new URL(response.url()).pathname === "/api/auth/demo-switch" &&
      response.request().method() === "POST";
    if (matches) postObserved = true;
    return matches;
  });
  const confirmed = page.waitForResponse(async (response) => {
    if (!postObserved || new URL(response.url()).pathname !== "/api/me" ||
      response.request().method() !== "GET" || response.status() !== 200) return false;
    const identity: unknown = await response.json();
    return typeof identity === "object" && identity !== null &&
      "user_id" in identity && identity.user_id === roleUser[role] &&
      "role" in identity && identity.role === role;
  });
  return Promise.all([posted, confirmed]);
}

async function switchRole(page: Page, demo: DemoAudit, role: DemoRole) {
  demo.armRole(role);
  const received = observeDemoSwitch(page, role);
  await demoRoleGroup(page).getByRole("button", { name: roleLabel[role], exact: true }).click();
  const [response, identity] = await received;
  expect(response.status()).toBe(200);
  expect(response.request().postData()).toBe(JSON.stringify({ role }));
  // The UI's fresh identity read proves the issued session; the unused POST body is not its authority.
  expect(await identity.json()).toMatchObject({ user_id: roleUser[role], role });
  demo.clearWrites();
}

async function navigate(page: Page, name: string) {
  const button = page.getByRole("navigation", { name: "Connected workspace", exact: true })
    .getByRole("button", { name, exact: true });
  if (!await button.isVisible()) await page.getByRole("button", { name: "Toggle workspace navigation", exact: true }).click();
  await button.click();
}

test("actual mock sessions are explicit, labeled and shared by canonical aliases without role grants", async ({ page, demo }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/app");
  await expect(page.locator('[data-mode="server-demo"]')).toHaveCount(1);
  await expect(page.getByText("Developer/demo mode", { exact: true })).toBeVisible();
  await expect(page.getByText(
    "Server-backed fictional mock data. Seeded demo accounts are not verified participant identities.",
    { exact: true },
  )).toBeVisible();
  expect(demo.calls.filter((call) => call.method === "POST")).toEqual([]);
  for (const role of ["site_owner", "operator", "investor"] as const) {
    if (role === "operator") {
      await expectPerspectiveGlide(page, "Developer/demo sign-in", () => switchRole(page, demo, role));
    } else {
      await switchRole(page, demo, role);
    }
    await expect(page.getByRole("heading", { level: 1, name: roleTitle[role], exact: true })).toBeVisible();
    await expectCompactPerspectiveRow(page, "Developer/demo sign-in");
    const switches = demo.calls.filter((call) => call.method === "POST").length;
    await page.goto(`/dashboard/${role === "site_owner" ? "site-owner" : role}`);
    await expect(page).toHaveURL((url) => url.pathname === "/app");
    await expect(page.getByRole("heading", {
      level: 1, name: role === "site_owner" ? "Read your sites" : roleTitle[role], exact: true,
    })).toBeVisible();
    await expect(page.locator("main")).toHaveCount(1);
    await expectSelectedDemoRole(page, role);
    expect(demo.calls.filter((call) => call.method === "POST")).toHaveLength(switches);
  }
  const before = demo.calls.filter((call) => call.method === "POST").length;
  await page.goto("/dashboard/operator");
  await expect(page).toHaveURL((url) => url.pathname === "/app");
  await expectSelectedDemoRole(page, "investor");
  await expect(page.getByRole("heading", { level: 1, name: roleTitle.investor, exact: true })).toBeVisible();
  await page.reload();
  await expectSelectedDemoRole(page, "investor");
  expect(demo.calls.filter((call) => call.method === "POST")).toHaveLength(before);
  const cookie = (await page.context().cookies()).find((item) => item.name === "sunsum_session");
  expect(cookie).toBeDefined();
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  expect(cookie?.secure).toBe(true);
});

test("a deliberate mock role switch retires an older real read before its late response can publish", async ({ page, demo }) => {
  const project = MOCK_PROJECTS[0];
  if (!project) throw new Error("The actual mock store must have a project.");
  await page.goto("/app");
  await switchRole(page, demo, "operator");
  await expect(page.getByRole("heading", { name: roleTitle.operator, exact: true })).toBeVisible();
  await navigate(page, "Project pipeline");
  const pending = demo.holdNextResponse(`/api/submissions/${project.siteId}`);
  const switching = demo.holdNextResponse("/api/auth/demo-switch", "POST");
  try {
    await page.getByRole("button", { name: `Open ${project.name}`, exact: true }).click();
    await pending.started;
    const investor = demoRoleGroup(page).getByRole("button", { name: "Financier", exact: true });
    await expect(investor).toBeEnabled();
    demo.armRole("investor");
    const switched = observeDemoSwitch(page, "investor");
    await investor.click();
    await switching.started;
    const roles = demoRoleGroup(page);
    await expect(roles).toHaveCount(1);
    await expect(roles).toHaveAttribute("aria-busy", "true");
    await expect(roles.getByRole("button")).toHaveCount(3);
    for (const control of await roles.getByRole("button").all()) await expect(control).toBeDisabled();
    await expect(demoRoleControl(page, "investor")).toHaveText("Signing in...");
    await expect(roles.locator('button[aria-current="true"]')).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText(project.name);
    const readsDuringSwitch = demo.calls.filter((call) => call.path === "/api/me").length;
    pending.release();
    await pending.settled;
    expect(demo.calls.filter((call) => call.path === "/api/me")).toHaveLength(readsDuringSwitch);
    await expect(page.getByRole("region", { name: "Stored record detail", exact: true })).toHaveCount(0);
    switching.release();
    const [switchedResponse, identity] = await switched;
    expect(switchedResponse.status()).toBe(200);
    expect(switchedResponse.request().postData()).toBe('{"role":"investor"}');
    expect(await identity.json()).toMatchObject({ user_id: DEMO_INVESTOR_USER_ID, role: "investor" });
    demo.clearWrites();
    await expect(page.getByRole("heading", { name: roleTitle.investor, exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Stored record detail", exact: true })).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText(project.siteAddressRaw);
    await expect(page.locator("main")).not.toContainText("ava.mitchell@example.org");
    expect(demo.calls.filter((call) => call.method === "POST").map((call) => call.path)).toEqual([
      "/api/auth/demo-switch", "/api/auth/demo-switch",
    ]);
  } finally {
    pending.release();
    switching.release();
  }
});

test("actual mock interest uses {} once, preserves its pending lifetime, then reconciles 201 and duplicate 409", async ({ page, demo }, info) => {
  const targets = MOCK_PROJECTS.filter((project) => project.visibleToInvestors).slice(1);
  const projectIndex = ["desktop", "tablet", "mobile"].indexOf(info.project.name);
  const project = targets[projectIndex];
  if (!project) throw new Error("Each configured browser project requires a distinct unengaged mock project.");
  const path = `/api/projects/${project.id}/engagements`;
  await page.goto("/app");
  await switchRole(page, demo, "investor");
  await expect(page.getByRole("heading", { name: roleTitle.investor, exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: /mandate/i }).uncheck();
  await page.getByRole("button", { name: `Open ${project.name}`, exact: true }).click();
  await expect(page.locator("main")).toContainText(/locked|tier[- ]zero|tier 0/i);
  expect(demo.calls.some((call) => call.path === `/api/projects/${project.id}/deal-room`)).toBe(false);
  const priorReads = demo.calls.filter((call) => call.path === "/api/me/engagements").length;
  const pending = demo.holdNextResponse(path, "POST");
  const received = page.waitForResponse((response) =>
    new URL(response.url()).pathname === path && response.request().method() === "POST");
  demo.armInterest(project.id);
  try {
    await page.getByRole("button", { name: "Register nonbinding interest", exact: true }).click();
    await pending.started;
    await expect(demoRoleControl(page, "operator")).toBeDisabled();
    expect(demo.calls.filter((call) => call.path === path && call.method === "POST")).toHaveLength(1);
    pending.release();
    await pending.settled;
    const response = await received;
    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject({
      investor_id: DEMO_INVESTOR_ID, project_id: project.id,
      funding_need_id: null, state: "interested", is_binding: false,
    });
    await expect.poll(() => demo.calls.filter((call) => call.path === "/api/me/engagements").length)
      .toBeGreaterThan(priorReads);
    await expect(demoRoleControl(page, "operator")).toBeEnabled();
    await expect(page.locator("main")).toContainText(/nonbinding interest (?:is |was )?(?:registered|recorded)|current engagement.*interested/i);
    demo.clearWrites();
    await navigate(page, "Reports");
    await page.goBack();
    await page.reload();
    await expectSelectedDemoRole(page, "investor");
    expect(demo.calls.filter((call) => call.path === path && call.method === "POST")).toHaveLength(1);

    // Separate endpoint probe: real browser-origin checks and the legitimately issued mock cookie remain in force.
    demo.armInterest(project.id);
    const duplicate = await page.evaluate(async (endpoint) => {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "content-type": "application/json" }, body: "{}",
      });
      const body: unknown = await response.json();
      return { status: response.status, body };
    }, path);
    expect(duplicate).toMatchObject({ status: 409, body: { code: "conflict" } });
    demo.clearWrites();
    await switchRole(page, demo, "operator");
    await expect(page.getByRole("heading", { name: roleTitle.operator, exact: true })).toBeVisible();
    demo.armInterest(project.id);
    const refused = await page.evaluate(async (endpoint) => {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "content-type": "application/json" }, body: "{}",
      });
      const body: unknown = await response.json();
      return { status: response.status, body };
    }, path);
    expect(refused).toMatchObject({ status: 403, body: { code: "forbidden_role" } });
    demo.clearWrites();
    expect(demo.calls.filter((call) => call.path === path && call.method === "POST")
      .every((call) => call.body === "{}")).toBe(true);
  } finally {
    pending.release();
  }
});
