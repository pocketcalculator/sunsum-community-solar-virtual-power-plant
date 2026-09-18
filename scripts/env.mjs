/**
 * Environment loading shared by the `scripts/` tools.
 *
 * Next.js reads `.env.local` automatically; a plain Node process does not, and
 * silently falling back to a default connection string or storage endpoint is
 * how you end up seeding the wrong thing. Both `db.mjs` and `blob.mjs` need it,
 * so it lives here rather than being written twice and drifting.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * A deliberately small `.env` parser: `KEY=value`, `#` comments, no quoting
 * rules and no interpolation. Anything more belongs in a dependency, and these
 * files only ever hold a connection string, a store name and a mode.
 *
 * Real environment variables win, so `DATABASE_URL=... npm run db:seed` behaves
 * the way anyone would expect.
 */
export function loadEnv(file) {
  let contents;

  try {
    contents = readFileSync(join(root, file), "utf8");
  } catch {
    return;
  }

  for (const line of contents.split("\n")) {
    if (line.trimStart().startsWith("#")) {
      continue;
    }

    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);

    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2];
    }
  }
}

/** The order matters: `.env.local` is the developer's override of `.env`. */
export function loadLocalEnv() {
  loadEnv(".env.local");
  loadEnv(".env");
}
