import type { ActorContext } from "./ports.ts";
import type { CompleteCataloguePrices } from "./catalogue-price-input.ts";
import type { ControlledProductMedia, ProductImageMetadata } from "./product-query-ports.ts";
export type ProductMaintenanceImageRole = "MAIN" | "WHITE_BACKGROUND" | "HANG_TAG" | "DETAIL" | "COLOR";
export interface ProductMaintenanceImageMetadata extends ProductImageMetadata {
  readonly version: number; readonly role: ProductMaintenanceImageRole | null; readonly colorId: string | null;
  readonly createdAt: string; readonly createdByAccountId: string | null;
}
export interface ProductMaintenanceImageSnapshot { readonly productId: string; readonly version: number; readonly images: readonly ProductMaintenanceImageMetadata[] }
export interface ProductMaintenanceImagesDto {
  readonly productId: string; readonly version: number;
  readonly images: readonly (Omit<ProductMaintenanceImageMetadata, "productId" | "fileRef" | "byteSize"> & {
    readonly byteSize: string; readonly thumbnailUrl: string | null; readonly thumbnailState: "READY" | "UNAVAILABLE";
  })[];
}
export type ProductImageChange =
  | { readonly action: "ADD"; readonly uploadId: string; readonly role: ProductMaintenanceImageRole; readonly colorId: string | null; readonly displayOrder: number }
  | { readonly action: "REPLACE"; readonly id: string; readonly expectedVersion: number; readonly uploadId: string; readonly role: ProductMaintenanceImageRole | null; readonly colorId: string | null; readonly displayOrder: number }
  | { readonly action: "EDIT_METADATA"; readonly id: string; readonly expectedVersion: number; readonly role: ProductMaintenanceImageRole | null; readonly colorId: string | null; readonly displayOrder: number }
  | { readonly action: "REMOVE"; readonly id: string; readonly expectedVersion: number };
export type ProductMaintenanceMediaCommandV2 = Extract<ProductMaintenanceCommandV2, { readonly action: "CREATE" | "EDIT" }> & { readonly imageChanges: readonly ProductImageChange[] };
/** Structural consumption seam implemented by the actual verified private stage. */
export interface ProductImageStageConsumer {
  readonly profile: "PRIVATE_PRODUCT_MEDIA_STAGE_V1";
  consume(input: { readonly actor: ActorContext; readonly productId: string | null; readonly commandKey: string; readonly uploadId: string; readonly signal: AbortSignal }): Promise<{
    readonly profile: "PRIVATE_PRODUCT_MEDIA_STAGE_V1"; readonly uploadId: string; readonly actorAccountId: string; readonly productId: string | null; readonly commandKey: string;
    readonly fileRef: string; readonly createdAt: string; readonly expiresAt: string;
    readonly original: { readonly mime: ProductImageMetadata["mime"]; readonly byteSize: bigint; readonly sha256: string };
    readonly thumbnail: { readonly mime: "image/webp"; readonly byteSize: bigint; readonly sha256: string; readonly derivedFromOriginalSha256: string };
  }>;
}
export type ProductMaintenanceAction = "CREATE" | "EDIT" | "DISABLE" | "RESTORE" | "DELETE";
export type ProductAuditValue = string | number | boolean | null | readonly ProductAuditValue[] | { readonly [key: string]: ProductAuditValue };
export interface ProductAuditObject { readonly [key: string]: ProductAuditValue }
export interface ProductWriteValues {
  readonly productCode: string; readonly name: string; readonly categoryId: string; readonly supplierId: string | null;
  readonly seasonId: string | null; readonly sizeGroupId: string; readonly year: number | null;
  readonly systemItemCode: string | null; readonly thickness: string | null; readonly collarPantsType: string | null;
  readonly defaultBarcodeSchemeId: string | null; readonly enabled: boolean; readonly prices: CompleteCataloguePrices;
}
export interface ProductWriteValuesV2 extends Omit<ProductWriteValues, "seasonId"> { readonly seasonIds: readonly string[] | null }
/** Absent seasonIds means legacy schema. Present null means actual historical UNKNOWN. */
export interface ProductStoredRecord extends ProductWriteValues { readonly id: string; readonly version: number; readonly deletedAt: string | null; readonly seasonIds?: readonly string[] | null }
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
  readonly season: ProductDetailReference | null; readonly seasons?: readonly ProductDetailReference[]; readonly sizeGroup: ProductDetailReference;
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
export interface ProductMaintenanceDetailV2 extends Omit<ProductMaintenanceDetail, "values" | "references"> {
  readonly values: ProductWriteValuesV2;
  readonly references: Omit<ProductDetailReferences, "season" | "seasons"> & { readonly seasons: readonly ProductDetailReference[] };
}
export interface ProductSkuSelection { readonly colorIds: readonly string[]; readonly fitIds: readonly string[] }
export type ProductMaintenanceCommandV2 = { readonly requestKey: string } & (
  { readonly action: "CREATE"; readonly values: ProductWriteValuesV2 & { readonly seasonIds: readonly string[] }; readonly skus: readonly ProductSkuInput[]; readonly barcodes: readonly ProductBarcodeInput[]; readonly skuSelection?: ProductSkuSelection }
  | { readonly action: "EDIT"; readonly id: string; readonly expectedVersion: number; readonly values: ProductWriteValuesV2; readonly skus: readonly ProductSkuInput[]; readonly barcodes: readonly ProductBarcodeInput[]; readonly skuSelection?: ProductSkuSelection }
  | { readonly action: "DISABLE" | "RESTORE" | "DELETE"; readonly id: string; readonly expectedVersion: number }
);
export interface ProductMaintenanceResult { readonly operationId: string; readonly kind: "PRODUCT"; readonly targetId: string; readonly version: number }
/** Internal same-SAVE append input. D1 supplies true provider-issued records and
 * its original purpose-bound evidence; this is never a public product command. */
export interface DocumentProductSkuAppendInput {
  readonly actor: ActorContext; readonly productId: string; readonly expectedVersion: number;
  readonly operationId: string; readonly requestKey: string; readonly completedAt: string;
  readonly skus: readonly ProductSkuRecord[];
}
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
  assertImageWriteReady?(): Promise<void>;
  assertImagesPrepared?(completion: Parameters<ProductMaintenanceEvidence["complete"]>[0]): Promise<void>;
  assertImageColorSwapReady?(completion: Parameters<ProductMaintenanceEvidence["complete"]>[0]): Promise<void>;
  loadImages?(productId: string): Promise<readonly ProductMaintenanceImageMetadata[]>;
  /** Supplied rows contain only actual changes. Deletions and unique-safe updates precede additions. */
  writeImages?(before: readonly ProductMaintenanceImageMetadata[], after: readonly ProductMaintenanceImageMetadata[]): Promise<void>;
  /** One statement owns root/image versions and all retained image facts; optional legacy provider compatibility. */
  readImageSnapshot?(productId: string): Promise<ProductMaintenanceImageSnapshot | null>;
  load(id: string): Promise<ProductAggregate | undefined>;
  readReferences(product: ProductStoredRecord): Promise<ProductDetailReferences>;
  readCandidates(query: ProductMaintenanceCandidateQuery): Promise<ProductMaintenanceCandidatePage>;
  /** v17: lock selected enabled color/fit references and every real member of this exact group in the original product transaction. */
  readSkuSelectionSizes?(productId: string, sizeGroupId: string, selection: ProductSkuSelection): Promise<readonly string[]>;
  /** Same-transaction reference locks, size-group membership and enabled/new-selection rules. */
  validateReferences(previous: ProductAggregate | undefined, next: ProductAggregate): Promise<void>;
  /** D3-owned trusted ALL-warehouse/SKU zero and reference guard; unknown/negative/nonzero must reject. */
  assertCanDelete(previous: ProductAggregate): Promise<void>;
  putProduct(next: ProductStoredRecord, previous: ProductStoredRecord | undefined): Promise<void>;
  putSku(next: ProductSkuRecord, previous: ProductSkuRecord | undefined): Promise<void>;
  putBarcode(next: ProductBarcodeRecord, previous: ProductBarcodeRecord | undefined): Promise<void>;
}
export interface ProductMaintenanceUnitOfWork { readonly seasonContract?: "product-season-array-v1"; transaction<T>(work: (tx: ProductMaintenanceTransaction) => Promise<T>): Promise<T> }
export interface ProductMaintenanceDependencies {
  readonly unitOfWork: ProductMaintenanceUnitOfWork; readonly now: () => string;
  readonly newId: (kind: "product" | "sku" | "barcode" | "operation") => string;
  readonly media?: ControlledProductMedia | null;
  readonly imageStage?: ProductImageStageConsumer | null;
  readonly newImageId?: () => string;
}
