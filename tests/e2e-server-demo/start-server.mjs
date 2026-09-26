import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { freemem } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const port = Number(process.argv[2]);
if (process.argv.length !== 3 || !Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("The isolated server-demo launcher requires an explicit loopback port.");
}
if (freemem() < 4 * 1024 ** 3) {
  throw new Error("Server-demo execution requires the unchanged 4 GiB free-RAM guard.");
}
for (const filename of [".env", ".env.local", ".env.production", ".env.production.local"]) {
  if (existsSync(join(root, filename))) {
    throw new Error(`Isolated server-demo refuses ${filename}; no environment-file credentials may be loaded.`);
  }
}
if (!existsSync(join(root, ".next", "BUILD_ID"))) {
  throw new Error("A parent-approved local Next build is required. This launcher never installs or builds.");
}

// Do not inherit database/provider credentials, user auth caches, NODE_OPTIONS or production secrets.
const env = {};
for (const name of ["PATH", "Path", "SystemRoot", "WINDIR", "ComSpec", "TEMP", "TMP", "TMPDIR"]) {
  if (process.env[name] !== undefined) env[name] = process.env[name];
}
Object.assign(env, {
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
  SUNSUM_PUBLIC_DATA_MODE: "server-demo",
  SUNSUM_PUBLIC_API_BASE_URL: "/api",
  SUNSUM_STORE: "mock",
  SUNSUM_DEMO_AUTH: "enabled",
  SUNSUM_SESSION_SECRET: "SYNTHETIC-SERVER-DEMO-TEST-ONLY-NOT-A-REAL-SIGNING-SECRET",
  SUNSUM_LIVE_READ_AUTH_APPROVED: "true",
  SUNSUM_LIVE_EXPORT_APPROVED: "",
  SUNSUM_LIVE_DOCUMENTS_APPROVED: "",
});

const child = spawn(process.execPath, [
  join(root, "node_modules", "next", "dist", "bin", "next"),
  "start", "--hostname", "127.0.0.1", "--port", String(port),
], { cwd: root, env, stdio: "inherit", windowsHide: true });

child.on("error", (error) => {
  console.error("The isolated server-demo process could not start:", error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal === "SIGTERM" || signal === "SIGINT" ? 0 : 1);
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  });
}
