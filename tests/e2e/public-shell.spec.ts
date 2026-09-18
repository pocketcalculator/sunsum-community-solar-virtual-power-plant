import { expect, test, type Page } from "@playwright/test";

const entryPaths = [
  { label: "I have a rooftop", href: "/join?start=i-have-roof" },
  { label: "I have land", href: "/join?start=i-have-land" },
  { label: "I want to fund projects", href: "/join?start=i-would-fund" },
];

const roleLinks = [
  { label: "Site Owner", href: "/dashboard/site-owner" },
  { label: "Investor", href: "/join?start=i-would-fund" },
  { label: "Platform Operator", href: "/join" },
];

async function hasOverflow(page: Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
}

async function chooseOption(page: Page, name: RegExp) {
  // Clicking the label is what a person actually does; the native input sits
  // beneath it, so targeting the input directly is not a realistic interaction.
  await page.getByText(name).click();
  await expect(page.getByRole("radio", { name, checked: true })).toBeVisible();
}

async function completeSignIn(page: Page) {
  await chooseOption(page, /email address and password/i);
  await page.getByRole("textbox", { name: "Full name" }).fill("Ada Lovelace");
  await page
    .getByRole("textbox", { name: "Email address" })
    .fill("ada@example.org");
  await page.getByLabel("Password", { exact: true }).fill("Correct-Horse-9!");
}

test("landing offers every way to take part without horizontal overflow", async ({
  page,
}, testInfo) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  for (const path of entryPaths) {
    const link = page.getByRole("link", {
      name: `Start with ${path.label.toLowerCase()}`,
      exact: true,
    });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", path.href);
  }

  const roleNavigation = page.getByRole("navigation", {
    name: "Role workspaces",
  });
  for (const role of roleLinks) {
    await expect(
      roleNavigation.getByRole("link", { name: role.label, exact: true }),
    ).toHaveAttribute("href", role.href);
  }

  expect(await hasOverflow(page)).toBe(false);
  await page.screenshot({
    path: testInfo.outputPath("landing.png"),
    fullPage: true,
    animations: "disabled",
  });
});

test("the create-profile flow opens on its first step", async ({
  page,
}, testInfo) => {
  const response = await page.goto("/join");
  expect(response?.status()).toBe(200);

  await expect(
    page.getByRole("heading", { level: 1, name: /create your sunsum profile/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: /tell us about you/i }),
  ).toBeVisible();
  await expect(page.getByText(/step 1 of 5/i).first()).toBeVisible();
  expect(await hasOverflow(page)).toBe(false);

  await page.screenshot({
    path: testInfo.outputPath("join-step-1.png"),
    fullPage: true,
    animations: "disabled",
  });
});

test("the site-owner dashboard renders its mock scenario without overflow", async ({
  page,
}, testInfo) => {
  const response = await page.goto("/dashboard/site-owner");
  expect(response?.status()).toBe(200);

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /explore a community solar scenario/i,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /run simulation/i }),
  ).toBeEnabled();
  await expect(page.getByText(/3 selected · maximum 5/i)).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(10);
  await expect(
    page
      .getByRole("region", { name: /location comparison cards/i })
      .getByRole("article"),
  ).toHaveCount(10);

  const pineMarker = page.getByRole("button", {
    name: /select 789 pine lane/i,
  });
  await pineMarker.hover();
  await expect(
    page.getByRole("tooltip").filter({ hasText: "789 Pine Lane" }),
  ).toBeVisible();
  await expect(
    page.getByRole("tooltip").filter({ hasText: "789 Pine Lane" }),
  ).toContainText("Mechanicsville");

  await page
    .getByRole("searchbox", {
      name: /search address, neighborhood, or property type/i,
    })
    .fill("987 Solar Way");
  await page.getByRole("button", { name: /add location/i }).click();
  await expect(
    page.getByRole("checkbox", { name: /987 solar way/i }),
  ).toBeChecked();
  await expect(page.getByText(/4 selected · maximum 5/i)).toBeVisible();

  await page.getByRole("button", { name: /select 789 pine lane/i }).click();
  await expect(page.getByText(/5 selected · maximum 5/i)).toBeVisible();
  await expect(page.getByText(/location selections changed/i)).toBeVisible();
  await page.getByRole("button", { name: /run simulation/i }).click();
  await expect(page.getByText("$88,000", { exact: true })).toBeVisible();
  await expect(page.getByText("$136,000", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/exclude 1 unvalidated draft location/i),
  ).toBeVisible();
  await expect(page.getByText(/location selections changed/i)).toHaveCount(0);

  const comparison = page.getByRole("region", {
    name: /location comparison cards/i,
  });
  await expect(
    comparison.getByText("Included in latest simulation", { exact: true }),
  ).toHaveCount(4);
  await expect(
    comparison.getByText(
      "Pending validation — excluded from latest simulation",
      { exact: true },
    ),
  ).toHaveCount(1);
  await expect(
    comparison
      .getByRole("heading", { level: 3, name: "Pine Ln" })
      .locator(".."),
  ).toContainText("$18,000");

  await page.getByTitle("Always use the light theme").click();
  await expect(
    page.getByRole("radio", { name: /^light$/i }),
  ).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByTitle("Always use the dark theme").click();
  await expect(page.getByRole("radio", { name: /^dark$/i })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await hasOverflow(page)).toBe(false);

  await page.screenshot({
    path: testInfo.outputPath("site-owner-dashboard.png"),
    fullPage: true,
    animations: "disabled",
  });
});

test("a landing deep link pre-selects the matching answer and stays editable", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: "Start with i have a rooftop", exact: true })
    .click();

  await expect(page).toHaveURL(/\/join\?start=i-have-roof$/);

  const rooftop = page.getByRole("checkbox", { name: /a rooftop to offer/i });
  await expect(rooftop).toBeChecked();

  // A starting value only: the person can clear it.
  await rooftop.uncheck();
  await expect(rooftop).not.toBeChecked();

  // It must never stand in for a participant type or skip a step.
  await expect(
    page.getByRole("heading", { level: 2, name: /tell us about you/i }),
  ).toBeVisible();
});

test("an unknown start parameter is ignored rather than breaking the page", async ({
  page,
}) => {
  const response = await page.goto("/join?start=not-a-real-option");
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: /create your sunsum profile/i }),
  ).toBeVisible();
  await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(0);
});

test("continuing with nothing filled in reports the problems and moves focus", async ({
  page,
}) => {
  await page.goto("/join");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: /create your sign-in/i }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Continue" }).click();

  // Next injects its own role="alert" route announcer, so scope to ours.
  const summary = page
    .getByRole("alert")
    .filter({ hasText: /check these before you continue/i });
  await expect(summary).toBeVisible();
  await expect(summary).toBeFocused();
  await expect(summary).toContainText(/enter an email address/i);

  // It must not advance while the step is invalid.
  await expect(
    page.getByRole("heading", { level: 2, name: /create your sign-in/i }),
  ).toBeVisible();
});

test("unavailable federated sign-in is disabled rather than pretending to work", async ({
  page,
}) => {
  await page.goto("/join");
  await page.getByRole("button", { name: "Continue" }).click();

  for (const provider of [/microsoft/i, /google/i, /apple/i]) {
    await expect(page.getByRole("radio", { name: provider })).toBeDisabled();
  }
  await expect(
    page.getByRole("radio", { name: /email address and password/i }),
  ).toBeEnabled();
});

test("a person can complete the flow and is told nothing was saved", async ({
  page,
}, testInfo) => {
  await page.goto("/join?start=i-have-roof");

  await page.getByRole("button", { name: "Continue" }).click();
  await completeSignIn(page);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { level: 2, name: /taking part as/i }),
  ).toBeVisible();
  await chooseOption(page, /myself/i);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { level: 2, name: /participant type/i }),
  ).toBeVisible();
  await chooseOption(page, /^property owner$/i);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { level: 2, name: /review your profile/i }),
  ).toBeVisible();
  await expect(page.getByText("Ada Lovelace").first()).toBeVisible();
  await page.getByRole("checkbox", { name: /not saved or sent/i }).check();
  await page.getByRole("button", { name: /finish and review/i }).click();

  await expect(
    page.getByRole("heading", { level: 2, name: /assembled/i }),
  ).toBeVisible();
  await expect(page.getByText(/not saved/i).first()).toBeVisible();

  // Nothing may imply an account exists.
  await expect(page.getByText(/account created/i)).toHaveCount(0);
  await expect(page.getByText(/welcome back/i)).toHaveCount(0);

  // The credential must never be echoed back. Rendered text is not enough:
  // it cannot see an input's value, a hidden subtree or an attribute, which is
  // exactly where a leak would hide.
  const rendered = await page.evaluate(() =>
    [
      document.documentElement.outerHTML,
      ...[...document.querySelectorAll("input")].map((input) => input.value),
    ]
      .join("\n")
      .toLowerCase(),
  );
  expect(rendered).not.toContain("correct-horse-9!");

  await page.screenshot({
    path: testInfo.outputPath("join-complete.png"),
    fullPage: true,
    animations: "disabled",
  });
});

test("going back keeps what was already entered", async ({ page }) => {
  await page.goto("/join");
  await page.getByRole("button", { name: "Continue" }).click();
  await completeSignIn(page);
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("textbox", { name: "Full name" })).toHaveValue(
    "Ada Lovelace",
  );
  await expect(page.getByRole("textbox", { name: "Email address" })).toHaveValue(
    "ada@example.org",
  );
});

test("skip navigation works with a keyboard", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: /skip to/i });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("unknown addresses return not-found with a way onwards", async ({
  page,
}) => {
  const response = await page.goto("/nope");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /home page/i })).toBeVisible();
});

for (const rootPixels of [20, 32]) {
  test(`supports enlarged root text at ${rootPixels}px without hiding overflow`, async ({
    page,
  }) => {
    for (const path of ["/", "/join", "/dashboard/site-owner", "/nope"]) {
      await page.goto(path);
      await page.addStyleTag({
        content: `:root { font-size: ${rootPixels}px !important; }`,
      });
      await expect(page.locator("html")).toHaveCSS(
        "font-size",
        `${rootPixels}px`,
      );
      expect(await hasOverflow(page), `${path} at ${rootPixels}px`).toBe(false);
    }
  });
}

test("metadata describes a public preview independently of body copy", async ({
  page,
}) => {
  for (const path of ["/", "/join", "/nope"]) {
    await page.goto(path);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      /public|planned|provisional|no account/i,
    );
  }
});
