// @vitest-environment node
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: join(root, "eslint.config.mjs"),
});

beforeAll(async () => {
  await eslint.calculateConfigForFile(
    join(root, "src/components/ui/probe.tsx"),
  );
}, 90_000);

async function lintBoundary(file: string, source: string) {
  const results = await eslint.lintText(source, {
    filePath: join(root, file),
  });
  const result = results[0];
  if (!result) throw new Error("ESLint did not inspect the synthetic module.");
  expect(result.fatalErrorCount).toBe(0);
  return result.messages.filter(
    (message) => message.ruleId === "no-restricted-imports",
  );
}

function boundaryMessages(file: string, importedModule: string) {
  return lintBoundary(
    file,
    `import value from ${JSON.stringify(importedModule)};\nexport default value;\n`,
  );
}

describe("the actual module-boundary configuration", () => {
  it.each([
    ["src/components/ui/probe.tsx", "@/features/participation"],
    ["src/components/ui/probe.tsx", "../../features/participation"],
    ["src/components/ui/probe.tsx", "../../app/page"],
    ["src/components/ui/probe.tsx", "@/lib/session"],
    ["src/components/ui/probe.tsx", "node:fs"],
    ["src/components/ui/probe.tsx", "node:sqlite"],
    ["src/components/ui/probe.tsx", "node:test/reporters"],
    ["src/components/ui/probe.tsx", "node:sea"],
    ["src/components/ui/probe.tsx", "node:test"],
    ["src/components/ui/probe.tsx", "fs/promises"],
    ["src/components/ui/probe.tsx", "server-only"],
    ["src/components/ui/probe.tsx", "next/headers"],
    ["src/features/participation/probe.tsx", "../../app/page"],
    ["src/features/participation/probe.tsx", "@/features/onboarding"],
    [
      "src/features/participation/probe.tsx",
      "@/features/onboarding/model/steps",
    ],
    ["src/features/onboarding/probe.tsx", "../../app/page"],
    ["src/features/onboarding/probe.tsx", "@/features/participation"],
    ["src/features/onboarding/probe.tsx", "node:sqlite"],
    ["src/features/onboarding/probe.tsx", "next/headers"],
    ["src/domain/probe.ts", "@/features/participation"],
    ["src/domain/probe.ts", "@/components/ui/Badge"],
    ["src/domain/probe.ts", "../app/page"],
    ["src/domain/probe.ts", "node:fs"],
    ["src/components/ui/probe.tsx", "@/domain/roles"],
    ["src/features/participation/index.ts", "node:sqlite"],
    ["src/features/participation/index.ts", "next/headers"],
    ["src/features/participation/index.ts", "./server"],
    ["src/features/participation/components/probe.tsx", "node:sqlite"],
    ["src/features/participation/components/probe.tsx", "next/headers"],
    ["src/features/participation/components/probe.tsx", "@/lib/session"],
    ["app/probe.tsx", "@/features/participation/paths"],
    ["app/probe.tsx", "../features/participation/paths"],
    ["src/components/ui/probe.tsx", "@/backend"],
    ["src/components/ui/probe.tsx", "@/backend/core"],
    ["src/domain/probe.ts", "@/backend"],
    ["src/features/participation/probe.tsx", "@/backend"],
    ["src/features/onboarding/probe.tsx", "@/backend"],
    ["src/features/onboarding/components/probe.tsx", "../../../backend/core"],
    ["app/probe.tsx", "@/backend/core"],
    ["app/probe.tsx", "@/backend/handlers/sites"],
    ["src/backend/handlers/probe.ts", "@/features/onboarding"],
    ["src/backend/handlers/probe.ts", "@/components/ui/Badge"],
    ["src/backend/handlers/probe.ts", "../../../app/page"],
    ["src/backend/core/probe.ts", "@/backend/handlers"],
    ["src/backend/core/probe.ts", "../handlers/sites"],
    ["src/backend/core/probe.ts", "next/server"],
    ["src/backend/core/probe.ts", "next/headers"],
    ["src/backend/core/probe.ts", "@/features/participation"],
    ["src/backend/core/investors/probe.ts", "../projects/types"],
    ["src/backend/core/investors/probe.ts", "../projects/mock-store"],
    ["src/backend/core/investors/probe.ts", "../identity/viewer"],
    ["src/backend/handlers/investors/probe.ts", "../../core/investors/portfolio"],
    ["src/backend/handlers/investors/probe.ts", "../../core/projects/types"],
    ["src/backend/handlers/investors/probe.ts", "../shared/http"],
    ["src/backend/core/probe.ts", "@/backend/core/investors/portfolio"],
    ["src/backend/handlers/probe.ts", "@/backend/handlers/investors/portfolio"],
    ["src/backend/core/shared/probe.ts", "../investors"],
    ["src/backend/core/shared/probe.ts", "../projects"],
    ["src/backend/core/shared/probe.ts", "../identity/viewer"],
  ])(
    "rejects %s importing %s",
    async (file, dependency) => {
      expect(await boundaryMessages(file, dependency)).not.toHaveLength(0);
    },
    15_000,
  );

  it.each([
    ["app/probe.tsx", "@/features/participation"],
    ["app/probe.tsx", "@/features/onboarding"],
    ["app/probe.tsx", "@/domain/roles"],
    ["src/features/participation/probe.tsx", "@/components/ui/icon"],
    ["src/features/participation/probe.tsx", "@/domain/journey"],
    ["src/features/onboarding/probe.tsx", "@/domain/userTypes"],
    ["src/features/onboarding/probe.tsx", "../model/steps"],
    ["src/domain/probe.ts", "./roles"],
    ["src/components/ui/probe.tsx", "react"],
    ["app/probe.tsx", "@/backend"],
    ["src/backend/handlers/probe.ts", "@/backend/core"],
    ["src/backend/handlers/investors/probe.ts", "../../core/investors"],
    ["src/backend/handlers/investors/probe.ts", "../../core/projects"],
    ["src/backend/handlers/investors/probe.ts", "../shared"],
    ["src/backend/handlers/investors/probe.ts", "../identity"],
    ["src/backend/handlers/shared/probe.ts", "../../core/shared"],
    ["src/backend/core/investors/probe.ts", "../projects"],
    ["src/backend/core/investors/probe.ts", "../identity"],
    ["src/backend/core/investors/probe.ts", "../shared"],
    ["src/backend/core/investors/probe.ts", "./portfolio"],
    ["src/backend/core/projects/probe.ts", "./types"],
    ["src/backend/core/shared/probe.ts", "./result"],
    ["src/backend/core/shared/probe.ts", "@/domain/roles"],
    ["src/backend/handlers/probe.ts", "next/server"],
    ["src/backend/handlers/probe.ts", "node:crypto"],
    ["src/backend/core/probe.ts", "@/domain/roles"],
    ["src/backend/core/probe.ts", "node:crypto"],
  ])(
    "permits %s importing %s",
    async (file, dependency) => {
      expect(await boundaryMessages(file, dependency)).toHaveLength(0);
    },
    15_000,
  );

  it.each([
    [
      "src/components/ui/probe.tsx",
      'export { DatabaseSync } from "node:sqlite";',
    ],
    ["src/features/participation/index.ts", 'export * from "next/headers";'],
    [
      "src/features/participation/components/probe.tsx",
      'export { DatabaseSync } from "node:sqlite";',
    ],
    ["src/components/ui/probe.tsx", 'export * from "@/backend";'],
    ["src/domain/probe.ts", 'export * from "@/backend/core";'],
    ["src/backend/core/probe.ts", 'export * from "@/backend/handlers";'],
  ])("rejects prohibited re-exports from %s", async (file, source) => {
    expect(await lintBoundary(file, source)).not.toHaveLength(0);
  });
});
