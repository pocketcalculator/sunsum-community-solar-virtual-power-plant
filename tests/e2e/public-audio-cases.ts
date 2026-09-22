import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import assets from "../../src/features/participation/content/pageAudioAssets.json" with { type: "json" };

type Topic = keyof typeof assets.tracks;

function nativeState(element: HTMLElement | SVGElement) {
  if (!(element instanceof HTMLAudioElement)) throw new Error("Expected a native audio element.");
  return { paused: element.paused, muted: element.muted, time: element.currentTime,
    duration: element.duration, src: element.currentSrc || element.src, ended: element.ended };
}

export async function exercisePublicAudio(page: Page, topic: Topic, assetBase = "/", creditsPath?: string) {
  const track = assets.tracks[topic];
  const expectedUrl = new URL(`${assetBase}${track.path}`, page.url());
  const response = await page.request.get(expectedUrl.href);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("audio/mpeg");
  const bytes = await response.body();
  expect(bytes.length).toBe(track.bytes);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(track.sha256);

  await expect(page.getByRole("region", { name: `Music: ${track.title}`, exact: true }))
    .toContainText(track.attribution);
  if (creditsPath) {
    const noticeResponse = await page.request.get(new URL(creditsPath, page.url()).href);
    expect(noticeResponse.status()).toBe(200);
    const canonicalNotice = readFileSync(new URL("../../docs/ws1/audio-credits.txt", import.meta.url));
    expect(await noticeResponse.body()).toEqual(canonicalNotice);
  }

  const audio = page.locator("audio");
  await expect(audio).toHaveCount(1);
  await expect(audio).not.toHaveAttribute("autoplay");
  await expect(audio).not.toHaveAttribute("loop");
  expect((await audio.evaluate(nativeState)).paused).toBe(true);
  await page.getByRole("button", { name: `Mute ${track.title}`, exact: true }).click();
  const play = page.getByRole("button", { name: `Play ${track.title}`, exact: true });
  await play.focus();
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await audio.evaluate(nativeState)).paused).toBe(false);
  await expect.poll(async () => (await audio.evaluate(nativeState)).time).toBeGreaterThan(0.05);
  const playing = await audio.evaluate(nativeState);
  expect(playing.muted).toBe(true);
  expect(playing.src).toBe(expectedUrl.href);
  expect(Math.abs(playing.duration - track.durationSeconds)).toBeLessThan(1);
  await page.getByRole("button", { name: `Unmute ${track.title}`, exact: true }).click();
  expect((await audio.evaluate(nativeState)).muted).toBe(false);
  expect((await audio.evaluate(nativeState)).paused).toBe(false);
  await page.getByRole("button", { name: `Pause ${track.title}`, exact: true }).click();
  await expect.poll(async () => (await audio.evaluate(nativeState)).paused).toBe(true);
  await play.click();
  await expect.poll(async () => (await audio.evaluate(nativeState)).paused).toBe(false);
  await audio.evaluate((element) => {
    if (!(element instanceof HTMLAudioElement)) throw new Error("Expected a native audio element.");
    element.currentTime = Math.max(0, element.duration - 0.15);
  });
  await expect.poll(async () => (await audio.evaluate(nativeState)).ended).toBe(true);
  await expect(play).toBeVisible();
  expect((await audio.evaluate(nativeState)).paused).toBe(true);
  await play.click();
  await expect.poll(async () => (await audio.evaluate(nativeState)).paused).toBe(false);
  const previous = await audio.elementHandle();
  if (!previous) throw new Error("The playing audio element disappeared.");
  await page.getByRole("link", { name: "Return to SunSum", exact: true }).click();
  await expect(page.locator("audio")).toHaveCount(0);
  expect((await previous.evaluate(nativeState)).paused).toBe(true);
}
