import console from "node:console";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { BootstrapSafetyError, validateBootstrapConfig, withBootstrapClient } from "./postgres-bootstrap-config.mjs";
import { bootstrapPrincipals } from "./postgres-principal-bootstrap.mjs";
import { bootstrapSchemas } from "./postgres-schema-bootstrap.mjs";

const main = async () => {
  const args = process.argv.slice(2);
  if (args[0] !== "--config" || !args[1] ||
      (args.length !== 2 && !(args.length === 3 && args[2] === "--apply"))) {
    throw new BootstrapSafetyError("Usage: node infrastructure/scripts/bootstrap-postgres.mjs --config <local-json> [--apply]");
  }
  const config = validateBootstrapConfig(JSON.parse(await readFile(args[1], "utf8")));
  if (args[2] !== "--apply") {
    console.log("Configuration validated; no network/authentication/SQL calls. With separately approved --apply:");
    console.log("1. Verify the Entra administrator; create or verify distinct nonadmin runtime/operator mappings in postgres.");
    console.log("2. Create operator-owned sunsum/drizzle schemas; revoke PUBLIC defaults; grant CONNECT only.");
    console.log("No tables, runtime schema CREATE, database ownership or future-table grants are created.");
    return;
  }
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    throw new BootstrapSafetyError("TLS verification must not be disabled.");
  }
  const [{ AzureCliCredential }, { default: pg }] = await Promise.all([
    import("@azure/identity"),
    import("pg"),
  ]);
  const credential = new AzureCliCredential({ tenantId: config.tenantId, processTimeoutInMs: 15000 });
  const connect = async (database, action) => {
    const client = new pg.Client({
      host: config.host,
      port: 5432,
      database,
      user: config.administratorRole,
      password: async () => {
        const token = await credential.getToken("https://ossrdbms-aad.database.windows.net/.default", {
          abortSignal: AbortSignal.timeout(15000),
        });
        if (!token?.token || token.expiresOnTimestamp <= Date.now() + 60000) {
          throw new BootstrapSafetyError("The explicit Azure CLI credential returned no usable token.");
        }
        return token.token;
      },
      ssl: { rejectUnauthorized: true, minVersion: "TLSv1.2", servername: config.host },
      connectionTimeoutMillis: 10000,
      query_timeout: 15000,
      statement_timeout: 15000,
      application_name: "sunsum-privileged-bootstrap",
    });
    await withBootstrapClient(client, action, (message) => console.error(message));
  };
  await connect("postgres", (client) => bootstrapPrincipals(client, config));
  await connect(config.database, (client) => bootstrapSchemas(client, config, pg.escapeIdentifier));
  console.log("Foundation bootstrap completed. Runtime is not an administrator; business tables and migrations were not applied.");
};

main().catch((error) => {
  console.error(error instanceof BootstrapSafetyError
    ? error.message
    : "Bootstrap failed. Check dependencies, approved target/network, Entra login and SQL permissions. Credentials and server error details are intentionally not logged.");
  process.exitCode = 1;
});
