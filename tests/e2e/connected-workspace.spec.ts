import { expect, test as base, type Download, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  createSyntheticLiveReadFixtures,
  installSyntheticBrowserAudit,
  syntheticLocalOrigin,
  syntheticStorageState,
  SYNTHETIC_SAVE_CANARIES,
  SYNTHETIC_LIVE_READ_PDF,
  type SyntheticBrowserAudit,
  type SyntheticLiveReadFixtures,
  type SyntheticLiveReadResponse,
  type SyntheticResponseOverride,
  type SyntheticTrafficObservation,
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

test.use({ actionTimeout: 10_000 });

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
  await page.goto(`/app?project=${fixtures.ids.projectId}`);
  await expect(page.getByText("This information is outside your current access", { exact: true })).toBeVisible();
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
