import type { FastifyPluginAsync } from "fastify";
import type { ActorContext } from "../../../packages/application/src/ports.ts";
import type { ProductQueryAuthenticationInput } from "./product-query-http.ts";
import type { ControlledProductMediaProvider } from "../../../adapters/media/src/controlled-product-media.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { assertNoQuery } from "./input.ts";
export interface ProductMediaHttpOptions {
  readonly authenticate: (input: ProductQueryAuthenticationInput) => Promise<ActorContext | null>;
  readonly provider: Pick<ControlledProductMediaProvider, "deliver"> | null;
}
/** Read-only delivery; upload routes require the future explicit codec/stage capability. */
export function createProductMediaHttpPlugin(options: ProductMediaHttpOptions): FastifyPluginAsync {
  if (typeof options?.authenticate !== "function" || !Object.hasOwn(options, "provider") || options.provider !== null && typeof options.provider?.deliver !== "function") throw TypeError("Explicit media authentication and provider availability required");
  return async app => {
    const actors = new WeakMap<object, ActorContext>();
    app.addHook("onRequest", async (request, reply) => {
      reply.header("Cache-Control", "no-store").header("Pragma", "no-cache").header("X-Content-Type-Options", "nosniff");
      const actor = await options.authenticate({ headers: Object.freeze({ ...request.headers }), ip: request.ip, method: request.method, url: request.url });
      if (actor === null) return reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } }); actors.set(request, actor);
    });
    app.addHook("onResponse", async request => { actors.delete(request); });
    app.setErrorHandler((error, _request, reply) => {
      const statuses: Readonly<Record<string, number>> = { FORBIDDEN: 403, PRODUCT_IMAGE_NOT_FOUND: 404, PRODUCT_MEDIA_NOT_READY: 503, PRODUCT_READ_ABORTED: 408,
        INVALID_PRODUCT_QUERY: 400, INVALID_PRODUCT_IMAGE_QUERY: 400, INVALID_HTTP_INPUT: 400, INVALID_ID: 400 };
      const status = error instanceof DomainError ? statuses[error.code] : undefined;
      return reply.code(status ?? 500).send({ error: { code: status === undefined ? "INTERNAL_ERROR" : (error as DomainError).code, message: "Controlled product image could not be delivered" } });
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
