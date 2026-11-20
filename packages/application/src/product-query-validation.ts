import { DomainError } from "../../domain/src/errors.ts";
import { entityId } from "../../domain/src/values.ts";
import type { ActorContext } from "./ports.ts";
import type { ProductImageQuery, ProductQuery, ProductReadGrant } from "./product-query-ports.ts";

export function invalidProductQuery(): never { throw new DomainError("INVALID_PRODUCT_QUERY", "Invalid product read parameters"); }
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))) invalidProductQuery();
  return value as Record<string, unknown>;
}
export function productImageId(value: unknown): string {
  try { if (typeof value !== "string") invalidProductQuery(); return entityId("product", value); } catch { return invalidProductQuery(); }
}
function productId(value: unknown) { return entityId("product", productImageId(value)); }
export function parseProductQuery(value: unknown): ProductQuery {
  const row = record(value, ["productId"]); return Object.freeze({ productId: productId(row.productId) });
}
export function parseProductImageQuery(value: unknown): ProductImageQuery {
  const row = record(value, ["productId", "imageId"]);
  return Object.freeze({ productId: productId(row.productId), imageId: productImageId(row.imageId) });
}
export function checkedProductActor(actor: ActorContext): ActorContext {
  try {
    if (!actor || !Object.hasOwn(actor, "hallId")) throw new Error("Missing hall fact");
    return Object.freeze({ accountId: entityId("account", actor.accountId), hallId: actor.hallId === null ? null : entityId("hall", actor.hallId) });
  } catch { throw new Error("Invalid trusted product actor"); }
}
export function checkedProductGrant(value: ProductReadGrant, target: ProductQuery): ProductReadGrant {
  try {
    const row = record(value, ["productId"]); const granted = productId(row.productId);
    if (granted !== target.productId) throw new DomainError("FORBIDDEN", "No grant for the requested product");
    return Object.freeze({ productId: granted });
  } catch (error) {
    if (error instanceof DomainError && error.code === "FORBIDDEN") throw error;
    throw new Error("Invalid trusted product grant");
  }
}
export function activeProductRead(signal: AbortSignal): void {
  if (signal.aborted) throw new DomainError("PRODUCT_READ_ABORTED", "Product read is no longer active");
}
