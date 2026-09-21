import { expect, test } from "@playwright/test";

function hostingPath() {
  const prefix = test.info().config.metadata.routePrefix;
  return typeof prefix === "string" ? prefix.replace(/#$/, "") : "/";
}

test("the static no-hash root opens Sunroom directly without a concept picker", async ({ page }) => {
  test.skip(!test.info().config.metadata.routePrefix, "Static build only.");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const root = hostingPath();
  await page.goto(root);
  await expect(page.getByRole("heading", { level: 1, name: "Your community, looking brighter.", exact: true })).toBeVisible();
  await expect(page.locator("[data-concept]")).toHaveAttribute("data-concept", "sunroom");
  await expect(page.getByRole("group", { name: "Demo role", exact: true }).getByRole("radio", { name: "Site owner", exact: true })).toBeChecked();
  await expect(page.getByRole("link", { name: /Gridline|All concepts|Explore the (?:Sunroom|Gridline) concept/i, includeHidden: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Gridline|All concepts/i, includeHidden: true })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: /concept/i, includeHidden: true })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/Gridline|Two points of view/i);
  await page.getByRole("link", { name: "Skip to content", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#lab-content")).toBeFocused();
  await expect(page).toHaveURL((url) => url.pathname === root);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Your community, looking brighter.", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

for (const pathname of ["/app", "/app/", "/concepts", "/concepts/", "/concepts/gridline", "/concepts/gridline/", "/concepts/sunroom/"]) {
  test(`static ${pathname} canonicalizes without losing query or fragment context`, async ({ page }) => {
    test.skip(!test.info().config.metadata.routePrefix, "Static build only.");
    const root = hostingPath();
    const context = "?role=operator&view=pipeline&project=sweet-auburn&scope=sweet-auburn&task=task-sweet-auburn-milestone&ref=old+link&ref=again#lab-content";
    const canonicalHash = `#/concepts/sunroom${context}`;
    await page.goto(`${root}#${pathname}${context}`);
    await expect(page).toHaveURL((url) => url.pathname === root && url.hash === canonicalHash);
    await expect(page.locator("[data-concept]")).toHaveAttribute("data-concept", "sunroom");
    await expect(page.getByRole("dialog", { name: "Sweet Auburn rooftop", exact: true })).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL((url) => url.pathname === root && url.hash === canonicalHash);
    await expect(page.getByRole("dialog", { name: "Sweet Auburn rooftop", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Demo role", exact: true }).getByRole("radio", { name: "Operator", exact: true })).toBeChecked();
    await expect(page.getByRole("combobox", { name: "Project context", exact: true })).toHaveValue("sweet-auburn");
    await expect(page.getByRole("heading", { level: 1, name: "Find a project. See its next step.", exact: true })).toBeVisible();
  });
}

for (const pathname of ["/concepts", "/concepts/gridline"]) {
  test(`static ${pathname} replaces the retired URL without extra back-forward entries`, async ({ page }) => {
    test.skip(!test.info().config.metadata.routePrefix, "Static build only.");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const root = hostingPath();
    const context = "?role=operator&view=pipeline#lab-content";
    const canonicalHash = `#/concepts/sunroom${context}`;
    await page.goto(`${root}#/`);
    await expect(page.getByRole("heading", { level: 1, name: /Community solar/ })).toBeVisible();
    const historyLength = await page.evaluate(() => window.history.length);

    await page.goto(`${root}#${pathname}${context}`);
    await expect(page).toHaveURL((url) => url.pathname === root && url.hash === canonicalHash);
    await expect(page.getByRole("group", { name: "Demo role", exact: true }).getByRole("radio", { name: "Operator", exact: true })).toBeChecked();
    await expect(page.getByRole("heading", { level: 1, name: "Find a project. See its next step.", exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.history.length)).toBe(historyLength + 1);

    await page.reload();
    await expect(page).toHaveURL((url) => url.pathname === root && url.hash === canonicalHash);
    await expect(page.getByRole("group", { name: "Demo role", exact: true }).getByRole("radio", { name: "Operator", exact: true })).toBeChecked();
    expect(await page.evaluate(() => window.history.length)).toBe(historyLength + 1);

    await page.goBack();
    await expect(page).toHaveURL((url) => url.pathname === root && url.hash === "#/");
    await expect(page.getByRole("heading", { level: 1, name: /Community solar/ })).toBeVisible();
    await expect(page.locator("[data-concept]")).toHaveCount(0);
    await page.goForward();
    await expect(page).toHaveURL((url) => url.pathname === root && url.hash === canonicalHash);
    await expect(page.getByRole("group", { name: "Demo role", exact: true }).getByRole("radio", { name: "Operator", exact: true })).toBeChecked();
    await expect(page.getByRole("heading", { level: 1, name: "Find a project. See its next step.", exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.history.length)).toBe(historyLength + 1);
    expect(errors).toEqual([]);
  });
}

for (const pathname of ["/need", "/opportunity", "/impact"]) {
  test(`authored ${pathname} page survives a static prefix reload`, async ({ page }) => {
    test.skip(!test.info().config.metadata.routePrefix, "Static build only.");
    const root = hostingPath();
    const errors: string[] = [];
    const serviceCalls: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/")) serviceCalls.push(request.url());
    });
    await page.goto(`${root}#${pathname}`);
    const title = page.getByRole("heading", { level: 1 });
    await expect(title).toBeVisible();
    const text = await title.innerText();
    expect(text.trim().length).toBeGreaterThan(0);
    await expect(page.locator("[data-concept]")).toHaveCount(0);
    await page.reload();
    await expect(page).toHaveURL((url) => url.pathname === root && url.hash === `#${pathname}`);
    await expect(title).toHaveText(text);
    expect(serviceCalls).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("About SunSum opens the original public landing, join flow and dashboard", async ({ page }) => {
  test.skip(!test.info().config.metadata.routePrefix, "Static build only.");
  const root = hostingPath();
  await page.goto(root);
  const about = page.getByRole("contentinfo").getByRole("link", { name: "About SunSum", exact: true });
  await expect(about).toHaveAttribute("href", "#/");
  await about.click();
  await expect(page).toHaveURL((url) => url.pathname === root && url.hash === "#/");
  await expect(page.getByRole("heading", { level: 1, name: /Community solar/ })).toBeVisible();
  await expect(page.locator("[data-concept]")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: /Community solar/ })).toBeVisible();
  await page.keyboard.press("Tab");
  await page.getByRole("link", { name: "Skip to main content", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await expect(page).toHaveURL((url) => url.pathname === root && url.hash === "#/");
  await page.getByRole("link", { name: "Start with i have a rooftop", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === root && url.hash === "#/join?start=i-have-roof");
  await expect(page.getByRole("checkbox", { name: /a rooftop to offer/i })).toBeChecked();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: /a rooftop to offer/i })).toBeChecked();
  await page.goto(`${root}#/dashboard/site-owner`);
  await expect(page).toHaveURL((url) => url.pathname === root && url.hash === "#/dashboard/site-owner");
  await expect(page.getByRole("button", { name: /Run simulation/i })).toBeEnabled();
  await expect(page.locator("[data-concept]")).toHaveCount(0);
});

test("profile progress labels fit their cards at narrow content widths and enlarged root text", async ({ page }, info) => {
  test.skip(!info.config.metadata.routePrefix, "Static build only.");
  await page.goto(`${hostingPath()}#/concepts/sunroom?role=site-owner&view=profile`);
  await expect(page.getByRole("heading", { name: "A profile you can revisit", exact: true })).toBeVisible();
  const steps = page.getByRole("list", { name: "Profile progress", exact: true }).getByRole("button");
  await expect(steps).toHaveCount(4);
  for (const size of [16, 24, 32]) {
    await page.evaluate((value) => { document.documentElement.style.fontSize = `${value}px`; }, size);
    const fits = await steps.evaluateAll((buttons) => buttons.map((button) => {
      const number = button.querySelector("span");
      const label = button.querySelector("strong");
      if (!number || !label) throw new Error("A progress step lost its visible number or label.");
      const bounds = button.getBoundingClientRect();
      const text = label.getBoundingClientRect();
      const marker = number.getBoundingClientRect();
      const style = getComputedStyle(button);
      return {
        name: button.getAttribute("aria-label"),
        contained: text.left >= marker.right - 1 &&
          text.right <= bounds.right - parseFloat(style.paddingRight) + 1 &&
          text.top >= bounds.top - 1 && text.bottom <= bounds.bottom + 1,
        touchTarget: bounds.width >= 44 && bounds.height >= 44,
      };
    }));
    expect(fits.every((step) => step.contained), JSON.stringify({ size, fits })).toBe(true);
    expect(fits.every((step) => step.touchTarget)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
  await page.screenshot({ path: info.outputPath("sunroom-profile-progress-reflow.png"), fullPage: true, animations: "disabled" });
});
