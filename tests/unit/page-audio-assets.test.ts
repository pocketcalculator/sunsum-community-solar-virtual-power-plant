// @vitest-environment node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import assets from "../../src/features/participation/content/pageAudioAssets.json";

describe("approved public audio manifest", () => {
  it("contains only the three measured topic mappings and no private correspondence", () => {
    expect(assets.schemaVersion).toBe(1);
    expect(Object.keys(assets.tracks)).toEqual(["need", "opportunity", "impact"]);
    expect(JSON.stringify(assets)).not.toMatch(/AAMk|attachment_id|message_id|privateSource|C:\\\\Users/);
  });

  it("ships a standalone third-party notice whose credits match the canonical manifest", () => {
    const notice = readFileSync(new URL("../../docs/ws1/audio-credits.txt", import.meta.url), "utf8")
      .replace(/\r\n/g, "\n");
    expect(notice).toContain("THIRD-PARTY AUDIO - NOT COVERED BY THE MIT CODE LICENSE");
    expect(notice).toContain("website, in the repository and in release bundles");
    for (const track of Object.values(assets.tracks)) {
      expect(notice).toContain(`File: ${track.path}\nTitle: ${track.title}\nAttribution: ${track.attribution}`);
    }
    expect(existsSync(new URL("../../public/audio/NOTICE.txt", import.meta.url))).toBe(false);
    expect(notice).not.toMatch(/AAMk|attachment_id|message_id|privateSource|audio-handoff|approval.packet|C:\\Users/);
  });

  it.each(["need", "opportunity", "impact"] as const)("%s binds the actual public bytes and finite native-probe metadata", (topic) => {
    const track = assets.tracks[topic];
    expect(track.path).toBe(`audio/${topic}.mp3`);
    expect(track.mime).toBe("audio/mpeg");
    const bytes = readFileSync(new URL(`../../public/${track.path}`, import.meta.url));
    expect(bytes.length).toBe(track.bytes);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(track.sha256);
    expect(bytes.subarray(0, 3).toString("ascii")).toBe("ID3");
    expect(Number.isFinite(track.durationSeconds) && track.durationSeconds > 0).toBe(true);
    expect(Number.isSafeInteger(track.sampleRateHz) && track.sampleRateHz > 0).toBe(true);
    expect(Number.isSafeInteger(track.channels) && track.channels > 0).toBe(true);
    expect(track.title.length).toBeGreaterThan(0);
    expect(track.attribution.length).toBeGreaterThan(0);
  });
});
