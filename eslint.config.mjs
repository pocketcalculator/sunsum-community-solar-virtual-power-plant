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

/**
 * The backend is server-side and may use Node built-ins, so it cannot be kept
 * honest by the browser-safety rules above. These describe its own boundary.
 */
const backendModules = {
  group: ["@/backend", "@/backend/**", "**/backend/**"],
  message:
    "Server-side workflow code must not enter browser-safe presentation; reach the backend from a route instead.",
};

const backendInternals = {
  group: ["@/backend/**", "**/backend/**"],
  message: "Routes must use the backend's public entry point.",
};

const presentationImports = {
  group: [
    "@/components",
    "@/components/**",
    "**/components/**",
    "@/features",
    "@/features/**",
    "**/features/**",
    "**/app/**",
  ],
  message:
    "The backend is the system of record: it must not depend on routes, features or presentation.",
};

const handlerImports = {
  group: [
    "@/backend/handlers",
    "@/backend/handlers/**",
    "**/backend/handlers/**",
    "./handlers",
    "./handlers/**",
    "../handlers",
    "../handlers/**",
  ],
  message:
    "Handlers depend on core, never the reverse: core logic must stay callable without a request.",
};

/**
 * Each directory under `core` and `handlers` is one service from design
 * document section 9.2, and its `index.ts` is the only way in. Reaching past it
 * is what turns a set of services into a mesh: the API surface is about
 * thirty-five endpoints, so the difference between "imports the investors
 * domain" and "imports one file inside it" decides whether the dependencies
 * stay countable.
 *
 * The patterns are deliberately domain-agnostic — a wildcard rather than a list
 * of names — so a new service is covered the moment its directory exists.
 *
 * These are gitignore-style patterns, not minimatch, with two consequences
 * worth knowing before editing them: a wildcard segment also matches a parent
 * segment, and a later pattern overrides an earlier one. So the first pattern
 * catches a sibling's internals but would also catch the perfectly legal
 * cross-layer barrel import; the negation puts every cross-layer path back, and
 * the two trailing patterns then re-block only the deep ones. Reordering these
 * four lines silently stops them working. The combination was checked against
 * sixty specifier and file-path pairs before it was adopted, and the
 * architecture tests pin the behaviour.
 */
const domainInternals = {
  group: ["../*/*", "!../../**", "**/core/*/*", "**/handlers/*/*"],
  message:
    "Import a service through its directory index, not a file inside it: use ../projects, not ../projects/types.",
};

/**
 * `shared` holds what has no domain meaning, so the traffic is one-way. If a
 * shared module imports a domain, the two can only import each other next, and
 * the cycle is much harder to remove than to prevent.
 */
const sharedIsDomainFree = {
  group: ["../*", "../*/**"],
  message:
    "core/shared must not depend on a service; a rule that needs one belongs in that service.",
};

const transportModules = [
  "next/server",
  "next/headers",
  "next/cache",
  "next/navigation",
].map((name) => ({
  name,
  message:
    "Core workflow logic must stay transport-neutral; read the request in a handler and pass plain values in.",
}));

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["app/**/*.{ts,tsx}", "src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
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
            backendModules,
            {
              group: [
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
            backendModules,
            {
              group: ["**/app/**"],
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
            backendModules,
            {
              group: [
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
            backendModules,
            {
              group: [
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
            backendModules,
            {
              group: [
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
    files: ["src/backend/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [presentationImports] }],
    },
  },
  {
    files: ["src/backend/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: transportModules,
          patterns: [presentationImports, handlerImports, domainInternals],
        },
      ],
    },
  },
  {
    files: ["src/backend/handlers/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [presentationImports, domainInternals],
        },
      ],
    },
  },
  {
    /** Must follow the core block: a later match replaces the rule, not merges it. */
    files: ["src/backend/core/shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: transportModules,
          patterns: [
            presentationImports,
            handlerImports,
            domainInternals,
            sharedIsDomainFree,
          ],
        },
      ],
    },
  },
  {
    files: ["app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            backendInternals,
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
