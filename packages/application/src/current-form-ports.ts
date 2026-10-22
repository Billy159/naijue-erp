import type { ActorContext } from "./ports.ts";
import type { EntityId } from "../../domain/src/values.ts";

/** CURRENT business-form proposals only. Not historical filter references, command
 * authorization, authoritative transaction facts, numbering or a prepared draft. */
export interface CurrentFormPage<T> {
  readonly page: number; readonly pageSize: 20; readonly exactTotal: bigint; readonly items: readonly T[];
  /** Only paymentAccount pages expose this optional hint status. AVAILABLE covers
   * verified runtime-active/source-hall hints, not unproven CUTOFF_HISTORY activity. */
  readonly recommendationAvailability?: "AVAILABLE" | "UNAVAILABLE";
}
export type CurrentFormContext = { readonly kind: "SALES"; readonly hallId: EntityId<"hall"> }
  | { readonly kind: "TRANSFER" };
export interface CurrentFormSearch { readonly search: string; readonly page: number; readonly pageSize: 20 }
/** Only account lookup carries a selected method; omission is not an all-method grant. */
export type CurrentSalesReferenceQuery = CurrentFormSearch & (
  { readonly kind: "hall"; readonly hallId: null }
  | { readonly kind: "customer" | "salesperson" | "warehouse" | "paymentMethod"; readonly hallId: EntityId<"hall"> }
  | { readonly kind: "paymentAccount"; readonly hallId: EntityId<"hall">; readonly paymentMethodId: EntityId<"paymentMethod"> }
);
export interface CurrentSalesReferenceItem {
  readonly id: string; readonly name: string; readonly code: string | null;
  readonly hallId: EntityId<"hall"> | null; readonly hallName: string | null;
  /** Account-only method metadata. A paymentMethod item's own canonical ID/name
   * are in id/name; these two fields and its hall/code fields remain null. */
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
export type CurrentFormBarcodeContext = { readonly kind: "SALES"; readonly hallId: EntityId<"hall">; readonly warehouseId: EntityId<"warehouse"> }
  | { readonly kind: "TRANSFER"; readonly fromWarehouseId: EntityId<"warehouse">; readonly toWarehouseId: EntityId<"warehouse"> };
export interface CurrentFormBarcodeQuery { readonly context: CurrentFormBarcodeContext; readonly barcode: string }
export type CurrentFormBarcodeResult = { readonly state: "FOUND"; readonly barcode: string;
  readonly binding: { readonly id: string; readonly kind: "MAIN" | "CONFIRMED_OLD" }; readonly sku: CurrentFormSku }
  | { readonly state: "NOT_FOUND" | "UNAVAILABLE"; readonly barcode: string; readonly binding: null; readonly sku: null };
/** Fresh non-secret native facts, captured in the same proposal snapshot. */
export interface CurrentFormIdentity {
  readonly accountId: EntityId<"account">; readonly staffId: EntityId<"staff">;
  readonly role: "ADMIN" | "WAREHOUSE" | "SALESPERSON"; readonly hallId: EntityId<"hall"> | null;
}
export type CurrentFormIntent = { readonly kind: "sales-references"; readonly parameters: CurrentSalesReferenceQuery }
  | { readonly kind: "transfer-warehouses"; readonly parameters: CurrentTransferWarehouseQuery }
  | { readonly kind: "products"; readonly parameters: CurrentFormProductQuery }
  | { readonly kind: "product-skus"; readonly parameters: CurrentFormProductSkuQuery }
  | { readonly kind: "sku-batch"; readonly parameters: CurrentFormSkuBatchQuery }
  | { readonly kind: "barcode"; readonly parameters: CurrentFormBarcodeQuery };
/** A trusted host grant for this form, never request-supplied. Halls constrain the
 * form/warehouse scope, not ownership of shared customer/staff/product/method/account records. */
export type CurrentFormReadGrant = { readonly kind: "all" }
  | { readonly kind: "halls"; readonly hallIds: readonly EntityId<"hall">[] };
export interface CurrentFormAuthorization {
  authorize(context: { readonly actor: ActorContext; readonly identity: CurrentFormIdentity }, intent: CurrentFormIntent,
    signal: AbortSignal): Promise<CurrentFormReadGrant>;
}
export interface CurrentFormReader {
  /** Explicit optional availability for older host adapters. A missing method
   * must reject503; it never falls back to product search or guessed SKU. */
  readBarcode?(actor: ActorContext, parameters: CurrentFormBarcodeQuery, signal: AbortSignal): Promise<CurrentFormBarcodeResult>;
  readSalesReferences(actor: ActorContext, parameters: CurrentSalesReferenceQuery, signal: AbortSignal): Promise<CurrentFormPage<CurrentSalesReferenceItem>>;
  readTransferWarehouses(actor: ActorContext, parameters: CurrentTransferWarehouseQuery, signal: AbortSignal): Promise<CurrentFormPage<CurrentTransferWarehouse>>;
  readProducts(actor: ActorContext, parameters: CurrentFormProductQuery, signal: AbortSignal): Promise<CurrentFormPage<CurrentFormProduct>>;
  readProductSkus(actor: ActorContext, parameters: CurrentFormProductSkuQuery, signal: AbortSignal): Promise<CurrentFormPage<CurrentFormSku>>;
  /** All requested IDs must still be eligible, otherwise the batch fails without disclosing which. */
  readSkuBatch(actor: ActorContext, parameters: CurrentFormSkuBatchQuery, signal: AbortSignal): Promise<readonly CurrentFormSku[]>;
}
