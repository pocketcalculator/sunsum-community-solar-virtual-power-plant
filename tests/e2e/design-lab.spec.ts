import { expect, test, type Page } from "@playwright/test";

test.use({ actionTimeout: 10_000 });

const navigation = {
  "site-owner": ["My profile", "My sites", "Solar potential", "Action center", "Documents", "Drafts & reports", "Activity log", "Overview"],
  operator: ["Action center", "Project pipeline", "Investor interest", "Documents", "Drafts & reports", "Activity log", "Overview"],
  investor: ["Discover projects", "My interests", "Investment mandate", "Deal documents", "Reports & exports", "Activity log", "Overview"],
};

function demoUrl(path: string) {
  const prefix = test.info().config.metadata.routePrefix;
  if (typeof prefix !== "string" || !prefix.endsWith("#")) throw new Error("Demo browser suites require playwright.vibehub.config.ts and the static hash entry.");
  return `${prefix}${path}`;
}

async function closePanel(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function openProject(page: Page, name: string) {
  await page.keyboard.press("Control+k");
  await page.getByRole("textbox", { name: "Search commands", exact: true }).fill(name);
  await page.getByRole("dialog").getByRole("button", { name: new RegExp(name) }).click();
  await expect(page.getByRole("dialog", { name, exact: true })).toBeVisible();
}

async function switchRole(page: Page, role: string) {
  await closePanel(page);
  const label = role === "site-owner" ? "Site owner" : role === "operator" ? "Operator" : role === "investor" ? "Investor" : null;
  if (!label) throw new Error(`Unknown demo role: ${role}`);
  await page.getByRole("radio", { name: label, exact: true }).check();
}

test.describe("sunroom", () => {
  for (const [role, pages] of Object.entries(navigation)) {
    test(`${role} workspace navigation and responsive layout`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(demoUrl(`/concepts/sunroom?role=${role}&view=overview`));
      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.locator("[data-concept]")).toHaveAttribute("data-concept", "sunroom");
      await expect(page.getByRole("link", { name: /Gridline|All concepts|Explore the (?:Sunroom|Gridline) concept/i, includeHidden: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Gridline|All concepts/i, includeHidden: true })).toHaveCount(0);
      await expect(page.getByRole("combobox", { name: /concept/i, includeHidden: true })).toHaveCount(0);
      for (const name of pages) {
        const menu = page.getByRole("button", { name: "Open navigation", exact: true });
        if (await menu.isVisible()) await menu.click();
        await page.getByRole("navigation", { name: /workspace/ }).getByRole("button", { name, exact: true }).click();
        await expect(page.locator("main h1")).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        if (overflow) console.log(await page.evaluate(() => ({
          viewport: window.innerWidth,
          pageWidth: document.documentElement.scrollWidth,
          outside: [...document.querySelectorAll("body *")].map((element) => {
            const bounds = element.getBoundingClientRect();
            return { tag: element.tagName, className: element.getAttribute("class"), left: bounds.left, right: bounds.right, text: element.textContent?.slice(0, 55) };
          }).filter((element) => element.left >= 0 && element.right > window.innerWidth + 1).slice(0, 12),
        })));
        expect(overflow, `sunroom, ${role}, ${name} must not overflow the page horizontally`).toBe(false);
        if (["My profile", "Action center", "Project pipeline", "Discover projects"].includes(name)) {
          await page.screenshot({ path: info.outputPath(`sunroom-${name.toLowerCase().replaceAll(" ", "-")}.png`), fullPage: true, animations: "disabled" });
        }
      }
      expect(errors).toEqual([]);
    });
  }

  test("command palette and role switch", async ({ page }) => {
    await page.goto(demoUrl("/concepts/sunroom?role=site-owner&view=overview"));
    await expect(page.locator("main h1")).toBeVisible();
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog", { name: "Find your next move" })).toBeVisible();
    await page.getByRole("textbox", { name: "Search commands", exact: true }).fill("Sweet Auburn");
    await page.getByRole("dialog").getByRole("button", { name: /Sweet Auburn rooftop/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("radio", { name: "Investor", exact: true }).check();
    const menu = page.getByRole("button", { name: "Open navigation", exact: true });
    if (await menu.isVisible()) await menu.click();
    await expect(page.getByRole("navigation", { name: "Investor workspace" })).toBeVisible();
    if (await menu.isVisible()) await closePanel(page);
    await page.reload();
    await expect(page.getByRole("radio", { name: "Investor", exact: true })).toBeChecked();
    await expect(page.locator("main")).not.toContainText("owner@example.invalid");
    await expect(page.locator("main")).not.toContainText("Example Street");
  });

  test("local guidance and reduced-motion behavior", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(demoUrl("/concepts/sunroom?role=site-owner&view=overview"));
    await expect(page.locator("main h1")).toBeVisible();
    const menu = page.getByRole("button", { name: "Open navigation", exact: true });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole("button", { name: "Ask Sunsum", exact: true }).click();
    await page.getByRole("textbox", { name: "Ask a question", exact: true }).fill("Is this a live grid control system?");
    await page.getByRole("button", { name: "Send question", exact: true }).click();
    await expect(page.getByRole("log")).toContainText("not live device control");
    const guide = page.getByRole("complementary", { name: "Ask SunSum", exact: true });
    await expect(guide).toContainText("no AI model");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const animations = await guide.evaluate((element) => getComputedStyle(element).animationName);
    expect(animations).toBe("none");
    await page.getByRole("button", { name: "Close guidance", exact: true }).click();
    await expect(guide).toHaveCount(0);
  });

  test("shared owner, operator and investor preview journey", async ({ page, context }) => {
    test.setTimeout(90_000);
    const name = "Harbor demo rooftop";
    await page.goto(demoUrl("/concepts/sunroom?role=site-owner&view=intake"));
    await page.getByLabel(/Fictional display name/).fill("Robin Example");
    await page.getByRole("button", { name: "Step 4: Review", exact: true }).click();
    await page.getByRole("checkbox", { name: /I agree to save fictional profile preferences/ }).check();
    await page.getByRole("button", { name: "Save profile", exact: true }).click();
    await page.getByLabel(/Site name/).fill(name);
    await page.getByLabel(/Contact name/).fill("Robin Example");
    await page.getByLabel(/Contact email/).fill("robin@example.invalid");
    await page.getByLabel(/Site address/).fill("742 Example Avenue, Atlanta, GA");
    await page.getByRole("button", { name: /Save & exit/i }).click();
    await page.reload();
    await openProject(page, name);
    await page.getByRole("button", { name: "Resume this draft", exact: true }).click();
    await page.getByRole("button", { name: /^Step 1:/ }).click();
    await expect(page.getByLabel(/Site name/)).toHaveValue(name);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel(/Usable area/).fill("1800");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("combobox", { name: "Document type", exact: true }).selectOption("site_summary");
    await page.getByLabel(/Choose a file/).setInputFiles({
      name: "private-site-summary.pdf", mimeType: "application/pdf", buffer: Buffer.from("Fictional metadata-only fixture"),
    });
    await page.getByRole("combobox", { name: "Document type", exact: true }).selectOption("electricity_bill");
    await page.getByLabel(/Choose a file/).setInputFiles({
      name: "private-bill.pdf", mimeType: "application/pdf", buffer: Buffer.from("Private fictional metadata-only fixture"),
    });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("button", { name: "Submit for screening", exact: true })).toBeDisabled();
    await page.getByRole("checkbox", { name: /I consent/ }).check();
    await page.getByRole("button", { name: "Submit for screening", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Potentially viable");
    const browserUrl = new URL(page.url());
    const appUrl = browserUrl.hash.startsWith("#/") ? new URL(browserUrl.hash.slice(1), browserUrl.origin) : browserUrl;
    const projectId = appUrl.searchParams.get("project");
    if (!projectId) throw new Error("Submitted project is missing its route identifier.");

    await page.getByRole("tab", { name: "Tasks & evidence", exact: true }).click();
    await page.getByRole("button", { name: "Open project documents", exact: true }).click();
    await page.getByRole("button", { name: "Add metadata", exact: true }).click();
    const upload = page.getByRole("dialog", { name: "Add document metadata", exact: true });
    await upload.getByRole("combobox", { name: "Document type", exact: true }).selectOption("site_summary");
    await upload.getByRole("radio", { name: /Shareable representation/ }).check();
    await upload.getByRole("checkbox", { name: /This represents a fictional, non-sensitive copy/ }).check();
    await upload.getByLabel(/Choose a file/).setInputFiles({
      name: "roof-summary.pdf", mimeType: "application/pdf", buffer: Buffer.from("Separate non-sensitive fictional representation"),
    });
    await upload.getByRole("button", { name: "Add metadata", exact: true }).click();
    await expect(upload).toHaveCount(0);

    await switchRole(page, "operator");
    await openProject(page, name);
    await page.getByRole("radio", { name: "Request info", exact: true }).click();
    await page.getByLabel(/Decision note/).fill("Confirm the usable roof area.");
    await page.getByRole("button", { name: "Record decision", exact: true }).click();
    await expect(page.getByRole("list", { name: "Shared project development stage" })).toHaveCount(0);
    await switchRole(page, "site-owner");
    await openProject(page, name);
    await expect(page.getByRole("dialog")).toContainText("Confirm the usable roof area.");
    await page.getByRole("button", { name: "Update and resubmit", exact: true }).click();
    await page.getByLabel(/Link to project request/).selectOption({ label: "Confirm the usable roof area." });
    await page.getByRole("combobox", { name: "Document type", exact: true }).selectOption("technical");
    await page.getByLabel(/Choose a file/).setInputFiles({
      name: "roof-area-evidence.pdf", mimeType: "application/pdf", buffer: Buffer.from("Fictional evidence for the selected task"),
    });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Resubmit site", exact: true }).click();
    await switchRole(page, "operator");
    await openProject(page, name);
    await page.getByRole("tab", { name: "Tasks & evidence", exact: true }).click();
    await page.getByRole("button", { name: "Review metadata for roof-area-evidence.pdf", exact: true }).click();
    const evidenceTask = page.getByRole("article", { name: "Confirm the usable roof area.", exact: true });
    await evidenceTask.getByRole("textbox").fill("Reviewed the fictional metadata for this request.");
    await evidenceTask.getByRole("button", { name: "Record task review", exact: true }).click();
    await page.getByRole("tab", { name: "Work & decisions", exact: true }).click();
    await page.getByLabel(/Decision note/).fill("Ready for the preliminary development review.");
    await page.getByRole("button", { name: "Record decision", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Awaiting project setup");
    await page.getByRole("button", { name: "Start pre-development", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Pre-development");
    await expect(page.getByRole("button", { name: "Move to development", exact: true })).toBeDisabled();
    await page.getByRole("tab", { name: "Tasks & evidence", exact: true }).click();
    const feasibilityTask = page.getByRole("article", { name: "Review the example feasibility scope", exact: true });
    await feasibilityTask.getByRole("textbox").fill("Reviewed the example scope; no real feasibility approval is implied.");
    await feasibilityTask.getByRole("button", { name: "Record task review", exact: true }).click();
    await page.getByRole("tab", { name: "Work & decisions", exact: true }).click();
    await page.getByRole("button", { name: "Move to development", exact: true }).click();
    await page.getByRole("button", { name: "Publish to investors", exact: true }).click();
    await page.getByRole("tab", { name: "Private notes", exact: true }).click();
    await page.getByLabel(/New private note/).fill("Internal review note, not investor-facing.");
    await page.getByRole("button", { name: "Save private note", exact: true }).click();

    await switchRole(page, "investor");
    await openProject(page, name);
    const room = page.getByRole("dialog");
    await expect(room).not.toContainText("roof-summary.pdf");
    await expect(room).not.toContainText("private-bill.pdf");
    await expect(room).not.toContainText("742 Example Avenue");
    await expect(room).not.toContainText("robin@example.invalid");
    await page.getByRole("button", { name: "Express non-binding interest", exact: true }).click();
    await page.getByRole("tab", { name: "Evidence", exact: true }).click();
    await expect(room).toContainText("roof-summary.pdf");
    await expect(room.getByText("roof-summary.pdf", { exact: true })).toBeVisible();
    await expect(room).not.toContainText("private-bill.pdf");
    await expect(room).not.toContainText("Internal review note");
    await expect(room.locator('[aria-current="step"]')).toHaveText(/Development/);
    await page.getByRole("tab", { name: "Overview", exact: true }).click();
    await page.getByRole("button", { name: "Withdraw interest", exact: true }).click();
    await expect(room).not.toContainText("roof-summary.pdf");
    await expect(page.getByRole("button", { name: "Express non-binding interest", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Express non-binding interest", exact: true }).click();

    const investorTab = await context.newPage();
    await investorTab.goto(demoUrl(`/concepts/sunroom?role=investor&view=portfolio&project=${projectId}`));
    await expect(investorTab.getByRole("dialog")).toContainText("roof-summary.pdf");
    await switchRole(page, "operator");
    await openProject(page, name);
    await page.getByRole("button", { name: "Hide from investors", exact: true }).click();
    await expect(investorTab.getByRole("dialog", { name: "Project unavailable", exact: true })).toBeVisible();
    await expect(investorTab.getByRole("dialog")).not.toContainText(name);
    await expect(investorTab.getByRole("dialog")).not.toContainText("roof-summary.pdf");
    await investorTab.close();

    await page.goto(demoUrl(`/concepts/sunroom?role=site-owner&view=sites&project=${projectId}`));
    await expect(page.getByRole("dialog", { name, exact: true }).locator('[aria-current="step"]')).toHaveText(/Development/);
    await page.reload();
    await expect(page.getByRole("dialog", { name, exact: true })).toContainText("roof-summary.pdf");
  });

  test("hidden project routes do not disclose project metadata", async ({ page }) => {
    await page.goto(demoUrl("/concepts/sunroom?role=investor&view=portfolio&project=grove-park"));
    const dialog = page.getByRole("dialog", { name: "Project unavailable", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog).not.toContainText("Grove Park");
    await expect(dialog).not.toContainText("Example Street");
    await expect(dialog).not.toContainText("electricity bill");
  });

  for (const pathname of ["/concepts", "/concepts/", "/concepts/gridline", "/concepts/gridline/"]) {
    test(`static ${pathname} aliases preserve fictional workspace context`, async ({ page }) => {
      const query = new URLSearchParams({
        role: "operator", view: "pipeline", project: "sweet-auburn", scope: "sweet-auburn",
        task: "task-sweet-auburn-milestone",
      });
      await page.goto(demoUrl(`${pathname}?${query}`));
      await expect(page.locator("[data-concept]")).toHaveAttribute("data-concept", "sunroom");
      await expect(page.getByRole("dialog", { name: "Sweet Auburn rooftop", exact: true })).toBeVisible();
      await closePanel(page);
      await expect(page.getByRole("radio", { name: "Operator", exact: true })).toBeChecked();
      await expect(page.getByRole("combobox", { name: "Project context", exact: true })).toHaveValue("sweet-auburn");
      await expect(page.getByRole("heading", { name: "Find a project. See its next step.", exact: true })).toBeVisible();
    });
  }

  test("unknown concept routes remain unavailable", async ({ page }) => {
    const path = "/concepts/unknown?role=operator&view=pipeline";
    await page.goto(demoUrl(path));
    await expect(page.getByRole("heading", { level: 1, name: /^That (?:preview )?page does not exist\.?$/ })).toBeVisible();
    await expect(page.locator("[data-concept]")).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Demo role", exact: true })).toHaveCount(0);
    await expect(page).toHaveURL((url) => url.hash === `#${path}`);
  });
});
