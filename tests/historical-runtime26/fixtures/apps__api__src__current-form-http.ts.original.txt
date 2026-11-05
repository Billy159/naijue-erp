import type { IncomingHttpHeaders } from "node:http";
import type { FastifyPluginAsync } from "fastify";
import type { ActorContext } from "../../../packages/application/src/ports.ts";
import { CURRENT_FORM_SAVED_EDIT_SKU_WIRE_FIELDS } from "../../../packages/application/src/current-form-ports.ts";
import type { CurrentFormReader, CurrentFormSavedEditSkuBatch, CurrentFormSavedEditSkuBatchWireV2, CurrentFormSavedEditSkuTupleV2, CurrentFormSavedEditProductTupleV2 } from "../../../packages/application/src/current-form-ports.ts";
import { checkedCurrentFormActor, activeCurrentFormRead, parseCurrentSalesReferenceQuery,
  parseCurrentTransferWarehouseQuery, parseCurrentFormProductQuery, parseCurrentFormProductSkuQuery,
  parseCurrentFormSkuBatchQuery, parseCurrentFormBarcodeQuery } from "../../../packages/application/src/current-form-validation.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { exactJson } from "./sales-http.ts";

/** Kind-specific opt-in hints preserve strict legacy page shapes. No client grant. */
export function currentCustomerRecommendationWire(value:unknown,kind:unknown,version:unknown):unknown {
 if((kind!=='customer'&&kind!=='warehouse')||version===(kind==='customer'?'customer-v1':'warehouse-v1')||!value||typeof value!=='object'||Array.isArray(value))return value;
 const {recommendationAvailability:_availability,items,...legacy}=value as Record<string,unknown>;
 return {...legacy,items:Array.isArray(items)?items.map(item=>{if(!item||typeof item!=='object'||Array.isArray(item))return item;const {isRecommended:_recommended,...legacyItem}=item;return legacyItem;}):items};
}

export interface CurrentFormAuthenticationInput {
  readonly headers: Readonly<IncomingHttpHeaders>; readonly ip: string; readonly method: string; readonly url: string;
}
export interface CurrentFormHttpOptions {
  /** Required current trusted session/identity provider. Client actor/roles/scope are never accepted. */
  readonly authenticate: (input: CurrentFormAuthenticationInput) => Promise<ActorContext | null>;
  /** Mandatory trusted proposal reader; it must recheck current identity and form authorization.
   * This HTTP adapter provides no default grant, DB pool, command or host registration. */
  readonly reader: CurrentFormReader;
}
/** Exact transport projection of an already validated domain revision1. No facts
 * are dropped/inferred; malformed provider keys are not hidden by tuple packing. */
export function encodeCurrentFormSavedEditSkuBatchWireV2(value: CurrentFormSavedEditSkuBatch): CurrentFormSavedEditSkuBatchWireV2 {
  const keys = (input: unknown, expected: readonly string[]): void => {
    if (!input || typeof input !== "object" || Array.isArray(input)
      || Reflect.ownKeys(input).length !== expected.length || expected.some(key => !Object.hasOwn(input, key)))
      throw new TypeError("Invalid saved-edit domain response");
  };
  keys(value, ["version", "skus", "products"]);
  if (value.version !== 1 || !Array.isArray(value.skus) || !Array.isArray(value.products)) throw new TypeError("Invalid saved-edit domain revision");
  const skus = value.skus.map((row): CurrentFormSavedEditSkuTupleV2 => {
    keys(row, CURRENT_FORM_SAVED_EDIT_SKU_WIRE_FIELDS);
    return Object.freeze(CURRENT_FORM_SAVED_EDIT_SKU_WIRE_FIELDS.map(key => row[key])) as unknown as CurrentFormSavedEditSkuTupleV2;
  });
  const products = value.products.map((row): CurrentFormSavedEditProductTupleV2 => {
    if (row.state === "ELIGIBLE") { keys(row, ["productId", "state", "sizeGroupId"]); return Object.freeze([row.productId, row.state, row.sizeGroupId] as const); }
    keys(row, ["productId", "state"]);
    if (row.state !== "UNAVAILABLE") throw new TypeError("Invalid saved-edit product state");
    return Object.freeze([row.productId, row.state] as const);
  });
  return Object.freeze({ version: 2, skus: Object.freeze(skus), products: Object.freeze(products) });
}
/** Read-only POST routes accept structured bounded filters, not commands. No server/listener or pool is created. */
export function createCurrentFormHttpPlugin(options: CurrentFormHttpOptions): FastifyPluginAsync {
  if (typeof options?.authenticate !== "function") throw new TypeError("Current form HTTP requires explicit trusted authentication");
  const authenticate = options.authenticate;
  const reader = options.reader;
  if (!reader || [reader.readSalesReferences, reader.readTransferWarehouses, reader.readProducts,
    reader.readProductSkus, reader.readSkuBatch].some(method => typeof method !== "function"))
    throw new TypeError("Current form HTTP requires an explicit trusted reader");
  // Capture bound methods before registration so later caller mutation cannot replace a provider.
  const sales = reader.readSalesReferences.bind(reader), warehouses = reader.readTransferWarehouses.bind(reader),
    products = reader.readProducts.bind(reader), skus = reader.readProductSkus.bind(reader), batch = reader.readSkuBatch.bind(reader),
    barcode = reader.readBarcode?.bind(reader), savedEditBatch = reader.readSavedEditSkuBatch?.bind(reader);
  const routes: readonly (readonly [string, (actor: ActorContext, body: unknown, signal: AbortSignal) => Promise<unknown>])[] = [
    ["/current-form/sales-references/query", (a, b, s) => sales(a, parseCurrentSalesReferenceQuery(b), s)],
    ["/current-form/transfer-warehouses/query", (a, b, s) => warehouses(a, parseCurrentTransferWarehouseQuery(b), s)],
    ["/current-form/products/query", (a, b, s) => products(a, parseCurrentFormProductQuery(b), s)],
    ["/current-form/product-skus/query", (a, b, s) => skus(a, parseCurrentFormProductSkuQuery(b), s)],
    ["/current-form/sku-batch/query", (a, b, s) => batch(a, parseCurrentFormSkuBatchQuery(b), s)],
    ["/current-form/saved-edit-sku-batch-v2/query", async (a, b, s) => {
      const query = parseCurrentFormSkuBatchQuery(b);
      if (!savedEditBatch) throw new DomainError("CURRENT_FORM_READ_UNAVAILABLE", "Explicit saved-edit metadata reader unavailable");
      return encodeCurrentFormSavedEditSkuBatchWireV2(await savedEditBatch(a, query, s));
    }],
    ["/current-form/barcode/query", (a, b, s) => {
      const query = parseCurrentFormBarcodeQuery(b);
      if (!barcode) throw new DomainError("CURRENT_FORM_READ_UNAVAILABLE", "Explicit current barcode reader unavailable");
      return barcode(a, query, s);
    }]
  ];
  return async function currentFormHttp(app) {
    const actors = new WeakMap<object, ActorContext>();
    const reads = new WeakMap<object, { readonly controller: AbortController; readonly cleanup: () => void }>();
    app.addHook("onRequest", async (request, reply) => {
      reply.header("Cache-Control", "no-store").header("Pragma", "no-cache");
      const controller = new AbortController();
      const aborted = () => controller.abort(); const closed = () => { if (!reply.raw.writableFinished) controller.abort(); };
      request.raw.once("aborted", aborted); reply.raw.once("close", closed);
      reads.set(request, { controller, cleanup: () => { request.raw.off("aborted", aborted); reply.raw.off("close", closed); } });
      let actor: ActorContext | null;
      try { actor = await authenticate({ headers: Object.freeze({ ...request.headers }), ip: request.ip, method: request.method, url: request.url }); }
      catch { throw new Error("Trusted current form authentication failed"); }
      if (actor === null) return reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
      actors.set(request, checkedCurrentFormActor(actor));
    });
    app.addHook("onResponse", async request => { reads.get(request)?.cleanup(); reads.delete(request); actors.delete(request); });
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof DomainError) {
        const statuses: Readonly<Record<string, number>> = { INVALID_CURRENT_FORM_QUERY: 400, FORBIDDEN: 403, SKU_UNAVAILABLE: 409, CURRENT_FORM_READ_ABORTED: 408, CURRENT_FORM_READ_UNAVAILABLE: 503 };
        const status = Object.hasOwn(statuses, error.code) ? statuses[error.code] : undefined;
        if (status !== undefined) return reply.code(status).send({ error: { code: error.code, message: status === 403 ? "Access denied" : "Current form read rejected" } });
      }
      const code = (error as { code?: string }).code;
      if (code === "FST_ERR_CTP_BODY_TOO_LARGE") return reply.code(413).send({ error: { code: "BODY_TOO_LARGE", message: "Request body is too large" } });
      if (code === "FST_ERR_CTP_INVALID_JSON_BODY" || code === "FST_ERR_CTP_EMPTY_JSON_BODY") return reply.code(400).send({ error: { code: "INVALID_JSON", message: "A valid JSON body is required" } });
      if (code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
      // Malformed trusted facts, unknown SQL failures and provider details never become successful empty pages or leaked errors.
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "The current form read could not be completed" } });
    });
    for (const [url, read] of routes) {
      app.post(url, { bodyLimit: 65_536 }, async (request, reply) => {
        if (!request.query || typeof request.query !== "object" || Array.isArray(request.query) || Object.keys(request.query).length) throw new DomainError("INVALID_CURRENT_FORM_QUERY", "Unexpected query parameters");
        if (request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
          return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
        }
        const actor = actors.get(request); const state = reads.get(request);
        if (!actor || !state) throw new Error("Missing trusted current form context");
        activeCurrentFormRead(state.controller.signal);
        const result = await read(actor, request.body, state.controller.signal);
        activeCurrentFormRead(state.controller.signal);
        return reply.type("application/json").send(exactJson(url==="/current-form/sales-references/query"?currentCustomerRecommendationWire(result,(request.body as {kind?:unknown})?.kind,request.headers["x-naijue-current-form-recommendation"]):result));
      });
    }
  };
}
