#!/usr/bin/env node
/**
 * Database tasks: `migrate`, `seed`, `reset`, `verify`.
 *
 * A Node script rather than `psql` in an npm script, because `psql` is not
 * installed on most laptops here and the database lives in a container. This
 * connects with the `pg` driver the application already depends on, so the only
 * prerequisite is `docker compose up -d`.
 *
 * It also loads `.env.local` before anything else. Next.js does that
 * automatically; a plain Node process does not, and silently falling back to a
 * default connection string is how you end up seeding the wrong database.
 *
 *   node scripts/db.mjs migrate   apply migrations (drizzle-kit, tracked)
 *   node scripts/db.mjs seed      load demo data (additive, idempotent)
 *   node scripts/db.mjs reset     empty every table
 *   node scripts/db.mjs verify    run the adversarial constraint probes
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import pg from "pg";

import { loadLocalEnv, root } from "./env.mjs";

const sqlDir = join(root, "src", "backend", "db");

loadLocalEnv();

const url = process.env.DATABASE_URL;

if (!url) {
  console.error(
    "DATABASE_URL is not set.\n" +
      "  cp .env.example .env.local   (then `docker compose up -d`)",
  );
  process.exit(1);
}

/**
 * Refuse to touch anything that is not obviously a local database.
 *
 * `reset` truncates every table. The cost of this check is nil and the cost of
 * skipping it is somebody's shared environment, so it applies to all the
 * writing tasks rather than only the destructive-looking one.
 */
function assertLocal(task) {
  const host = new URL(url).hostname;

  if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
    console.error(
      `Refusing to ${task} against ${host}: this tool is for local development only.\n` +
        "Migrating a deployed database is a deployment step, not an npm script.",
    );
    process.exit(1);
  }
}

/**
 * Run a `.sql` file.
 *
 * psql meta-commands are handled here rather than removed from the files: the
 * probe script is meant to stay runnable under `psql` directly, where `\echo`
 * gives it readable sections. `\set` is psql configuration with no equivalent
 * over the wire, and the scripts do not depend on it for correctness — they
 * raise, and a raise reaches us as a rejected promise.
 */
async function runSqlFile(name) {
  const raw = readFileSync(join(sqlDir, name), "utf8");
  const statements = [];
  const buffer = [];

  for (const line of raw.split("\n")) {
    const echo = /^\\echo\s*'?(.*?)'?\s*$/.exec(line);

    if (echo) {
      statements.push({ echo: echo[1] });
      continue;
    }

    if (line.startsWith("\\")) {
      continue;
    }

    buffer.push(line);
  }

  statements.push({ sql: buffer.join("\n") });

  const client = new pg.Client({ connectionString: url });
  client.on("notice", (notice) => console.log(`  ${notice.message}`));
  await client.connect();

  try {
    for (const statement of statements) {
      if (statement.echo !== undefined) {
        console.log(statement.echo);
      } else if (statement.sql.trim()) {
        await client.query(statement.sql);
      }
    }
  } finally {
    await client.end();
  }
}

const tasks = {
  async migrate() {
    assertLocal("migrate");
    const result = spawnSync("npx", ["drizzle-kit", "migrate"], {
      cwd: root,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: process.env,
    });
    process.exit(result.status ?? 1);
  },

  async studio() {
    assertLocal("open studio against");
    const result = spawnSync("npx", ["drizzle-kit", "studio"], {
      cwd: root,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: process.env,
    });
    process.exit(result.status ?? 1);
  },

  async seed() {
    assertLocal("seed");
    await runSqlFile("seed.sql");
    console.log("\nSeeded. Every assertion above passed, or this would have thrown.");
  },

  async reset() {
    assertLocal("reset");
    await runSqlFile("reset.sql");
    console.log("Every table is empty. Run `npm run db:seed` to rebuild the demo data.");
  },

  async verify() {
    assertLocal("verify");
    await runSqlFile("verify-constraints.sql");
    console.log("\nEvery constraint probe passed.");
  },
};

const task = process.argv[2] ?? "";

if (!Object.hasOwn(tasks, task)) {
  console.error(`Usage: node scripts/db.mjs <${Object.keys(tasks).join("|")}>`);
  process.exit(1);
}

try {
  await tasks[task]();
} catch (error) {
  console.error(`\n${task} failed:\n`);
  console.error(error.message ?? error);
  process.exit(1);
}
