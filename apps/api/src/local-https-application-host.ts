import { createServer } from "node:https";
import type { Server } from "node:https";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import type { PostgresApplicationApi } from "./postgres-read-api.ts";

export interface LocalHttpsApplicationHostOptions {
  readonly api: PostgresApplicationApi;
  readonly address: { readonly host: "127.0.0.1"; readonly port: number };
  readonly tls: { readonly key: Buffer; readonly cert: Buffer };
  readonly assets: { readonly root: string; readonly entry: string };
}
export interface LocalHttpsApplicationHost { readonly origin: string; close(): Promise<void> }
const forbidden = (name: string): boolean => name.startsWith(".")
  || /^(?:source(?:[-_.].*)?|incoming(?:[-_.].*)?|provenance(?:[-_.].*)?|metafile(?:[-_.].*)?)$/i.test(name)
  || /(?:^|[-_.])(?:keys?|private|secrets?|pem|crt|cert)(?:[-_.]|$)/i.test(name);
const mime: Readonly<Record<string, string>> = Object.freeze({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2" });
function safeRelative(value: string): boolean {
  return value.length > 0 && value.length < 2048 && !/[\\\u0000-\u001f\u007f]/.test(value)
    && value.split("/").every(segment => segment.length > 0 && segment !== "." && segment !== ".." && !forbidden(segment));
}
/** Capture only bounded emitted public asset bytes before listening. No request-time filesystem reads. */
async function captureBuild(root: string, entry: string): Promise<ReadonlyMap<string, { readonly bytes: Buffer; readonly type: string }>> {
  if (typeof root !== "string" || !path.isAbsolute(root) || path.resolve(root) !== root
    || !safeRelative(entry) || path.posix.extname(entry) !== ".html" || await realpath(root) !== root)
    throw new TypeError("Explicit canonical build directory and public HTML entry required");
  for (let parent = root; ; parent = path.dirname(parent)) {
    if ((await lstat(parent)).isSymbolicLink()
      || /^(?:source(?:[-_.].*)?|incoming(?:[-_.].*)?|provenance(?:[-_.].*)?)$/i.test(path.basename(parent)))
      throw new TypeError("Build ancestors cannot be links or source/provenance locations");
    if (parent === path.dirname(parent)) break;
  }
  const result = new Map<string, { readonly bytes: Buffer; readonly type: string }>(); let total = 0, files = 0;
  async function walk(directory: string, prefix: string): Promise<void> {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, item.name), relative = prefix + item.name;
      const stat = await lstat(absolute);
      if (stat.isSymbolicLink()) throw new TypeError("Build output may not contain symbolic links");
      if (!safeRelative(relative)) continue; // Never read/serve source, provenance, incoming, key or dot entries.
      if (stat.isDirectory()) { await walk(absolute, relative + "/"); continue; }
      const type = mime[path.extname(relative).toLowerCase()];
      if (!stat.isFile() || !type) continue; // In particular no TS/TSX/maps/CSV/archives/certificates.
      if (++files > 2048 || stat.size > 16 * 1024 * 1024 || total + stat.size > 64 * 1024 * 1024)
        throw new TypeError("Build exceeds explicit public asset limits");
      if (await realpath(absolute) !== absolute) throw new TypeError("Build files must remain within their canonical directory");
      const bytes = await readFile(absolute); total += bytes.byteLength;
      if (bytes.byteLength !== stat.size || total > 64 * 1024 * 1024) throw new TypeError("Build changed during capture");
      result.set(relative, Object.freeze({ bytes, type }));
    }
  }
  await walk(root, "");
  if (!result.has(entry)) throw new TypeError("The configured actual build HTML entry is unavailable");
  return result;
}
function failure(response: ServerResponse, status: number): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  response.end(JSON.stringify({ error: { code: status === 404 ? "NOT_FOUND" : "HOST_REQUEST_REJECTED" } }));
}
async function closeListener(server: Server | undefined, sockets: ReadonlySet<Duplex>): Promise<void> {
  if (!server) return;
  const stopped = new Promise<void>((resolve, reject) => server.close(error => {
    if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") reject(error); else resolve();
  }));
  // Also closes active HTTP responses and pending TLS handshakes; request close propagates existing abort hooks.
  for (const socket of sockets) socket.destroy();
  await stopped;
}

/** Trusted local development host. No env, source loader, migration, credential discovery or synthetic transport.
 * Takes ownership of supplied API on invocation, including startup failure. Never modifies system TLS trust. */
export async function startLocalHttpsApplicationHost(options: LocalHttpsApplicationHostOptions): Promise<LocalHttpsApplicationHost> {
  const api = options?.api, apiClose = typeof api?.close === "function" ? api.close.bind(api) : undefined;
  let server: Server | undefined, closing: Promise<void> | undefined;
  const sockets = new Set<Duplex>();
  const close = (): Promise<void> => closing ??= (async () => {
    const errors: unknown[] = [];
    try { await closeListener(server, sockets); } catch (error) { errors.push(error); }
    try { await apiClose?.(); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, "HTTPS listener/API resource closure could not be confirmed");
  })();
  try {
    const address = options?.address;
    if (!apiClose || typeof api?.app?.routing !== "function" || typeof api.trustedOrigin !== "string" || api.app.server.listening
      || address?.host !== "127.0.0.1" || !Number.isInteger(address.port) || address.port < 1024 || address.port > 65535
      || !Buffer.isBuffer(options.tls?.key) || !Buffer.isBuffer(options.tls?.cert) || !options.tls.key.length || !options.tls.cert.length)
      throw new TypeError("Explicit new application API, loopback port and private TLS material required");
    const host = address.host, port = address.port, authority = `${host}:${port}`;
    const tls = { key: Buffer.from(options.tls.key), cert: Buffer.from(options.tls.cert) };
    const origin = `https://${authority}`;
    if (api.trustedOrigin !== origin) throw new TypeError("HTTPS listener must match the API's captured exact trustedOrigin");
    const routing = api.app.routing.bind(api.app), entry = options.assets.entry;
    const assets = await captureBuild(options.assets.root, entry);
    const handle = (request: IncomingMessage, response: ServerResponse): void => {
      const raw = request.url;
      if (closing || typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")
        || /[\\\u0000-\u001f\u007f]/.test(raw) || request.headers.host !== authority) return failure(response, 400);
      if (raw === "/api" || raw.startsWith("/api/") || raw.startsWith("/api?")) {
        request.url = raw.slice(4) || "/";
        if (request.url.startsWith("?")) request.url = "/" + request.url;
        routing(request, response); return; // Unknown API routes stay API404 and never become HTML.
      }
      if (request.method !== "GET" && request.method !== "HEAD") return failure(response, 405);
      const pathname = raw.split("?", 1)[0]!;
      let name: string;
      try { name = pathname === "/" ? entry : pathname.startsWith("/assets/") ? decodeURIComponent(pathname.slice(8)) : ""; }
      catch { return failure(response, 400); }
      if (!safeRelative(name)) return failure(response, 404);
      const asset = assets.get(name); if (!asset) return failure(response, 404);
      response.writeHead(200, { "content-type": asset.type, "content-length": asset.bytes.byteLength,
        "cache-control": "no-store", "x-content-type-options": "nosniff" });
      response.end(request.method === "HEAD" ? undefined : asset.bytes);
    };
    server = createServer({ ...tls, minVersion: "TLSv1.2", maxHeaderSize: 16_384 }, handle);
    server.requestTimeout = 30_000; server.headersTimeout = 10_000; server.keepAliveTimeout = 1_000;
    server.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
    const listener = server;
    await new Promise<void>((resolve, reject) => {
      const fail = (error: Error) => { listener.off("listening", ready); reject(error); };
      const ready = () => { listener.off("error", fail); resolve(); };
      listener.once("error", fail); listener.once("listening", ready); listener.listen(port, host);
    });
    return Object.freeze({ origin, close });
  } catch (error) {
    try { await close(); } catch (cleanup) { throw new AggregateError([error, cleanup], "HTTPS construction failed and resources may remain"); }
    throw error;
  }
}
