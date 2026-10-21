import type { ActorContext } from "./ports.ts";
import type { EntityId } from "../../domain/src/values.ts";

/** CURRENT business-form proposals only. Not historical filter references, command
 * authorization, authoritative transaction facts, numbering or a prepared draft. */
export interface CurrentFormPage<T> {
  readonly page: number; readonly pageSize: 20; readonly exactTotal: bigint; readonly items: readonly T[];
}
export type CurrentFormContext = { readonly kind: "SALES"; readonly hallId: EntityId<"hall"> }
  | { readonly kind: "TRANSFER" };
export interface CurrentFormSearch { readonly search: string; readonly page: number; readonly pageSize: 20 }
export interface CurrentSalesReferenceQuery extends CurrentFormSearch {
  readonly kind: "hall" | "customer" | "salesperson" | "warehouse" | "paymentAccount";
  /** null only for the hall picker; all other references belong to this proposed form hall. */
  readonly hallId: EntityId<"hall"> | null;
}
export interface CurrentSalesReferenceItem {
  readonly id: string; readonly name: string; readonly code: string | null;
  readonly hallId: EntityId<"hall"> | null; readonly hallName: string | null;
  readonly paymentMethodId: EntityId<"paymentMethod"> | null; readonly paymentMethodName: string | null;
}
export interface CurrentTransferWarehouseQuery extends CurrentFormSearch { readonly direction: "FROM" | "TO" }
export interface CurrentTransferWarehouse {
  readonly id: EntityId<"warehouse">; readonly name: string; readonly hallId: EntityId<"hall">; readonly hallName: string;
  readonly enabled: boolean; readonly hallEnabled: boolean; readonly hasNonzeroInventory: boolean;
}
export interface CurrentFormProductQuery extends CurrentFormSearch { readonly context: CurrentFormContext }
export interface CurrentFormProduct {
  readonly id: EntityId<"product">; readonly code: string; readonly name: string;
  /** Native nullable retail_price, exact yuan text at scale 2. Not a complete nine-price set. */
  readonly retailPrice: string | null; readonly minimumPriceAvailability: "UNAVAILABLE";
}
export interface CurrentFormProductSkuQuery {
  readonly context: CurrentFormContext; readonly productId: EntityId<"product">; readonly page: number; readonly pageSize: 20;
}
export const CURRENT_FORM_MAX_TARGET_SKUS = 200;
export interface CurrentFormSkuBatchQuery { readonly context: CurrentFormContext; readonly skuIds: readonly EntityId<"sku">[] }
export interface CurrentFormSku {
  readonly id: EntityId<"sku">; readonly skuCode: string;
  readonly productId: EntityId<"product">; readonly productCode: string; readonly productName: string;
  readonly colorId: EntityId<"color">; readonly colorName: string; readonly fitId: EntityId<"fit">; readonly fitName: string;
  readonly sizeId: EntityId<"size">; readonly sizeName: string; readonly sizeGroupId: EntityId<"sizeGroup">;
  /** No current barcode authority exists in 0001–0008. Missing is not a known null barcode. */
  readonly barcodeAvailability: "UNAVAILABLE";
}
/** Fresh non-secret native facts, captured in the same proposal snapshot. */
export interface CurrentFormIdentity {
  readonly accountId: EntityId<"account">; readonly staffId: EntityId<"staff">;
  readonly role: "ADMIN" | "WAREHOUSE" | "SALESPERSON"; readonly hallId: EntityId<"hall"> | null;
}
export type CurrentFormIntent = { readonly kind: "sales-references"; readonly parameters: CurrentSalesReferenceQuery }
  | { readonly kind: "transfer-warehouses"; readonly parameters: CurrentTransferWarehouseQuery }
  | { readonly kind: "products"; readonly parameters: CurrentFormProductQuery }
  | { readonly kind: "product-skus"; readonly parameters: CurrentFormProductSkuQuery }
  | { readonly kind: "sku-batch"; readonly parameters: CurrentFormSkuBatchQuery };
/** A trusted host grant for this form, never request-supplied. Halls constrain the
 * form/warehouse scope, not ownership of shared customer/staff/product/account records. */
export type CurrentFormReadGrant = { readonly kind: "all" }
  | { readonly kind: "halls"; readonly hallIds: readonly EntityId<"hall">[] };
export interface CurrentFormAuthorization {
  authorize(context: { readonly actor: ActorContext; readonly identity: CurrentFormIdentity }, intent: CurrentFormIntent,
    signal: AbortSignal): Promise<CurrentFormReadGrant>;
}
export interface CurrentFormReader {
  readSalesReferences(actor: ActorContext, parameters: CurrentSalesReferenceQuery, signal: AbortSignal): Promise<CurrentFormPage<CurrentSalesReferenceItem>>;
  readTransferWarehouses(actor: ActorContext, parameters: CurrentTransferWarehouseQuery, signal: AbortSignal): Promise<CurrentFormPage<CurrentTransferWarehouse>>;
  readProducts(actor: ActorContext, parameters: CurrentFormProductQuery, signal: AbortSignal): Promise<CurrentFormPage<CurrentFormProduct>>;
  readProductSkus(actor: ActorContext, parameters: CurrentFormProductSkuQuery, signal: AbortSignal): Promise<CurrentFormPage<CurrentFormSku>>;
  /** All requested IDs must still be eligible, otherwise the batch fails without disclosing which. */
  readSkuBatch(actor: ActorContext, parameters: CurrentFormSkuBatchQuery, signal: AbortSignal): Promise<readonly CurrentFormSku[]>;
}
