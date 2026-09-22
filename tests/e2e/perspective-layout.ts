import { expect, type Page } from "@playwright/test";

export async function expectCompactPerspectiveRow(page: Page, name: string) {
  const group = page.getByRole("group", { name, exact: true });
  const row = page.locator("[data-header-appearance-row]").filter({ has: group });
  await expect(row).toHaveCount(1);
  const theme = row.getByRole("switch", { name: "Dark appearance", exact: true });
  await expect(theme).toBeEnabled();
  const track = group.locator("[data-role-visual-track]");
  await expect(track).toHaveCount(1);
  const [roleBounds, themeBounds, trackBounds] = await Promise.all([
    group.boundingBox(), theme.boundingBox(), track.boundingBox(),
  ]);
  if (!roleBounds || !themeBounds || !trackBounds) throw new Error("The perspective/theme row has no visible geometry.");
  expect(trackBounds.height).toBeGreaterThanOrEqual(32);
  expect(trackBounds.height).toBeLessThanOrEqual(36);
  expect(Math.abs((roleBounds.y + roleBounds.height / 2) - (themeBounds.y + themeBounds.height / 2))).toBeLessThanOrEqual(2);
  expect(themeBounds.x).toBeGreaterThanOrEqual(roleBounds.x + roleBounds.width - 1);
  expect(themeBounds.x - roleBounds.x - roleBounds.width).toBeLessThanOrEqual(16);
  expect(themeBounds.height).toBeGreaterThanOrEqual(44);
  expect(await theme.evaluate((element) => element.previousElementSibling?.getAttribute("data-variant"))).toBe("pill");
  const metrics = await group.locator("[data-role-control]").evaluateAll((elements) => elements.map((element) => {
    const bounds = element.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height };
  }));
  expect(metrics).toHaveLength(3);
  expect(metrics.every((target) => target.width >= 44 && target.height >= 44)).toBe(true);
  expect(await track.evaluate((element) => parseFloat(getComputedStyle(element).borderTopLeftRadius))).toBeGreaterThanOrEqual(18);
  const fontSizes = await group.locator("[data-role]").evaluateAll((elements) =>
    elements.map((element) => parseFloat(getComputedStyle(element).fontSize)));
  expect(fontSizes.every((size) => size >= 13)).toBe(true);
  const labels = await group.locator("[data-role] > span").evaluateAll((elements) => elements.map((element) => {
    const label = element.getBoundingClientRect();
    const target = element.parentElement?.getBoundingClientRect();
    const lineHeight = parseFloat(getComputedStyle(element).lineHeight);
    return Boolean(target && Number.isFinite(lineHeight) && label.height <= lineHeight + 1 &&
      label.left >= target.left - 1 && label.right <= target.right + 1);
  }));
  expect(labels).toHaveLength(3);
  expect(labels.every(Boolean)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}

export async function expectPerspectiveGlide(page: Page, name: string, trigger: () => Promise<void>) {
  const indicator = page.getByRole("group", { name, exact: true }).locator("[data-role-indicator]");
  await expect(indicator).toHaveCount(1);
  await expect.poll(() => indicator.evaluate((element) =>
    element.getAnimations().filter((animation) => animation.playState === "running").length)).toBe(0);
  const start = await indicator.boundingBox();
  if (!start) throw new Error("The indicator has no initial geometry.");
  await indicator.evaluate((element) => {
    if (!(element instanceof HTMLElement)) throw new Error("Expected an HTML highlight.");
    delete element.dataset.motionSamples;
    const started = (event: Event) => {
      if (!(event instanceof TransitionEvent) || event.propertyName !== "transform") return;
      element.removeEventListener("transitionrun", started);
      const positions: number[] = [];
      const until = performance.now() + 350;
      const sample = () => {
        positions.push(element.getBoundingClientRect().left);
        if (performance.now() < until) requestAnimationFrame(sample);
        else element.dataset.motionSamples = JSON.stringify(positions);
      };
      requestAnimationFrame(sample);
    };
    element.addEventListener("transitionrun", started);
  });
  await trigger();
  await expect.poll(() => indicator.getAttribute("data-motion-samples")).not.toBeNull();
  const serialized = await indicator.getAttribute("data-motion-samples");
  const positions: unknown = JSON.parse(serialized ?? "null");
  if (!Array.isArray(positions) || !positions.every((value) => typeof value === "number" && Number.isFinite(value))) {
    throw new Error("No valid native animation samples were recorded.");
  }
  const end = await indicator.boundingBox();
  if (!end) throw new Error("The persistent indicator was removed.");
  expect(Math.abs(end.x - start.x)).toBeGreaterThan(4);
  const low = Math.min(start.x, end.x);
  const high = Math.max(start.x, end.x);
  expect(positions.some((position) => position > low + 1 && position < high - 1)).toBe(true);
  const duration = await indicator.evaluate((element) => {
    const style = getComputedStyle(element);
    const properties = style.transitionProperty.split(",").map((property) => property.trim());
    const durations = style.transitionDuration.split(",").map((value) => value.trim());
    const index = properties.indexOf("transform");
    const value = durations[index % durations.length] ?? "";
    return index < 0 ? 0 : parseFloat(value) * (value.endsWith("ms") ? 1 : 1000);
  });
  expect(duration).toBeGreaterThanOrEqual(180);
  expect(duration).toBeLessThanOrEqual(240);
}
