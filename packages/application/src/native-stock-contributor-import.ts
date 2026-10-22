import { requireDomain } from "../../domain/src/errors.ts";
import { entityId } from "../../domain/src/values.ts";
import { HISTORY_MAPPING_VERSION, isHistoryQuantity, matchesStockContributorEvidence } from "./history-storage-contract.ts";
import type { ImportSourceEvidence, JsonObject, StockContributionLineage } from "./history-storage-contract.ts";
import { IMPORT_V2_TABLES } from "./import-v2-contract.ts";
import { requestHash } from "./request-hash.ts";

/** Immutable original signed contributions. Does not create a baseline ledger entry. */
export const NATIVE_STOCK_CONTRIBUTOR_VERSION = "NATIVE_STOCK_CONTRIBUTOR_V1";
export interface NativeStockSelection {
  readonly entity: "INVENTORY_BASELINE"; readonly source: "BASE_V2";
  readonly path: "business/12切换库存.csv"; readonly baseManifestSha256: string;
  readonly selectionSha256: string; readonly approvalSha256: string;
  readonly csvSha256: string; readonly lineageCsvSha256: string;
}
export interface NativeStockContributorInput {
  readonly source: ImportSourceEvidence;
  readonly lineage: StockContributionLineage;
}
export interface NativeStockGroupInput {
  readonly batchId: string; readonly fixedSourceNamespace: string; readonly selection: NativeStockSelection;
  /** One complete effective (warehouse, canonical SKU) stock CSV row. */
  readonly canonicalStock: JsonObject;
  readonly warehouse: { readonly sourceKey: string; readonly nativeId: string };
  readonly sku: { readonly canonicalSourceKey: string; readonly nativeId: string };
  readonly contributors: readonly NativeStockContributorInput[];
}
export interface PreparedNativeStockGroup extends NativeStockGroupInput {
  readonly mappingVersion: typeof HISTORY_MAPPING_VERSION; readonly fingerprint: string;
  readonly signedQuantity: string;
}
export interface NativeStockContributorStore { stage(input: PreparedNativeStockGroup): Promise<{ inserted: number; replayed: number }> }
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= 65536 && !v.includes("\0");
const hash = (v: unknown): boolean => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
export function prepareNativeStockGroup(input: NativeStockGroupInput): PreparedNativeStockGroup {
  const group = structuredClone(input), n = group.canonicalStock, selection = group.selection;
  entityId("sku", group.batchId); entityId("sku", group.warehouse.nativeId); entityId("sku", group.sku.nativeId);
  requireDomain(text(group.fixedSourceNamespace) && selection?.entity === "INVENTORY_BASELINE"
    && selection.source === "BASE_V2" && selection.path === "business/12切换库存.csv"
    && [selection.baseManifestSha256, selection.selectionSha256, selection.approvalSha256,
      selection.csvSha256, selection.lineageCsvSha256].every(hash),
  "NATIVE_STOCK_SELECTION", "Exact selected stock CSV and complete original lineage authority required");
  requireDomain(Array.isArray(group.contributors) && group.contributors.length > 0 && group.contributors.length <= 200
    && new TextEncoder().encode(JSON.stringify(group)).byteLength <= 4 * 1024 * 1024,
  "NATIVE_STOCK_LIMIT", "One bounded complete effective stock key required");
  const columns = IMPORT_V2_TABLES.find(t => t.entity === "INVENTORY_BASELINE")!.columns;
  requireDomain(n && Object.keys(n).length === columns.length && columns.every(c => Object.hasOwn(n, c.name)
    && typeof n[c.name] === "string" && (n[c.name] as string).length <= 65536 && !(n[c.name] as string).includes("\0")
    && (!c.required || n[c.name] !== "")), "NATIVE_STOCK_COLUMNS", "Exact complete effective stock row required");
  requireDomain(text(group.warehouse.sourceKey) && text(group.sku.canonicalSourceKey)
    && n["仓库来源编号"] === group.warehouse.sourceKey && n["SKU来源编号"] === group.sku.canonicalSourceKey
    && text(n["来源编号"]) && isHistoryQuantity(n["核准库存数量"]) && n["核准库存数量"] !== "0"
    && n["合并输入库存行数"] === String(group.contributors.length),
  "NATIVE_STOCK_KEY", "One exact nonzero canonical warehouse/SKU stock key and input count required");
  const ids = new Set<string>(), keys = new Set<string>(), positions = new Set<string>();
  const units = new Set<string>(); let sum = 0n;
  for (const { source: s, lineage: l } of group.contributors) {
    requireDomain(s && s.batchId === group.batchId && s.entityType === "INVENTORY_BASELINE"
      && text(s.sourceKey) && text(s.fileRef) && text(s.sheet) && typeof s.rowNo === "string"
      && /^[1-9]\d*$/.test(s.rowNo) && BigInt(s.rowNo) <= 9223372036854775807n
      && hash(s.sourceFileSha256) && hash(s.rowSha256) && s.fieldProvenance?.schema_version === 1
      && s.fieldProvenance.fields && typeof s.fieldProvenance.fields === "object",
    "NATIVE_STOCK_SOURCE", "Exact original signed stock occurrence required");
    entityId("sku", s.id);
    requireDomain(!Object.hasOwn(s.fieldProvenance, "stock_contribution") && !Object.hasOwn(s.fieldProvenance, "native_stock_import"),
      "NATIVE_STOCK_PROVENANCE", "Unaugmented original stock provenance required");
    for (const [field, value] of Object.entries(s.rawFields)) {
      const p = (s.fieldProvenance.fields as Record<string, JsonObject>)[field];
      requireDomain(p && ["ORIGINAL", "MIGRATION_DERIVED", "UNKNOWN"].includes(String(p.origin)) && text(p.reason)
        && Object.hasOwn(p, "raw") && requestHash(p.raw) === requestHash(value)
        && (p.origin !== "MIGRATION_DERIVED" || text(p.evidence_ref)),
      "NATIVE_STOCK_PROVENANCE", "Every original contributor field requires unchanged exact raw provenance");
    }
    const contributor = { batchId: group.batchId, sourceRowId: s.id, warehouseId: group.warehouse.nativeId,
      canonicalSkuId: group.sku.nativeId, oldSourceSkuId: l.oldSkuSourceId,
      canonicalStockSourceKey: n["来源编号"] as string, sourceUnit: l.sourceUnit, signedQuantity: l.signedQuantity,
      baselineLedgerId: null };
    requireDomain(matchesStockContributorEvidence(contributor, s, l,
      { warehouseSourceKey: group.warehouse.sourceKey, canonicalSkuSourceKey: group.sku.canonicalSourceKey })
      && l.canonicalStockRowSourceId === n["来源编号"] && text(l.productSourceId),
    "NATIVE_STOCK_LINEAGE", "Original signed occurrence differs from reviewed lineage or canonical group");
    const position = JSON.stringify([s.sourceFileSha256, s.sheet, s.rowNo]);
    requireDomain(!ids.has(s.id) && !keys.has(s.sourceKey) && !positions.has(position),
      "NATIVE_STOCK_DUPLICATE", "No duplicate original contribution in a canonical group");
    requireDomain(text(l.sourceUnit), "NATIVE_STOCK_UNIT", "Original unit must be explicit and nonblank");
    ids.add(s.id); keys.add(s.sourceKey); positions.add(position); units.add(l.sourceUnit); sum += BigInt(l.signedQuantity);
  }
  requireDomain(units.size === 1 && n["来源单位集合快照"] === JSON.stringify([...units].sort()),
    "NATIVE_STOCK_UNIT", "One exact compatible original stock unit and snapshot required");
  requireDomain(sum >= -9223372036854775808n && sum <= 9223372036854775807n
    && sum.toString() === n["核准库存数量"],
  "NATIVE_STOCK_CONSERVATION", "Canonical signed baseline must exactly equal all original signed contributions");
  return { ...group, mappingVersion: HISTORY_MAPPING_VERSION, fingerprint: requestHash(group), signedQuantity: sum.toString() };
}
export function validatePreparedNativeStockGroup(group: PreparedNativeStockGroup): void {
  const { mappingVersion: _mapping, fingerprint: _hash, signedQuantity: _quantity, ...input } = group;
  requireDomain(requestHash(prepareNativeStockGroup(input)) === requestHash(group),
    "NATIVE_STOCK_PREPARED_CHANGED", "Prepared signed stock group changed");
}
export function nativeStockSourceEvidence(group: PreparedNativeStockGroup, row: NativeStockContributorInput): JsonObject {
  const s = row.source;
  return { id: s.id, batch_id: s.batchId, entity_type: "INVENTORY_BASELINE", source_key: s.sourceKey,
    file_ref: s.fileRef, sheet: s.sheet, row_no: s.rowNo, source_file_sha256: s.sourceFileSha256,
    row_sha256: s.rowSha256, raw_fields: s.rawFields, normalized_fields: s.normalizedFields,
    field_provenance: { ...s.fieldProvenance, stock_contribution: { ...row.lineage },
      native_stock_import: { validator_version: NATIVE_STOCK_CONTRIBUTOR_VERSION, selection: { ...group.selection },
        group_fingerprint: group.fingerprint, canonical_stock_row: group.canonicalStock,
        warehouse_native_id: group.warehouse.nativeId, sku_native_id: group.sku.nativeId } } };
}
export async function stageNativeStockContributors(input: NativeStockGroupInput, options: {
  readonly mode?: "DRY_RUN" | "STAGE"; readonly store?: NativeStockContributorStore;
  /** Independently authenticate exact selected rows and prove this is ALL originals for the effective key. */
  readonly authorize?: (group: PreparedNativeStockGroup) => Promise<void>;
} = {}): Promise<{ mode: "DRY_RUN" | "STAGE"; contributors: number; inserted: number; replayed: number; baselinePosted: false; published: false }> {
  const group = prepareNativeStockGroup(input);
  if (options.mode === undefined || options.mode === "DRY_RUN") return { mode: "DRY_RUN", contributors: group.contributors.length,
    inserted: 0, replayed: 0, baselinePosted: false, published: false };
  requireDomain(options.mode === "STAGE" && options.store && options.authorize,
    "NATIVE_STOCK_AUTHORIZATION_REQUIRED", "Independent per-original-row, complete-group stock authority required");
  await options.authorize(structuredClone(group));
  return { mode: "STAGE", contributors: group.contributors.length, ...await options.store.stage(group), baselinePosted: false, published: false };
}
