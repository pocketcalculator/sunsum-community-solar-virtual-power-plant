// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../src/features/community-context", import.meta.url));
const sources = readdirSync(root, { recursive: true, encoding: "utf8" })
  .filter((file) => /\.(ts|tsx)$/.test(file))
  .map((file) => ({ file, source: readFileSync(join(root, file), "utf8") }));

describe("public learning module boundary", () => {
  it("keeps every export independent of server, demo and persistence code", () => {
    expect(sources.length).toBeGreaterThan(0);
    for (const { file, source } of sources) {
      expect(source, file).not.toMatch(
        /(?:from|import)\s*["'][^"']*(?:backend|design-lab|live-workspace|participation|server-only|node:|next\/headers)/,
      );
      expect(source, file).not.toMatch(
        /\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage|indexedDB|speechSynthesis|SpeechRecognition|AudioContext)\b|\bgetUserMedia\s*\(/,
      );
    }
  });

  it("ships authored text rather than private source artifacts or embedded media", () => {
    for (const { file, source } of sources) {
      expect(source, file).not.toMatch(/\.docx|Attachment key:|C:\\Users\\|source-copy-redline|preserved_sha256/i);
      expect(source, file).not.toMatch(/<(?:audio|video|iframe)\b|\bautoPlay\b/);
    }
  });
});
