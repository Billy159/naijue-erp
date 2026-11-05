/** Native SALE only; no provisioning, dotenv, production import or automatic cleanup. */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { nativeSaleSchema11Settings } from "../tests/integration/native-sales-schema11-safety.ts";
import { safeTarget } from "../tests/integration/safety.ts";
const args = process.argv.slice(2);
if (args.length !== 1 || args[0] !== "--run-native-sales-schema11") {
  console.error("Refused: explicit --run-native-sales-schema11 and prior exact fresh disposable Mac target/source approval required. No connection attempted.");
  process.exitCode = 2;
} else {
  try {
    const settings = nativeSaleSchema11Settings(process.env);
    console.log(`Native SALE schema11 synthetic acceptance target: ${safeTarget(settings)}. Historical/native source creation lifecycle NOT_RUN; synthetic catalogue/source fixture and formal V2 stage/publish metadata.`);
    const child = spawn(process.execPath, ["--test", "--test-concurrency=1", "--test-reporter=tap", "tests/integration/native-sales-schema11.integration.ts"], {
      cwd: fileURLToPath(new URL("../", import.meta.url)), stdio: "inherit", shell: false,
      env: { ...process.env, NAIJUE_PG_RUNNER_MARKER: randomBytes(32).toString("hex") }
    });
    child.once("error", () => { console.error("Native SALE test process failed to start; no engine acceptance claimed."); process.exitCode = 1; });
    child.once("exit", (code, signal) => { process.exitCode = signal ? 1 : (code ?? 1); });
    for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { child.kill(signal); });
  } catch {
    console.error("Native SALE schema11 gate refused before child creation; no connection attempted; no acceptance claimed.");
    process.exitCode = 2;
  }
}
