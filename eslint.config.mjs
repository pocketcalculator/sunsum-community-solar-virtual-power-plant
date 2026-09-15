import { builtinModules } from "node:module";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const serverImports = [
  ...new Set(builtinModules.flatMap((name) => [name, `node:${name}`])),
  "server-only",
  "next/headers",
  "next/server",
  "next/cache",
].map((name) => ({
  name,
  message:
    "Public presentation must stay browser-safe and independent of server services.",
}));

const nodeNamespace = {
  regex: "^node:",
  message: "Node-only modules cannot enter browser-safe presentation.",
};

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: serverImports,
          patterns: [
            nodeNamespace,
            {
              group: [
                "@/app",
                "@/app/**",
                "@/features",
                "@/features/**",
                "@/domain",
                "@/domain/**",
                "@/lib",
                "@/lib/**",
                "**/app/**",
                "**/features/**",
                "**/domain/**",
                "**/lib/**",
              ],
              message:
                "Domain-neutral UI cannot depend on routes, features, domain vocabulary, or services.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/features/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app", "@/app/**", "**/app/**"],
              message: "Features must not depend on application routes.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: serverImports,
          patterns: [
            nodeNamespace,
            {
              group: [
                "@/app",
                "@/app/**",
                "@/features",
                "@/features/**",
                "@/components",
                "@/components/**",
                "@/lib",
                "@/lib/**",
                "**/app/**",
                "**/features/**",
                "**/components/**",
              ],
              message:
                "The domain layer is shared vocabulary: it must not depend on routes, features, UI or services.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/features/participation/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: serverImports,
          patterns: [
            nodeNamespace,
            {
              group: [
                "@/app",
                "@/app/**",
                "**/app/**",
                "@/lib",
                "@/lib/**",
                "**/lib/**",
                "@/features/onboarding",
                "@/features/onboarding/**",
                "**/onboarding/**",
                "./server",
                "./server/**",
                "../server",
                "../server/**",
              ],
              message:
                "The public participation feature cannot depend on routes, another feature's internals, or server integration.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/features/onboarding/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: serverImports,
          patterns: [
            nodeNamespace,
            {
              group: [
                "@/app",
                "@/app/**",
                "**/app/**",
                "@/lib",
                "@/lib/**",
                "**/lib/**",
                "@/features/participation",
                "@/features/participation/**",
                "**/participation/**",
                "./server",
                "./server/**",
                "../server",
                "../server/**",
              ],
              message:
                "The onboarding feature cannot depend on routes, another feature's internals, or server integration.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/features/*/**", "**/features/*/**"],
              message: "Routes must use a feature's public entry point.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
  ]),
]);
