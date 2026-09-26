import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

function demoUrl(path: string) {
  const prefix = test.info().config.metadata.routePrefix;
  if (typeof prefix !== "string" || !prefix.endsWith("#")) throw new Error("Demo browser suites require playwright.vibehub.config.ts and the static hash entry.");
  return `${prefix}${path}`;
}

test("Sunroom themes preserve selected project context and truthful service state", async ({ page }, info) => {
  await page.goto(demoUrl("/concepts/sunroom?role=site-owner"));
  await page.getByRole("combobox", { name: "Project context", exact: true }).selectOption("sweet-auburn");
  await expect(page.locator("main h1")).toHaveText("Sweet Auburn rooftop");
  for (const scheme of ["light", "dark"] as const) {
    const toggle = page.getByRole("switch", { name: "Dark appearance", exact: true });
    if (await toggle.getAttribute("aria-checked") !== String(scheme === "dark")) await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
    await expect(page.getByRole("combobox", { name: "Project context", exact: true })).toHaveValue("sweet-auburn");
    const colors = await page.locator('[data-concept="sunroom"]').evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      text: getComputedStyle(element).color,
    }));
    expect(colors.background).toBe(scheme === "dark" ? "rgb(10, 16, 29)" : "rgb(245, 247, 251)");
    expect(colors.text).not.toBe(colors.background);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    await page.screenshot({ path: info.outputPath(`sunroom-project-${scheme}.png`), fullPage: true, animations: "disabled" });
  }
  await page.getByRole("button", { name: /Synthetic preview.*service status/ }).click();
  const status = page.getByRole("dialog", { name: "Service status", exact: true });
  await expect(status).toContainText("No operational backend connection");
  await expect(status.getByText("Unavailable live", { exact: true })).toHaveCount(10);
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Project context", exact: true })).toHaveValue("sweet-auburn");
});

test("Sunroom operator home restores work without losing role or project scope", async ({ page }) => {
  await page.goto(demoUrl("/concepts/sunroom?role=operator&view=reports&scope=sweet-auburn"));
  const home = page.getByRole("link", { name: "Sunroom home", exact: true });
  test.skip(!(await home.isVisible()), "The persistent sidebar home link is desktop/tablet navigation.");
  await expect(page.getByRole("radio", { name: "Operator", exact: true })).toBeChecked();
  await home.click();
  await expect(page.locator("main h1")).toHaveText("Move the next piece of work.");
  await expect(page.getByRole("radio", { name: "Operator", exact: true })).toBeChecked();
  await expect(page.getByRole("combobox", { name: "Project context", exact: true })).toHaveValue("sweet-auburn");
  await page.reload();
  await expect(page.locator("main h1")).toHaveText("Move the next piece of work.");
});

test("existing v1 browser progress migrates without being expanded or overwritten", async ({ page }) => {
  await page.goto(demoUrl("/concepts/sunroom?role=operator"));
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await page.getByRole("button", { name: "Reset fictional demo", exact: true }).click();
  const legacy = await page.evaluate(() => {
    const raw = localStorage.getItem("sunsum-design-lab-v2");
    if (!raw) throw new Error("Expected fresh synthetic save");
    const envelope = JSON.parse(raw);
    if (envelope.state.sites.length !== 50) throw new Error("Fresh scenario must contain 50 records");
    const state = envelope.state;
    state.sites = state.sites.slice(0, 6);
    for (const site of state.sites) {
      delete site.ownerVisible;
      delete site.tasks;
      delete site.decisions;
      delete site.notes;
      delete site.evidenceRevision;
      delete site.revision;
    }
    state.sites[0].name = "Preserved fictional rooftop";
    delete state.profile;
    delete state.drafts;
    const original = JSON.stringify(state);
    localStorage.setItem("sunsum-design-lab-v1", original);
    localStorage.removeItem("sunsum-design-lab-v2");
    return original;
  });
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Project context", exact: true }).locator("option")).toHaveCount(7);
  await expect(page.getByRole("combobox", { name: "Project context", exact: true })).toContainText("Preserved fictional rooftop");
  const receipt = await page.evaluate(() => ({
    original: localStorage.getItem("sunsum-design-lab-v1"),
    current: JSON.parse(localStorage.getItem("sunsum-design-lab-v2") ?? "null"),
  }));
  expect(receipt.original).toBe(legacy);
  expect(receipt.current.schemaVersion).toBe(2);
  expect(receipt.current.mode).toBe("synthetic");
  expect(receipt.current.state.sites).toHaveLength(6);
  await page.goto(demoUrl("/concepts/sunroom?role=operator&project=grove-park"));
  await page.getByRole("tab", { name: "Assessment", exact: true }).click();
  await page.getByRole("group", { name: "Selected fixture outcome", exact: true }).getByRole("radio").nth(1).check();
  await page.getByLabel(/Rerun reason/).fill("Changed evidence on a restored legacy project.");
  await page.getByRole("button", { name: "Record manual rerun", exact: true }).click();
  await page.reload();
  await page.getByRole("tab", { name: "Work & decisions", exact: true }).click();
  await expect(page.getByRole("button", { name: "Move to development", exact: true })).toBeDisabled();
  await page.getByLabel(/Review confirmation rationale/).fill("Confirmed the current legacy project evidence.");
  await page.getByRole("button", { name: "Confirm current review", exact: true }).click();
  await expect(page.getByRole("button", { name: "Move to development", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem("sunsum-design-lab-v1"))).toBe(legacy);
});

test("Sunroom mobile navigation and typed guidance do not expose hidden or audio controls", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(demoUrl("/concepts/sunroom?role=site-owner&scope=sweet-auburn"));
  await expect(page.locator("main h1")).toBeVisible();
  const mobile = page.getByRole("button", { name: "Open navigation", exact: true });
  if (await mobile.isVisible()) {
    await expect(page.locator("aside")).not.toBeVisible();
    await mobile.click();
    await expect(page.getByRole("dialog", { name: "Workspace navigation" })).toBeVisible();
    await page.getByRole("button", { name: "Ask Sunsum", exact: true }).click();
  } else await page.getByRole("button", { name: "Ask Sunsum", exact: true }).click();
  const guide = page.getByRole("complementary", { name: "Ask SunSum", exact: true });
  await expect(guide).toContainText("Sweet Auburn rooftop");
  await expect(guide).toContainText("no AI model");
  await expect(guide.getByRole("button", { name: /voice|speech|microphone/i })).toHaveCount(0);
  await page.getByLabel("Ask a question", { exact: true }).fill("What is the next task?");
  await page.getByRole("button", { name: "Send question", exact: true }).click();
  await expect(page.getByRole("log")).toContainText("For Sweet Auburn rooftop");
  await page.getByRole("button", { name: "Close guidance", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("desktop keeps the filtered map above work and nonmodal guidance beside it", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1100, "Desktop arrangement; narrow screens reflow in document order.");
  await page.goto(demoUrl("/concepts/sunroom?role=operator&view=queue"));
  const map = page.getByRole("region", { name: "Linked illustrative map" });
  const work = page.getByRole("list", { name: "Submissions awaiting a manual action" });
  const guide = page.getByRole("complementary", { name: "Ask SunSum" });
  await expect(work.getByRole("button")).toHaveCount(25);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const mapBox = await map.boundingBox();
  const workBox = await work.boundingBox();
  const guideBox = await guide.boundingBox();
  if (!mapBox || !workBox || !guideBox) throw new Error("Map, work and guidance must be laid out.");
  expect(mapBox.y + mapBox.height).toBeLessThan(workBox.y);
  expect(guideBox.x).toBeGreaterThan(workBox.x + workBox.width - 1);
  expect(mapBox.width).toBeGreaterThan(workBox.width);
  await page.getByLabel("Search submissions", { exact: true }).fill("Sweet Auburn");
  await expect(work.getByRole("button")).toHaveCount(1);
  await expect(guide).toContainText("Sweet Auburn rooftop");
  await guide.getByLabel("Ask a question", { exact: true }).fill("What is the next task?");
  await guide.getByRole("button", { name: "Send question", exact: true }).click();
  await expect(work.getByRole("button", { name: "Review Sweet Auburn rooftop" })).toBeEnabled();
  await expect(guide.getByRole("log")).toContainText("For Sweet Auburn rooftop");
});

test("operator Documents and Reports return to the same queue and focused row", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(demoUrl("/concepts/sunroom?role=operator&view=queue"));
  await page.getByLabel("Search submissions", { exact: true }).fill("Community");
  await page.getByRole("combobox", { name: "Sort submissions", exact: true }).selectOption("stage-desc");
  await page.getByRole("button", { name: "Next submissions", exact: true }).click();
  const row = page.getByRole("list", { name: "Submissions awaiting a manual action" }).getByRole("button").nth(2);
  const name = (await row.getAttribute("aria-label"))?.slice("Review ".length);
  if (!name) throw new Error("Expected a named queue row.");
  await row.click();
  await page.getByRole("tab", { name: "Tasks & evidence", exact: true }).click();
  await page.getByRole("button", { name: "Open project documents", exact: true }).click();
  await page.getByRole("button", { name: "Drafts & reports", exact: true }).last().click();
  await page.getByRole("button", { name: "Back to the selected project", exact: true }).click();
  await page.getByRole("button", { name: `Close ${name}`, exact: true }).click();
  await expect(page.getByRole("button", { name: `Review ${name}`, exact: true })).toBeFocused();
  await expect(page.getByLabel("Search submissions", { exact: true })).toHaveValue("Community");
  await expect(page.getByRole("combobox", { name: "Sort submissions", exact: true })).toHaveValue("stage-desc");
  await expect(page.getByRole("combobox", { name: "Submissions per page", exact: true })).toHaveValue("25");
  await expect(page.getByText("Page 2 of 2", { exact: true })).toBeVisible();
});

test("role segments support click, keyboard and a cancellable pointer drag", async ({ page }) => {
  await page.goto(demoUrl("/concepts/sunroom?role=site-owner&view=overview"));
  const owner = page.getByRole("radio", { name: "Site owner", exact: true });
  const operator = page.getByRole("radio", { name: "Operator", exact: true });
  await operator.check();
  await operator.press("ArrowLeft");
  await expect(owner).toBeChecked();
  const from = await owner.boundingBox();
  const to = await operator.boundingBox();
  if (!from || !to) throw new Error("Native role controls must be visible.");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 });
  await expect(owner).toBeChecked();
  await page.mouse.up();
  await expect(operator).toBeChecked();
  await expect(page.locator("main h1")).toHaveText("Move the next piece of work.");
});

test("editable briefing and assessment report produce separate real local files", async ({ page }, info) => {
  await page.goto(demoUrl("/concepts/sunroom?role=site-owner&view=reports&scope=sweet-auburn"));
  await page.getByRole("button", { name: "Create briefing draft", exact: true }).click();
  await page.getByLabel("Owner contact name", { exact: true }).fill("Corrected fictional contact");
  await page.getByLabel("Draft body", { exact: true }).fill("Original non-executing demo briefing. Review the example roof scope.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByRole("checkbox", { name: "I reviewed this saved synthetic draft", exact: true }).check();
  await page.getByRole("button", { name: "Record human review", exact: true }).click();
  await expect(page.getByRole("status", { name: "Report action status" })).toContainText("Human review recorded");
  const briefingDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Briefing HTML", exact: true }).click();
  const briefing = await briefingDownload;
  expect(briefing.suggestedFilename()).toMatch(/\.html$/);
  const briefingPath = await briefing.path();
  if (!briefingPath) throw new Error("The local briefing download is missing");
  const html = await readFile(briefingPath, "utf8");
  expect(html).toContain("Corrected fictional contact");
  expect(html).toContain("Original non-executing demo briefing");
  expect(html).toContain("source");
  expect(html).not.toContain("<script");
  await page.screenshot({ path: info.outputPath("sunroom-reviewed-briefing.png"), fullPage: true, animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  await page.getByRole("button", { name: /Assessment report.*Review original/ }).click();
  await page.getByRole("button", { name: "Create assessment report", exact: true }).click();
  await expect(page.getByLabel("Stored assessment provenance")).toContainText("Original assessment");
  await expect(page.getByLabel("Stored assessment provenance")).toContainText("Recorded human decision");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  const assessmentDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Assessment report CSV", exact: true }).click();
  const assessment = await assessmentDownload;
  expect(assessment.suggestedFilename()).toMatch(/assessment.*\.csv$/);
  const assessmentPath = await assessment.path();
  if (!assessmentPath) throw new Error("The local assessment download is missing");
  expect(await readFile(assessmentPath, "utf8")).toContain("Unreviewed demo draft");
});

test("profile-first setup resumes the same existing intake", async ({ page }) => {
  await page.goto(demoUrl("/concepts/sunroom?role=site-owner&view=intake&project=east-point&scope=east-point"));
  await expect(page.getByRole("heading", { name: "A profile you can revisit", exact: true })).toBeVisible();
  const originalName = await page.getByRole("combobox", { name: "Project context", exact: true })
    .locator('option[value="east-point"]').textContent();
  if (!originalName) throw new Error("Expected the original owner draft in the project selector");
  await page.getByLabel(/Fictional display name/).fill("Robin Example");
  await page.getByRole("button", { name: "Step 4: Review", exact: true }).click();
  await page.getByRole("checkbox", { name: /I agree to save fictional profile preferences/ }).check();
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page).toHaveURL(/project=east-point(?:&|$)/);
  await page.getByRole("button", { name: /^Step 1:/ }).click();
  await expect(page.getByLabel(/Site name/)).toHaveValue(originalName);
});

test("an unavailable intake route never becomes a new blank site", async ({ page }) => {
  await page.goto(demoUrl("/concepts/sunroom?role=site-owner&view=intake&project=unavailable-example"));
  await page.getByLabel(/Fictional display name/).fill("Robin Example");
  await page.getByRole("button", { name: "Step 4: Review", exact: true }).click();
  await page.getByRole("checkbox", { name: /I agree to save fictional profile preferences/ }).check();
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Draft unavailable", exact: true })).toBeVisible();
  await expect(page.getByLabel(/Site name/)).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("sunsum-design-lab-v2") ?? "null").state.sites.length)).toBe(50);
});

test("action-center documents return to the exact project task", async ({ page }, info) => {
  await page.goto(demoUrl("/concepts/sunroom?role=site-owner&view=inbox"));
  await page.getByRole("button", { name: "Open requested documents", exact: true }).first().click();
  const current = new URL(page.url());
  const route = current.hash.startsWith("#/") ? new URL(current.hash.slice(1), current.origin) : current;
  const task = route.searchParams.get("task");
  const project = route.searchParams.get("scope");
  expect(task).toBeTruthy();
  expect(project).toBeTruthy();
  await expect(page.locator("main")).toContainText("Request:");
  await page.screenshot({ path: info.outputPath("sunroom-requested-documents.png"), fullPage: true, animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  await page.getByRole("button", { name: "Back to the selected project", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Tasks & evidence", exact: true })).toHaveAttribute("aria-selected", "true");
  const linkedTask = page.getByRole("article").filter({ hasText: "Linked action-center task" });
  await expect(linkedTask).toBeFocused();
  await page.getByRole("button", { name: "Open project documents", exact: true }).click();
  const returned = new URL(page.url());
  const returnedRoute = returned.hash.startsWith("#/") ? new URL(returned.hash.slice(1), returned.origin) : returned;
  expect(returnedRoute.searchParams.get("scope")).toBe(project);
  expect(returnedRoute.searchParams.get("task")).toBe(task);
  await page.reload();
  await expect(page.locator("main")).toContainText("Request:");
});

test("manual reruns preserve the original and a failed attempt keeps the last good result", async ({ page }, info) => {
  await page.goto(demoUrl("/concepts/sunroom?role=operator&project=sweet-auburn"));
  await expect(page.getByRole("dialog", { name: "Sweet Auburn rooftop", exact: true })).toBeVisible();
  if (await page.getByRole("button", { name: "Confirm current review", exact: true }).isVisible()) {
    await page.getByLabel(/Review confirmation rationale/).fill("Reviewing the current fictional source.");
    await page.getByRole("button", { name: "Confirm current review", exact: true }).click();
  }
  await page.getByRole("tab", { name: "Assessment", exact: true }).click();
  const original = page.getByRole("article", { name: "Immutable original fixture", exact: true });
  const originalText = await original.innerText();
  await page.getByRole("group", { name: "Selected fixture outcome", exact: true }).getByRole("radio").nth(1).check();
  await page.getByLabel(/Rerun reason/).fill("A changed example needs another deliberate review.");
  await page.getByRole("button", { name: "Record manual rerun", exact: true }).click();
  await expect(original).toHaveText(originalText, { useInnerText: true });
  await expect(page.getByRole("group", { name: "Latest assessment comparison", exact: true })).toContainText("Changed since");
  const current = page.getByRole("article", { name: "Current selected-fixture outcome", exact: true });
  const lastGood = await current.innerText();
  await page.getByText("Try the failure state", { exact: true }).click();
  await page.getByRole("button", { name: "Simulate rerun failure", exact: true }).click();
  await expect(current).toHaveText(lastGood, { useInnerText: true });
  await expect(original).toHaveText(originalText, { useInnerText: true });
  await page.screenshot({ path: info.outputPath("sunroom-assessment-retained-result.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("tab", { name: "Work & decisions", exact: true }).click();
  await expect(page.getByRole("button", { name: "Move to development", exact: true })).toBeDisabled();
  await page.getByLabel(/Review confirmation rationale/).fill("Human review retained for this changed synthetic revision.");
  await page.getByRole("button", { name: "Confirm current review", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Human review confirmed");
});

for (const size of [20, 32]) {
  test(`Sunroom supports enlarged root text at ${size}px`, async ({ page }) => {
    for (const query of [
      "role=site-owner&view=profile",
      "role=site-owner&view=sites",
      "role=operator&view=queue",
      "role=operator&view=pipeline",
      "role=investor&view=portfolio",
      "role=site-owner&view=reports&scope=sweet-auburn",
    ]) {
      await page.goto(demoUrl(`/concepts/sunroom?${query}`));
      await expect(page.locator("main h1")).toBeVisible();
      await page.addStyleTag({ content: `html { font-size: ${size}px !important; }` });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), query).toBe(false);
    }
  });
}
