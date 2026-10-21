/** Historical storage DTOs, not live SAVE inputs. No SQL execution or invented defaults. */
export const HISTORY_MAPPING_VERSION = "V2_HISTORY_NULLABLE_1" as const;
export const HISTORY_COUNT_KEYS = ["history_sales_header", "history_sales_line", "history_sales_settlement", "history_transfer_header", "history_transfer_line", "import_source_row", "import_sku_alias", "import_stock_contributor", "barcodes"] as const;
export type HistoryCounts = Record<typeof HISTORY_COUNT_KEYS[number], number>;
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export interface ImportSourceEvidence {
  id: string; batchId: string; entityType: string; sourceKey: string;
  fileRef: string; sheet: string; rowNo: string; sourceFileSha256: string; rowSha256: string;
  /** Exact original cells and normalized input respectively; never replace with projected values. */
  rawFields: JsonObject; normalizedFields: JsonObject; fieldProvenance: JsonObject;
}
export interface HistorySourceLink { id: string; batchId: string; sourceRowId: string }
export interface HistoryHeader extends HistorySourceLink {
  version: number; number: string; businessDate: string | null;
  sourceStatus: "DRAFT" | "APPROVED" | "VOID"; note: string | null;
  createdBySourceKey: string | null; approvedBySourceKey: string | null;
  createdHallId: string | null; createdHallProvenance: "ORIGINAL" | "MIGRATION_DERIVED" | "UNKNOWN";
  createdHallReason: string;
  /** Local wall time is not UTC; instant exists only with evidenced offset/timezone. */
  createdLocalAt: string | null; updatedLocalAt: string | null; approvedLocalAt: string | null;
  createdInstant: string | null; updatedInstant: string | null; approvedInstant: string | null;
}
export interface HistorySalesHeader extends HistoryHeader {
  businessType: "SALE" | "RETURN" | "EXCHANGE"; hallId: string; customerId: string;
  warehouseId: string; salespersonId: string | null;
  grossAmount: string; orderDiscount: string; netDue: string;
}
export interface HistoryTransferHeader extends HistoryHeader {
  fromWarehouseId: string; toWarehouseId: string; createdRoleSource: string | null;
}
export interface HistoryLine extends HistorySourceLink {
  headerId: string; lineNo: number; skuId: string; quantity: string;
  productCodeSnapshot: string | null; productNameSnapshot: string | null;
  colorNameSnapshot: string | null; fitNameSnapshot: string | null; sizeNameSnapshot: string | null; barcodeSnapshot: string | null;
}
export interface HistorySalesLine extends HistoryLine {
  referencePrice: string | null; dealPrice: string; lineAmount: string; allocatedDiscount: string | null;
  isGift: boolean | null; pricingMethodSource: string | null; discountTenths: number | null; ordinaryZeroConfirmed: boolean | null;
}
export type HistoryTransferLine = HistoryLine;
export interface HistorySalesSettlement extends HistorySourceLink {
  headerId: string; lineNo: number; paymentAccountId: string; direction: "RECEIVE" | "REFUND";
  amount: string; accountNameSnapshot: string | null; methodNameSnapshot: string | null; paymentMethodIdSnapshot: string | null;
}
export interface ImportSkuAlias {
  batchId: string; oldSourceSkuId: string; canonicalSkuId: string; sourceRowId: string;
  canonicalSourceKey: string; mappingBasis: string;
}
export interface ImportStockContributor {
  batchId: string; sourceRowId: string; warehouseId: string; canonicalSkuId: string; oldSourceSkuId: string;
  canonicalStockSourceKey: string; sourceUnit: string; signedQuantity: string; baselineLedgerId: string | null;
}
export interface HistoryRevision {
  id: string; document: { kind: "SALES"; salesId: string } | { kind: "TRANSFER"; transferId: string };
  fromVersion: number; toVersion: number; actorAccountId: string; requestKey: string; reason: string;
  changedAt: string; beforeFacts: JsonObject; afterFacts: JsonObject; stockEffectBasis: string; stockEffectEvidence: JsonObject;
}
/** Explicit exact cent representation BEFORE numeric(18,2) binding (PostgreSQL itself rounds excess scale). */
export function isExactHistoryMoney(value: unknown): value is string {
  return typeof value === "string" && /^-?(?:0|[1-9][0-9]{0,15})\.[0-9]{2}$/.test(value) && value !== "-0.00";
}
export function isHistoryQuantity(value: unknown): value is string {
  if (typeof value !== "string" || !/^(?:0|-?[1-9][0-9]*)$/.test(value)) return false;
  const integer = BigInt(value);
  return integer >= -9223372036854775808n && integer <= 9223372036854775807n;
}
export function isHistoryCounts(value: unknown): value is HistoryCounts {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const object = value as Record<string, unknown>;
  return Object.keys(object).length === HISTORY_COUNT_KEYS.length && HISTORY_COUNT_KEYS.every(key =>
    Object.hasOwn(object, key) && Number.isSafeInteger(object[key]) && (object[key] as number) >= 0);
}
/** Persist the approved mapping CSV occurrence verbatim plus this validator version. */
export interface StockContributionLineage {
  validator_version: "STOCK_CONTRIBUTOR_LINEAGE_V1";
  oldStockSourceId: string; canonicalStockRowSourceId: string; warehouseSourceId: string;
  oldSkuSourceId: string; canonicalSkuSourceId: string; productSourceId: string;
  signedQuantity: string; sourceUnit: string; sourceFile: string; sourceSheet: string;
  sourceRow: string; sourceSha256: string;
}
/** Pure pre-binding counterpart, not database proof or a replacement for hash verification. */
export function matchesStockContributorEvidence(
  row: ImportStockContributor, source: ImportSourceEvidence, lineage: StockContributionLineage,
  resolved: { warehouseSourceKey: string; canonicalSkuSourceKey: string },
): boolean {
  return source.batchId === row.batchId && source.id === row.sourceRowId && source.entityType === "INVENTORY_BASELINE"
    && lineage.validator_version === "STOCK_CONTRIBUTOR_LINEAGE_V1"
    && lineage.oldStockSourceId === source.sourceKey && lineage.canonicalStockRowSourceId === row.canonicalStockSourceKey
    && lineage.oldSkuSourceId === row.oldSourceSkuId && lineage.canonicalSkuSourceId === resolved.canonicalSkuSourceKey
    && lineage.warehouseSourceId === resolved.warehouseSourceKey && lineage.signedQuantity === row.signedQuantity
    && lineage.sourceUnit === row.sourceUnit && lineage.sourceFile === source.fileRef && lineage.sourceSheet === source.sheet
    && lineage.sourceRow === source.rowNo && lineage.sourceSha256 === source.sourceFileSha256
    && source.rawFields["来源编号"] === source.sourceKey
    && source.rawFields["SKU来源编号"] === row.oldSourceSkuId
    && source.rawFields["仓库来源编号"] === resolved.warehouseSourceKey
    && isHistoryQuantity(source.rawFields["核准库存数量"])
    && source.rawFields["核准库存数量"] === row.signedQuantity;
}
