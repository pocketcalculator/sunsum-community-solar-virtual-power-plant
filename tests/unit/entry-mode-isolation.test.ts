// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));

function resolveLocal(specifier: string, from: string, hasFile: (path: string) => boolean = existsSync): string | null {
  if (!specifier.startsWith("@/") && !specifier.startsWith(".")) return null;
  const path = specifier.startsWith("@/")
    ? resolve(root, "src", specifier.slice(2))
    : resolve(dirname(from), specifier);
  if (/\.(?:css|svg|png|jpg|webp)$/.test(path)) return null;
  const found = [path, `${path}.ts`, `${path}.tsx`, join(path, "index.ts"), join(path, "index.tsx")]
    .find((candidate) => /\.(?:ts|tsx|json)$/.test(candidate) && hasFile(candidate));
  if (!found) throw new Error(`Unresolved local module ${specifier} from ${relative(root, from)}`);
  return found;
}

function runtimeGraph(entries: readonly string[], fixtures?: Readonly<Record<string, string>>): string[] {
  const sources = fixtures && new Map(Object.entries(fixtures).map(([file, text]) => [resolve(root, file), text]));
  const hasFile = sources ? (file: string) => sources.has(file) : existsSync;
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = sources ? sources.get(file) : readFileSync(file, "utf8");
    if (text === undefined) throw new Error(`Missing graph fixture: ${relative(root, file)}`);
    if (file.endsWith(".json")) {
      JSON.parse(text);
      return;
    }
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const inspect = (node: ts.Node) => {
      let specifier: string | null = null;
      if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly &&
        ts.isStringLiteral(node.moduleSpecifier)) {
        const bindings = node.importClause?.namedBindings;
        const onlyTypes = !node.importClause?.name && bindings && ts.isNamedImports(bindings) &&
          bindings.elements.length > 0 && bindings.elements.every((element) => element.isTypeOnly);
        if (!onlyTypes) specifier = node.moduleSpecifier.text;
      }
      if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)) specifier = node.moduleSpecifier.text;
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] && ts.isStringLiteral(node.arguments[0])) specifier = node.arguments[0].text;
      if (specifier) {
        const target = resolveLocal(specifier, file, hasFile);
        if (target) visit(target);
      }
      ts.forEachChild(node, inspect);
    };
    inspect(source);
  };
  entries.forEach((entry) => visit(resolve(root, entry)));
  return [...seen].map((file) => relative(root, file).replaceAll("\\", "/"));
}

function forbiddenLiveFiles(graph: readonly string[]) {
  return graph.filter((file) =>
    /src\/features\/(?:design-lab|demo-auth|site-owner-dashboard)\//.test(file) ||
    file.startsWith("src/backend/"));
}

describe("separate runtime entry graphs", () => {
  it("keeps synthetic UI out of /app and confines demo sign-in to its explicit browser compositor", () => {
    const frameworkEntries = ["app", "app/app"].flatMap((directory) =>
      ["layout", "template", "error", "global-error", "loading", "not-found", "default"].flatMap((name) =>
        [".ts", ".tsx"].map((extension) => `${directory}/${name}${extension}`)))
      .filter((entry) => existsSync(resolve(root, entry)));
    expect(frameworkEntries).toContain("app/layout.tsx");
    expect(frameworkEntries).toContain("app/not-found.tsx");
    const graph = runtimeGraph(["app/app/page.tsx", ...frameworkEntries]);
    expect(graph.filter((file) => /src\/features\/(?:design-lab|site-owner-dashboard)\//.test(file))).toEqual([]);
    expect(graph).toContain("app/app/configuration.ts");
    const configuration = ts.createSourceFile("configuration.ts",
      readFileSync(resolve(root, "app/app/configuration.ts"), "utf8"), ts.ScriptTarget.Latest, true);
    expect(configuration.statements.some((node) => ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "server-only")).toBe(true);
    const browserGraph = runtimeGraph(["app/app/WorkspaceEntry.tsx", ...frameworkEntries]);
    expect(forbiddenLiveFiles(browserGraph).sort()).toEqual([
      "src/features/demo-auth/components/DemoRoleSwitcher.tsx",
      "src/features/demo-auth/index.ts",
    ]);
    expect(forbiddenLiveFiles(runtimeGraph(["src/features/live-workspace/index.ts"]))).toEqual([]);
  });

  it.each(["runtime", "type-only"] as const)("distinguishes a %s demo import through a composed layout", (kind) => {
    const graph = runtimeGraph(["app/app/page.tsx", "app/layout.tsx"], {
      "app/app/page.tsx": "export default function Page() { return null; }",
      "app/layout.tsx": kind === "runtime"
        ? 'import { initializeDemo } from "@/features/design-lab/state"; initializeDemo();'
        : 'import type { DemoState } from "@/features/design-lab/state"; export type State = DemoState;',
      "src/features/design-lab/state.ts": "export interface DemoState {} export function initializeDemo() {}",
    });
    expect(forbiddenLiveFiles(graph)).toEqual(kind === "runtime" ? ["src/features/design-lab/state.ts"] : []);
  });

  it("tracks JSON as validated data without interpreting its string values as imports", () => {
    const graph = runtimeGraph(["static/main.tsx"], {
      "static/main.tsx": 'import audio from "@/features/participation/content/pageAudioAssets.json" with { type: "json" }; export { audio };',
      "src/features/participation/content/pageAudioAssets.json": JSON.stringify({ note: 'import("@/backend")' }),
    });
    expect(graph).toEqual(["static/main.tsx", "src/features/participation/content/pageAudioAssets.json"]);
    expect(() => runtimeGraph(["static/main.tsx"], {
      "static/main.tsx": 'import missing from "./missing.json"; export { missing };',
    })).toThrow("Unresolved local module ./missing.json");
    expect(() => runtimeGraph(["static/main.tsx"], {
      "static/main.tsx": 'import invalid from "./invalid.json"; export { invalid };',
      "static/invalid.json": "{",
    })).toThrow(SyntaxError);
  });

  it("still detects backend data imported by a browser entry", () => {
    const graph = runtimeGraph(["static/main.tsx"], {
      "static/main.tsx": 'import fixture from "@/backend/fixture.json"; export { fixture };',
      "src/backend/fixture.json": JSON.stringify({ value: "synthetic guard canary" }),
    });
    expect(forbiddenLiveFiles(graph)).toEqual(["src/backend/fixture.json"]);
  });

  it("does not ship a live reader, live workspace or backend through the static entry", () => {
    const graph = runtimeGraph(["static/main.tsx"]);
    expect(graph.filter((file) =>
      /src\/features\/(?:live-read|live-workspace|demo-auth)\//.test(file))).toEqual([]);
    expect(graph).not.toContain("src/features/design-lab/services.ts");
    expect(graph.filter((file) => file.startsWith("src/backend/"))).toEqual([]);
  });
});
