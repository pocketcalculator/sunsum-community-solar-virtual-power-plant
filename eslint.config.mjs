import { builtinModules } from "node:module";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const databasePackages = ["pg", "drizzle-orm", "drizzle-kit", "@azure/identity"].map(
  (name) => ({
    name,
    message: "Database clients belong in server infrastructure, not presentation, core, or handlers.",
  }),
);

const databasePackageInternals = {
  group: ["pg/**", "drizzle-orm/**", "drizzle-kit/**", "@azure/identity/**"],
  message: "Database clients belong in the server infrastructure boundary.",
};

const infrastructureImports = {
  group: [
    "@/backend/infrastructure",
    "@/backend/infrastructure/**",
    "**/infrastructure",
    "**/infrastructure/**",
    "../infrastructure",
  ],
  message: "Inject persistence through a core interface; construct clients at the composition boundary.",
};

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
})).concat(databasePackages);

const nodeNamespace = {
  regex: "^node:",
  message: "Node-only modules cannot enter browser-safe presentation.",
};

/**
 * The backend is server-side and may use Node built-ins, so it cannot be kept
 * honest by the browser-safety rules above. These describe its own boundary.
 */
const backendModules = {
  group: ["@/backend", "@/backend/**", "**/backend", "**/backend/**"],
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

/**
 * The dependency between rules and storage runs one way. `db` imports domain
 * vocabulary from `core`; `core` never imports `db`.
 *
 * This is what keeps `ProjectStore` an interface a domain owns rather than a
 * shape the database dictates. Reverse it and the schema starts deciding what
 * the rules can express, which is the failure ADR 0001 is trying to avoid.
 */
const persistenceImports = {
  group: [
    "@/backend/db",
    "@/backend/db/**",
    "**/backend/db/**",
    "./db",
    "./db/**",
    "../db",
    "../db/**",
    "../../db",
    "../../db/**",
  ],
  message:
    "Persistence depends on core, never the reverse: a domain owns its store interface, so import the interface, not the table.",
};

/**
 * A database driver is persistence too.
 *
 * Blocking `@/backend/db` alone stopped being enough once a real driver was a
 * dependency: core could import `pg` directly and write SQL in a rule, which is
 * the same boundary violation with a shorter import path. Nothing outside
 * `src/backend/db` has any business holding a connection.
 */
const driverImports = {
  group: [
    "pg",
    "pg-*",
    "postgres",
    "drizzle-orm",
    "drizzle-orm/**",
    "drizzle-kit",
    "drizzle-kit/**",
  ],
  message:
    "Only src/backend/db may talk to a database driver. Depend on the store interface the domain owns.",
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
    files: ["src/components/{ui,workspace}/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: serverImports,
          patterns: [
            nodeNamespace,
            databasePackageInternals,
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
          paths: serverImports,
          patterns: [
            databasePackageInternals,
            backendModules,
            {
              group: ["**/app/**"],
              message: "Features must not depend on application routes.",
            },
            /**
             * Features are siblings, not a layer: one must never reach into
             * another. The pairwise rules below predate there being more than
             * two features, so this states the invariant once for all of them.
             * Shared code belongs in `@/components/ui` or `@/domain`, and a
             * page is the place to compose two features together.
             */
            {
              group: ["@/features/*", "@/features/*/**"],
              message:
                "Features must not import each other. Put shared code in @/domain or @/components, and compose features in a route.",
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
            databasePackageInternals,
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
    /**
     * The connected workspace reads through `live-read`.
     *
     * `live-read` is not a sibling presentation feature: it is the bounded
     * same-origin read client — its requests, its error vocabulary and the
     * projections the workspace renders — and it is deliberately kept out of
     * `@/domain` so the static demo entry can never resolve a live reader.
     * `community-context` supplies the shared explanatory copy the workspace
     * shows beside a read. Both dependencies are named here rather than by
     * relaxing the sibling rule, so every other feature stays out of reach.
     */
    files: ["src/features/live-workspace/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: serverImports,
          patterns: [
            databasePackageInternals,
            backendModules,
            {
              group: ["**/app/**"],
              message: "Features must not depend on application routes.",
            },
            {
              group: [
                "@/features/*",
                "@/features/*/**",
                "!@/features/live-read",
                "!@/features/live-read/**",
                "!@/features/community-context",
                "!@/features/community-context/**",
              ],
              message:
                "The live workspace may compose only the live reader and the shared community context.",
            },
          ],
        },
      ],
    },
  },
  {
    /**
     * The static demo quotes the fixtures and the explanation it illustrates.
     *
     * `design-lab` ships only in the separate synthetic entry, and its point is
     * to show the same dashboard fixtures and the same virtual-power-plant
     * explanation the product surfaces use. Duplicating either would let the
     * demo drift from what it claims to illustrate.
     */
    files: ["src/features/design-lab/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: serverImports,
          patterns: [
            databasePackageInternals,
            backendModules,
            {
              group: ["**/app/**"],
              message: "Features must not depend on application routes.",
            },
            {
              group: [
                "@/features/*",
                "@/features/*/**",
                "!@/features/community-context",
                "!@/features/community-context/**",
                "!@/features/site-owner-dashboard",
                "!@/features/site-owner-dashboard/**",
              ],
              message:
                "The static demo may quote only the dashboard fixtures and the shared community context.",
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
            databasePackageInternals,
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
            databasePackageInternals,
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
    files: ["src/backend/db/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [presentationImports, infrastructureImports] },
      ],
    },
  },
  {
    files: ["src/backend/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...transportModules, ...databasePackages],
          patterns: [
            presentationImports,
            handlerImports,
            domainInternals,
            infrastructureImports,
            databasePackageInternals,
            persistenceImports,
            driverImports,
          ],
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
          paths: databasePackages,
          patterns: [
            presentationImports,
            domainInternals,
            infrastructureImports,
            databasePackageInternals,
            persistenceImports,
            driverImports,
          ],
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
          paths: [...transportModules, ...databasePackages],
          patterns: [
            presentationImports,
            handlerImports,
            domainInternals,
            persistenceImports,
            driverImports,
            sharedIsDomainFree,
            infrastructureImports,
            databasePackageInternals,
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
          paths: databasePackages,
          patterns: [
            backendInternals,
            databasePackageInternals,
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
    ".azure/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
  ]),
]);
