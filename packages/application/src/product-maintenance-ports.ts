import type { ActorContext } from "./ports.ts";
import type { CompleteCataloguePrices } from "./catalogue-price-input.ts";
export type ProductMaintenanceAction = "CREATE" | "EDIT" | "DISABLE" | "RESTORE" | "DELETE";
export type ProductAuditValue = string | number | boolean | null | readonly ProductAuditValue[] | { readonly [key: string]: ProductAuditValue };
export interface ProductAuditObject { readonly [key: string]: ProductAuditValue }
export interface ProductWriteValues {
  readonly productCode: string; readonly name: string; readonly categoryId: string; readonly supplierId: string | null;
  readonly seasonId: string | null; readonly sizeGroupId: string; readonly year: number | null;
  readonly systemItemCode: string | null; readonly thickness: string | null; readonly collarPantsType: string | null;
  readonly defaultBarcodeSchemeId: string | null; readonly enabled: boolean; readonly prices: CompleteCataloguePrices;
}
export interface ProductStoredRecord extends ProductWriteValues { readonly id: string; readonly version: number; readonly deletedAt: string | null }
export interface ProductSkuInput {
  readonly id: string | null; readonly expectedVersion: number | null; readonly skuCode: string;
  readonly colorId: string; readonly fitId: string; readonly sizeId: string; readonly enabled: boolean;
}
export interface ProductSkuRecord {
  readonly id: string; readonly productId: string; readonly skuCode: string; readonly colorId: string; readonly fitId: string;
  readonly sizeId: string; readonly enabled: boolean; readonly version: number; readonly createdOperationId: string | null;
}
export interface ProductBarcodeInput {
  readonly id: string | null; readonly barcode: string; readonly colorId: string; readonly fitId: string; readonly sizeId: string;
  readonly kind: "MAIN" | "CONFIRMED_OLD"; readonly schemeId: string | null; readonly enabled: boolean;
}
export interface ProductBarcodeRecord {
  readonly id: string; readonly barcode: string; readonly skuId: string; readonly kind: "MAIN" | "CONFIRMED_OLD";
  readonly schemeId: string | null; readonly enabled: boolean;
}
export interface ProductAggregate { readonly product: ProductStoredRecord; readonly skus: readonly ProductSkuRecord[]; readonly barcodes: readonly ProductBarcodeRecord[] }
export interface ProductDetailReference { readonly id: string; readonly name: string }
export interface ProductDetailReferences {
  readonly categoryPath: readonly ProductDetailReference[];
  readonly supplier: (ProductDetailReference & { readonly enabled: boolean }) | null;
  readonly season: ProductDetailReference | null; readonly sizeGroup: ProductDetailReference;
  readonly defaultBarcodeScheme: (ProductDetailReference & { readonly ruleVersion: string; readonly status: "CURRENT" | "HISTORICAL" }) | null;
}
export type ProductMaintenanceCandidateKind = "categories" | "suppliers" | "seasons" | "size-groups" | "colors" | "fits" | "barcode-schemes" | "years" | "thicknesses" | "collar-pants-types";
export interface ProductMaintenanceCandidateQuery { readonly kind: ProductMaintenanceCandidateKind; readonly search: string; readonly page: number; readonly pageSize: 20 | 50 | 100 }
export interface ProductMaintenanceCandidate { readonly id: string; readonly name: string; readonly code: string | null; readonly parentId: string | null; readonly version: number | null }
export interface ProductMaintenanceCandidatePage { readonly kind: ProductMaintenanceCandidateKind; readonly page: number; readonly pageSize: 20 | 50 | 100; readonly total: number; readonly items: readonly ProductMaintenanceCandidate[] }
/** Editing DTO is separate from the frozen old-field drawer read DTO v1. */
export interface ProductMaintenanceDetail {
  readonly productId: string; readonly version: number; readonly deletedAt: string | null; readonly values: ProductWriteValues;
  readonly skus: readonly ProductSkuInput[]; readonly barcodes: readonly ProductBarcodeInput[]; readonly references: ProductDetailReferences;
}
export type ProductMaintenanceCommand = { readonly requestKey: string } & (
  { readonly action: "CREATE"; readonly values: ProductWriteValues; readonly skus: readonly ProductSkuInput[]; readonly barcodes: readonly ProductBarcodeInput[] }
  | { readonly action: "EDIT"; readonly id: string; readonly expectedVersion: number; readonly values: ProductWriteValues; readonly skus: readonly ProductSkuInput[]; readonly barcodes: readonly ProductBarcodeInput[] }
  | { readonly action: "DISABLE" | "RESTORE" | "DELETE"; readonly id: string; readonly expectedVersion: number }
);
export interface ProductMaintenanceResult { readonly operationId: string; readonly kind: "PRODUCT"; readonly targetId: string; readonly version: number }
/** Structural seam implemented by D1's common driver; D2 does not write shared receipt/audit SQL. */
export interface ProductMaintenanceEvidence {
  assertAllowed(actor: ActorContext, kind: "PRODUCT", action: ProductMaintenanceAction | "RECEIPT" | "DETAIL" | "CANDIDATES"): Promise<void>;
  getReceipt(actorAccountId: string, requestKey: string, kind: "PRODUCT"): Promise<{
    readonly requestHash: string; readonly action: string;
    readonly result: { readonly operationId: string; readonly kind: string; readonly targetId: string; readonly version: number };
    readonly completedAt: string;
  } | undefined>;
  prepare?(input: Parameters<ProductMaintenanceEvidence["complete"]>[0]): Promise<void>;
  complete(input: {
    readonly operationId: string; readonly actorAccountId: string; readonly requestKey: string; readonly requestHash: string;
    readonly kind: "PRODUCT"; readonly action: ProductMaintenanceAction; readonly targetId: string;
    readonly oldVersion: number | null; readonly newVersion: number; readonly beforeValues: ProductAuditObject | null;
    readonly afterValues: ProductAuditObject; readonly completedAt: string;
  }): Promise<{ readonly operationId: string; readonly kind: string; readonly targetId: string; readonly version: number }>;
}
export interface ProductMaintenanceTransaction {
  readonly evidence: ProductMaintenanceEvidence;
  load(id: string): Promise<ProductAggregate | undefined>;
  readReferences(product: ProductStoredRecord): Promise<ProductDetailReferences>;
  readCandidates(query: ProductMaintenanceCandidateQuery): Promise<ProductMaintenanceCandidatePage>;
  /** Same-transaction reference locks, size-group membership and enabled/new-selection rules. */
  validateReferences(previous: ProductAggregate | undefined, next: ProductAggregate): Promise<void>;
  /** D3-owned trusted ALL-warehouse/SKU zero and reference guard; unknown/negative/nonzero must reject. */
  assertCanDelete(previous: ProductAggregate): Promise<void>;
  putProduct(next: ProductStoredRecord, previous: ProductStoredRecord | undefined): Promise<void>;
  putSku(next: ProductSkuRecord, previous: ProductSkuRecord | undefined): Promise<void>;
  putBarcode(next: ProductBarcodeRecord, previous: ProductBarcodeRecord | undefined): Promise<void>;
}
export interface ProductMaintenanceUnitOfWork { transaction<T>(work: (tx: ProductMaintenanceTransaction) => Promise<T>): Promise<T> }
export interface ProductMaintenanceDependencies {
  readonly unitOfWork: ProductMaintenanceUnitOfWork; readonly now: () => string;
  readonly newId: (kind: "product" | "sku" | "barcode" | "operation") => string;
}
