import { DomainError } from "../../domain/src/errors.ts";
import { activeProductRead, checkedProductActor, parseProductQuery } from "./product-query-validation.ts";
import { checkedProductDetailsScope, checkedProductStockPage, parseProductDetailsPageQuery, productDetailsIntent,
  parseProductStockOverviewQuery, checkedProductStockOverviewScope, checkedProductStockOverviewResult, checkedProductDefaultScheme } from "./product-details-query-validation.ts";
import type { ActorContext } from "./ports.ts";
import type { ProductQuery } from "./product-query-ports.ts";
import type { ProductDetailsQueryDependencies, ProductDetailsReadIntent, ProductDetailsScopedRead } from "./product-details-query-ports.ts";

/** Target-only reads of existing fields; no schema, command or inventory writer. */
export function createProductDetailsQueryService(dependencies: ProductDetailsQueryDependencies) {
  if (typeof dependencies?.authorization?.authorize !== "function" || typeof dependencies?.reader?.readPrices !== "function"
    || typeof dependencies.reader.readBarcodes !== "function" || !Object.hasOwn(dependencies, "stockReader")
    || (dependencies.stockReader !== null && typeof dependencies.stockReader?.readStock !== "function"))
    throw new TypeError("Product details require explicit per-tab authorization, reader and stock availability");
  const authorize = dependencies.authorization.authorize.bind(dependencies.authorization), reader = dependencies.reader, stock = dependencies.stockReader;
  async function read<P extends ProductQuery, R extends { readonly productId: string } | null>(actor: ActorContext, intent: ProductDetailsReadIntent, parameters: P,
    signal: AbortSignal, work: (scope: ProductDetailsScopedRead<P>) => Promise<R>): Promise<R> {
    const current = checkedProductActor(actor); activeProductRead(signal);
    const grant = await authorize(current, intent, signal); activeProductRead(signal);
    const scope = checkedProductDetailsScope(Object.freeze({ actor: current, intent, parameters, grant: Object.freeze({ ...grant }), signal }));
    const result = await work(scope); activeProductRead(signal);
    if (result !== null && result.productId !== parameters.productId) throw Error("Mismatched trusted product detail result");
    return result;
  }
  return Object.freeze({
    async readPrices(actor: ActorContext, input: unknown, signal: AbortSignal) {
      const p = parseProductQuery(input); return read(actor, productDetailsIntent("prices", p), p, signal, scope => reader.readPrices(scope));
    },
    async readBarcodes(actor: ActorContext, input: unknown, signal: AbortSignal) {
      const p = parseProductDetailsPageQuery(input);
      return read(actor, productDetailsIntent("barcodes", p), p, signal, async scope => {
        const result = await reader.readBarcodes(scope);
        return result === null ? null : { ...result, defaultScheme: checkedProductDefaultScheme(result.defaultScheme) };
      });
    },
    async readStockOverview(actor: ActorContext, input: unknown, signal: AbortSignal) {
      const p = parseProductStockOverviewQuery(input), current = checkedProductActor(actor); activeProductRead(signal);
      // Authorization compatibility only. This never reads or aggregates the legacy stock page.
      const grant = await authorize(current, productDetailsIntent("stock", { productId: p.productId, page: 1, pageSize: 20 }), signal); activeProductRead(signal);
      const scope = checkedProductStockOverviewScope({ actor: current, intent: Object.freeze({ kind: "stock-overview", parameters: p }),
        grant: Object.freeze({ ...grant }), parameters: p, signal });
      if (stock === null || typeof stock.readOverview !== "function") throw new DomainError("PRODUCT_STOCK_NOT_READY", "Controlled whole-scope stock overview is unavailable");
      const result = await stock.readOverview(scope); activeProductRead(signal);
      return result === null ? null : checkedProductStockOverviewResult(result, p);
    },
    async readStock(actor: ActorContext, input: unknown, signal: AbortSignal) {
      const p = parseProductDetailsPageQuery(input);
      return read(actor, productDetailsIntent("stock", p), p, signal, async scope => {
        if (stock === null) throw new DomainError("PRODUCT_STOCK_NOT_READY", "Controlled product stock reader is unavailable");
        const result = await stock.readStock(scope); activeProductRead(signal);
        return result === null ? null : checkedProductStockPage(result, p);
      });
    }
  });
}
