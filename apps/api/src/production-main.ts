import { readProductionCredentialRequestKey } from "./production-credential-key.ts";
import { createNodeCredentialRequestTag } from "../../../packages/authentication/src/passwords.ts";
import type { ProductionRuntime26R3Configuration } from "./production-provider-composition.ts";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createProductionRuntime26FullApplicationApi, createProductionApplicationApi, parseProductionRuntimeConfiguration } from "./production-provider-composition.ts";
import { startProductionApplicationHost } from "./production-application-host.ts";
import { createProductionRuntime26ApplicationApi, parseProductionRuntime26Configuration } from "./production-provider-composition.ts";
import { startProductionRuntime26ApplicationHost } from "./production-application-host.ts";
import { createProductionRuntime26R3ApplicationApi, parseProductionRuntime26R3Configuration, createProductionRuntime26R2ApplicationApi, parseProductionRuntime26R2Configuration } from "./production-provider-composition.ts";
import { startProductionRuntime26R3ApplicationHost, startProductionRuntime26R2ApplicationHost } from "./production-application-host.ts";

/** C supplies an absolute private JSON configuration path as the sole argument.
 * Never emit that file, its pathname, parsed configuration or raw error causes. */
export async function runProductionMain(args: readonly string[]): Promise<void> {
  if (args.length !== 1 || !args[0] || !path.isAbsolute(args[0]) || path.resolve(args[0]) !== args[0])
    throw new TypeError("One absolute private runtime configuration path is required");
  const filename = args[0], stat = await lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || await realpath(filename) !== filename || stat.size > 65_536 || (stat.mode & 0o077) !== 0)
    throw new TypeError("A bounded canonical private configuration file is required");
  const bytes = await readFile(filename);
  if (bytes.length !== stat.size || bytes.length > 65_536) throw new TypeError("Runtime configuration changed while reading");
  const config = parseProductionRuntimeConfiguration(JSON.parse(bytes.toString("utf8")) as unknown);
  const api = await createProductionApplicationApi(config);
  const host = await startProductionApplicationHost({ api, configuration: config });
  let stopping = false;
  const stop = (): void => {
    if (stopping) return; stopping = true;
    process.off("SIGTERM", stop); process.off("SIGINT", stop);
    void host.close().catch(() => { process.stderr.write("Production shutdown failed\n"); process.exitCode = 1; });
  };
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
  process.stdout.write(JSON.stringify({ event: "PRODUCTION_HOST_STARTED", publicOrigin: host.publicOrigin, ...config.build }) + "\n");
}

/** Explicit --exact26-r1 entry only. The legacy entry above never auto-upgrades
 * a config or reuses an already running pool. Operational files stay private. */
export async function runProductionRuntime26Main(args: readonly string[]): Promise<void> {
  if (args.length !== 1 || !args[0] || !path.isAbsolute(args[0]) || path.resolve(args[0]) !== args[0])
    throw new TypeError("One absolute private exact26 runtime configuration path is required");
  const filename = args[0], stat = await lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || await realpath(filename) !== filename || stat.size > 65_536 || (stat.mode & 0o077) !== 0)
    throw new TypeError("A bounded canonical private exact26 configuration file is required");
  const bytes = await readFile(filename);
  if (bytes.length !== stat.size || bytes.length > 65_536) throw new TypeError("Exact26 runtime configuration changed while reading");
  const config = parseProductionRuntime26Configuration(JSON.parse(bytes.toString("utf8")) as unknown);
  const api = await createProductionRuntime26ApplicationApi(config);
  const host = await startProductionRuntime26ApplicationHost({ api, configuration: config });
  let stopping = false;
  const stop = (): void => {
    if (stopping) return; stopping = true;
    process.off("SIGTERM", stop); process.off("SIGINT", stop);
    void host.close().catch(() => { process.stderr.write("Exact26 production shutdown failed\n"); process.exitCode = 1; });
  };
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
  process.stdout.write(JSON.stringify({ event: "PRODUCTION_EXACT26_HOST_STARTED", publicOrigin: host.publicOrigin, ...config.build }) + "\n");
}

/** Independent --exact26-r2 selects reviewed native commands explicitly. */
export async function runProductionRuntime26R2Main(args: readonly string[]): Promise<void> {
  if (args.length !== 1 || !args[0] || !path.isAbsolute(args[0]) || path.resolve(args[0]) !== args[0])
    throw new TypeError("One absolute private exact26 R2 configuration path is required");
  const filename = args[0], stat = await lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || await realpath(filename) !== filename || stat.size > 65_536 || (stat.mode & 0o077) !== 0)
    throw new TypeError("A bounded canonical private exact26 R2 configuration file is required");
  const bytes = await readFile(filename);
  if (bytes.length !== stat.size || bytes.length > 65_536) throw new TypeError("Exact26 R2 runtime configuration changed while reading");
  const config = parseProductionRuntime26R2Configuration(JSON.parse(bytes.toString("utf8")) as unknown);
  const api = await createProductionRuntime26R2ApplicationApi(config);
  const host = await startProductionRuntime26R2ApplicationHost({ api, configuration: config });
  let stopping = false;
  const stop = (): void => {
    if (stopping) return; stopping = true;
    process.off("SIGTERM", stop); process.off("SIGINT", stop);
    void host.close().catch(() => { process.stderr.write("Exact26 R2 production shutdown failed\n"); process.exitCode = 1; });
  };
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
  process.stdout.write(JSON.stringify({ event: "PRODUCTION_EXACT26_R2_HOST_STARTED", publicOrigin: host.publicOrigin, ...config.build }) + "\n");
}

/** Only the selected R3/Full CLI loads this private file. Direct factories keep their explicit null default. */
export async function readProductionStaffCredentialRequestTag(config: ProductionRuntime26R3Configuration): Promise<((password: string) => string) | null> {
  if (config.staffMaintenance !== true) return null;
  if (config.staffCredentialRequestKeyFile === undefined) throw new TypeError("Selected staff credentials require a stable private request key");
  const key=await readProductionCredentialRequestKey(config.staffCredentialRequestKeyFile);
  try { return createNodeCredentialRequestTag(key); } finally { key.fill(0); }
}

/** Explicit R3 successor; private configuration and host shutdown use the original boundary. */
async function runProductionRuntime26R3SelectedMain(args: readonly string[], full: boolean): Promise<void> {
  if (args.length !== 1 || !args[0] || !path.isAbsolute(args[0]) || path.resolve(args[0]) !== args[0])
    throw new TypeError("One absolute private exact26 R3 configuration path is required");
  const filename = args[0], stat = await lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || await realpath(filename) !== filename || stat.size > 65_536 || (stat.mode & 0o077) !== 0)
    throw new TypeError("A bounded canonical private exact26 R3 configuration file is required");
  const bytes = await readFile(filename);
  if (bytes.length !== stat.size || bytes.length > 65_536) throw new TypeError("Exact26 R3 runtime configuration changed while reading");
  const config = parseProductionRuntime26R3Configuration(JSON.parse(bytes.toString("utf8")) as unknown);
  const staffCredentialRequestTag = await readProductionStaffCredentialRequestTag(config);
  const api = full ? await createProductionRuntime26FullApplicationApi(config, undefined, staffCredentialRequestTag) : await createProductionRuntime26R3ApplicationApi(config, undefined, staffCredentialRequestTag);
  const host = await startProductionRuntime26R3ApplicationHost({ api, configuration: config });
  let stopping = false;
  const stop = (): void => {
    if (stopping) return; stopping = true;
    process.off("SIGTERM", stop); process.off("SIGINT", stop);
    void host.close().catch(() => { process.stderr.write("Exact26 R3 production shutdown failed\n"); process.exitCode = 1; });
  };
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
  process.stdout.write(JSON.stringify({ event: full ? "PRODUCTION_EXACT26_FULL_HOST_STARTED" : "PRODUCTION_EXACT26_R3_HOST_STARTED", publicOrigin: host.publicOrigin, ...config.build }) + "\n");
}

// Importing the module is inert, including during a source check.
export async function runProductionRuntime26R3Main(args: readonly string[]): Promise<void> {
  return runProductionRuntime26R3SelectedMain(args, false);
}
/** Full is an explicit trusted launch mode; the JSON remains the closed R3 shape. */
export async function runProductionRuntime26FullMain(args: readonly string[]): Promise<void> {
  return runProductionRuntime26R3SelectedMain(args, true);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const exact26 = process.argv[2] === "--exact26-r1";
  const exact26R2 = process.argv[2] === "--exact26-r2";
  const exact26R3 = process.argv[2] === "--exact26-r3";
  const exact26Full = process.argv[2] === "--exact26-full";
  void (exact26Full ? runProductionRuntime26FullMain(process.argv.slice(3)) : exact26R3 ? runProductionRuntime26R3Main(process.argv.slice(3)) : exact26R2 ? runProductionRuntime26R2Main(process.argv.slice(3)) : exact26 ? runProductionRuntime26Main(process.argv.slice(3)) : runProductionMain(process.argv.slice(2))).catch(() => {
    process.stderr.write("Production startup refused or failed; inspect private operational diagnostics\n"); process.exitCode = 1;
  });
}
