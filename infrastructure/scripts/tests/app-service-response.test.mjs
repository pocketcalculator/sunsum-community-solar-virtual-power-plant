import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);
const modulePath = fileURLToPath(new URL("../DeploymentSafety.psm1", import.meta.url));

test("App Service probes inspect responses without following sign-in redirects", async () => {
  const requests = [];
  const cases = [
    { status: 200, mode: "Preview", expected: true },
    { status: 503, mode: "Preview", expected: false },
    { status: 200, mode: "ApprovedSignIn", expected: false },
    { status: 302, location: "https://login.microsoftonline.com/tenant/oauth2/v2.0/authorize", mode: "ApprovedSignIn", expected: true },
    { status: 302, location: "https://127.0.0.1/.auth/login/aad", mode: "ApprovedSignIn", expected: true },
    { status: 302, location: "/follow", mode: "Preview", expected: false },
    { status: 302, location: "/follow", mode: "ApprovedSignIn", expected: false },
    { status: 302, mode: "ApprovedSignIn", expected: false },
    { status: 302, location: "https://unexpected.example/.auth/login/aad", mode: "ApprovedSignIn", expected: false },
    { status: 302, location: "http://login.microsoftonline.com/", mode: "ApprovedSignIn", expected: false },
    { status: 302, location: "https://login.microsoftonline.com:444/", mode: "ApprovedSignIn", expected: false },
    { status: 302, location: "https://user@login.microsoftonline.com/", mode: "ApprovedSignIn", expected: false },
  ];
  const server = createServer((request, response) => {
    requests.push(request.url);
    const scenario = cases[Number(request.url.slice(1))];
    if (!scenario) { response.writeHead(500).end(); return; }
    response.writeHead(scenario.status, scenario.location ? { Location: scenario.location } : {}).end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    for (const [index, scenario] of cases.entries()) {
      const command = `Import-Module '${modulePath.replaceAll("'", "''")}' -Force; Test-AppServiceResponse -Uri 'http://127.0.0.1:${server.address().port}/${index}' -ExpectedAccessMode ${scenario.mode}`;
      const result = await execute("pwsh", ["-NoProfile", "-NonInteractive", "-Command", command], { timeout: 15000 });
      assert.equal(result.stdout.trim(), String(scenario.expected).replace(/^./u, (value) => value.toUpperCase()), JSON.stringify(scenario));
      assert.equal(result.stderr, "");
    }
    assert.deepEqual(requests, cases.map((_, index) => `/${index}`));
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});