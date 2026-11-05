import { requireDomain } from "./errors.ts";
import type { EntityId, MinorAmount, Version } from "./values.ts";

export interface CustomerRow { readonly id: EntityId<"customer">; readonly code: string; readonly name: string; readonly enabled: boolean; readonly version: Version }
export interface SupplierRow { readonly id: EntityId<"supplier">; readonly code: string; readonly name: string; readonly enabled: boolean; readonly version: Version }
export interface ProductRow {
  readonly id: EntityId<"product">; readonly productCode: string; readonly name: string;
  readonly categoryId: EntityId<"category">; readonly supplierId: EntityId<"supplier"> | null;
  readonly seasonId: EntityId<"season"> | null; readonly sizeGroupId: EntityId<"sizeGroup">;
  readonly retailPrice: MinorAmount | null;
  readonly enabled: boolean; readonly version: Version;
}
/** Price authority belongs to the product, never a parallel SKU override. */
export interface SkuRow {
  readonly id: EntityId<"sku">; readonly productId: EntityId<"product">; readonly colorId: EntityId<"color">;
  readonly fitId: EntityId<"fit">; readonly sizeId: EntityId<"size">; readonly skuCode: string;
  readonly enabled: boolean; readonly version: Version;
}
/** Source size code may be absent or repeat across groups; internal identity remains the ID. */
export interface SizeRow { readonly id: EntityId<"size">; readonly code: string | null; readonly name: string }
export interface SizeGroupRow { readonly id: EntityId<"sizeGroup">; readonly code: string; readonly name: string }
export interface SeasonRow { readonly id: EntityId<"season">; readonly code: string; readonly name: string; readonly displayOrder: number }
export interface SizeGroupMemberRow { readonly sizeGroupId: EntityId<"sizeGroup">; readonly sizeId: EntityId<"size">; readonly displayOrder: number }
/** This public port deliberately has no maintenance operations for sizes, groups or seasons. */
export interface ReadonlyDictionary<T> {
  get(id: string): Promise<T | undefined>;
  list(query: { readonly page: number; readonly pageSize: number; readonly search: string }): Promise<{ readonly items: readonly T[]; readonly total: number }>;
}
export interface PaymentMethodRow { readonly id: EntityId<"paymentMethod">; readonly name: string; readonly enabled: boolean; readonly version: Version }
export interface PaymentAccountRow {
  readonly id: EntityId<"paymentAccount">; readonly name: string; readonly paymentMethodId: EntityId<"paymentMethod">;
  readonly enabled: boolean; readonly version: Version;
}
export interface PaymentAccountHallRow { readonly paymentAccountId: EntityId<"paymentAccount">; readonly hallId: EntityId<"hall"> }
export interface WarehouseRow { readonly id: EntityId<"warehouse">; readonly hallId: EntityId<"hall">; readonly name: string; readonly enabled: boolean; readonly version: Version }

export function validateSkuUniqueness(skus: readonly SkuRow[]): void {
  const dimensions = new Set<string>();
  const codes = new Set<string>();
  const ids = new Set<string>();
  for (const sku of skus) {
    const key = JSON.stringify([sku.productId, sku.colorId, sku.fitId, sku.sizeId]);
    requireDomain(!dimensions.has(key) && !codes.has(sku.skuCode) && !ids.has(sku.id), "SKU_CONFLICT", "SKU identity, code and four-dimensional combination must be unique");
    dimensions.add(key); codes.add(sku.skuCode); ids.add(sku.id);
  }
}
