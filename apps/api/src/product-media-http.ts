import type { FastifyPluginAsync } from "fastify";
import type { ActorContext } from "../../../packages/application/src/ports.ts";
import type { ProductQueryAuthenticationInput } from "./product-query-http.ts";
import type { ControlledProductMediaProvider } from "../../../adapters/media/src/controlled-product-media.ts";
import type { PrivateProductMediaStage } from "../../../adapters/media/src/product-media-stage.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import { assertNoQuery, parseRequestKey } from "./input.ts";
const uploadLimit = 8388608;
export interface ProductMediaHttpOptions {
  readonly authenticate: (input: ProductQueryAuthenticationInput) => Promise<ActorContext | null>;
  readonly provider: Pick<ControlledProductMediaProvider, "deliver"> | null;
  readonly imageStage?: Pick<PrivateProductMediaStage, "stage"> | null;
}
/** Existing controlled delivery and raw upload bridge to the actual private stage. */
export function createProductMediaHttpPlugin(options: ProductMediaHttpOptions): FastifyPluginAsync {
  if (typeof options?.authenticate !== "function" || !Object.hasOwn(options, "provider") || options.provider !== null && typeof options.provider?.deliver !== "function") throw TypeError("Explicit media authentication and provider availability required");
  if (options.imageStage != null && typeof options.imageStage.stage !== "function") throw TypeError("Explicit private product media stage required");
  const imageStage = options.imageStage ?? null;
  return async app => {
    app.addContentTypeParser(["image/png", "image/jpeg", "image/webp"], { parseAs: "buffer", bodyLimit: uploadLimit }, (_request, body, done) => done(null, body));
    const actors = new WeakMap<object, ActorContext>();
    app.addHook("onRequest", async (request, reply) => {
      reply.header("Cache-Control", "no-store").header("Pragma", "no-cache").header("X-Content-Type-Options", "nosniff");
      const actor = await options.authenticate({ headers: Object.freeze({ ...request.headers }), ip: request.ip, method: request.method, url: request.url });
      if (actor === null) return reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } }); actors.set(request, actor);
    });
    app.addHook("onResponse", async request => { actors.delete(request); });
    app.setErrorHandler((error, request, reply) => {
      const statuses: Readonly<Record<string, number>> = { FORBIDDEN: 403, PRODUCT_IMAGE_NOT_FOUND: 404, PRODUCT_MEDIA_NOT_READY: 503, PRODUCT_READ_ABORTED: 408,
        INVALID_PRODUCT_QUERY: 400, INVALID_PRODUCT_IMAGE_QUERY: 400, INVALID_HTTP_INPUT: 400, INVALID_ID: 400,
        INVALID_UPLOAD: 400, INVALID_MEDIA_TYPE: 400, INVALID_MEDIA_DIMENSIONS: 400, MEDIA_TOO_LARGE: 413,
        PRODUCT_NOT_FOUND: 404, PRODUCT_DELETED: 409, IDEMPOTENCY_CONFLICT: 409, MEDIA_SCOPE_MISMATCH: 409, UPLOAD_EXPIRED: 409 };
      const parserStatuses: Readonly<Record<string, number>> = { FST_ERR_CTP_BODY_TOO_LARGE: 413, FST_ERR_CTP_INVALID_MEDIA_TYPE: 415 };
      const status = error instanceof DomainError ? statuses[error.code] : parserStatuses[(error as { code?: string }).code ?? ""];
      const code = error instanceof DomainError ? error.code : status === 413 ? "BODY_TOO_LARGE" : status === 415 ? "UNSUPPORTED_MEDIA_TYPE" : "INTERNAL_ERROR";
      return reply.code(status ?? 500).send({ error: { code: status === undefined ? "INTERNAL_ERROR" : code,
        message: request.method === "POST" ? "Product image upload could not be completed" : "Controlled product image could not be delivered" } });
    });
    app.post<{ Body: Buffer }>("/products/media/uploads", { bodyLimit: uploadLimit, async onRequest(request, reply) {
      const mime = request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase();
      if (!mime || !["image/png", "image/jpeg", "image/webp"].includes(mime))
        return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use binary PNG, JPEG or WEBP" } });
    } }, async (request, reply) => {
      assertNoQuery(request.query); const actor = actors.get(request); if (!actor) throw Error("Missing current media actor");
      const declaredMime = request.headers["content-type"]!.split(";")[0]!.trim().toLowerCase();
      const commandKey = parseRequestKey(request.headers["x-command-key"]), uploadKey = parseRequestKey(request.headers["x-upload-key"]);
      const headerProductId = request.headers["x-product-id"];
      if (headerProductId !== undefined && typeof headerProductId !== "string") throw new DomainError("INVALID_HTTP_INPUT", "Invalid upload product scope");
      const productId = headerProductId === undefined ? null : entityId("product", headerProductId);
      if (!Buffer.isBuffer(request.body)) throw new DomainError("INVALID_UPLOAD", "Binary image body required");
      if (imageStage === null) throw new DomainError("PRODUCT_MEDIA_NOT_READY", "Private product media stage unavailable");
      const controller = new AbortController(), abort = () => controller.abort(), close = () => { if (!reply.raw.writableFinished) controller.abort(); };
      request.raw.once("aborted", abort); reply.raw.once("close", close);
      try {
        const uploaded = await imageStage.stage({ actor, productId, commandKey, uploadKey, declaredMime, bytes: request.body, signal: controller.signal });
        return { uploadId: uploaded.uploadId, mime: uploaded.mime, byteSize: uploaded.byteSize, expiresAt: uploaded.expiresAt };
      } finally { request.raw.off("aborted", abort); reply.raw.off("close", close); }
    });
    app.get<{ Params: { productId: string; imageId: string; revision: string; variant: string } }>("/products/media/:productId/:imageId/:revision/:variant", { exposeHeadRoute: false }, async (request, reply) => {
      assertNoQuery(request.query); const actor = actors.get(request); if (!actor) throw Error("Missing current media actor");
      const { productId, imageId, revision, variant } = request.params;
      if (!/^[a-f0-9]{64}$/.test(revision) || variant !== "thumbnail" && variant !== "original") throw new DomainError("PRODUCT_IMAGE_NOT_FOUND", "Image unavailable");
      if (options.provider === null) throw new DomainError("PRODUCT_MEDIA_NOT_READY", "Controlled media provider unavailable");
      const controller = new AbortController(), abort = () => controller.abort(), close = () => { if (!reply.raw.writableFinished) controller.abort(); };
      request.raw.once("aborted", abort); reply.raw.once("close", close);
      try {
        const result = await options.provider.deliver({ actor, productId, imageId, revision, variant, signal: controller.signal });
        if (!Buffer.isBuffer(result.bytes) || result.bytes.length < 1 || result.bytes.length > 8388608 || !["image/png", "image/jpeg", "image/webp"].includes(result.mime)) throw Error("Invalid controlled media bytes");
        return reply.type(result.mime).send(result.bytes);
      } finally { request.raw.off("aborted", abort); reply.raw.off("close", close); }
    });
  };
}
