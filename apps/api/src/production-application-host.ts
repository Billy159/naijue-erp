import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import type { PostgresApplicationApi } from "./postgres-read-api.ts";
import { parseProductionRuntimeConfiguration } from "./production-provider-composition.ts";
import { productionRuntime26HostConfiguration } from "./production-provider-composition.ts";
import { productionRuntime26R2HostConfiguration } from "./production-provider-composition.ts";
import type { ProductionRuntimeConfiguration, ProductionRuntime26Configuration, ProductionRuntime26R2Configuration } from "./production-provider-composition.ts";

export interface ProductionApplicationHostOptions { readonly api: PostgresApplicationApi; readonly configuration: ProductionRuntimeConfiguration }
export interface ProductionApplicationHost { readonly publicOrigin: string; close(): Promise<void> }
const forbidden = (name: string): boolean => name.startsWith(".")
  || /^(?:source(?:[-_.].*)?|incoming(?:[-_.].*)?|provenance(?:[-_.].*)?|metafile(?:[-_.].*)?)$/i.test(name)
  || /(?:^|[-_.])(?:keys?|private|secrets?|pem|crt|cert)(?:[-_.]|$)/i.test(name);
const mime: Readonly<Record<string, string>> = Object.freeze({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2" });
function safeRelative(value: string): boolean {
  return value.length > 0 && value.length < 2048 && !/[\\\x00-\x1f\x7f]/.test(value)
    && value.split("/").every(segment => segment.length > 0 && segment !== "." && segment !== ".." && !forbidden(segment));
}
/** Same bounded public-output boundary as the local HTTPS host. The reverse proxy
 * serves no source tree: only these captured emitted bytes can leave this host. */
async function captureBuild(root: string, entry: string): Promise<ReadonlyMap<string, { readonly bytes: Buffer; readonly type: string }>> {
  if (!path.isAbsolute(root) || path.resolve(root) !== root || !safeRelative(entry) || /synthetic|fixture|harness/i.test(entry)
    || path.extname(entry) !== ".html" || await realpath(root) !== root)
    throw new TypeError("Explicit canonical build directory and public HTML entry required");
  for (let parent = root; ; parent = path.dirname(parent)) {
    if ((await lstat(parent)).isSymbolicLink() || /^(?:source(?:[-_.].*)?|incoming(?:[-_.].*)?|provenance(?:[-_.].*)?)$/i.test(path.basename(parent)))
      throw new TypeError("Build ancestors cannot be links or source/provenance locations");
    if (parent === path.dirname(parent)) break;
  }
  const result = new Map<string, { readonly bytes: Buffer; readonly type: string }>(); let total = 0, files = 0, entries = 0;
  async function walk(directory: string, prefix: string, depth: number): Promise<void> {
    if (depth > 16) throw new TypeError("Build exceeds directory depth limit");
    for (const item of await readdir(directory, { withFileTypes: true })) {
      if (++entries > 8192) throw new TypeError("Build exceeds directory entry limit");
      const absolute = path.join(directory, item.name), relative = prefix + item.name, stat = await lstat(absolute);
      if (stat.isSymbolicLink()) throw new TypeError("Build output may not contain symbolic links");
      if (!safeRelative(relative)) continue;
      if (stat.isDirectory()) { await walk(absolute, relative + "/", depth + 1); continue; }
      const type = mime[path.extname(relative).toLowerCase()];
      if (!stat.isFile() || !type) continue;
      if (++files > 2048 || stat.size > 16 * 1024 * 1024 || total + stat.size > 64 * 1024 * 1024) throw new TypeError("Build exceeds public asset limits");
      if (await realpath(absolute) !== absolute) throw new TypeError("Build files must be canonical");
      const bytes = await readFile(absolute); total += bytes.byteLength;
      if (bytes.byteLength !== stat.size || total > 64 * 1024 * 1024) throw new TypeError("Build changed during capture");
      result.set(relative, Object.freeze({ bytes, type }));
    }
  }
  await walk(root, "", 0);
  if (!result.has(entry)) throw new TypeError("The configured actual build HTML entry is unavailable");
  return result;
}
function failure(response: ServerResponse, status: number): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  response.end(JSON.stringify({ error: { code: status === 404 ? "NOT_FOUND" : "HOST_REQUEST_REJECTED" } }));
}
/** Prepare without opening a socket; also permits protocol checks of the exact
 * production handler. Ownership of API shutdown belongs to start below/caller. */
export async function createProductionRequestHandler(options: ProductionApplicationHostOptions,
  isClosing: () => boolean = () => false): Promise<(request: IncomingMessage, response: ServerResponse) => void> {
  const config = parseProductionRuntimeConfiguration(options.configuration), api = options.api;
  if (typeof api?.close !== "function" || typeof api?.app?.routing !== "function" || api.app.server.listening
    || api.trustedOrigin !== config.publicOrigin) throw new TypeError("Explicit non-listening application with the exact public origin required");
  const routing = api.app.routing.bind(api.app), hosts = new Set(config.http.acceptedHosts), entry = config.assets.entry;
  const assets = await captureBuild(config.assets.root, entry);
  const health = Buffer.from(JSON.stringify({ status: "HOST_READY", databaseChecked: false, apiBase: "/api", ...config.build }));
  return (request, response) => {
    const raw = request.url;
    // Proxy headers are deliberately ignored. The trusted origin is configuration,
    // and accepted Host values must be supplied by the deployment owner.
    if (isClosing()) return failure(response, 503);
    if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || /[\\\x00-\x1f\x7f]/.test(raw)
      || !hosts.has(request.headers.host ?? "")) return failure(response, 400);
    if (raw === "/api" || raw.startsWith("/api/") || raw.startsWith("/api?")) {
      request.url = raw.slice(4) || "/"; if (request.url.startsWith("?")) request.url = "/" + request.url;
      routing(request, response); return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") return failure(response, 405);
    const pathname = raw.split("?", 1)[0]!;
    if (pathname === "/healthz") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8", "content-length": health.byteLength, "cache-control": "no-store", "x-content-type-options": "nosniff" });
      response.end(request.method === "HEAD" ? undefined : health); return;
    }
    let name: string;
    try { name = pathname === "/" ? entry : pathname.startsWith("/assets/") ? decodeURIComponent(pathname.slice(8)) : ""; }
    catch { return failure(response, 400); }
    if (!safeRelative(name)) return failure(response, 404);
    const asset = assets.get(name); if (!asset) return failure(response, 404);
    response.writeHead(200, { "content-type": asset.type, "content-length": asset.bytes.byteLength, "cache-control": "no-store", "x-content-type-options": "nosniff" });
    response.end(request.method === "HEAD" ? undefined : asset.bytes);
  };
}
async function closeListener(server: Server | undefined, sockets: ReadonlySet<Duplex>): Promise<void> {
  if (!server) return;
  const stopped = new Promise<void>((resolve, reject) => server.close(error => {
    if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") reject(error); else resolve();
  }));
  for (const socket of sockets) socket.destroy();
  await stopped;
}
/** Internal container HTTP only. C must keep port 3000 off public bindings and
 * terminate HTTPS on the approved existing proxy. No X-Forwarded trust, migrations
 * or automatic database discovery. Takes API ownership even if startup fails. */
export async function startProductionApplicationHost(options: ProductionApplicationHostOptions): Promise<ProductionApplicationHost> {
  const apiClose = typeof options?.api?.close === "function" ? options.api.close.bind(options.api) : undefined;
  let server: Server | undefined, closing: Promise<void> | undefined; const sockets = new Set<Duplex>();
  const close = (): Promise<void> => closing ??= (async () => {
    const errors: unknown[] = [];
    try { await closeListener(server, sockets); } catch (error) { errors.push(error); }
    try { await apiClose?.(); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, "Production listener/API shutdown failed");
  })();
  try {
    const config = parseProductionRuntimeConfiguration(options.configuration);
    const handle = await createProductionRequestHandler({ api: options.api, configuration: config }, () => closing !== undefined);
    server = createServer({ maxHeaderSize: 16_384 }, handle);
    server.requestTimeout = 30_000; server.headersTimeout = 10_000; server.keepAliveTimeout = 1_000;
    server.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
    const listener = server;
    await new Promise<void>((resolve, reject) => {
      const fail = (error: Error) => { listener.off("listening", ready); reject(error); };
      const ready = () => { listener.off("error", fail); resolve(); };
      listener.once("error", fail); listener.once("listening", ready); listener.listen(config.http.port, config.http.host);
    });
    return Object.freeze({ publicOrigin: config.publicOrigin, close });
  } catch (error) {
    try { await close(); } catch (cleanup) { throw new AggregateError([error, cleanup], "Production startup and cleanup failed"); }
    throw error;
  }
}

export interface ProductionRuntime26ApplicationHostOptions { readonly api: PostgresApplicationApi; readonly configuration: ProductionRuntime26Configuration }
/** Explicit successor adapter reuses the original host's captured public output
 * and request boundary. Private review metadata is never a public asset/health field. */
export async function createProductionRuntime26RequestHandler(options: ProductionRuntime26ApplicationHostOptions,
  isClosing: () => boolean = () => false): Promise<(request: IncomingMessage, response: ServerResponse) => void> {
  return createProductionRequestHandler({ api: options.api, configuration: productionRuntime26HostConfiguration(options.configuration) }, isClosing);
}
export async function startProductionRuntime26ApplicationHost(options: ProductionRuntime26ApplicationHostOptions): Promise<ProductionApplicationHost> {
  let configuration: ProductionRuntimeConfiguration;
  try { configuration = productionRuntime26HostConfiguration(options.configuration); }
  catch (error) {
    try { await options?.api?.close(); } catch (cleanup) { throw new AggregateError([error, cleanup], "Exact26 host configuration and API cleanup failed"); }
    throw error;
  }
  return startProductionApplicationHost({ api: options.api, configuration });
}

export interface ProductionRuntime26R2ApplicationHostOptions { readonly api: PostgresApplicationApi; readonly configuration: ProductionRuntime26R2Configuration }
export async function createProductionRuntime26R2RequestHandler(options: ProductionRuntime26R2ApplicationHostOptions,
  isClosing: () => boolean = () => false): Promise<(request: IncomingMessage, response: ServerResponse) => void> {
  return createProductionRequestHandler({ api: options.api, configuration: productionRuntime26R2HostConfiguration(options.configuration) }, isClosing);
}
export async function startProductionRuntime26R2ApplicationHost(options: ProductionRuntime26R2ApplicationHostOptions): Promise<ProductionApplicationHost> {
  let configuration: ProductionRuntimeConfiguration;
  try { configuration = productionRuntime26R2HostConfiguration(options.configuration); }
  catch (error) {
    try { await options?.api?.close(); } catch (cleanup) { throw new AggregateError([error, cleanup], "Exact26 R2 host configuration and API cleanup failed"); }
    throw error;
  }
  return startProductionApplicationHost({ api: options.api, configuration });
}
