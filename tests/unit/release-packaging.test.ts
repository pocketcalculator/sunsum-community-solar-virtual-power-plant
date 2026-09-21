// @vitest-environment node
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  closeSync, copyFileSync, existsSync, ftruncateSync, mkdirSync, mkdtempSync, openSync,
  readFileSync, readdirSync, rmSync, symlinkSync, truncateSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const directories: string[] = [];
let fixture: string;
const topics = ["need", "opportunity", "impact"] as const;
const audioManifestPath = "src/features/participation/content/pageAudioAssets.json";
const audioCreditsPath = "docs/ws1/audio-credits.txt";
const audioCreditsHeader = "THIRD-PARTY AUDIO - NOT COVERED BY THE MIT CODE LICENSE";
// These byte fixtures test archive integrity, not decoding or the real clips' provenance.
const audioContent = Object.fromEntries(topics.map((topic) => [topic, Buffer.from(`synthetic-package-audio:${topic}`)]));
const audioManifest = {
  schemaVersion: 1,
  tracks: Object.fromEntries(topics.map((topic) => [topic, {
    path: `audio/${topic}.mp3`,
    title: `${topic} packaging fixture`,
    attribution: "Synthetic test bytes, not a recording.",
    mime: "audio/mpeg",
    bytes: audioContent[topic]!.byteLength,
    sha256: createHash("sha256").update(audioContent[topic]!).digest("hex"),
    durationSeconds: 1,
    sampleRateHz: 44100,
    channels: 1,
  }])),
};
const audioCredits = `${audioCreditsHeader}\nSynthetic packaging fixtures, not recordings.\n${topics.map((topic) =>
  `${audioManifest.tracks[topic]!.title}\n${audioManifest.tracks[topic]!.attribution}\n`).join("\n")}`;
const demoContent = {
  "index.html": '<h1 id="demo">Fictional demo</h1><script src="./assets/fixture.js"></script>',
  "assets/fixture.js": 'document.getElementById("demo").dataset.mode = "SYNTHETIC_DEMO_ONLY";',
  "AUDIO-CREDITS.txt": audioCredits,
  ...Object.fromEntries(topics.map((topic) => [`audio/${topic}.mp3`, audioContent[topic]!])),
};
const operatorPaths = [
  "README.md", "LICENSE", "docs/ws1/connections.md", "docs/ws1/connection-and-deployment-guide.md",
  "docs/ws1/live-read.env.example", "docs/ws1/server-demo.env.example", "docs/ws1/media-credits.md",
  "docs/ws1/code-approval.example.json", audioManifestPath, audioCreditsPath, "scripts/New-UiRelease.ps1",
  "docs/ws1/architecture.md", "docs/ws1/contracts.md", "infrastructure/docs/app-service-postgres.md",
  "infrastructure/scripts/New-AppServicePackage.ps1", "infrastructure/scripts/Test-AppServicePackage.ps1",
  "infrastructure/scripts/Deploy-AppServiceCode.ps1", "infrastructure/scripts/DeploymentSafety.psm1",
].sort();

interface ArchiveEntry {
  name: string;
  bytes: number;
  sha256: string;
}

function inspectArchive(path: string): ArchiveEntry[] {
  const result = spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-Command", `
    $ErrorActionPreference = 'Stop'
    $archive = [System.IO.Compression.ZipFile]::OpenRead($env:SUNSUM_TEST_ARCHIVE)
    try {
      $entries = @(foreach ($entry in $archive.Entries) {
        $stream = $entry.Open()
        try { $hash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($stream)) }
        finally { $stream.Dispose() }
        [pscustomobject]@{ name = $entry.FullName; bytes = $entry.Length; sha256 = $hash }
      })
      ConvertTo-Json -InputObject $entries -Compress
    } finally { $archive.Dispose() }
  `], { encoding: "utf8", timeout: 10_000, env: { ...process.env, SUNSUM_TEST_ARCHIVE: path } });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message);
  return JSON.parse(result.stdout);
}

function put(path: string, content: string | Uint8Array) {
  const destination = join(fixture, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
}

function git(...args: string[]) {
  const result = spawnSync("git", ["-C", fixture, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message);
  return result.stdout.trim();
}

function stamp() {
  const directory = join(fixture, "build", "vibehub");
  const files = readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)).replaceAll("\\", "/"))
    .filter((path) => path !== "demo-build.json");
  put("build/vibehub/demo-build.json", JSON.stringify({
    mode: "SYNTHETIC_DEMO_ONLY",
    sourceRevision: git("rev-parse", "HEAD"),
    sourceClean: true,
    files: Object.fromEntries(files.map((file) =>
      [file, createHash("sha256").update(readFileSync(join(directory, file))).digest("hex")])),
  }));
}

function packageRelease(destination = join(fixture, ".azure", "release")) {
  return spawnSync("pwsh", [
    "-NoProfile", "-NonInteractive", "-File", join(root, "scripts", "New-UiRelease.ps1"),
    "-SourceRoot", fixture, "-OutputDirectory", destination,
  ], { encoding: "utf8", timeout: 30_000 });
}

function packageApplication() {
  return spawnSync("pwsh", [
    "-NoProfile", "-NonInteractive", "-File", join(root, "infrastructure", "scripts", "New-AppServicePackage.ps1"),
    "-SourceRoot", fixture, "-OutputPath", join(fixture, ".azure", "application.zip"),
  ], { encoding: "utf8", timeout: 20_000 });
}

function validateApplication(path = join(fixture, ".azure", "application.zip")) {
  return spawnSync("pwsh", [
    "-NoProfile", "-NonInteractive", "-File", join(root, "infrastructure", "scripts", "Test-AppServicePackage.ps1"),
    "-Path", path,
  ], { encoding: "utf8", timeout: 10_000 });
}

function grow(path: string, bytes: number) {
  const destination = join(fixture, path);
  mkdirSync(dirname(destination), { recursive: true });
  const descriptor = openSync(destination, "w");
  try { ftruncateSync(descriptor, bytes); }
  finally { closeSync(descriptor); }
}

function expectReleaseRefusal(message: string) {
  const result = packageRelease();
  expect(result.error).toBeUndefined();
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(message);
  expect(existsSync(join(fixture, ".azure", "release", "sunsum-app-source.zip"))).toBe(false);
}

beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), "sunsum-release-test-"));
  directories.push(fixture);
  put(".gitignore", "/build\n/.azure\n.env\n");
  put("package.json", JSON.stringify({
    name: "release-fixture", scripts: { start: "next start" }, engines: { node: "^22.22.2", npm: "^10.0.0" },
  }));
  put("package-lock.json", JSON.stringify({ name: "release-fixture", lockfileVersion: 3, packages: {} }));
  put("tsconfig.json", "{}");
  put("app/layout.tsx", "export default function Layout() { return null; }");
  put(audioManifestPath, JSON.stringify(audioManifest));
  put(audioCreditsPath, audioCredits);
  for (const topic of topics) put(`public/audio/${topic}.mp3`, audioContent[topic]!);
  put(".env", "EXCLUDED_TEST_VALUE=never-in-application-archive");
  for (const file of [
    "README.md", "LICENSE", "docs/ws1/connections.md", "docs/ws1/connection-and-deployment-guide.md",
    "docs/ws1/live-read.env.example", "docs/ws1/server-demo.env.example", "docs/ws1/media-credits.md",
    "docs/ws1/code-approval.example.json",
    "docs/ws1/architecture.md", "docs/ws1/contracts.md", "infrastructure/docs/app-service-postgres.md",
  ]) put(file, "Public-safe fixture documentation.");
  for (const file of [
    "New-AppServicePackage.ps1", "Test-AppServicePackage.ps1",
    "Deploy-AppServiceCode.ps1", "DeploymentSafety.psm1",
  ]) {
    const target = join(fixture, "infrastructure", "scripts", file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(root, "infrastructure", "scripts", file), target);
  }
  mkdirSync(join(fixture, "scripts"), { recursive: true });
  copyFileSync(join(root, "scripts", "New-UiRelease.ps1"), join(fixture, "scripts", "New-UiRelease.ps1"));
  git("init", "--quiet");
  git("add", ".");
  git("-c", "user.name=SunSum test", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m",
    "Release fixture\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>");
  for (const [file, text] of Object.entries(demoContent)) put(`build/vibehub/${file}`, text);
  stamp();
});

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("local-only release assembly", () => {
  it("packages a clean source revision and hash-bound demo with separate operator documentation", () => {
    const result = packageRelease();
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    const release = join(fixture, ".azure", "release");
    const manifest = JSON.parse(readFileSync(join(release, "release-manifest.json"), "utf8").replace(/^\uFEFF/, ""));
    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.sourceRevision).toBe(git("rev-parse", "HEAD"));
    expect(manifest.backendContractRevision).toBe("449f6b0660609af3c80946f618c5e73828a36768");
    expect(manifest.deployedRevision).toBeNull();
    expect(manifest.AzureCalls).toBe(0);
    expect(manifest.application.mode).toBe("DYNAMIC_WORKSPACE");
    expect(manifest.application.supportedSourceModes).toEqual(["connected", "server-demo"]);
    const interest = { method: "POST", path: "/api/projects/{id}/engagements", body: {} };
    expect(manifest.application.allowedMutations.connected).toEqual([interest]);
    expect(manifest.application.allowedMutations["server-demo"]).toEqual([
      interest, expect.objectContaining({ method: "POST", path: "/api/auth/demo-switch" }),
    ]);
    expect(manifest.application.admission["server-demo"]).toContain("SUNSUM_DEMO_AUTH=enabled");
    expect(manifest.demo.mode).toBe("SYNTHETIC_DEMO_ONLY");
    expect(manifest.demo.allowedMutations).toEqual([]);
    expect(manifest.demo.serviceTransport).toBe(false);
    expect(manifest.demo.sessionTransport).toBe(false);
    expect(manifest.nodeRequirement).toBe("^22.22.2");
    expect(manifest.npmRequirement).toBe("^10.0.0");
    expect(manifest.limits).toEqual({
      compressedBytes: 64 * 1024 * 1024, uncompressedBytes: 64 * 1024 * 1024,
      entryBytes: 32 * 1024 * 1024, entries: 10000,
    });
    expect(manifest.application.sha256.toLowerCase()).toBe(
      createHash("sha256").update(readFileSync(join(release, "sunsum-app-source.zip"))).digest("hex"));
    const demoZip = join(release, "sunsum-synthetic-demo.zip");
    expect(manifest.demo.sha256.toLowerCase()).toBe(createHash("sha256").update(readFileSync(demoZip)).digest("hex"));
    const entries = inspectArchive(demoZip);
    expect(entries.map((entry) => entry.name).sort()).toEqual([...Object.keys(demoContent), "demo-build.json"].sort());
    for (const entry of entries) {
      const source = readFileSync(join(fixture, "build", "vibehub", entry.name));
      expect(entry.bytes, entry.name).toBe(source.byteLength);
      expect(entry.sha256.toLowerCase(), entry.name).toBe(createHash("sha256").update(source).digest("hex"));
    }
    const applicationEntries = inspectArchive(join(release, "sunsum-app-source.zip"));
    for (const [section, archiveEntries] of [
      [manifest.application, applicationEntries], [manifest.demo, entries],
    ] as const) {
      expect(section.files).toBe(archiveEntries.length);
      expect(section.uncompressedBytes).toBe(archiveEntries.reduce((sum, entry) => sum + entry.bytes, 0));
      expect(section.compressedBytes).toBe(readFileSync(join(release, section.file)).byteLength);
      expect(section.fileHashes).toHaveLength(archiveEntries.length);
      expect(section.fileHashes).toEqual(expect.arrayContaining(archiveEntries.map((entry) => ({
        path: entry.name, bytes: entry.bytes, sha256: entry.sha256,
      }))));
    }
    expect(applicationEntries.some((entry) => entry.name === ".env")).toBe(false);
    expect(manifest.audio.license).toBe("THIRD_PARTY_NOT_MIT");
    expect(manifest.audio.manifest.path).toBe(audioManifestPath);
    expect(manifest.audio.manifest.sha256.toLowerCase()).toBe(
      createHash("sha256").update(readFileSync(join(fixture, audioManifestPath))).digest("hex"));
    const applicationCredits = applicationEntries.find((entry) => entry.name === "AUDIO-CREDITS.txt");
    const staticCredits = entries.find((entry) => entry.name === "AUDIO-CREDITS.txt");
    expect(applicationCredits).toEqual(staticCredits);
    expect(applicationCredits?.sha256.toLowerCase()).toBe(createHash("sha256").update(audioCredits).digest("hex"));
    expect(manifest.audio.credits).toEqual({
      path: "AUDIO-CREDITS.txt", bytes: Buffer.byteLength(audioCredits), sha256: applicationCredits?.sha256,
    });
    expect(manifest.audio.tracks).toHaveLength(3);
    for (const topic of topics) {
      const expected = audioManifest.tracks[topic]!;
      const applicationEntry = applicationEntries.find((entry) => entry.name === `public/${expected.path}`);
      const demoEntry = entries.find((entry) => entry.name === expected.path);
      expect(applicationEntry?.sha256).toBe(demoEntry?.sha256);
      expect(applicationEntry?.bytes).toBe(expected.bytes);
      expect(applicationEntry?.sha256.toLowerCase()).toBe(expected.sha256);
      expect(manifest.audio.tracks).toContainEqual({
        topic, applicationPath: `public/${expected.path}`, demoPath: expected.path,
        title: expected.title, attribution: expected.attribution, mime: expected.mime,
        bytes: expected.bytes, sha256: applicationEntry?.sha256,
        durationSeconds: expected.durationSeconds, sampleRateHz: expected.sampleRateHz, channels: expected.channels,
      });
    }
    const operator = join(release, "operator");
    const delivered = readdirSync(operator, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => relative(operator, join(entry.parentPath, entry.name)).replaceAll("\\", "/")).sort();
    expect(delivered).toEqual(operatorPaths);
    expect(manifest.operator.map((entry: { file: string }) => entry.file).sort())
      .toEqual(operatorPaths.map((path) => `operator/${path}`));
    for (const entry of manifest.operator) {
      const bytes = readFileSync(join(release, entry.file));
      expect(entry.sha256.toLowerCase(), entry.file).toBe(createHash("sha256").update(bytes).digest("hex"));
      expect(entry.bytes, entry.file).toBe(bytes.byteLength);
      expect(bytes, entry.file).toEqual(readFileSync(join(fixture, entry.file.slice("operator/".length))));
    }
    expect(manifest.sourceRepository).toBe("https://github.com/pocketcalculator/sunsum-community-solar-virtual-power-plant");
    expect(manifest.deployment).toContain("Not performed by packaging.");
  }, 35_000);

  it.each(["dirty", "revision", "changed", "missing", "extra", "existing-output"] as const)(
    "refuses %s release inputs without creating an application ZIP",
    (failure) => {
      if (failure === "dirty") put("app/layout.tsx", "export default function Changed() { return null; }");
      if (failure === "revision") {
        const file = join(fixture, "build", "vibehub", "demo-build.json");
        const metadata = JSON.parse(readFileSync(file, "utf8"));
        metadata.sourceRevision = "0".repeat(40);
        writeFileSync(file, JSON.stringify(metadata));
      }
      if (failure === "changed") put("build/vibehub/index.html", "<h1>Changed after build</h1>");
      if (failure === "missing") rmSync(join(fixture, "build", "vibehub", "index.html"));
      if (failure === "extra") put("build/vibehub/unreviewed.js", "throw new Error('unreviewed');");
      if (failure === "existing-output") mkdirSync(join(fixture, ".azure", "release"), { recursive: true });
      const result = packageRelease();
      expect(result.error).toBeUndefined();
      expect(result.status).not.toBe(0);
      expect(existsSync(join(fixture, ".azure", "release", "sunsum-app-source.zip"))).toBe(false);
    }, 35_000,
  );

  it.each(["missing", "changed", "extra", "credential"] as const)(
    "refuses %s static media/content even after it is re-stamped",
    (failure) => {
      if (failure === "missing") rmSync(join(fixture, "build", "vibehub", "audio", "impact.mp3"));
      if (failure === "changed") put("build/vibehub/audio/need.mp3", "changed-clip");
      if (failure === "extra") put("build/vibehub/audio/unapproved.mp3", "unapproved-clip");
      if (failure === "credential") put("build/vibehub/credentials.txt", "synthetic-test-value");
      stamp();
      expectReleaseRefusal(failure === "missing" ? "Required static audio"
        : failure === "changed" ? "Static audio bytes or SHA-256"
          : failure === "extra" ? "Unexpected static artifact path" : "Unsafe or duplicate static artifact path");
    }, 35_000,
  );

  it.each(["missing", "changed", "wrong-case"] as const)(
    "refuses %s static audio credits even after the build is re-stamped",
    (failure) => {
      rmSync(join(fixture, "build", "vibehub", "AUDIO-CREDITS.txt"));
      if (failure === "changed") put("build/vibehub/AUDIO-CREDITS.txt", "Stale credits.");
      if (failure === "wrong-case") put("build/vibehub/audio-credits.txt", audioCredits);
      stamp();
      expectReleaseRefusal("Static audio credits are missing or do not match the public notice");
    }, 35_000,
  );

  it.each(["entry", "total"] as const)("rejects static %s byte-limit overflow before compression", (limit) => {
    grow("build/vibehub/assets/large.js", 32 * 1024 * 1024 + (limit === "entry" ? 1 : 0));
    if (limit === "total") grow("build/vibehub/assets/second.js", 32 * 1024 * 1024);
    expectReleaseRefusal("Uncompressed static artifact exceeds the safety limit");
  }, 35_000);

  it("rejects a compressed static ZIP over 64 MiB without a completed release manifest", () => {
    const bytes = randomBytes(32 * 1024 * 1024 - 4096);
    put("build/vibehub/assets/first.js", bytes);
    put("build/vibehub/assets/second.js", bytes);
    stamp();
    const result = packageRelease();
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Static archive exceeds the 64 MiB safety limit");
    expect(existsSync(join(fixture, ".azure", "release", "release-manifest.json"))).toBe(false);
  }, 35_000);

  it("rejects more than 10,000 static entries before hashing or compression", () => {
    for (let index = 0; index < 10001; index += 1) {
      put(`build/vibehub/assets/count-${index}.js`, "");
    }
    expectReleaseRefusal("Too many static archive entries");
  }, 60_000);

  it("rejects a linked static asset directory rather than traversing it", () => {
    mkdirSync(join(fixture, ".azure", "private"), { recursive: true });
    symlinkSync(join(fixture, ".azure", "private"), join(fixture, "build", "vibehub", "linked"),
      process.platform === "win32" ? "junction" : "dir");
    expectReleaseRefusal("must not contain links or junctions");
  }, 35_000);
});

describe("application media and archive validation", () => {
  it.each(["missing", "empty", "stale", "wrong-terms"] as const)(
    "rejects %s public audio credits without publishing an archive",
    (failure) => {
      if (failure === "missing") rmSync(join(fixture, audioCreditsPath));
      if (failure === "empty") put(audioCreditsPath, "");
      if (failure === "stale") put(audioCreditsPath, `${audioCreditsHeader}\nStale title and attribution.`);
      if (failure === "wrong-terms") put(audioCreditsPath, audioCredits.replace(audioCreditsHeader, "Incorrect license notice."));
      const result = packageApplication();
      expect(result.error).toBeUndefined();
      expect(result.status).not.toBe(0);
      expect(existsSync(join(fixture, ".azure", "application.zip"))).toBe(false);
    }, 25_000,
  );

  it.each(["missing", "corrupt"] as const)("rejects %s source media without publishing an archive", (failure) => {
    if (failure === "missing") rmSync(join(fixture, "public", "audio", "need.mp3"));
    else put("public/audio/need.mp3", "corrupt-test-bytes");
    const result = packageApplication();
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(failure === "missing" ? "Required application file is missing" : "do not match the public manifest");
    expect(existsSync(join(fixture, ".azure", "application.zip"))).toBe(false);
    const leftovers = existsSync(join(fixture, ".azure")) ? readdirSync(join(fixture, ".azure")) : [];
    expect(leftovers.filter((path) => path.startsWith(".sunsum-source-"))).toEqual([]);
  }, 25_000);

  it.each([
    ["schema version", { schemaVersion: 2 }],
    ["extra root metadata", { privateSource: "not-permitted-in-public-manifest" }],
    ["missing topic", { tracks: { need: audioManifest.tracks.need, opportunity: audioManifest.tracks.opportunity } }],
    ["extra topic", { tracks: { ...audioManifest.tracks, extra: audioManifest.tracks.need } }],
  ] as const)("rejects invalid manifest %s", (_description, change) => {
    put(audioManifestPath, JSON.stringify({ ...audioManifest, ...change }));
    const result = packageApplication();
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(existsSync(join(fixture, ".azure", "application.zip"))).toBe(false);
  }, 25_000);

  it.each([
    ["path", "../need.mp3"], ["path", "audio/Need.mp3"], ["path", "audio/other.mp3"],
    ["mime", "audio/wav"], ["title", ""], ["attribution", " "], ["privateSource", "not-public"],
    ["bytes", 0], ["bytes", "32"], ["bytes", 32 * 1024 * 1024 + 1],
    ["sha256", "not-a-hash"], ["sha256", "0".repeat(64)],
    ["durationSeconds", 0], ["durationSeconds", "Infinity"], ["durationSeconds", null],
    ["sampleRateHz", 0], ["channels", 3],
  ] as const)("rejects invalid audio metadata %s=%s", (field, value) => {
    put(audioManifestPath, JSON.stringify({
      ...audioManifest,
      tracks: { ...audioManifest.tracks, need: { ...audioManifest.tracks.need, [field]: value } },
    }));
    const result = packageApplication();
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(existsSync(join(fixture, ".azure", "application.zip"))).toBe(false);
  }, 25_000);

  it.each(["entry", "total"] as const)("rejects source %s byte-limit overflow before compression", (limit) => {
    grow("src/large.ts", 32 * 1024 * 1024 + (limit === "entry" ? 1 : 0));
    if (limit === "total") grow("src/second.ts", 32 * 1024 * 1024);
    const result = packageApplication();
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Uncompressed source exceeds the safety limit");
    expect(existsSync(join(fixture, ".azure", "application.zip"))).toBe(false);
  }, 25_000);

  it("rejects an archive larger than 64 MiB before opening it", () => {
    const result = packageApplication();
    expect(result.status, result.stderr).toBe(0);
    const path = join(fixture, ".azure", "application.zip");
    truncateSync(path, 64 * 1024 * 1024 + 1);
    const validation = validateApplication(path);
    expect(validation.status).not.toBe(0);
    expect(validation.stderr).toContain("Source archive exceeds the 64 MiB safety limit");
  }, 35_000);

  it("rejects more than 10,000 archive entries before reading any payload", () => {
    mkdirSync(join(fixture, ".azure"), { recursive: true });
    const path = join(fixture, ".azure", "application.zip");
    const creation = spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-Command", `
      $ErrorActionPreference = 'Stop'
      $zip = [System.IO.Compression.ZipFile]::Open($env:SUNSUM_TEST_ARCHIVE, [System.IO.Compression.ZipArchiveMode]::Create)
      try { for ($index = 0; $index -lt 10001; $index++) { $null = $zip.CreateEntry("src/item-$index.ts") } }
      finally { $zip.Dispose() }
    `], { encoding: "utf8", timeout: 15_000, env: { ...process.env, SUNSUM_TEST_ARCHIVE: path } });
    expect(creation.status, creation.stderr).toBe(0);
    const result = validateApplication(path);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Too many source archive entries");
  }, 35_000);

  it.each([
    "../package.json", "public/audio/other.mp3", "public/audio/Need.mp3",
    "public/credentials.txt", "src/secrets/token.json", "public/audio/need.mp3", "src/linked.ts",
  ])("rejects an unsafe, duplicate or linked archive addition: %s", (name) => {
    const packaging = packageApplication();
    expect(packaging.status, packaging.stderr).toBe(0);
    const path = join(fixture, ".azure", "application.zip");
    const update = spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-Command", `
      $ErrorActionPreference = 'Stop'
      $zip = [System.IO.Compression.ZipFile]::Open($env:SUNSUM_TEST_ARCHIVE, [System.IO.Compression.ZipArchiveMode]::Update)
      try {
        $entry = $zip.CreateEntry($env:SUNSUM_TEST_ENTRY)
        if ($env:SUNSUM_TEST_ENTRY -ceq 'src/linked.ts') { $entry.ExternalAttributes = -1610612736 }
      } finally { $zip.Dispose() }
    `], {
      encoding: "utf8", timeout: 10_000,
      env: { ...process.env, SUNSUM_TEST_ARCHIVE: path, SUNSUM_TEST_ENTRY: name },
    });
    expect(update.status, update.stderr).toBe(0);
    const result = validateApplication(path);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(name === "src/linked.ts" ? "symbolic link" : "unexpected, duplicate or unsafe path");
  }, 35_000);

  it("binds the real staged media to its public manifest without substituting fixture measurements", () => {
    const manifest = JSON.parse(readFileSync(join(root, audioManifestPath), "utf8"));
    const credits = readFileSync(join(root, audioCreditsPath), "utf8");
    expect(credits).toContain(audioCreditsHeader);
    expect(manifest.schemaVersion).toBe(1);
    expect(Object.keys(manifest.tracks).sort()).toEqual([...topics].sort());
    let total = 0;
    for (const topic of topics) {
      const track = manifest.tracks[topic];
      expect(credits).toContain(track.title);
      expect(credits).toContain(track.attribution);
      expect(track.path).toBe(`audio/${topic}.mp3`);
      const bytes = readFileSync(join(root, "public", track.path));
      total += bytes.byteLength;
      expect(track.bytes).toBe(bytes.byteLength);
      expect(track.sha256.toLowerCase()).toBe(createHash("sha256").update(bytes).digest("hex"));
      expect(track.mime).toBe("audio/mpeg");
      expect(Number.isFinite(track.durationSeconds) && track.durationSeconds > 0).toBe(true);
      expect(Number.isInteger(track.sampleRateHz) && track.sampleRateHz > 0).toBe(true);
      expect([1, 2]).toContain(track.channels);
      expect(bytes.byteLength).toBeLessThanOrEqual(32 * 1024 * 1024);
    }
    expect(total).toBeLessThanOrEqual(64 * 1024 * 1024);
  });
});
