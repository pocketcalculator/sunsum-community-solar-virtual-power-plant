import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "public", "design-previews");
const baseURL = new URL(process.env.DESIGN_LAB_URL ?? "http://127.0.0.1:4183/");
if (!["http:", "https:"].includes(baseURL.protocol) || baseURL.username || baseURL.password) {
  throw new Error("DESIGN_LAB_URL must identify the static preview without embedded credentials.");
}
const concepts = [...new Set((process.env.DESIGN_LAB_CONCEPTS ?? "sunroom").split(",").map((value) => value.trim()))];
if (concepts.length !== 1 || concepts[0] !== "sunroom") {
  throw new Error("DESIGN_LAB_CONCEPTS only supports sunroom.");
}
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "msedge" });
try {
  for (const concept of concepts) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1120 },
      reducedMotion: "reduce",
      colorScheme: "dark",
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const route = new URL(baseURL);
    route.hash = `/concepts/${concept}?role=site-owner&view=overview`;
    await page.goto(route.href, { waitUntil: "networkidle", timeout: 120_000 });
    await page.locator('[data-concept="sunroom"]').waitFor({ timeout: 60_000 });
    await page.getByRole("button", { name: /Synthetic preview.*service status/ }).waitFor();
    await page.locator("main h1").waitFor({ timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(output, `${concept}.png`) });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: join(output, `${concept}-mobile.png`), fullPage: true });
    if (errors.length) throw new Error(`${concept}: ${errors.join("\n")}`);
    await context.close();
    console.log(`${concept}: desktop + mobile saved in ${output}`);
  }
} finally {
  await browser.close();
}
