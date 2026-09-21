import { expect, test as base } from "@playwright/test";
import {
  installSyntheticBrowserAudit, syntheticLocalOrigin, syntheticStorageState,
  SYNTHETIC_SAVE_CANARIES, type SyntheticBrowserAudit,
} from "../fixtures/live-read-contracts";

const test = base.extend<{ audit: SyntheticBrowserAudit }>({
  storageState: async ({ baseURL }, provide) => {
    await provide(syntheticStorageState(syntheticLocalOrigin(baseURL)));
  },
  audit: [async ({ page, baseURL }, provide) => {
    const audit = await installSyntheticBrowserAudit(page, syntheticLocalOrigin(baseURL));
    try {
      await provide(audit);
    } finally {
      const storage = await audit.storageSnapshot();
      expect({
        calls: audit.calls,
        unexpectedTraffic: audit.unexpected,
        storageAcrossDocuments: audit.storageAttempts,
        storageInCurrentDocument: storage.attempts,
        retainedCanaries: storage.canaries,
        pageErrors: audit.errors,
      }).toEqual({
        calls: [], unexpectedTraffic: [], storageAcrossDocuments: [], storageInCurrentDocument: [],
        retainedCanaries: SYNTHETIC_SAVE_CANARIES, pageErrors: [],
      });
    }
  }, { auto: true }],
});

test("the actual /app entry stays unconfigured and retains both synthetic saves without accessing them", async ({ page, audit }) => {
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Your service connection is out of reach right now" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh permitted reads", exact: true })).toBeDisabled();
  await expect(page.getByText("Live reads only", { exact: true })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Dark appearance" })).toBeEnabled();
  await expect(page.locator("[data-concept]")).toHaveCount(0);
  expect(audit.calls).toEqual([]);
  await page.getByRole("button", { name: "Notifications", exact: true }).click();
  await expect(page.getByRole("region", { name: "Notifications", exact: true })).toContainText("marks nothing read");
  await page.getByRole("button", { name: "Close notifications", exact: true }).click();
  await expect(page.getByRole("region", { name: "Notifications", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Skip to workspace", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#workspace-content")).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

for (const route of ["/concepts", "/concepts/sunroom", "/concepts/gridline"]) {
  test(`${route} aliases to live without taking role or redirect authority`, async ({ page, baseURL }) => {
    await page.goto(`${route}?view=pipeline&project=opaque-id&role=operator&redirect=https://outside.invalid`);
    await expect(page).toHaveURL((url) =>
      url.origin === syntheticLocalOrigin(baseURL) &&
      url.pathname === "/app" && url.searchParams.get("project") === "opaque-id" &&
      url.searchParams.get("view") === "pipeline" && !url.searchParams.has("role") &&
      !url.searchParams.has("redirect"));
    await expect(page.getByRole("heading", { name: "Your service connection is out of reach right now" })).toBeVisible();
    await expect(page.locator("[data-concept]")).toHaveCount(0);
  });
}

test("the old dynamic owner workspace is a live alias, not the fictional simulation", async ({ page, baseURL }) => {
  await page.goto("/dashboard/site-owner");
  await expect(page).toHaveURL((url) => url.origin === syntheticLocalOrigin(baseURL) &&
    url.pathname === "/app" && url.searchParams.get("view") === "sites");
  await expect(page.getByRole("button", { name: /Run simulation/i })).toHaveCount(0);
});
