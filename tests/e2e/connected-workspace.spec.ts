import { expect, test as base, type Download, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { DEMO_INVESTOR_ID, DEMO_SITE_OWNER_USER_ID } from "../../src/backend/demo-principals";
import type { EngagementPayload } from "../../src/backend/core/engagements/workflows";
import {
  createSyntheticLiveReadFixtures,
  installSyntheticBrowserAudit,
  syntheticLocalOrigin,
  syntheticStorageState,
  SYNTHETIC_SAVE_CANARIES,
  SYNTHETIC_LIVE_READ_PDF,
  SYNTHETIC_LIVE_READ_IDS,
  type SyntheticBrowserAudit,
  type SyntheticLiveReadFixtures,
  type SyntheticLiveReadResponse,
  type SyntheticResponseOverride,
  type SyntheticTrafficObservation,
  type SyntheticInterestOutcome,
  type SyntheticInterestRefusal,
} from "../fixtures/live-read-contracts";

const audits = new WeakMap<Page, SyntheticBrowserAudit>();
const test = base.extend<{ audit: SyntheticBrowserAudit }>({
  storageState: async ({ baseURL }, provide) => {
    await provide(syntheticStorageState(syntheticLocalOrigin(baseURL)));
  },
  audit: [async ({ page, baseURL }, provide) => {
    const audit = await installSyntheticBrowserAudit(page, syntheticLocalOrigin(baseURL));
    audits.set(page, audit);
    try {
      await provide(audit);
    } finally {
      const storage = await audit.storageSnapshot();
      expect({
        unexpectedTraffic: audit.unexpected,
        storageAcrossDocuments: audit.storageAttempts,
        storageInCurrentDocument: storage.attempts,
        retainedCanaries: storage.canaries,
        pageErrors: audit.errors,
      }).toEqual({
        unexpectedTraffic: [], storageAcrossDocuments: [], storageInCurrentDocument: [],
        retainedCanaries: SYNTHETIC_SAVE_CANARIES, pageErrors: [],
      });
      audits.delete(page);
    }
  }, { auto: true }],
});

test.use({ actionTimeout: 10_000, serviceWorkers: "block" });

async function intercept(
  page: Page,
  fixtures: SyntheticLiveReadFixtures,
  override?: SyntheticResponseOverride,
) {
  const audit = audits.get(page);
  if (!audit) throw new Error("Connected request/storage audit was not installed.");
  audit.useFixtures(fixtures, override);
  return audit;
}

async function navigate(page: Page, name: string) {
  const button = page.getByRole("navigation", { name: "Connected workspace" })
    .getByRole("button", { name, exact: true });
  if (!await button.isVisible()) {
    await page.getByRole("button", { name: "Toggle workspace navigation", exact: true }).click();
  }
  await button.click();
}

function jsonFailure(response: SyntheticLiveReadResponse, status: number): SyntheticLiveReadResponse {
  return {
    ...response, status, contentType: "application/json",
    body: JSON.stringify({ code: status === 401 ? "unauthenticated" : "forbidden_role",
      message: "Synthetic contract refusal; no real service was contacted." }),
  };
}

function expectReadOnly(calls: readonly SyntheticTrafficObservation[]) {
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.every((call) => call.method === "GET")).toBe(true);
  expect(calls.filter((call) => call.violation !== null)).toEqual([]);
}

function heldResponse() {
  let release = () => {};
  let started = () => {};
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  const received = new Promise<void>((resolve) => { started = resolve; });
  return { waiting, received, release, started };
}

function interestFixtures(outcome?: SyntheticInterestOutcome) {
  return createSyntheticLiveReadFixtures("investor", {
    investorEngaged: false,
    interest: {
      investorId: SYNTHETIC_LIVE_READ_IDS.investorId, projectId: SYNTHETIC_LIVE_READ_IDS.projectId,
      ...(outcome === undefined ? {} : { outcome }),
    },
  });
}

function expectOnlyScopedInterest(calls: readonly SyntheticTrafficObservation[], projectId: string, count: number) {
  const commands = calls.filter((call) => call.method !== "GET");
  expect(commands).toHaveLength(count);
  for (const command of commands) expect(command).toMatchObject({
    path: `/api/projects/${projectId}/engagements`, method: "POST", postData: "{}", violation: null,
  });
  expect(calls.filter((call) => call.violation !== null)).toEqual([]);
}

async function openLockedProject(page: Page, fixtures: SyntheticLiveReadFixtures) {
  await page.goto(`/app?view=portfolio&project=${fixtures.ids.projectId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Synthetic project", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Stored record detail", exact: true }))
    .toContainText(/locked|tier[- ]zero|tier 0/i);
  await expect(page.getByRole("button", { name: "Register nonbinding interest", exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Investor", exact: true })).toBeChecked();
}

async function assertNoPrivatePersistence(page: Page, values: readonly string[]) {
  const persisted = await page.evaluate(() => ({
    local: Object.fromEntries(Object.entries(localStorage)),
    session: Object.fromEntries(Object.entries(sessionStorage)),
    history: window.history.state,
  }));
  const serialized = JSON.stringify(persisted);
  for (const value of values) expect(serialized).not.toContain(value);
}

const CREATED_INTEREST = /nonbinding interest (?:is |was |has been )?(?:registered|recorded)|registered nonbinding interest/i;
const UNKNOWN_INTEREST = /outcome (?:is )?unknown|may have (?:completed|been recorded)|cannot confirm.*(?:interest|outcome)/i;

async function repeatedFilter(
  region: Locator,
  name: string,
  choices: readonly { value: string; label: RegExp }[],
) {
  const listbox = region.getByRole("listbox", { name, exact: true });
  if (await listbox.count() === 1) {
    await listbox.selectOption(choices.map((choice) => choice.value));
    return;
  }
  const group = region.getByRole("group", { name, exact: true });
  await expect(group).toHaveCount(1);
  for (const checkbox of await group.getByRole("checkbox").all()) await checkbox.uncheck();
  for (const choice of choices) await group.getByRole("checkbox", { name: choice.label }).check();
}

function endpointCalls(calls: readonly SyntheticTrafficObservation[], paths: readonly string[]) {
  return calls.filter((call) => paths.includes(new URL(call.url).pathname));
}

async function queryChange(page: Page, path: string, matches: (params: URLSearchParams) => boolean, act: () => Promise<unknown>) {
  const completed = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === path && matches(url.searchParams);
  });
  await act();
  await completed;
  await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "false");
}

async function expectNoDownloadAfterCompletion(page: Page, downloads: readonly Download[]) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  expect(downloads).toEqual([]);
  await expect(page.waitForEvent("download", { timeout: 300 })).rejects.toThrow(/Timeout.*download/s);
  expect(downloads).toEqual([]);
}

for (const role of ["site-owner", "operator", "investor"] as const) {
  test(`mocked ${role} contract renders one granted role without browser fixtures or writes`, async ({ page }, info) => {
    const fixtures = createSyntheticLiveReadFixtures(role);
    const { calls, errors } = await intercept(page, fixtures);
    await page.goto("/app?role=operator");
    const title = role === "site-owner" ? "Your sites, in context" :
      role === "operator" ? "Your Action Center" : "Explore your permitted portfolio";
    await expect(page.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
    const group = page.getByRole("group", { name: "Workspace role", exact: true });
    for (const [value, label] of [
      ["site-owner", "Site owner"], ["operator", "Operator"], ["investor", "Investor"],
    ] as const) {
      const control = group.getByRole("radio", { name: label, exact: true });
      if (value === role) await expect(control).toBeChecked();
      else await expect(control).toBeDisabled();
    }
    await expect(page.getByRole("combobox", { name: "Records per page", exact: true })).toHaveValue("25");
    await expect(page.locator("[data-concept]")).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("Sweet Auburn rooftop");
    await page.getByRole("button", { name: "Notifications", exact: true }).click();
    await expect(page.getByRole("region", { name: "Notifications", exact: true })).toContainText("marks nothing read");
    await page.getByRole("button", { name: "Close notifications", exact: true }).click();
    for (const size of ["50", "100", "25"]) {
      await page.getByRole("combobox", { name: "Records per page", exact: true }).selectOption(size);
      await expect(page.getByRole("combobox", { name: "Records per page", exact: true })).toHaveValue(size);
    }
    const dark = page.getByRole("switch", { name: "Dark appearance", exact: true });
    if (await dark.getAttribute("aria-checked") !== "true") await dark.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`mocked-${role}-read-only-dark.png`), fullPage: true, animations: "disabled" });
    expectReadOnly(calls);
    expect(errors).toEqual([]);
  });
}

test("mocked operator work precedes metrics and reports preserve the exact collection context", async ({ page }) => {
  const fixtures = createSyntheticLiveReadFixtures("operator");
  const { calls, errors } = await intercept(page, fixtures);
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Your Action Center", exact: true })).toBeVisible();
  const order = await page.locator("main h2").allTextContents();
  expect(order).toContain("Read the work ahead");
  expect(order).toContain("Pipeline facts");
  expect(order.indexOf("Read the work ahead")).toBeLessThan(order.indexOf("Pipeline facts"));
  await navigate(page, "Project pipeline");
  const search = page.getByRole("textbox", { name: "Search permitted records", exact: true });
  await search.fill("Synthetic");
  await page.getByRole("combobox", { name: "Sort records", exact: true }).selectOption("stage-desc");
  await page.getByRole("combobox", { name: "Records per page", exact: true }).selectOption("50");
  await page.getByRole("button", { name: "Cards", exact: true }).click();
  await search.focus();
  await navigate(page, "Reports");
  await expect(page.getByRole("heading", { name: "One clearly scoped manifest", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to collection", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Read the project pipeline", exact: true })).toBeVisible();
  await expect(search).toHaveValue("Synthetic");
  await expect(search).toBeFocused();
  await expect(page.getByRole("combobox", { name: "Sort records", exact: true })).toHaveValue("stage-desc");
  await expect(page.getByRole("combobox", { name: "Records per page", exact: true })).toHaveValue("50");
  await expect(page.getByRole("button", { name: "Cards", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Open Synthetic project", exact: true }).click();
  await expect(page.getByRole("region", { name: "Stored record detail", exact: true })).toContainText("Stored human override");
  await page.getByRole("button", { name: "Back to collection", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Read the project pipeline", exact: true })).toBeVisible();
  expectReadOnly(calls);
  expect(errors).toEqual([]);
});

test("mocked permitted metadata, original bytes and export manifests stay different artifacts", async ({ page }) => {
  const fixtures = createSyntheticLiveReadFixtures("site-owner");
  const { calls, errors } = await intercept(page, fixtures);
  await page.goto(`/app?view=documents&scope=${fixtures.ids.siteId}`);
  await expect(page.getByRole("region", { name: "Permitted document metadata", exact: true })).toContainText("Synthetic report.pdf");
  await page.getByText("File history and original", { exact: true }).click();
  const originalReady = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download original: Synthetic report.pdf", exact: true }).click();
  const original = await originalReady;
  const originalPath = await original.path();
  if (!originalPath) throw new Error("The synthetic original download has no local path.");
  expect(await readFile(originalPath, "utf8")).toBe(SYNTHETIC_LIVE_READ_PDF);
  expect(original.suggestedFilename()).toMatch(/\.pdf$/);
  await navigate(page, "Reports");
  await page.getByRole("button", { name: "Load permitted export preview", exact: true }).click();
  await expect(page.getByText("Synthetic caller-scoped records", { exact: true })).toBeVisible();
  const before = calls.filter((call) => call.path === "/api/export?format=json").length;
  const csvReady = page.waitForEvent("download");
  await page.getByRole("button", { name: "Refresh and download CSV", exact: true }).click();
  const csv = await csvReady;
  const csvPath = await csv.path();
  if (!csvPath) throw new Error("The synthetic CSV download has no local path.");
  const contents = await readFile(csvPath, "utf8");
  expect(csv.suggestedFilename()).toMatch(/\.csv$/);
  expect(contents).toContain("Synthetic project");
  expect(contents).not.toContain("%PDF");
  expect(contents).not.toContain("content_url");
  expect(calls.filter((call) => call.path === "/api/export?format=json").length).toBe(before + 1);
  expectReadOnly(calls);
  expect(errors).toEqual([]);
});

for (const format of ["json", "csv"] as const) {
  test(`TEST-3 ${format} download contains release B and none of preview A`, async ({ page }) => {
    const preview = createSyntheticLiveReadFixtures("site-owner", { exportPhase: "preview-a" });
    const release = createSyntheticLiveReadFixtures("site-owner", { exportPhase: "release-b" });
    const oldRecord = preview.records[0];
    const newRecord = release.records[0];
    if (!oldRecord || !newRecord) throw new Error("Missing synthetic export scenario records.");
    let exportReads = 0;
    let released = false;
    const downloads: Download[] = [];
    page.on("download", (download) => downloads.push(download));
    const { calls } = await intercept(page, preview, (path) => {
      if (path === "/api/export?format=json") {
        exportReads += 1;
        released = exportReads >= 2;
      }
      return (released ? release : preview).responseFor(path);
    });
    await page.goto("/app?view=reports");
    const report = page.getByRole("region", { name: "Permitted export", exact: true });
    await report.getByRole("button", { name: "Load permitted export preview", exact: true }).click();
    await expect(report.getByText("SYNTHETIC PREVIEW A SCOPE ONLY", { exact: true })).toBeVisible();
    await expect(report.getByText(oldRecord.name, { exact: true })).toBeVisible();
    expect(downloads).toEqual([]);
    const downloaded = page.waitForEvent("download");
    await report.getByRole("button", { name: `Refresh and download ${format.toUpperCase()}`, exact: true }).click();
    const download = await downloaded;
    const path = await download.path();
    if (!path) throw new Error("The reread export produced no inspectable download.");
    const contents = await readFile(path, "utf8");
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${format}$`));
    for (const retired of [
      oldRecord.id, oldRecord.documentId, oldRecord.name, oldRecord.documentName,
      "SYNTHETIC PREVIEW A SCOPE ONLY",
    ]) expect(contents).not.toContain(retired);
    if (format === "json") {
      const payload: unknown = JSON.parse(contents);
      expect(payload).toMatchObject({
        scopeLabel: "SYNTHETIC RELEASE B SCOPE ONLY",
        projects: expect.arrayContaining([expect.objectContaining({ projectId: newRecord.id, name: newRecord.name })]),
        documents: [expect.objectContaining({ id: newRecord.documentId, fileName: newRecord.documentName })],
      });
    } else {
      for (const fresh of [
        newRecord.id, newRecord.documentId, newRecord.name, newRecord.documentName,
        "SYNTHETIC RELEASE B SCOPE ONLY",
      ]) expect(contents).toContain(`"${fresh}"`);
    }
    expect(contents).not.toContain("%PDF");
    expect(contents).not.toContain("content_url");
    await expect(report).toHaveAttribute("aria-busy", "false");
    await expect(report.getByText(newRecord.name, { exact: true })).toBeVisible();
    await expect(report.getByText(oldRecord.name, { exact: true })).toHaveCount(0);
    expect(downloads).toHaveLength(1);
    expect(exportReads).toBe(2);
    expect(calls.filter((call) => call.path === "/api/export?format=json")).toHaveLength(2);
  });

  for (const failure of ["denied", "expired", "malformed", "changed-identity"] as const) {
    test(`TEST-3 ${format} reread ${failure} cannot download or reuse preview A`, async ({ page }) => {
      const preview = createSyntheticLiveReadFixtures("site-owner", { exportPhase: "preview-a" });
      const release = createSyntheticLiveReadFixtures("site-owner", { exportPhase: "release-b" });
      const oldRecord = preview.records[0];
      if (!oldRecord) throw new Error("Missing synthetic preview record.");
      let exportReads = 0;
      let rereading = false;
      const downloads: Download[] = [];
      page.on("download", (download) => downloads.push(download));
      await intercept(page, preview, (path, response) => {
        if (path === "/api/export?format=json") {
          exportReads += 1;
          rereading = exportReads >= 2;
          if (rereading && (failure === "denied" || failure === "expired")) {
            return jsonFailure(response, failure === "expired" ? 401 : 403);
          }
          if (rereading && failure === "malformed") return { ...response, body: '{"incorrect":"manifest"}' };
        }
        if (rereading && failure === "changed-identity" && path === "/api/me") {
          return { ...response, body: JSON.stringify({ user_id: preview.ids.operatorUserId, role: "site_owner" }) };
        }
        return (rereading ? release : preview).responseFor(path);
      });
      await page.goto("/app?view=reports");
      const report = page.getByRole("region", { name: "Permitted export", exact: true });
      await report.getByRole("button", { name: "Load permitted export preview", exact: true }).click();
      await expect(report.getByText("SYNTHETIC PREVIEW A SCOPE ONLY", { exact: true })).toBeVisible();
      await expect(report.getByText(oldRecord.name, { exact: true })).toBeVisible();
      await report.getByRole("button", { name: `Refresh and download ${format.toUpperCase()}`, exact: true }).click();
      const title = failure === "denied" ? "This information is outside your current access" :
        failure === "expired" ? "Your existing service sign-in is needed" :
          failure === "malformed" ? "The service response could not be understood" : "Your service context changed";
      await expect(page.getByRole("status").getByText(title, { exact: true })).toBeVisible();
      if (failure === "malformed") {
        await expect(report).toHaveAttribute("aria-busy", "false");
        await expect(report.getByText("SYNTHETIC PREVIEW A SCOPE ONLY", { exact: true })).toHaveCount(0);
        await expect(report.getByText(oldRecord.name, { exact: true })).toHaveCount(0);
        await expect(report.getByRole("button", { name: "Refresh and download JSON", exact: true })).toBeDisabled();
        await expect(report.getByRole("button", { name: "Refresh and download CSV", exact: true })).toBeDisabled();
      } else {
        await expect(report).toHaveCount(0);
        await expect(page.getByRole("region", { name: "Permitted record collection", exact: true })).toHaveCount(0);
        await expect(page.locator("main")).not.toContainText(oldRecord.name);
        await expect(page.locator("main")).not.toContainText("SYNTHETIC PREVIEW A SCOPE ONLY");
      }
      // Visible terminal status, retired/cleared preview, and settled rendering
      // precede the absence assertion; request counts alone are not an oracle.
      await expectNoDownloadAfterCompletion(page, downloads);
      expect(exportReads).toBe(2);
    });
  }
}

test("TEST-7 filtered page-two selection survives detail, Documents, Reports and browser history", async ({ page }) => {
  const fixtures = createSyntheticLiveReadFixtures("operator", { collectionScenario: "page-two" });
  const matching = fixtures.records.filter((record) => record.continuityMatch)
    .sort((left, right) => left.name.localeCompare(right.name, "en"));
  const expectedPage = matching.slice(50, 100);
  const selected = expectedPage[3];
  if (matching.length !== 60 || expectedPage.length !== 10 || !selected) {
    throw new Error("The page-two scenario must contain 60 matching records and a nonfirst page-two selection.");
  }
  await intercept(page, fixtures);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/app?view=pipeline");
  const collection = page.getByRole("region", { name: "Permitted record collection", exact: true });
  const results = page.getByRole("region", { name: "Permitted projects and sites", exact: true });
  await expect(page.getByRole("heading", { name: "Read the project pipeline", exact: true })).toBeVisible();
  await collection.getByRole("textbox", { name: "Search permitted records", exact: true }).fill("Continuity");
  await expect(collection.getByText("1-25 of 62 matching loaded records", { exact: true })).toBeVisible();
  await collection.getByRole("combobox", { name: "Lifecycle stage", exact: true }).selectOption("pre-development");
  await expect(collection.getByText("1-25 of 61 matching loaded records", { exact: true })).toBeVisible();
  await collection.getByRole("combobox", { name: "Site type", exact: true }).selectOption("rooftop");
  await expect(collection.getByText("1-25 of 60 matching loaded records", { exact: true })).toBeVisible();
  await collection.getByRole("combobox", { name: "Sort records", exact: true }).selectOption("name");
  await collection.getByRole("combobox", { name: "Records per page", exact: true }).selectOption("50");
  await collection.getByRole("button", { name: "Cards", exact: true }).click();
  await collection.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(collection.getByText("51-60 of 60 matching loaded records", { exact: true })).toBeVisible();
  const open = results.getByRole("button", { name: `Open ${selected.name}`, exact: true });
  await results.getByRole("button", { name: `Select ${selected.name}`, exact: true }).click();
  await expect(results.getByRole("button", { name: `Select ${selected.name}`, exact: true })).toHaveAttribute("aria-pressed", "true");
  await open.focus();
  await open.click();
  await expect(page.getByRole("heading", { level: 1, name: selected.name, exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Stored record detail", exact: true })).toContainText(selected.documentName);
  await expect(page).toHaveURL((url) => url.searchParams.get("project") === selected.id && url.searchParams.get("scope") === selected.id);
  await navigate(page, "Documents");
  await expect(page.getByText(`Context: ${selected.name}`, { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Permitted document metadata", exact: true })).toContainText(selected.documentName);
  await expect(page).toHaveURL((url) => url.searchParams.get("view") === "documents" && url.searchParams.get("scope") === selected.id);
  await navigate(page, "Reports");
  await expect(page.getByRole("heading", { name: "One clearly scoped manifest", exact: true })).toBeVisible();
  await expect(page).toHaveURL((url) => url.searchParams.get("view") === "reports" && url.searchParams.get("scope") === selected.id);

  const assertRestoredCollection = async () => {
    await expect(page.getByRole("heading", { name: "Read the project pipeline", exact: true })).toBeVisible();
    await expect(collection.getByRole("textbox", { name: "Search permitted records", exact: true })).toHaveValue("Continuity");
    await expect(collection.getByRole("combobox", { name: "Lifecycle stage", exact: true })).toHaveValue("pre-development");
    await expect(collection.getByRole("combobox", { name: "Site type", exact: true })).toHaveValue("rooftop");
    await expect(collection.getByRole("combobox", { name: "Sort records", exact: true })).toHaveValue("name");
    await expect(collection.getByRole("combobox", { name: "Records per page", exact: true })).toHaveValue("50");
    await expect(collection.getByRole("button", { name: "Cards", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(collection.getByText("Page 2 of 2", { exact: true })).toBeVisible();
    await expect(collection.getByText("51-60 of 60 matching loaded records", { exact: true })).toBeVisible();
    expect(await results.locator("[data-project-id]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-project-id"))))
      .toEqual(expectedPage.map((record) => record.id));
    await expect(results.locator(`[data-project-id="${selected.id}"]`)).toHaveAttribute("data-selected", "true");
    await expect(results.getByRole("button", { name: `Select ${selected.name}`, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL((url) => url.searchParams.get("view") === "pipeline" &&
      url.searchParams.get("scope") === selected.id && !url.searchParams.has("project"));
    await expect(open).toBeFocused();
  };

  await page.getByRole("button", { name: "Back to collection", exact: true }).click();
  await assertRestoredCollection();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "One clearly scoped manifest", exact: true })).toBeVisible();
  await expect(page).toHaveURL((url) => url.searchParams.get("view") === "reports" && url.searchParams.get("scope") === selected.id);
  await page.goBack();
  await expect(page.getByText(`Context: ${selected.name}`, { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Permitted document metadata", exact: true })).toContainText(selected.documentName);
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: selected.name, exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Stored record detail", exact: true })).toContainText(selected.documentName);
  await page.goBack();
  await assertRestoredCollection();
});

test("faccb47 native history restores the historical record, not the last unrelated open or refresh focus", async ({ page }) => {
  const fixtures = createSyntheticLiveReadFixtures("operator", { collectionScenario: "page-two" });
  const first = fixtures.records[1];
  const second = fixtures.records[2];
  if (!first || !second) throw new Error("The native-history case requires two visible distinct fixture records.");
  const audit = await intercept(page, fixtures);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/app?view=pipeline");
  const results = page.getByRole("region", { name: "Permitted projects and sites", exact: true });
  await page.getByRole("combobox", { name: "Sort records", exact: true }).selectOption("name");
  const firstOpen = results.getByRole("button", { name: `Open ${first.name}`, exact: true });
  const secondOpen = results.getByRole("button", { name: `Open ${second.name}`, exact: true });
  await results.getByRole("button", { name: `Select ${first.name}`, exact: true }).click();
  await firstOpen.click();
  await expect(page.getByRole("heading", { level: 1, name: first.name, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to collection", exact: true }).click();
  await expect(firstOpen).toBeFocused();
  await secondOpen.click();
  await expect(page.getByRole("heading", { level: 1, name: second.name, exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL((url) => url.searchParams.get("scope") === first.id && !url.searchParams.has("project"));
  await expect(results.locator(`[data-project-id="${first.id}"]`)).toHaveAttribute("data-selected", "true");
  await expect(firstOpen).toBeFocused();
  await expect(secondOpen).not.toBeFocused();
  await page.goForward();
  await expect(page.getByRole("heading", { level: 1, name: second.name, exact: true })).toBeVisible();
  await page.goBack();
  await expect(firstOpen).toBeFocused();
  await page.getByRole("button", { name: "Refresh permitted reads", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Read the project pipeline", exact: true })).toBeVisible();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(firstOpen).not.toBeFocused();
  await expect(secondOpen).not.toBeFocused();
  const search = page.getByRole("textbox", { name: "Search permitted records", exact: true });
  await search.focus();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(search).toBeFocused();
  expectReadOnly(audit.calls);
});

test("25/50/100 paging, sorting, layout and local facets never send unsupported or needless collection requests", async ({ page }) => {
  const fixtures = createSyntheticLiveReadFixtures("operator", { collectionScenario: "page-two" });
  const audit = await intercept(page, fixtures);
  await page.goto("/app?view=pipeline");
  const collection = page.getByRole("region", { name: "Permitted record collection", exact: true });
  const results = page.getByRole("region", { name: "Permitted projects and sites", exact: true });
  await expect(collection.getByText("1-25 of 65 matching loaded records", { exact: true })).toBeVisible();
  const before = audit.calls.filter((call) => ["/api/pipeline", "/api/submissions"].includes(new URL(call.url).pathname)).length;
  for (const [size, visible] of [["50", 50], ["100", 65], ["25", 25]] as const) {
    await collection.getByRole("combobox", { name: "Records per page", exact: true }).selectOption(size);
    await expect(results.locator("[data-project-id]")).toHaveCount(visible);
    await expect(collection.getByText(`1-${visible} of 65 matching loaded records`, { exact: true })).toBeVisible();
  }
  await collection.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(collection.getByText("26-50 of 65 matching loaded records", { exact: true })).toBeVisible();
  await collection.getByRole("combobox", { name: "Sort records", exact: true }).selectOption("name");
  await collection.getByRole("button", { name: "Cards", exact: true }).click();
  await collection.getByRole("textbox", { name: "Search permitted records", exact: true }).fill("Continuity");
  await collection.getByRole("combobox", { name: "Lifecycle stage", exact: true }).selectOption("pre-development");
  await collection.getByRole("combobox", { name: "Site type", exact: true }).selectOption("rooftop");
  await expect(collection.getByText("1-25 of 60 matching loaded records", { exact: true })).toBeVisible();
  expect(audit.calls.filter((call) => ["/api/pipeline", "/api/submissions"].includes(new URL(call.url).pathname))).toHaveLength(before);
  for (const call of audit.calls) {
    const params = new URL(call.url).searchParams;
    for (const key of ["page", "page_size", "limit", "offset", "search", "sort", "display", "site_type"]) {
      expect(params.has(key)).toBe(false);
    }
  }
  expectReadOnly(audit.calls);
});

test("actor replacement retires page-two selection, local collection state and historical private context", async ({ page }) => {
  const operator = createSyntheticLiveReadFixtures("operator", { collectionScenario: "page-two" });
  const owner = createSyntheticLiveReadFixtures("site-owner");
  const audit = await intercept(page, operator);
  await page.goto("/app?view=pipeline");
  const search = page.getByRole("textbox", { name: "Search permitted records", exact: true });
  await search.fill("Continuity");
  await page.getByRole("combobox", { name: "Records per page", exact: true }).selectOption("50");
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  const selected = page.getByRole("region", { name: "Permitted projects and sites", exact: true }).getByRole("button", { name: /^Open / }).nth(3);
  await selected.click();
  await expect(page.getByRole("region", { name: "Stored record detail", exact: true })).toContainText("Continuity");
  await navigate(page, "Documents");
  audit.useFixtures(owner);
  await page.getByRole("button", { name: "Refresh permitted reads", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Site owner", exact: true })).toBeChecked();
  await expect(page.locator("main")).not.toContainText("Continuity record");
  const back = page.getByRole("button", { name: "Back to collection", exact: true });
  if (await back.count() !== 0) await back.click();
  await expect(search).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Records per page", exact: true })).toHaveValue("25");
  await page.goBack();
  await expect(page.getByRole("radio", { name: "Site owner", exact: true })).toBeChecked();
  await expect(page.locator("main")).not.toContainText("Continuity record");
  expectReadOnly(audit.calls);
});

test("investor service filters send repeated stage, viability, exact project_type and deliberate mandate true/false", async ({ page }) => {
  const fixtures = createSyntheticLiveReadFixtures("investor", { collectionScenario: "page-two" });
  const audit = await intercept(page, fixtures);
  await page.goto("/app?view=portfolio");
  await expect(page.getByRole("heading", { name: "Explore your permitted portfolio", exact: true })).toBeVisible();
  const filters = page.getByRole("region", { name: "Service filters", exact: true });
  const mandate = filters.getByRole("checkbox", { name: /Only projects matching the stored mandate/ });
  await expect(mandate).toBeChecked();
  const initial = endpointCalls(audit.calls, ["/api/portfolio"]);
  expect(initial.length).toBeGreaterThan(0);
  expect(initial.every((call) => new URL(call.url).searchParams.get("mandate_match") === "true")).toBe(true);
  await queryChange(page, "/api/portfolio", (params) => params.getAll("stage").length === 2, () =>
    repeatedFilter(filters, "Project stage", [
      { value: "pre_development", label: /^Pre[- ]development$/i }, { value: "operations", label: /^Operations$/i },
    ]));
  await queryChange(page, "/api/portfolio", (params) => params.get("viability") === "potentially_viable", () =>
    filters.getByRole("combobox", { name: "Service viability", exact: true }).selectOption("potentially_viable"));
  await queryChange(page, "/api/portfolio", (params) => params.get("project_type") === "synthetic_project_type", () =>
    filters.getByRole("combobox", { name: "Project type", exact: true }).selectOption("synthetic_project_type"));
  const before = endpointCalls(audit.calls, ["/api/portfolio"]).length;
  await queryChange(page, "/api/portfolio", (params) => params.get("mandate_match") === "false", () => mandate.uncheck());
  const request = endpointCalls(audit.calls, ["/api/portfolio"]).at(-1);
  if (!request) throw new Error("The explicit investor filter request was not observed.");
  const params = new URL(request.url).searchParams;
  expect(params.getAll("stage")).toEqual(["pre_development", "operations"]);
  expect(params.get("viability")).toBe("potentially_viable");
  expect(params.get("project_type")).toBe("synthetic_project_type");
  expect(params.get("mandate_match")).toBe("false");
  expect([...new Set(params.keys())].sort()).toEqual(["mandate_match", "project_type", "stage", "viability"]);
  expect(endpointCalls(audit.calls, ["/api/portfolio"])).toHaveLength(before + 1);
  await expect(page.getByText("1-25 of 64 matching loaded records", { exact: true })).toBeVisible();
  await queryChange(page, "/api/portfolio", (query) => query.get("mandate_match") === "true", () => mandate.check());
  await expect(page.getByText("1-25 of 63 matching loaded records", { exact: true })).toBeVisible();
  expectReadOnly(audit.calls);
});

test("operator service filters share exact repeated status/type/viability/applied raw-location queries without persisting address text", async ({ page }) => {
  const fixtures = createSyntheticLiveReadFixtures("operator", { collectionScenario: "page-two" });
  const audit = await intercept(page, fixtures);
  await page.goto("/app?view=pipeline");
  const filters = page.getByRole("region", { name: "Service filters", exact: true });
  await expect(filters).toBeVisible();
  await queryChange(page, "/api/pipeline", (params) => params.getAll("status").length === 2, () =>
    repeatedFilter(filters, "Submission status", [
      { value: "submitted", label: /^Submitted$/i }, { value: "accepted", label: /^Accepted$/i },
    ]));
  await queryChange(page, "/api/pipeline", (params) => params.get("type") === "rooftop", () =>
    filters.getByRole("combobox", { name: "Service site type", exact: true }).selectOption("rooftop"));
  await queryChange(page, "/api/pipeline", (params) => params.get("viability") === "potentially_viable", () =>
    filters.getByRole("combobox", { name: "Service viability", exact: true }).selectOption("potentially_viable"));
  const address = "Synthetic private address / Continuity";
  const draft = filters.getByRole("searchbox", { name: "Service location", exact: true });
  const before = endpointCalls(audit.calls, ["/api/pipeline", "/api/submissions"]).length;
  await draft.fill(`  ${address}  `);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  expect(endpointCalls(audit.calls, ["/api/pipeline", "/api/submissions"])).toHaveLength(before);
  await queryChange(page, "/api/pipeline", (params) => params.get("location") === address, () =>
    filters.getByRole("button", { name: "Apply location", exact: true }).click());
  const sent = endpointCalls(audit.calls, ["/api/pipeline", "/api/submissions"]).slice(before);
  expect(sent).toHaveLength(2);
  expect(new Set(sent.map((call) => new URL(call.url).pathname))).toEqual(new Set(["/api/pipeline", "/api/submissions"]));
  expect(new URL(sent[0]?.url ?? "").search).toBe(new URL(sent[1]?.url ?? "").search);
  for (const request of sent) {
    const params = new URL(request.url).searchParams;
    expect(params.getAll("status")).toEqual(["submitted", "accepted"]);
    expect(params.get("type")).toBe("rooftop");
    expect(params.get("viability")).toBe("potentially_viable");
    expect(params.get("location")).toBe(address);
    expect([...new Set(params.keys())].sort()).toEqual(["location", "status", "type", "viability"]);
    expect(request.url).not.toContain(" ");
  }
  await expect(page.getByText("1-25 of 61 matching loaded records", { exact: true })).toBeVisible();
  await expect(draft).toHaveValue(address);
  expect(page.url()).not.toContain("Synthetic");
  await assertNoPrivatePersistence(page, [address, "Continuity"]);
  const unapplied = "Unapplied synthetic location & + /";
  await draft.fill(unapplied);
  const requestsBeforeNavigation = endpointCalls(audit.calls, ["/api/pipeline", "/api/submissions"]).length;
  await navigate(page, "Reports");
  await page.goBack();
  await expect(draft).toHaveValue(unapplied);
  await expect(filters.getByRole("combobox", { name: "Service site type", exact: true })).toHaveValue("rooftop");
  expect(endpointCalls(audit.calls, ["/api/pipeline", "/api/submissions"])).toHaveLength(requestsBeforeNavigation);
  await assertNoPrivatePersistence(page, [address, unapplied]);
  expectReadOnly(audit.calls);
});

for (const role of ["operator", "investor"] as const) {
  for (const order of ["old-first", "new-first"] as const) {
    test(`${role} ${order} filter completion cannot replace current results or clear another request's loading`, async ({ page }) => {
      const fixtures = createSyntheticLiveReadFixtures(role);
      const older = heldResponse();
      const newer = heldResponse();
      const endpoint = role === "operator" ? "/api/pipeline" : "/api/portfolio";
      let olderReturned = false;
      const audit = await intercept(page, fixtures, async (path, response) => {
        const url = new URL(path, "https://synthetic.invalid");
        if (url.pathname !== endpoint) return response;
        if (url.searchParams.get("viability") === "more_information_required") {
          older.started();
          await older.waiting;
          olderReturned = true;
        } else if (url.searchParams.get("viability") === "potentially_viable") {
          newer.started();
          await newer.waiting;
        }
        return response;
      });
      try {
        await page.goto(`/app?view=${role === "operator" ? "pipeline" : "portfolio"}`);
        await expect(page.getByRole("button", { name: "Open Synthetic project", exact: true })).toBeVisible();
        const viability = page.getByRole("region", { name: "Service filters", exact: true })
          .getByRole("combobox", { name: "Service viability", exact: true });
        await viability.selectOption("more_information_required");
        await older.received;
        await viability.selectOption("potentially_viable");
        await newer.received;
        await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "true");
        if (order === "old-first") {
          older.release();
          await expect.poll(() => olderReturned).toBe(true);
          await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
          await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "true");
          await expect(page.getByRole("button", { name: "Refreshing permitted reads...", exact: true })).toBeDisabled();
          newer.release();
        } else {
          newer.release();
          await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "false");
          await expect(page.getByRole("button", { name: "Open Synthetic project", exact: true })).toBeVisible();
          older.release();
          await expect.poll(() => olderReturned).toBe(true);
        }
        await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "false");
        await expect(viability).toHaveValue("potentially_viable");
        await expect(page.getByRole("button", { name: "Open Synthetic project", exact: true })).toBeVisible();
        await expect(page.getByRole("region", { name: "Permitted record collection", exact: true }))
          .not.toContainText("No loaded records match these filters.");
        expectReadOnly(audit.calls);
      } finally {
        older.release();
        newer.release();
      }
    });
  }
  test(`${role} filtered refusal cannot appear as unfiltered, fictional or empty complete success`, async ({ page }) => {
    const fixtures = createSyntheticLiveReadFixtures(role);
    const endpoint = role === "operator" ? "/api/pipeline" : "/api/portfolio";
    const audit = await intercept(page, fixtures, (path, response) => {
      const url = new URL(path, "https://synthetic.invalid");
      return url.pathname === endpoint && url.searchParams.has("viability")
        ? { ...response, status: 503, body: '{"code":"service_unavailable","message":"Synthetic filtered read unavailable"}' }
        : response;
    });
    await page.goto(`/app?view=${role === "operator" ? "pipeline" : "portfolio"}`);
    await expect(page.getByRole("button", { name: "Open Synthetic project", exact: true })).toBeVisible();
    await page.getByRole("region", { name: "Service filters", exact: true })
      .getByRole("combobox", { name: "Service viability", exact: true }).selectOption("more_information_required");
    await expect(page.getByRole("main")).toContainText(/unavailable|out of reach|partial snapshot/i);
    await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "false");
    await expect(page.getByRole("button", { name: "Open Synthetic project", exact: true })).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("Sweet Auburn");
    expectReadOnly(audit.calls);
  });
}

test("mocked investor detail never reveals private owner fields or original-file controls", async ({ page }) => {
  const fixtures = createSyntheticLiveReadFixtures("investor");
  const { calls, errors } = await intercept(page, fixtures);
  await page.goto(`/app?project=${fixtures.ids.projectId}`);
  const detail = page.getByRole("region", { name: "Stored record detail", exact: true });
  await expect(detail).toContainText("Released investor tier-1 metadata");
  await expect(detail).not.toContainText("Synthetic private address");
  await expect(detail).not.toContainText("Synthetic owner");
  await expect(detail).not.toContainText("owner@example.invalid");
  await expect(detail).not.toContainText("PRIVATE-CANARY");
  await page.getByText("File history and original", { exact: true }).click();
  await expect(page.getByRole("button", { name: /^Download original:/ })).toHaveCount(0);
  await navigate(page, "Documents");
  await expect(page.getByRole("region", { name: "Permitted document metadata", exact: true })).toContainText("Released investor tier-1 metadata");
  await navigate(page, "Activity");
  await expect(page.getByRole("region", { name: "Permitted record activity", exact: true })).toContainText("Not included in this projection");
  expect(calls.some((call) => call.path.startsWith("/api/submissions") || call.path.startsWith("/api/me/sites"))).toBe(false);
  expect(calls.some((call) => call.path.endsWith("/content"))).toBe(false);
  expectReadOnly(calls);
  expect(errors).toEqual([]);
});

test("mocked missing engagement stays locked without expressing interest", async ({ page }) => {
  const fixtures = createSyntheticLiveReadFixtures("investor", { investorEngaged: false });
  const { calls, errors } = await intercept(page, fixtures);
  await openLockedProject(page, fixtures);
  expect(calls.some((call) => call.path.endsWith("/deal-room"))).toBe(false);
  await navigate(page, "Documents");
  await expect(page.locator("main")).toContainText(/locked|tier[- ]zero|tier 0/i);
  await navigate(page, "Reports");
  await page.goBack();
  await page.goBack();
  await page.getByRole("button", { name: "Refresh permitted reads", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Investor", exact: true })).toBeChecked();
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("radio", { name: "Investor", exact: true })).toBeChecked();
  await page.reload();
  await expect(page.getByRole("radio", { name: "Investor", exact: true })).toBeChecked();
  expect(calls.some((call) => call.path.endsWith("/deal-room"))).toBe(false);
  expectReadOnly(calls);
  expect(errors).toEqual([]);
});

test("mocked absent original is not replaced by a generated file", async ({ page }) => {
  const fixtures = createSyntheticLiveReadFixtures("site-owner", { documentBytesAvailable: false });
  const { calls, errors } = await intercept(page, fixtures);
  let downloads = 0;
  page.on("download", () => { downloads += 1; });
  await page.goto(`/app?view=documents&scope=${fixtures.ids.siteId}`);
  await expect(page.getByText("Synthetic report.pdf", { exact: true })).toBeVisible();
  await page.getByText("File history and original", { exact: true }).click();
  await page.getByRole("button", { name: "Download original: Synthetic report.pdf", exact: true }).click();
  await expect(page.getByRole("status", { name: "Original download status", exact: true })).toContainText("This record or original file is unavailable");
  expect(downloads).toBe(0);
  expectReadOnly(calls);
  expect(errors).toEqual([]);
});

for (const failure of ["unauthenticated", "denied", "malformed", "network"] as const) {
  test(`mocked ${failure} read has no fictional success fallback`, async ({ page }) => {
    const fixtures = createSyntheticLiveReadFixtures("site-owner");
    const { calls } = await intercept(page, fixtures, (path, response) => {
      if (failure === "network" && path === "/api/me") return "network";
      if (path === "/api/me" && (failure === "unauthenticated" || failure === "denied")) {
        return jsonFailure(response, failure === "unauthenticated" ? 401 : 403);
      }
      if (failure === "malformed" && path === "/api/me/sites") return { ...response, body: '{"incorrect":"shape"}' };
      return response;
    });
    await page.goto("/app");
    const message = failure === "unauthenticated" ? "Your existing service sign-in is needed" :
      failure === "denied" ? "This information is outside your current access" :
        failure === "malformed" ? "The service response could not be understood" : "The service could not be reached";
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    await expect(page.locator("main")).not.toContainText("Sweet Auburn rooftop");
    await expect(page.getByRole("region", { name: "Permitted record collection", exact: true })).toHaveCount(0);
    expectReadOnly(calls);
  });
}

test("mocked identity expiry on refresh retires the visible scope", async ({ page }) => {
  const fixtures = createSyntheticLiveReadFixtures("site-owner");
  let expired = false;
  const { calls, errors } = await intercept(page, fixtures, (path, response) =>
    expired && path === "/api/me" ? jsonFailure(response, 401) : response);
  await page.goto("/app?view=sites");
  await expect(page.getByRole("button", { name: "Open Synthetic project", exact: true })).toBeVisible();
  expired = true;
  await page.getByRole("button", { name: "Refresh permitted reads", exact: true }).click();
  await expect(page.getByText("Your existing service sign-in is needed", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Synthetic project", exact: true })).toHaveCount(0);
  expectReadOnly(calls);
  expect(errors).toEqual([]);
});

test("mocked partial secondary data is not described as an empty complete workspace", async ({ page }) => {
  const fixtures = createSyntheticLiveReadFixtures("operator");
  const { calls, errors } = await intercept(page, fixtures, (path, response) =>
    path === "/api/pipeline" ? { ...response, status: 503, body: '{"code":"unavailable","message":"Synthetic secondary failure"}' } : response);
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Your Action Center", exact: true })).toBeVisible();
  await expect(page.getByText(/This is a partial snapshot/)).toBeVisible();
  await expect(page.getByRole("button", {
    name: `Open Unnamed site (${fixtures.ids.unconvertedSiteId.slice(0, 8)})`, exact: true,
  })).toBeVisible();
  await expect(page.getByRole("region", { name: "Read snapshot summary" })
    .getByText("Projects reported by the service", { exact: true }).locator("..")).toContainText("Not supplied");
  expectReadOnly(calls);
  expect(errors).toEqual([]);
});

test("explicit interest serializes duplicate clicks, reconciles 201, and requires fresh deliberate deal-room access", async ({ page }) => {
  const fixtures = interestFixtures();
  const pending = heldResponse();
  const path = `/api/projects/${fixtures.ids.projectId}/engagements`;
  const audit = await intercept(page, fixtures, async (_path, response, request) => {
    if (request.method === "POST") {
      pending.started();
      await pending.waiting;
    }
    return response;
  });
  try {
    await openLockedProject(page, fixtures);
    expectReadOnly(audit.calls);
    expect(audit.calls.some((call) => call.path.endsWith("/deal-room"))).toBe(false);
    const beforeReads = audit.calls.filter((call) => call.path === "/api/me/engagements").length;
    audit.armInterest(fixtures.ids.projectId);
    await page.getByRole("button", { name: "Register nonbinding interest", exact: true }).dblclick();
    await pending.received;
    expectOnlyScopedInterest(audit.calls, fixtures.ids.projectId, 1);
    const back = page.getByRole("button", { name: "Back to collection", exact: true });
    await back.focus();
    pending.release();
    await expect(page.locator("main")).toContainText(CREATED_INTEREST);
    await expect.poll(() => audit.calls.filter((call) => call.path === "/api/me/engagements").length).toBeGreaterThan(beforeReads);
    await expect(back).toBeFocused();
    await expect(page).toHaveURL((url) => url.searchParams.get("project") === fixtures.ids.projectId);
    expect(audit.calls.some((call) => call.path.endsWith("/deal-room"))).toBe(false);
    const commandIndex = audit.calls.findIndex((call) => call.method === "POST");
    expect(audit.calls.slice(0, commandIndex).filter((call) => call.path === "/api/me").length).toBeGreaterThan(1);
    expect(audit.calls.slice(commandIndex + 1).some((call) => call.path === "/api/me/engagements")).toBe(true);
    audit.disarmInterest();
    await page.getByRole("button", { name: "Open permitted deal room", exact: true }).click();
    await expect(page.getByRole("region", { name: "Stored record detail", exact: true }))
      .toContainText("Released investor tier-1 metadata");
    expect(audit.calls.filter((call) => call.path === `/api/projects/${fixtures.ids.projectId}/deal-room`)).toHaveLength(1);
    await navigate(page, "Documents");
    await navigate(page, "Reports");
    await page.goBack();
    await page.goBack();
    await page.getByRole("button", { name: "Refresh permitted reads", exact: true }).click();
    await expect(page.getByRole("radio", { name: "Investor", exact: true })).toBeChecked();
    await page.reload();
    await expect(page.getByRole("radio", { name: "Investor", exact: true })).toBeChecked();
    expectOnlyScopedInterest(audit.calls, fixtures.ids.projectId, 1);
    await assertNoPrivatePersistence(page, ["Synthetic project", fixtures.ids.investorId, path, "funding_need_id"]);
  } finally {
    pending.release();
  }
});

test("expected 409 reconciles the existing binding state without claiming another nonbinding creation", async ({ page }) => {
  const fixtures = interestFixtures({ kind: "conflict", state: "committed" });
  const audit = await intercept(page, fixtures);
  await openLockedProject(page, fixtures);
  audit.armInterest(fixtures.ids.projectId);
  await page.getByRole("button", { name: "Register nonbinding interest", exact: true }).click();
  await expect(page.locator("main")).toContainText(/already|existing engagement/i);
  await expect(page.locator("main")).toContainText(/committed/i);
  await expect(page.locator("main")).not.toContainText(CREATED_INTEREST);
  expect(JSON.parse(fixtures.responseFor("/api/me/engagements").body)).toEqual([
    expect.objectContaining({ state: "committed", is_binding: true, funding_need_id: null }),
  ]);
  audit.disarmInterest();
  await page.reload();
  await expect(page.getByRole("radio", { name: "Investor", exact: true })).toBeChecked();
  expectOnlyScopedInterest(audit.calls, fixtures.ids.projectId, 1);
});

test("page-two interest checks fresh membership, then refreshes only engagements and retains collection context", async ({ page }) => {
  const catalogue = createSyntheticLiveReadFixtures("investor", { collectionScenario: "page-two" });
  const selected = catalogue.records.find((record) => record.name === "Continuity record 054");
  if (!selected) throw new Error("The interest continuity case requires a nonfirst page-two project.");
  const fixtures = createSyntheticLiveReadFixtures("investor", {
    investorEngaged: false, collectionScenario: "page-two",
    interest: { investorId: catalogue.ids.investorId, projectId: selected.id },
  });
  const audit = await intercept(page, fixtures);
  await page.goto("/app?view=portfolio");
  const collection = page.getByRole("region", { name: "Permitted record collection", exact: true });
  const results = page.getByRole("region", { name: "Permitted projects and sites", exact: true });
  await collection.getByRole("textbox", { name: "Search permitted records", exact: true }).fill("Continuity");
  await collection.getByRole("combobox", { name: "Lifecycle stage", exact: true }).selectOption("pre-development");
  await collection.getByRole("combobox", { name: "Site type", exact: true }).selectOption("rooftop");
  await collection.getByRole("combobox", { name: "Sort records", exact: true }).selectOption("name");
  await collection.getByRole("combobox", { name: "Records per page", exact: true }).selectOption("50");
  await collection.getByRole("button", { name: "Cards", exact: true }).click();
  await collection.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(collection.getByText("51-60 of 60 matching loaded records", { exact: true })).toBeVisible();
  const open = results.getByRole("button", { name: `Open ${selected.name}`, exact: true });
  await results.getByRole("button", { name: `Select ${selected.name}`, exact: true }).click();
  await open.click();
  await expect(page.getByRole("heading", { level: 1, name: selected.name, exact: true })).toBeVisible();
  const priorPortfolio = endpointCalls(audit.calls, ["/api/portfolio"]);
  expect(priorPortfolio.length).toBeGreaterThan(0);
  audit.armInterest(selected.id);
  await page.getByRole("button", { name: "Register nonbinding interest", exact: true }).click();
  await expect(page.locator("main")).toContainText(CREATED_INTEREST);
  await expect(page.getByRole("button", { name: "Refresh interest status", exact: true })).toBeEnabled();
  audit.disarmInterest();
  const portfolio = endpointCalls(audit.calls, ["/api/portfolio"]);
  expect(portfolio).toHaveLength(priorPortfolio.length + 1);
  expect(portfolio.at(-1)?.path).toBe(priorPortfolio.at(-1)?.path);
  const commandIndex = audit.calls.findIndex((call) => call.method === "POST");
  expect(commandIndex).toBeGreaterThan(0);
  expect(audit.calls.slice(0, commandIndex).filter((call) => new URL(call.url).pathname === "/api/portfolio"))
    .toHaveLength(portfolio.length);
  expect(endpointCalls(audit.calls.slice(commandIndex + 1), ["/api/portfolio"])).toEqual([]);
  await page.getByRole("button", { name: "Back to collection", exact: true }).click();
  await expect(collection.getByRole("textbox", { name: "Search permitted records", exact: true })).toHaveValue("Continuity");
  await expect(collection.getByRole("combobox", { name: "Lifecycle stage", exact: true })).toHaveValue("pre-development");
  await expect(collection.getByRole("combobox", { name: "Site type", exact: true })).toHaveValue("rooftop");
  await expect(collection.getByRole("combobox", { name: "Records per page", exact: true })).toHaveValue("50");
  await expect(collection.getByRole("button", { name: "Cards", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(collection.getByText("Page 2 of 2", { exact: true })).toBeVisible();
  await expect(results.locator(`[data-project-id="${selected.id}"]`)).toHaveAttribute("data-selected", "true");
  await expect(open).toBeFocused();
  expectOnlyScopedInterest(audit.calls, selected.id, 1);
});

const interestRefusals = [
  ["unauthenticated", 401, "Your existing service sign-in is needed"],
  ["forbidden_role", 403, "This information is outside your current access"],
  ["forbidden_tier", 403, "This information is outside your current access"],
  ["forbidden_origin", 403, "This information is outside your current access"],
  ["not_found", 404, "This project is no longer available for interest."],
  ["invalid_body", 400, "This request cannot use the accepted service contract"],
] as const satisfies readonly (readonly [SyntheticInterestRefusal, number, string])[];

for (const [code, status, message] of interestRefusals) {
  test(`explicit interest ${code} is a refusal, never fictional creation or automatic recovery`, async ({ page }) => {
    const fixtures = interestFixtures({ kind: "refused", code });
    const refusals: SyntheticLiveReadResponse[] = [];
    const audit = await intercept(page, fixtures, (_path, response, request) => {
      if (request.method === "POST") refusals.push(response);
      return response;
    });
    await openLockedProject(page, fixtures);
    audit.armInterest(fixtures.ids.projectId);
    await page.getByRole("button", { name: "Register nonbinding interest", exact: true }).click();
    await expect(page.locator("main")).toContainText(message);
    expect(refusals).toHaveLength(1);
    const refusal = refusals[0];
    if (!refusal) throw new Error("The explicit interest refusal was not observed.");
    expect(refusal.status).toBe(status);
    expect(JSON.parse(refusal.body)).toMatchObject({ code });
    await expect(page.locator("main")).not.toContainText(CREATED_INTEREST);
    expect(JSON.parse(fixtures.responseFor("/api/me/engagements").body)).toEqual([]);
    expect(audit.calls.some((call) => call.path.endsWith("/deal-room"))).toBe(false);
    if (status === 401 || status === 403) {
      await expect(page.getByRole("region", { name: "Stored record detail", exact: true })).toHaveCount(0);
      await expect(page.getByRole("region", { name: "Permitted record collection", exact: true })).toHaveCount(0);
    }
    audit.disarmInterest();
    await page.getByRole("button", { name: "Refresh permitted reads", exact: true }).click();
    await expect(page.getByRole("radio", { name: "Investor", exact: true })).toBeChecked();
    expectOnlyScopedInterest(audit.calls, fixtures.ids.projectId, 1);
    expect(audit.calls.some((call) => call.path.startsWith("/api/auth/"))).toBe(false);
  });
}

for (const outcome of ["network", "unavailable", "invalid-success", "wrong-project", "wrong-investor", "binding-success"] as const) {
  test(`explicit interest ${outcome} remains outcome-unknown after empty reconciliation without replay`, async ({ page }) => {
    const fixtures = interestFixtures({ kind: "unknown", recorded: false });
    const audit = await intercept(page, fixtures, (_path, response, request) => {
      if (request.method !== "POST") return response;
      if (outcome === "network") return "network";
      if (outcome === "invalid-success") return { ...response, status: 201, body: '{"wrong":"receipt"}' };
      if (outcome === "wrong-project" || outcome === "wrong-investor" || outcome === "binding-success") {
        const mismatched: EngagementPayload = {
          id: fixtures.ids.engagementId, funding_need_id: null,
          project_id: outcome === "wrong-project" ? fixtures.ids.unconvertedSiteId : fixtures.ids.projectId,
          investor_id: outcome === "wrong-investor" ? fixtures.ids.operatorUserId : fixtures.ids.investorId,
          state: "interested", is_binding: outcome === "binding-success",
          created_at: "2026-09-21T08:00:00Z", state_changed_at: "2026-09-21T08:00:00Z",
        };
        return { ...response, status: 201, body: JSON.stringify(mismatched) };
      }
      return response;
    });
    await openLockedProject(page, fixtures);
    audit.armInterest(fixtures.ids.projectId);
    await page.getByRole("button", { name: "Register nonbinding interest", exact: true }).click();
    await expect(page.locator("main")).toContainText(UNKNOWN_INTEREST);
    await expect(page.locator("main")).not.toContainText(CREATED_INTEREST);
    audit.disarmInterest();
    const reads = audit.calls.filter((call) => call.path === "/api/me/engagements").length;
    await page.getByRole("button", { name: /refresh.*(?:interest|engagement)|check.*(?:interest|engagement)/i }).click();
    await expect.poll(() => audit.calls.filter((call) => call.path === "/api/me/engagements").length).toBeGreaterThan(reads);
    await expect(page.locator("main")).toContainText(UNKNOWN_INTEREST);
    await navigate(page, "Reports");
    await page.goBack();
    await expect(page.locator("main")).toContainText(UNKNOWN_INTEREST);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(page.getByRole("radio", { name: "Investor", exact: true })).toBeChecked();
    await expect(page.locator("main")).toContainText(UNKNOWN_INTEREST);
    expectOnlyScopedInterest(audit.calls, fixtures.ids.projectId, 1);
    expect(audit.calls.some((call) => call.path.endsWith("/deal-room"))).toBe(false);
    await assertNoPrivatePersistence(page, [fixtures.ids.investorId, "funding_need_id", "/engagements", "Synthetic project"]);
    await page.reload();
    await expect(page.getByRole("radio", { name: "Investor", exact: true })).toBeChecked();
    expectOnlyScopedInterest(audit.calls, fixtures.ids.projectId, 1);
  });
}

test("an unknown response can reconcile current recorded interest without claiming which request created it", async ({ page }) => {
  const fixtures = interestFixtures({ kind: "unknown", recorded: true });
  const audit = await intercept(page, fixtures);
  await openLockedProject(page, fixtures);
  audit.armInterest(fixtures.ids.projectId);
  await page.getByRole("button", { name: "Register nonbinding interest", exact: true }).click();
  await expect(page.locator("main")).toContainText(UNKNOWN_INTEREST);
  audit.disarmInterest();
  await page.getByRole("button", { name: "Refresh interest status", exact: true }).click();
  const interest = page.getByRole("region", { name: "Project interest", exact: true });
  await expect(interest).toContainText("Existing project-level engagement: interested");
  await expect(interest).toContainText("no new creation is claimed");
  await expect(interest).not.toContainText(CREATED_INTEREST);
  expectOnlyScopedInterest(audit.calls, fixtures.ids.projectId, 1);
});

test("a new attempt after unknown outcome needs explicit acknowledgement and another scoped preflight", async ({ page }) => {
  const fixtures = interestFixtures({ kind: "unknown", recorded: false });
  const audit = await intercept(page, fixtures);
  await openLockedProject(page, fixtures);
  audit.armInterest(fixtures.ids.projectId);
  await page.getByRole("button", { name: "Register nonbinding interest", exact: true }).click();
  const interest = page.getByRole("region", { name: "Project interest", exact: true });
  await expect(interest).toContainText(UNKNOWN_INTEREST);
  audit.disarmInterest();
  const retry = interest.getByRole("button", { name: "Make a new registration attempt", exact: true });
  await expect(retry).toBeDisabled();
  await expect(interest).toContainText("An empty or failed status read does not prove it failed.");
  await interest.getByRole("checkbox", { name: /I understand the uncertain outcome/ }).check();
  await expect(retry).toBeEnabled();
  const before = audit.calls.length;
  audit.armInterest(fixtures.ids.projectId);
  await retry.click();
  await expect(interest).toContainText(UNKNOWN_INTEREST);
  await expect(retry).toBeDisabled();
  const repeated = audit.calls.slice(before);
  const dispatch = repeated.findIndex((call) => call.method === "POST");
  expect(dispatch).toBeGreaterThan(0);
  expect(repeated.slice(0, dispatch).some((call) => call.path === "/api/me/engagements")).toBe(true);
  expect(repeated.slice(0, dispatch).filter((call) => call.path === "/api/me").length).toBeGreaterThanOrEqual(2);
  expectOnlyScopedInterest(audit.calls, fixtures.ids.projectId, 2);
});

test("failed unknown-outcome reconciliation cannot erase uncertainty or trigger another write", async ({ page }) => {
  const fixtures = interestFixtures({ kind: "unknown", recorded: false });
  let dispatched = false;
  const audit = await intercept(page, fixtures, (path, response, request) => {
    if (request.method === "POST") dispatched = true;
    if (dispatched && path === "/api/me/engagements") return {
      ...response, status: 503, body: '{"code":"service_unavailable","message":"Synthetic reconciliation unavailable"}',
    };
    return response;
  });
  await openLockedProject(page, fixtures);
  audit.armInterest(fixtures.ids.projectId);
  await page.getByRole("button", { name: "Register nonbinding interest", exact: true }).click();
  await expect(page.locator("main")).toContainText(UNKNOWN_INTEREST);
  audit.disarmInterest();
  await page.getByRole("button", { name: /refresh.*(?:interest|engagement)|check.*(?:interest|engagement)/i }).click();
  await expect(page.locator("main")).toContainText(UNKNOWN_INTEREST);
  await expect(page.locator("main")).toContainText(/unavailable|could not|out of reach/i);
  expectOnlyScopedInterest(audit.calls, fixtures.ids.projectId, 1);
});

test("a 201 receipt does not unlock a deal room without fresh authoritative engagement eligibility", async ({ page }) => {
  const fixtures = interestFixtures();
  let dispatched = false;
  const audit = await intercept(page, fixtures, (path, response, request) => {
    if (request.method === "POST") dispatched = true;
    return dispatched && path === "/api/me/engagements" ? { ...response, body: "[]" } : response;
  });
  await openLockedProject(page, fixtures);
  audit.armInterest(fixtures.ids.projectId);
  await page.getByRole("button", { name: "Register nonbinding interest", exact: true }).click();
  await expect(page.locator("main")).toContainText(CREATED_INTEREST);
  await expect(page.getByRole("button", { name: "Open permitted deal room", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Stored record detail", exact: true })).toContainText(/locked|tier[- ]zero|tier 0/i);
  expect(audit.calls.some((call) => call.path.endsWith("/deal-room"))).toBe(false);
  expectOnlyScopedInterest(audit.calls, fixtures.ids.projectId, 1);
});

test("funding-need interest is not a duplicate of the explicit project-level {} command", async ({ page }) => {
  const fixtures = createSyntheticLiveReadFixtures("investor", {
    engagements: [{ scope: "funding-need", state: "funded", isBinding: true }],
    interest: { investorId: SYNTHETIC_LIVE_READ_IDS.investorId, projectId: SYNTHETIC_LIVE_READ_IDS.projectId },
  });
  const audit = await intercept(page, fixtures);
  await page.goto(`/app?project=${fixtures.ids.projectId}`);
  await expect(page.getByRole("button", { name: "Register nonbinding interest", exact: true })).toBeVisible();
  audit.armInterest(fixtures.ids.projectId);
  await page.getByRole("button", { name: "Register nonbinding interest", exact: true }).click();
  await expect(page.locator("main")).toContainText(CREATED_INTEREST);
  expect(JSON.parse(fixtures.responseFor("/api/me/engagements").body)).toEqual([
    expect.objectContaining({ funding_need_id: fixtures.ids.fundingNeedId, state: "funded", is_binding: true }),
    expect.objectContaining({ funding_need_id: null, state: "interested", is_binding: false }),
  ]);
  expectOnlyScopedInterest(audit.calls, fixtures.ids.projectId, 1);
});

test("an existing binding project engagement does not override a later withdrawn funding-scope room lock", async ({ page }) => {
  const fixtures = createSyntheticLiveReadFixtures("investor", {
    engagements: [
      { scope: "project", state: "funded", isBinding: true, changedAt: "2026-09-23T00:00:00Z" },
      { scope: "funding-need", state: "withdrawn", changedAt: "2026-09-20T00:00:00Z" },
    ],
  });
  const audit = await intercept(page, fixtures);
  await page.goto(`/app?project=${fixtures.ids.projectId}`);
  await expect(page.getByRole("region", { name: "Stored record detail", exact: true })).toContainText(/locked|tier[- ]zero|tier 0/i);
  await expect(page.locator("main")).toContainText(/funded/i);
  await expect(page.getByRole("button", { name: "Register nonbinding interest", exact: true })).not.toBeEnabled();
  expect(audit.calls.some((call) => call.path.endsWith("/deal-room"))).toBe(false);
  expectReadOnly(audit.calls);
});

test("an actor change before dispatch sends nothing and cannot manufacture an investor grant", async ({ page }) => {
  const fixtures = interestFixtures();
  const operator = createSyntheticLiveReadFixtures("operator");
  let changed = false;
  const audit = await intercept(page, fixtures, (path, response) =>
    changed && path === "/api/me" ? operator.responseFor(path) : response);
  await openLockedProject(page, fixtures);
  changed = true;
  audit.armInterest(fixtures.ids.projectId);
  await page.getByRole("button", { name: "Register nonbinding interest", exact: true }).click();
  await expect(page.getByRole("region", { name: "Stored record detail", exact: true })).toHaveCount(0);
  await expect(page.locator("main")).toContainText(/context changed|not sent|identity/i);
  expectReadOnly(audit.calls);
});

test("a late dispatched interest receipt is retired on actor change and never replays into the new actor", async ({ page }) => {
  const fixtures = interestFixtures();
  const pending = heldResponse();
  const audit = await intercept(page, fixtures, async (_path, response, request) => {
    if (request.method === "POST") {
      pending.started();
      await pending.waiting;
    }
    return response;
  });
  try {
    await openLockedProject(page, fixtures);
    await page.getByRole("button", { name: "Back to collection", exact: true }).click();
    await page.getByRole("button", { name: "Open Synthetic project", exact: true }).click();
    await expect(page.getByRole("button", { name: "Register nonbinding interest", exact: true })).toBeVisible();
    audit.armInterest(fixtures.ids.projectId);
    const command = page.waitForRequest((request) =>
      request.method() === "POST" && new URL(request.url()).pathname === `/api/projects/${fixtures.ids.projectId}/engagements`);
    await page.getByRole("button", { name: "Register nonbinding interest", exact: true }).click();
    const sent = await command;
    await pending.received;
    audit.useFixtures(createSyntheticLiveReadFixtures("operator"));
    await expect(page.getByRole("button", { name: "Refresh permitted reads", exact: true })).toBeDisabled();
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.getByRole("heading", { level: 1, name: "Your Action Center", exact: true })).toBeVisible();
    const refresh = page.getByRole("button", { name: "Refresh permitted reads", exact: true });
    await refresh.focus();
    pending.release();
    const response = await sent.response();
    if (response !== null) await response.finished();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(refresh).toBeFocused();
    await expect(page.locator("main")).not.toContainText(CREATED_INTEREST);
    await expect(page.getByRole("region", { name: "Stored record detail", exact: true })).toHaveCount(0);
    await page.goBack();
    await expect(page.getByRole("radio", { name: "Operator", exact: true })).toBeChecked();
    expectOnlyScopedInterest(audit.calls, fixtures.ids.projectId, 1);
  } finally {
    pending.release();
  }
});

for (const source of ["seeded-user", "seeded-investor-profile"] as const) {
  test(`connected mode rejects ${source} without attempting seeded sign-in or private fallback`, async ({ page }) => {
    const role = source === "seeded-user" ? "site-owner" : "investor";
    const fixtures = createSyntheticLiveReadFixtures(role);
    const audit = await intercept(page, fixtures, (path, response) => {
      if (path !== "/api/me") return response;
      return { ...response, body: JSON.stringify(source === "seeded-user"
        ? { user_id: DEMO_SITE_OWNER_USER_ID, role: "site_owner" }
        : {
          user_id: fixtures.ids.investorUserId, role: "investor", onboarded: true,
          investor: { id: DEMO_INVESTOR_ID, organization_name: "SYNTHETIC seeded rejection", onboarding_completed_at: "2026-09-20T12:00:00Z" },
        }) };
    });
    await page.goto("/app");
    await expect(page.locator("main")).toContainText(/seeded|demo identit|demo principal/i);
    await expect(page.getByRole("region", { name: "Permitted record collection", exact: true })).toHaveCount(0);
    expect(audit.calls.every((call) => call.method === "GET" && call.path === "/api/me")).toBe(true);
    expect(audit.calls.length).toBeGreaterThan(0);
  });
}
