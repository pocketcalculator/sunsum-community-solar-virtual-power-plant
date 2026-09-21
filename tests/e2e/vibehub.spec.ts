import { expect, test } from "@playwright/test";
import { exercisePublicAudio } from "./public-audio-cases";
import { expectCompactPerspectiveRow, expectPerspectiveGlide } from "./perspective-layout";

function hostingPath() {
  const prefix = test.info().config.metadata.routePrefix;
  return typeof prefix === "string" ? prefix.replace(/#$/, "") : "/";
}

test("bare and explicit public roots show the original landing with a deliberate Sunroom entrance", async ({ page }, testInfo) => {
  test.skip(!test.info().config.metadata.routePrefix, "Static build only.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  const serviceCalls: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) serviceCalls.push(request.url());
  });
  const root = hostingPath();
  for (const hash of ["", "#/"]) {
    await page.goto(`${root}${hash}`);
    await expect(page.getByRole("heading", { level: 1, name: "Community solar, with communities at the center.", exact: true })).toBeVisible();
    await expect(page.locator("[data-concept]")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Explore participation", exact: true })).toHaveAttribute("href", "#/join");
    await expect(page.getByRole("link", { name: "Why local needs come first", exact: true })).toHaveAttribute("href", "#/need");
    const workspace = page.getByRole("link", { name: "Open Sunroom workspace", exact: true });
    await expect(workspace).toHaveAttribute("href", "#/app");
    await page.getByRole("link", { name: "Skip to main content", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: /Community solar/ })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`public-front-door-${hash ? "hash" : "bare"}.png`), fullPage: true, animations: "disabled" });
    await workspace.click();
    await expect(page).toHaveURL((url) => url.pathname === root && url.hash === "#/concepts/sunroom");
    await expect(page.getByRole("heading", { level: 1, name: "Your community, looking brighter.", exact: true })).toBeVisible();
    await expect(page.locator("[data-concept]")).toHaveAttribute("data-concept", "sunroom");
    const role = page.getByRole("group", { name: "Demo role", exact: true });
    expect(await role.evaluate((element) => element.closest("header") !== null)).toBe(true);
    await expectCompactPerspectiveRow(page, "Demo role");
    await page.screenshot({ path: testInfo.outputPath(`compact-synthetic-header-${hash ? "hash" : "bare"}.png`), animations: "disabled" });
    await page.getByRole("link", { name: "Skip to content", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#lab-content")).toBeFocused();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Your community, looking brighter.", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Gridline|All concepts/i, includeHidden: true })).toHaveCount(0);
  }
  expect(serviceCalls).toEqual([]);
  expect(errors).toEqual([]);
});

test("the shared role highlight glides forward and back instead of replacing selected backgrounds", async ({ page }, testInfo) => {
  test.skip(!testInfo.config.metadata.routePrefix, "Static build only.");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`${hostingPath()}#/concepts/sunroom?role=site-owner&view=overview`);
  const group = page.getByRole("group", { name: "Demo role", exact: true });
  await expect(group.getByRole("radio", { name: "Site owner", exact: true })).toBeChecked();
  await expectPerspectiveGlide(page, "Demo role", async () => {
    await group.getByRole("radio", { name: "Operator", exact: true }).check();
  });
  await expect(group.getByRole("radio", { name: "Operator", exact: true })).toBeChecked();
  await expectPerspectiveGlide(page, "Demo role", async () => {
    await group.getByRole("radio", { name: "Operator", exact: true }).press("ArrowLeft");
  });
  await expect(group.getByRole("radio", { name: "Site owner", exact: true })).toBeChecked();
  await page.screenshot({ path: testInfo.outputPath("shared-pill-glide-settled.png"), animations: "disabled" });
});

test("dragging tracks the pointer continuously, then glides back on cancellation without changing role", async ({ page }) => {
  test.skip(!test.info().config.metadata.routePrefix, "Static build only.");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`${hostingPath()}#/concepts/sunroom?role=site-owner&view=overview`);
  const group = page.getByRole("group", { name: "Demo role", exact: true });
  const owner = group.getByRole("radio", { name: "Site owner", exact: true });
  const operator = group.getByRole("radio", { name: "Operator", exact: true });
  const indicator = group.locator("[data-role-indicator]");
  const [first, second, initial] = await Promise.all([owner.boundingBox(), operator.boundingBox(), indicator.boundingBox()]);
  if (!first || !second || !initial) throw new Error("Role drag geometry is missing.");
  const pitch = second.x - first.x;
  const x = first.x + first.width / 2;
  const y = first.y + first.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + pitch * 0.6, y, { steps: 5 });
  await expect(indicator).toHaveAttribute("data-role-state", "preview");
  await expect.poll(async () => {
    const bounds = await indicator.boundingBox();
    return bounds ? Math.abs(bounds.x - initial.x - pitch * 0.6) : Infinity;
  }).toBeLessThan(2);
  await expect(owner).toBeChecked();
  await expectPerspectiveGlide(page, "Demo role", async () => {
    await page.keyboard.press("Escape");
    await page.mouse.up();
  });
  await expect(owner).toBeChecked();
});

test("reduced motion snaps the role highlight without losing keyboard selection", async ({ page }) => {
  test.skip(!test.info().config.metadata.routePrefix, "Static build only.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${hostingPath()}#/concepts/sunroom?role=site-owner&view=overview`);
  const group = page.getByRole("group", { name: "Demo role", exact: true });
  const owner = group.getByRole("radio", { name: "Site owner", exact: true });
  await owner.press("ArrowRight");
  await expect(group.getByRole("radio", { name: "Operator", exact: true })).toBeChecked();
  const indicator = group.locator("[data-role-indicator]");
  expect(await indicator.evaluate((element) =>
    getComputedStyle(element).transitionDuration.split(",").every((duration) => parseFloat(duration) === 0))).toBe(true);
  expect(await indicator.evaluate((element) => element.getAnimations().length)).toBe(0);
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

for (const topic of ["need", "opportunity", "impact"] as const) {
  test(`static ${topic} plays the exact supplied clip below the hosting prefix`, async ({ page }) => {
    test.skip(!test.info().config.metadata.routePrefix, "Static build only.");
    await page.emulateMedia({ reducedMotion: "reduce" });
    const root = hostingPath();
    const requests: string[] = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith("/api/") || path.startsWith("/audio/")) requests.push(path);
    });
    await page.goto(`${root}#/${topic}`);
    await page.reload();
    await exercisePublicAudio(page, topic, root);
    expect(requests).toEqual([]);
  });
}

test("static role workspace links use Sunroom without relocating the legacy owner illustration", async ({ page }) => {
  test.skip(!test.info().config.metadata.routePrefix, "Static build only.");
  const root = hostingPath();
  for (const [label, role, view] of [
    ["Fictional site owner workspace", "site-owner", "sites"],
    ["Fictional investor workspace", "investor", "portfolio"],
    ["Fictional operator workspace", "operator", "queue"],
  ] as const) {
    await page.goto(`${root}#/`);
    const link = page.getByRole("navigation", { name: "Role workspaces" }).getByRole("link", { name: label });
    await expect(link).toHaveAttribute("href", `#/concepts/sunroom?role=${role}&view=${view}`);
    await link.click();
    await expect(page.locator("[data-concept]")).toHaveAttribute("data-concept", "sunroom");
  }
  await page.getByRole("contentinfo").getByRole("link", { name: "About SunSum", exact: true }).click();
  const illustration = page.getByRole("link", { name: "Site owner illustration", exact: true });
  await expect(illustration).toHaveAttribute("href", "#/dashboard/site-owner");
  await illustration.click();
  await expect(page.getByRole("button", { name: /Run simulation/i })).toBeEnabled();
  await expect(page.locator("[data-concept]")).toHaveCount(0);
});

test("About SunSum opens the original public landing, join flow and dashboard", async ({ page }) => {
  test.skip(!test.info().config.metadata.routePrefix, "Static build only.");
  const root = hostingPath();
  await page.goto(`${root}#/concepts/sunroom`);
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
