import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import { THEME_INIT_SCRIPT } from "./src/components/ui/theme/themeInitScript";

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
const outputPath = path("./build/vibehub/");

function artifactHashes(directory: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error("Static output must not contain symbolic links.");
    const full = join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(files, artifactHashes(full));
    else if (entry.isFile() && full !== join(outputPath, "demo-build.json")) {
      files[relative(outputPath, full).replaceAll("\\", "/")] =
        createHash("sha256").update(readFileSync(full)).digest("hex");
    }
  }
  return files;
}

export default defineConfig(({ mode }) => {
  const values = loadEnv(mode, path("./static/"), "SUNSUM_PUBLIC_");
  const selectedMode = process.env.SUNSUM_PUBLIC_DATA_MODE ?? values.SUNSUM_PUBLIC_DATA_MODE ?? "preview";
  const apiBase = process.env.SUNSUM_PUBLIC_API_BASE_URL ?? values.SUNSUM_PUBLIC_API_BASE_URL;
  if (selectedMode !== "preview" || apiBase?.trim()) {
    throw new Error("SYNTHETIC_DEMO_ONLY: static builds require preview mode and no live API base URL. Use the separate Next application for live reads.");
  }
  let buildIdentity: { sourceRevision: string | null; sourceClean: boolean } = {
    sourceRevision: null, sourceClean: false,
  };
  return {
  root: path("./static/"),
  base: "./",
  publicDir: path("./public/"),
  envPrefix: [],
  define: {
    "import.meta.env.SUNSUM_PUBLIC_DATA_MODE": JSON.stringify("preview"),
    "import.meta.env.SUNSUM_PUBLIC_API_BASE_URL": JSON.stringify(""),
  },
  resolve: {
    alias: {
      "next/link": path("./static/Link.tsx"),
      "next/image": path("./static/Image.tsx"),
      "@": path("./src/"),
    },
  },
  build: {
    outDir: outputPath,
    emptyOutDir: true,
    sourcemap: false,
    license: { fileName: "THIRD-PARTY-LICENSES.txt" },
  },
  plugins: [{
    name: "sunsum-static-shell",
    transformIndexHtml: {
      order: "pre",
      handler: () => [{ tag: "script", children: THEME_INIT_SCRIPT, injectTo: "head-prepend" }],
    },
    generateBundle() {
      const revision = spawnSync("git", ["rev-parse", "HEAD"], { cwd: path("./"), encoding: "utf8" });
      const state = spawnSync("git", ["status", "--porcelain"], { cwd: path("./"), encoding: "utf8" });
      const identified = revision.status === 0 && state.status === 0 &&
        /^[a-f0-9]{40}$/.test(revision.stdout.trim());
      if (!identified) this.warn("Source revision is unavailable; this demo is not eligible for the reviewed release packager.");
      buildIdentity = {
        sourceRevision: identified ? revision.stdout.trim() : null,
        sourceClean: identified && state.stdout.trim() === "",
      };
      this.emitFile({
        type: "asset",
        fileName: "demo-build.json",
        source: JSON.stringify({
          mode: "SYNTHETIC_DEMO_ONLY",
          ...buildIdentity,
        }, null, 2),
      });
      this.emitFile({ type: "asset", fileName: "LICENSE.txt", source: readFileSync(path("./LICENSE"), "utf8") });
      this.emitFile({ type: "asset", fileName: "AUDIO-CREDITS.txt", source: readFileSync(path("./docs/ws1/audio-credits.txt")) });
      this.emitFile({ type: "asset", fileName: "icon.svg", source: readFileSync(path("./app/icon.svg"), "utf8") });
    },
    closeBundle() {
      writeFileSync(join(outputPath, "demo-build.json"), JSON.stringify({
        mode: "SYNTHETIC_DEMO_ONLY",
        ...buildIdentity,
        files: artifactHashes(outputPath),
      }, null, 2));
    },
  }],
  };
});
