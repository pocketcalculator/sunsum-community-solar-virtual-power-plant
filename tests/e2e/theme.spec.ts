import { expect, test, type Page } from "@playwright/test";

/**
 * The theme is decided before the first paint by an inline script, which is the
 * one part of it that cannot be seen from a unit test: jsdom has no paint, no
 * navigation and no second tab. These cases run the real document.
 */

const LIGHT_PAGE = "rgb(245, 247, 251)";
const DARK_PAGE = "rgb(10, 16, 29)";

function paintedTheme(page: Page) {
  return page.evaluate(() =>
    document.documentElement.getAttribute("data-theme"),
  );
}

function themeOption(page: Page, name: RegExp) {
  return page.getByRole("radio", { name });
}

/**
 * Clicking the label is what a person actually does: the radio itself is
 * clipped to a point beneath it, so targeting the control directly is not a
 * realistic interaction. Matches how the create-profile flow is exercised.
 */
async function chooseTheme(page: Page, name: RegExp) {
  const option = themeOption(page, name);
  const optionId = await option.getAttribute("id");
  if (optionId === null) throw new Error("The theme option has no id.");

  await page.locator(`label[for="${optionId}"]`).click();
  await expect(option).toBeChecked();
}

test("follows a device set to light, with no choice stored", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");

  expect(await paintedTheme(page)).toBe("light");
  await expect(page.locator("body")).toHaveCSS("background-color", LIGHT_PAGE);
  await expect(themeOption(page, /^system$/i)).toBeChecked();
});

test("follows a device set to dark, with no choice stored", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  expect(await paintedTheme(page)).toBe("dark");
  await expect(page.locator("body")).toHaveCSS("background-color", DARK_PAGE);
});

test("an explicit choice overrides the device and survives a reload", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  await chooseTheme(page, /^light$/i);
  await expect(page.locator("body")).toHaveCSS("background-color", LIGHT_PAGE);

  await page.reload();

  // The reload is the real test: the pre-paint script, not React, decided this.
  expect(await paintedTheme(page)).toBe("light");
  await expect(page.locator("body")).toHaveCSS("background-color", LIGHT_PAGE);
  await expect(themeOption(page, /^light$/i)).toBeChecked();
});

test("the choice is settled before the page is painted", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");

  const markup = await page.content();
  const headEnd = markup.indexOf("</head>");
  const script = markup.indexOf("sunsum.theme");
  const bodyStart = markup.indexOf("<body");

  // The script that writes the attribute has to finish inside the head, or the
  // body paints in the wrong theme first and corrects itself in view. Asserting
  // that `data-theme` merely appears somewhere would not show this: it is on the
  // opening <html> tag and inside the script's own text either way.
  expect(headEnd).toBeGreaterThan(-1);
  expect(script).toBeGreaterThan(-1);
  expect(script).toBeLessThan(headEnd);
  expect(headEnd).toBeLessThan(bodyStart);
});

test("the choice carries across pages without being chosen again", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await chooseTheme(page, /^light$/i);

  await page.getByRole("link", { name: /create your profile/i }).first().click();
  await expect(page).toHaveURL(/\/join$/);

  expect(await paintedTheme(page)).toBe("light");
  await expect(themeOption(page, /^light$/i)).toBeChecked();
});

test("handing control back to the device restores its setting", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");

  await chooseTheme(page, /^dark$/i);
  await expect(page.locator("body")).toHaveCSS("background-color", DARK_PAGE);

  await chooseTheme(page, /^system$/i);

  await expect(page.locator("body")).toHaveCSS("background-color", LIGHT_PAGE);
  expect(await paintedTheme(page)).toBe("light");
});

test("a device that changes its mind is followed while system is chosen", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("body")).toHaveCSS("background-color", DARK_PAGE);

  await page.emulateMedia({ colorScheme: "light" });

  await expect(page.locator("body")).toHaveCSS("background-color", LIGHT_PAGE);
  expect(await paintedTheme(page)).toBe("light");
});

test("a device that changes its mind is ignored after an explicit choice", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await chooseTheme(page, /^dark$/i);

  await page.emulateMedia({ colorScheme: "light" });

  await expect(page.locator("body")).toHaveCSS("background-color", DARK_PAGE);
});

test("the theme can be changed with a keyboard alone", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  const system = themeOption(page, /^system$/i);
  await system.focus();
  await expect(system).toBeFocused();

  // Arrow keys are the browser's own behaviour for a radio group, and they
  // wrap from the last option back to the first.
  await page.keyboard.press("ArrowRight");

  await expect(themeOption(page, /^light$/i)).toBeChecked();
  await expect(page.locator("body")).toHaveCSS("background-color", LIGHT_PAGE);
});

test("the control shows a visible focus ring in both themes", async ({
  page,
}) => {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");

    const option = themeOption(page, /^dark$/i);
    await option.focus();

    const outlineWidth = await option.evaluate((input) => {
      const label = input.nextElementSibling;
      if (!label) throw new Error("The option has no label to focus.");

      return window.getComputedStyle(label).outlineWidth;
    });

    expect(outlineWidth, `focus ring in ${scheme}`).not.toBe("0px");
  }
});

test("the light theme renders every public page without overflow", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "light" });

  for (const path of ["/", "/join", "/nope"]) {
    await page.goto(path);
    await expect(page.locator("body")).toHaveCSS("background-color", LIGHT_PAGE);

    const overflows = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflows, `${path} in the light theme`).toBe(false);
  }

  await page.goto("/");
  await page.screenshot({
    path: testInfo.outputPath("landing-light.png"),
    fullPage: true,
    animations: "disabled",
  });
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  /**
   * A native radio changes its own checked state with no script running, so an
   * enabled control here would report a theme the document never adopted. The
   * page itself is still readable: no attribute means the dark baseline paints.
   */
  test("offers no control it cannot honour", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");

    expect(await paintedTheme(page)).toBeNull();
    await expect(page.locator("body")).toHaveCSS("background-color", DARK_PAGE);

    for (const name of [/^light$/i, /^dark$/i, /^system$/i]) {
      await expect(themeOption(page, name)).toBeDisabled();
    }
  });
});
