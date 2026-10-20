/** Deliberately not part of npm test/check. No .env loading, service startup or database provisioning. */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { integrationSettings, safeTarget } from "../tests/integration/safety.ts";

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
  console.log("Dormant real-PostgreSQL validation. Read docs/POSTGRES-INTEGRATION.md first.\nRun only after approval: node scripts/run-postgres-integration.mjs --run\nRequires NODE_ENV=test, NAIJUE_PG_INTEGRATION, NAIJUE_PG_TEST_DATABASE_URL and NAIJUE_PG_EXPECT_DATABASE.\nNo provisioning, automatic cleanup, .env loading, remote target or production data is supported.");
} else if (args.length !== 1 || args[0] !== "--run") {
  console.error("Refused: explicit --run is required. Use --help for prerequisites; no connection was attempted.");
  process.exitCode = 2;
} else {
  try {
    const settings = integrationSettings(process.env);
    console.log(`Explicitly opted-in disposable local target: ${safeTarget(settings)}. Real PostgreSQL results follow only if executed.`);
    const child = spawn(process.execPath, ["--test", "--test-concurrency=1", "--test-reporter=tap", "tests/integration/postgres.integration.test.ts"], {
      cwd: fileURLToPath(new URL("../", import.meta.url)), stdio: "inherit", shell: false,
      env: { ...process.env, NAIJUE_PG_RUNNER_MARKER: randomBytes(32).toString("hex") }
    });
    child.once("error", () => { console.error("Could not start the integration test process; no result is claimed."); process.exitCode = 1; });
    child.once("exit", (code, signal) => { process.exitCode = signal ? 1 : (code ?? 1); });
    for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { child.kill(signal); });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Integration safety validation failed");
    process.exitCode = 2;
  }
}
