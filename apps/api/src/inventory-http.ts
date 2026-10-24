import type { IncomingHttpHeaders } from "node:http";
import { constants, type ReadStream } from "node:fs";
import { open, lstat, realpath, unlink, type FileHandle } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import type { ActorContext } from "../../../packages/application/src/ports.ts";
import type { InventoryQueryDependencies } from "../../../packages/application/src/inventory-query-contracts.ts";
import { checkedInventoryActor, createInventoryQueryService } from "../../../packages/application/src/inventory-query-service.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { rejectInventoryInput } from "../../../packages/application/src/inventory-query-validation.ts";

export interface InventoryAuthenticationInput {
  readonly headers: Readonly<IncomingHttpHeaders>; readonly ip: string; readonly method: string; readonly url: string;
}
export interface InventoryHttpOptions {
  /** Must resolve current server identity/session and enforce trusted Origin for these POST reads,
   * including cookie CSRF protections. Read-only does not exempt this route. Structurally compatible
   * with SalesAuthenticationInput/createSalesSessionAuthenticator. No client actor/role/default admin. */
  readonly authenticate: (input: InventoryAuthenticationInput) => Promise<ActorContext | null>;
  readonly dependencies: InventoryQueryDependencies;
  /** C-created private0700 directory, outside public assets. Absence disables
   * output with503; it never falls back to a database-held network stream. */
  readonly outputSpool?: InventoryOutputSpoolOptions;
}
export interface InventoryOutputSpoolOptions {
  readonly directory: string; readonly maxBytes: number; readonly maxConcurrent: number; readonly maxDurationMs: number;
}
// Serialize the already-validated frame in bounded pieces. A legal large matrix
// must not require a second whole-frame JSON string alongside the reader DTO.
function* outputJsonParts(value: unknown): Generator<string> {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) { yield JSON.stringify(value); return; }
  if (Array.isArray(value)) { yield "["; for (let i = 0; i < value.length; i++) { if (i) yield ","; yield* outputJsonParts(value[i]); } yield "]"; return; }
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    yield "{"; let first = true; for (const [key, item] of Object.entries(value as Record<string, unknown>)) { if (!first) yield ","; first = false; yield JSON.stringify(key); yield ":"; yield* outputJsonParts(item); } yield "}"; return;
  }
  throw new DomainError("INVENTORY_INTEGRITY_FAILED", "Inventory output contains an invalid frame value");
}
/** Encapsulated read-only routes. POST carries structured filters, but does not mutate inventory or other business state.
 * Response bodies match apps/web/src/inventory/contracts.ts. Snapshot readiness/reference are also exposed as headers.
 * This plugin never listens, connects to PG, enables CORS, invents covered balances or chooses a synthetic fallback.
 */
export function createInventoryHttpPlugin(options: InventoryHttpOptions): FastifyPluginAsync {
  if (typeof options?.authenticate !== "function") throw new TypeError("Inventory HTTP requires explicit trusted authentication");
  const authenticate = options.authenticate;
  const service = createInventoryQueryService(options.dependencies);
  const outputSpool = options.outputSpool === undefined ? undefined : Object.freeze({ ...options.outputSpool });
  if (outputSpool && (!isAbsolute(outputSpool.directory) || !Number.isSafeInteger(outputSpool.maxBytes) || outputSpool.maxBytes <= 0
    || !Number.isSafeInteger(outputSpool.maxConcurrent) || outputSpool.maxConcurrent !== 1
    || !Number.isSafeInteger(outputSpool.maxDurationMs) || outputSpool.maxDurationMs <= 0 || outputSpool.maxDurationMs > 2147483647)) throw new TypeError("Inventory output requires explicit bounded private spool settings");
  let activeOutputs = 0;
  return async function inventoryHttp(app) {
    const actors = new WeakMap<object, ActorContext>();
    const reads = new WeakMap<object, { controller: AbortController; cleanup: () => void; outputCleanup?: () => Promise<void> }>();
    app.addHook("onRequest", async (request, reply) => {
      reply.header("Cache-Control", "no-store").header("Pragma", "no-cache");
      const controller = new AbortController();
      const aborted = () => controller.abort();
      const closed = () => { if (!reply.raw.writableFinished) controller.abort(); };
      request.raw.once("aborted", aborted); reply.raw.once("close", closed);
      reads.set(request, { controller, cleanup: () => { request.raw.off("aborted", aborted); reply.raw.off("close", closed); } });
      let actor: ActorContext | null;
      try { actor = await authenticate({ headers: Object.freeze({ ...request.headers }), ip: request.ip, method: request.method, url: request.url }); }
      catch { throw new Error("Trusted inventory authentication failed"); }
      if (actor === null) return reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
      actors.set(request, checkedInventoryActor(actor));
    });
    app.addHook("onResponse", async request => {
      const state = reads.get(request);
      try { await state?.outputCleanup?.(); } finally { state?.cleanup(); reads.delete(request); actors.delete(request); }
    });
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof DomainError) {
        if (error.code === "INVALID_INVENTORY_INPUT") return reply.code(400).send({ error: { code: error.code, message: "Inventory read parameters rejected" } });
        if (error.code === "FORBIDDEN") return reply.code(403).send({ error: { code: error.code, message: "Access denied" } });
        if (error.code === "INVENTORY_NOT_READY") return reply.code(503).send({ error: { code: error.code, message: "Inventory facts are not ready for this read" } });
        if (error.code === "INVENTORY_READ_ABORTED") return reply.code(408).send({ error: { code: error.code, message: "Inventory read is no longer active" } });
        if (error.code === "INVENTORY_READ_TOO_LARGE") return reply.code(503).send({ error: { code: error.code, message: "Complete inventory output exceeds the configured resource limit" } });
      }
      const code = (error as { code?: string }).code;
      if (code === "FST_ERR_CTP_BODY_TOO_LARGE") return reply.code(413).send({ error: { code: "BODY_TOO_LARGE", message: "Request body is too large" } });
      if (code === "FST_ERR_CTP_INVALID_JSON_BODY" || code === "FST_ERR_CTP_EMPTY_JSON_BODY") return reply.code(400).send({ error: { code: "INVALID_JSON", message: "A valid JSON body is required" } });
      if (code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
      // Unknown response/storage/authentication failures are never empty successful pages or leaked diagnostics.
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "The inventory read could not be completed" } });
    });
    for (const [url, read] of [["/inventory/query", service.readInventory], ["/inventory/candidates/query", service.readCandidates]] as const) {
      app.post(url, { bodyLimit: 65_536 }, async (request, reply) => {
        if (!request.query || typeof request.query !== "object" || Array.isArray(request.query) || Object.keys(request.query).length) rejectInventoryInput();
        if (request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
          return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
        }
        const actor = actors.get(request); const state = reads.get(request);
        if (!actor || !state) throw new Error("Missing trusted inventory request context");
        const snapshot = await read(actor, request.body, state.controller.signal);
        return reply.header("X-Inventory-Read-Reference", snapshot.readReference)
          .header("X-Inventory-Readiness", snapshot.readiness).send(snapshot.data);
      });
    }
    app.post("/inventory/output/query", { bodyLimit: 65_536 }, async (request, reply) => {
      if (!request.query || typeof request.query !== "object" || Array.isArray(request.query) || Object.keys(request.query).length) rejectInventoryInput();
      if (request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
      const actor = actors.get(request), state = reads.get(request); if (!actor || !state) throw new Error("Missing trusted inventory request context");
      if (!outputSpool || activeOutputs >= outputSpool.maxConcurrent) throw new DomainError("INVENTORY_NOT_READY", "Complete output resources are unavailable");
      const active = () => { if (state.controller.signal.aborted) throw new DomainError("INVENTORY_READ_ABORTED", "Inventory output is no longer active"); };
      active(); activeOutputs++;
      let file: FileHandle | undefined, filePath: string | undefined, stream: ReadStream | undefined, cleanupPromise: Promise<void> | undefined;
      const abortedOutput = () => {
        const error = new DomainError("INVENTORY_READ_ABORTED", "Inventory output is no longer active");
        stream?.destroy(error); if (stream && !reply.raw.writableFinished) reply.raw.destroy();
      };
      const timer = setTimeout(() => state.controller.abort(), outputSpool.maxDurationMs); timer.unref();
      const cleanup = (): Promise<void> => cleanupPromise ??= (async () => {
        clearTimeout(timer); state.controller.signal.removeEventListener("abort", abortedOutput);
        try { stream?.destroy(); if (file) await file.close(); }
        finally {
          try { if (file && filePath) await unlink(filePath); }
          finally { activeOutputs--; state.cleanup(); reads.delete(request); actors.delete(request); }
        }
      })();
      state.outputCleanup = cleanup; state.controller.signal.addEventListener("abort", abortedOutput, { once: true });
      try {
        const directory = resolve(outputSpool.directory);
        let stat: Awaited<ReturnType<typeof lstat>>, actualDirectory: string;
        try { stat = await lstat(directory); actualDirectory = await realpath(directory); }
        catch (error) {
          if (["ENOENT", "ENOTDIR", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) throw new DomainError("INVENTORY_NOT_READY", "Private output directory is unavailable");
          throw error;
        }
        if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || actualDirectory !== directory
          || typeof process.getuid === "function" && stat.uid !== process.getuid()) throw new DomainError("INVENTORY_NOT_READY", "Private output directory is unavailable");
        active(); filePath = join(directory, `inventory-${randomUUID()}.ndjson`);
        file = await open(filePath, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        active(); const target = file; let bytes = 0, pending = "", pendingBytes = 0, reference: string | undefined, complete = false;
        const flush = async () => { active(); if (pending) { await target.writeFile(Buffer.from(pending)); pending = ""; pendingBytes = 0; } active(); };
        for await (const frame of service.readOutput(actor, request.body, state.controller.signal)) {
          active(); if (reference === undefined) { if (frame.kind !== "summary") throw Error("Inventory output summary is unavailable"); reference = frame.readReference; }
          for (const part of (function* () { yield* outputJsonParts(frame); yield "\n"; })()) {
            const length = Buffer.byteLength(part);
            if (bytes + length > outputSpool.maxBytes) throw new DomainError("INVENTORY_READ_TOO_LARGE", "Complete inventory output exceeds its private resource bound");
            if (pendingBytes + length > 65_536) await flush();
            bytes += length; pending += part; pendingBytes += length;
          }
          if (frame.kind === "complete") complete = true;
        }
        if (!reference || !complete) throw Error("Complete inventory output is unavailable");
        // The source returns complete only after confirmed COMMIT and release.
        // Finish private bytes before exposing any success/network stream.
        await flush(); await target.sync(); active();
        if ((await target.stat()).size !== bytes) throw Error("Complete inventory output bytes are unavailable");
        stream = target.createReadStream({ start: 0, end: bytes - 1, autoClose: false, highWaterMark: 65_536 });
        stream.once("close", () => { void cleanup().catch(error => request.log.error({ err: error }, "Inventory output cleanup failed")); });
        return reply.header("X-Inventory-Read-Reference", reference).header("X-Inventory-Readiness", "ready").type("application/x-ndjson").send(stream);
      } catch (error) {
        try { await cleanup(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], "Inventory output and cleanup failed"); }
        throw error;
      }
    });
  };
}
