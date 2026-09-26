// @vitest-environment node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const directories: string[] = [];
let fixture: string;
const demoContent = {
  "index.html": '<h1 id="demo">Fictional demo</h1><script src="./assets/fixture.js"></script>',
  "assets/fixture.js": 'document.getElementById("demo").dataset.mode = "SYNTHETIC_DEMO_ONLY";',
};
const operatorPaths = [
  "README.md", "LICENSE", "docs/ws1/connections.md", "docs/ws1/connection-and-deployment-guide.md",
  "docs/ws1/live-read.env.example", "docs/ws1/code-approval.example.json",
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

function put(path: string, content: string) {
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
  put("build/vibehub/demo-build.json", JSON.stringify({
    mode: "SYNTHETIC_DEMO_ONLY",
    sourceRevision: git("rev-parse", "HEAD"),
    sourceClean: true,
    files: Object.fromEntries(Object.entries(demoContent).map(([file, text]) =>
      [file, createHash("sha256").update(text).digest("hex")])),
  }));
}

function packageRelease(destination = join(fixture, ".azure", "release")) {
  return spawnSync("pwsh", [
    "-NoProfile", "-NonInteractive", "-File", join(root, "scripts", "New-UiRelease.ps1"),
    "-SourceRoot", fixture, "-OutputDirectory", destination,
  ], { encoding: "utf8", timeout: 30_000 });
}

beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), "sunsum-release-test-"));
  directories.push(fixture);
  put(".gitignore", "/build\n/.azure\n.env\n");
  put("package.json", JSON.stringify({ name: "release-fixture", scripts: { start: "next start" } }));
  put("package-lock.json", JSON.stringify({ name: "release-fixture", lockfileVersion: 3, packages: {} }));
  put("tsconfig.json", "{}");
  put("app/layout.tsx", "export default function Layout() { return null; }");
  put(".env", "EXCLUDED_TEST_VALUE=never-in-application-archive");
  for (const file of [
    "README.md", "LICENSE", "docs/ws1/connections.md", "docs/ws1/connection-and-deployment-guide.md",
    "docs/ws1/live-read.env.example", "docs/ws1/code-approval.example.json",
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
    expect(manifest.sourceRevision).toBe(git("rev-parse", "HEAD"));
    expect(manifest.application.mode).toBe("LIVE_READ_ONLY");
    expect(manifest.demo.mode).toBe("SYNTHETIC_DEMO_ONLY");
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
});
