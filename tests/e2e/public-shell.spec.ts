import { expect, test, type Page } from "@playwright/test";
import { THEME_STORAGE_KEY } from "../../src/components/ui/theme/theme";
import { exercisePublicAudio } from "./public-audio-cases";
import { expectCompactPerspectiveRow } from "./perspective-layout";

const entryPaths = [
  { label: "I have a rooftop", href: "/join?start=i-have-roof" },
  { label: "I have land", href: "/join?start=i-have-land" },
  { label: "I want to fund projects", href: "/join?start=i-would-fund" },
];

const roleLinks = [
  { label: "Site owner workspace", href: "/dashboard/site-owner" },
  { label: "Investor workspace", href: "/dashboard/investor" },
  { label: "Operator workspace", href: "/dashboard/operator" },
];

async function hasOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

async function chooseOption(page: Page, name: RegExp) {
  await page.getByText(name).click();
  await expect(page.getByRole("radio", { name, checked: true })).toBeVisible();
}

async function fillFictionalDetails(page: Page) {
  await page.getByRole("textbox", { name: "Example name", exact: true }).fill("Alex Example");
  await page.getByRole("textbox", { name: "Example email address", exact: true }).fill("alex@example.org");
}

async function completeProfile(page: Page, participant: RegExp = /^property owner$/i) {
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await fillFictionalDetails(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await chooseOption(page, /^as myself$/i);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await chooseOption(page, participant);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("checkbox", { name: /not saved or sent/i }).check();
  await page.getByRole("button", { name: /finish and review/i }).click();
}

test("landing keeps role workspaces distinct from fictional participation cards", async ({ page }, testInfo) => {
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

  const contexts = page.getByRole("navigation", { name: "Role workspaces" });
  for (const item of roleLinks) {
    await expect(contexts.getByRole("link", { name: item.label, exact: true }))
      .toHaveAttribute("href", item.href);
  }

  const primary = page.getByRole("navigation", { name: "Primary", exact: true });
  for (const [name, href] of [
    ["Need", "/need"], ["Opportunity", "/opportunity"], ["Impact", "/impact"],
    ["About", "/#about"], ["FAQ", "/#faq"], ["Workspace", "/app"],
  ] as const) {
    await expect(primary.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
  }
  await expect(page.getByRole("link", { name: "Why local needs come first", exact: true })).toHaveAttribute("href", "/need");
  expect(await hasOverflow(page)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("landing.png"), fullPage: true, animations: "disabled" });
});

for (const [route, title] of [
  ["/need", "The Need Page"], ["/opportunity", "The Opportunity"], ["/impact", "The Impact"],
] as const) {
  test(`${route} has an authored story, optional VPP education and a return`, async ({ page }) => {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
    await expect(page.getByRole("article")).toContainText("not a claim of current projects or guaranteed outcomes");
    const learning = page.locator("details").filter({ hasText: "Learn how a virtual power plant works" });
    await expect(learning).not.toHaveAttribute("open");
    await learning.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(learning).toHaveAttribute("open");
    await expect(learning.getByRole("term")).toHaveCount(5);
    await expect(learning).toContainText("Grid-tied solar alone is not backup power");
    expect(await hasOverflow(page)).toBe(false);
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.locator("video, iframe")).toHaveCount(0);
    await expect(page.locator("audio")).toHaveCount(1);
    await expect(page.locator("audio")).toHaveAttribute("src", `/audio${route}.mp3`);
    await expect(page.locator("audio")).not.toHaveAttribute("autoplay");
    await expect(page.locator("audio")).not.toHaveAttribute("loop");
    await page.getByRole("link", { name: "Return to SunSum", exact: true }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
}

for (const topic of ["need", "opportunity", "impact"] as const) {
  test(`${topic} plays the supplied media with independent keyboard playback and mute controls`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/${topic}`);
    await exercisePublicAudio(page, topic);
  });
}

test("a failed public clip reports an error without losing the authored story", async ({ page }) => {
  await page.route("**/audio/need.mp3", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto("/need");
  await page.getByRole("button", { name: /^Play / }).click();
  await expect(page.getByRole("region", { name: /^Music:/ }).getByRole("alert")).toContainText("could not be played");
  await expect(page.getByRole("button", { name: /^Play / })).toBeVisible();
  await expect(page.getByRole("article")).toContainText("not a claim of current projects or guaranteed outcomes");
});

test("the service workspace keeps a thin role capsule next to theme without header overlap", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/app");
  await expect(page.getByRole("group", { name: "Workspace role", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("compact-workspace-role-theme.png"), fullPage: false, animations: "disabled" });
  await expectCompactPerspectiveRow(page, "Workspace role");
});

test("the profile preview opens on its first step", async ({ page }, testInfo) => {
  const response = await page.goto("/join");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Explore your participation" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Tell us about you" })).toBeVisible();
  await expect(page.getByText(/step 1 of 5/i).first()).toBeVisible();
  expect(await hasOverflow(page)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("join-step-1.png"), fullPage: true, animations: "disabled" });
});

for (const [role, view] of [["site-owner", "sites"], ["operator", "queue"], ["investor", "portfolio"]] as const) {
test(`the dynamic ${role} alias enters the canonical workspace without a persona grant or sample fallback`, async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url());
  });
  await page.goto(`/dashboard/${role}?role=operator&next=https://outside.invalid`);
  await expect(page).toHaveURL(new RegExp(`/app\\?view=${view}$`));
  await expect(page.getByRole("heading", { name: "Your service connection is out of reach right now" })).toBeVisible();
  await expect(page.getByText("Connection unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /run simulation/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Refresh permitted reads", exact: true })).toBeDisabled();
  expect(apiRequests).toEqual([]);
  expect(await page.evaluate(() =>
    Object.keys(localStorage).filter((key) => key.startsWith("sunsum-design-lab")),
  )).toEqual([]);
});
}

test("a landing deep link pre-selects an editable answer without skipping a step", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Start with i have a rooftop", exact: true }).click();
  await expect(page).toHaveURL(/\/join\?start=i-have-roof$/);
  const rooftop = page.getByRole("checkbox", { name: /a rooftop to offer/i });
  await expect(rooftop).toBeChecked();
  await rooftop.uncheck();
  await expect(rooftop).not.toBeChecked();
  await expect(page.getByRole("heading", { level: 2, name: "Tell us about you" })).toBeVisible();
});

test("an unknown start parameter is ignored rather than breaking the page", async ({ page }) => {
  const response = await page.goto("/join?start=not-a-real-option");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Explore your participation" })).toBeVisible();
  await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(0);
});

test("missing fictional details report the problems and move focus", async ({ page }) => {
  await page.goto("/join");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const summary = page.getByRole("alert").filter({ hasText: /check these before you continue/i });
  await expect(summary).toBeVisible();
  await expect(summary).toBeFocused();
  await expect(summary).toContainText(/enter an email address/i);
  await expect(page.getByRole("heading", { level: 2, name: "Try fictional profile details" })).toBeVisible();
});

test("the public flow offers no password, code or pretend identity-provider path", async ({ page }) => {
  await page.goto("/join");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator('input[type="password"], input[autocomplete="one-time-code"], input[autocomplete="new-password"], input[autocomplete="current-password"]')).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /microsoft|google|apple|sign.in/i })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Example name", exact: true })).toHaveAttribute("autocomplete", "off");
  await expect(page.getByRole("textbox", { name: "Example email address", exact: true })).toHaveAttribute("autocomplete", "off");
});

test("a person can complete the fictional flow without saving or service requests", async ({ page }, testInfo) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url());
  });
  await page.goto("/join?start=i-have-roof");
  await completeProfile(page);
  await expect(page.getByRole("heading", { level: 2, name: "Your fictional profile is assembled" })).toBeVisible();
  await expect(page.getByText("alex@example.org", { exact: true })).toBeVisible();
  await expect(page.getByText(/no workspace access has been granted/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Explore workspace", exact: true })).toHaveAttribute("href", "/app");
  await expect(page.locator('input[type="password"], input[autocomplete="one-time-code"]')).toHaveCount(0);
  expect(apiRequests).toEqual([]);
  expect(await page.evaluate((themeKey) =>
    Object.keys(localStorage).filter((key) => key !== themeKey), THEME_STORAGE_KEY,
  )).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("join-complete.png"), fullPage: true, animations: "disabled" });
});

test("going back keeps fictional answers", async ({ page }) => {
  await page.goto("/join");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await fillFictionalDetails(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Example name", exact: true })).toHaveValue("Alex Example");
  await expect(page.getByRole("textbox", { name: "Example email address", exact: true })).toHaveValue("alex@example.org");
});

test("keyboard learning and return preserve an unfinished profile", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/join?start=i-have-roof");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("textbox", { name: "Example name", exact: true }).fill("An unfinished example");
  const summary = page.locator("summary").filter({ hasText: "Learning and help (optional)" });
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Virtual power plant learning" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Human adoption support" })).toContainText("does not contact a project manager");
  await page.getByRole("button", { name: "Return to profile preview", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Try fictional profile details" })).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Example name", exact: true })).toHaveValue("An unfinished example");
  await expect(page.getByRole("textbox", { name: "Example email address", exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /a rooftop to offer/i })).toBeChecked();
});

for (const [label, participant] of [
  ["researcher", /^student or researcher$/i],
  ["workforce", /^workforce development participant$/i],
  ["learning", /^just learning more$/i],
] as const) {
  test(`${label} completion leads to learning, not a fourth workspace`, async ({ page }) => {
    await page.goto("/join");
    await completeProfile(page, participant);
    const next = page.getByRole("region", { name: "Where to explore next" });
    await expect(next.getByRole("heading", { name: "Keep exploring through learning" })).toBeVisible();
    await expect(next.getByRole("link", { name: /workspace/i })).toHaveCount(0);
    await next.getByRole("button", { name: "Open learning and help", exact: true }).click();
    await expect(page.getByRole("region", { name: "Virtual power plant learning" })).toBeVisible();
    await page.getByRole("button", { name: "Return to profile preview", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your fictional profile is assembled" })).toBeFocused();
  });
}

test("public appearance retains its Light, Dark and System choices", async ({ page }) => {
  await page.goto("/");
  const theme = page.getByRole("group", { name: /colour theme/i });
  await expect(theme.getByRole("radio")).toHaveCount(3);
  await page.getByTitle("Always use the light theme").click();
  await expect(theme.getByRole("radio", { name: /^light$/i })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByTitle("Always use the dark theme").click();
  await expect(theme.getByRole("radio", { name: /^dark$/i })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByTitle("Follow the theme this device is set to").click();
  await expect(theme.getByRole("radio", { name: /^system$/i })).toBeChecked();
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

test("unknown addresses return not-found with a way onwards", async ({ page }) => {
  const response = await page.goto("/nope");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /home page/i })).toBeVisible();
});

for (const rootPixels of [20, 32]) {
  test(`supports enlarged root text at ${rootPixels}px with learning open`, async ({ page }) => {
    for (const path of ["/", "/need", "/opportunity", "/impact", "/join", "/nope"]) {
      await page.goto(path);
      await page.addStyleTag({ content: `:root { font-size: ${rootPixels}px !important; }` });
      await expect(page.locator("html")).toHaveCSS("font-size", `${rootPixels}px`);
      const learning = page.locator("summary").filter({ hasText: /Learning and help \(optional\)|Learn how a virtual power plant works/ });
      if (await learning.count()) await learning.click();
      expect(await hasOverflow(page), `${path} at ${rootPixels}px`).toBe(false);
    }
  });
}

test("metadata distinguishes the fictional preview from authorized service actions", async ({ page }) => {
  for (const path of ["/", "/need", "/opportunity", "/impact", "/join", "/nope"]) {
    await page.goto(path);
    const description = page.locator('meta[name="description"]');
    if (path !== "/join") {
      await expect(description).toHaveAttribute("content", /separate synthetic demo uses fictional browser-local data/i);
      await expect(description).toHaveAttribute("content", /service actions require authorized access/i);
    } else {
      await expect(description).toHaveAttribute("content", /no account is created/i);
      await expect(description).toHaveAttribute("content", /nothing you enter is saved/i);
    }
  }
});
