import { requireDomain } from "../../domain/src/errors.ts";
import { entityId } from "../../domain/src/values.ts";
import { HISTORY_MAPPING_VERSION } from "./history-storage-contract.ts";
import { CATALOGUE_PRICE_KEYS } from "./catalogue-price-input.ts";
import type { ImportSourceEvidence, JsonObject } from "./history-storage-contract.ts";
import { IMPORT_V2_TABLES } from "./import-v2-contract.ts";
import { requestHash } from "./request-hash.ts";

/** Source-only creator. No guessed SKU IDs, no barcode MAIN decisions, no publication. */
export const NATIVE_SKU_IMPORT_VERSION = "NATIVE_SKU_IMPORT_V1";
export interface NativeSkuSelection {
  readonly source: "BASE_V2"; readonly entity: "SKU"; readonly path: "business/02合法SKU.csv";
  readonly baseManifestSha256: string; readonly selectionSha256: string; readonly approvalSha256: string;
  readonly csvSha256: string; readonly aliasCsvSha256: string;
}
export interface NativeSkuReference {
  readonly sourceKey: string; readonly nativeId: string;
  /** Exact same-batch native binding snapshot; not a name-only lookup. */
  readonly nativeSnapshot: JsonObject;
}
export interface NativeSkuAliasMapping {
  readonly oldSourceSkuId: string; readonly canonicalSourceSkuId: string; readonly isRepresentative: "true" | "false";
  readonly canonicalMemberCount: string; readonly productSourceId: string; readonly newSizeDictionaryId: string;
  readonly newSizeGroupId: string; readonly newSizeGroupName: string; readonly newSizeCode: string; readonly newSizeName: string;
  readonly colorCodeIdentity: string; readonly fitCode: string; readonly canonicalState: string;
  readonly oldSkuCode: string; readonly oldState: string;
  readonly sourceFile: string; readonly sourceSheet: string; readonly sourceRow: string; readonly sourceSha256: string;
  readonly mappingBasis: string;
}
export interface NativeSkuAliasInput { readonly source: ImportSourceEvidence; readonly mapping: NativeSkuAliasMapping }
export interface NativeSkuImportInput {
  readonly batchId: string; readonly fixedSourceNamespace: string; readonly selection: NativeSkuSelection;
  /** Effective canonical CSV row plus its independently selected representative original occurrence. */
  readonly canonicalSource: ImportSourceEvidence;
  readonly nativeSkuId: string;
  readonly references: { readonly product: NativeSkuReference; readonly color: NativeSkuReference;
    readonly fit: NativeSkuReference; readonly size: NativeSkuReference; readonly sizeGroup: NativeSkuReference };
  /** All old SKU occurrences for this canonical SKU, including the representative. */
  readonly aliases: readonly NativeSkuAliasInput[];
  readonly importRecord: { readonly id: string; readonly reviewedAt: string; readonly decisionReason: string };
}
export interface PreparedNativeSkuImport extends NativeSkuImportInput {
  readonly mappingVersion: typeof HISTORY_MAPPING_VERSION;
  readonly nativeSku: { readonly id: string; readonly product_id: string; readonly color_id: string; readonly fit_id: string;
    readonly size_id: string; readonly sku_code: string; readonly enabled: boolean; readonly version: 1 };
  readonly fingerprint: string;
}
export interface NativeSkuImportStore { stage(input: PreparedNativeSkuImport): Promise<{ inserted: number; replayed: number }> }
const hash = (v: unknown): boolean => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= 65536 && !v.includes("\0");
const PRODUCT_NATIVE_COLUMNS = ["id", "product_code", "name", "category_id", "supplier_id", "season_id", "size_group_id", "year",
  "system_item_code", "thickness", "collar_pants_type", "enabled", "version", ...CATALOGUE_PRICE_KEYS] as const;
const sourceIdentity = (s: ImportSourceEvidence, batchId: string): void => {
  requireDomain(s && s.entityType === "SKU" && s.batchId === batchId && text(s.sourceKey) && text(s.fileRef) && text(s.sheet)
    && typeof s.rowNo === "string" && /^[1-9]\d*$/.test(s.rowNo) && BigInt(s.rowNo) <= 9223372036854775807n
    && hash(s.sourceFileSha256) && hash(s.rowSha256) && s.rawFields && s.normalizedFields
    && s.fieldProvenance?.schema_version === 1 && s.fieldProvenance.fields && typeof s.fieldProvenance.fields === "object",
  "NATIVE_SKU_SOURCE", "Exact original SKU occurrence and versioned provenance required");
  entityId("sku", s.id);
  requireDomain(s.rawFields["来源编号"] === s.sourceKey, "NATIVE_SKU_SOURCE", "Original SKU source identity differs");
  requireDomain(!Object.hasOwn(s.fieldProvenance, "native_sku_import"), "NATIVE_SKU_PROVENANCE", "Unaugmented original SKU provenance required");
  for (const [field, value] of Object.entries(s.rawFields)) {
    const p = (s.fieldProvenance.fields as Record<string, JsonObject>)[field];
    requireDomain(p && ["ORIGINAL", "MIGRATION_DERIVED", "UNKNOWN"].includes(String(p.origin)) && text(p.reason)
      && Object.hasOwn(p, "raw") && requestHash(p.raw) === requestHash(value)
      && (p.origin !== "MIGRATION_DERIVED" || text(p.evidence_ref)), "NATIVE_SKU_PROVENANCE", "Exact original field provenance required");
  }
};
export function prepareNativeSkuImport(input: NativeSkuImportInput): PreparedNativeSkuImport {
  const row = structuredClone(input), s = row.canonicalSource, n = s.normalizedFields, selection = row.selection;
  entityId("sku", row.batchId); entityId("sku", row.nativeSkuId);
  requireDomain(text(row.fixedSourceNamespace) && selection?.source === "BASE_V2" && selection.entity === "SKU"
    && selection.path === "business/02合法SKU.csv" && [selection.baseManifestSha256, selection.selectionSha256,
      selection.approvalSha256, selection.csvSha256, selection.aliasCsvSha256].every(hash),
  "NATIVE_SKU_SELECTION", "Exact effective SKU and full alias mapping selection required");
  requireDomain(Array.isArray(row.aliases) && row.aliases.length > 0 && row.aliases.length <= 200
    && new TextEncoder().encode(JSON.stringify(row)).byteLength <= 4 * 1024 * 1024,
  "NATIVE_SKU_LIMIT", "One bounded complete canonical group required");
  sourceIdentity(s, row.batchId);
  const columns = IMPORT_V2_TABLES.find(t => t.entity === "SKU")!.columns;
  requireDomain(Object.keys(n).length === columns.length && columns.every(c => Object.hasOwn(n, c.name)
    && typeof n[c.name] === "string" && (n[c.name] as string).length <= 65536 && !(n[c.name] as string).includes("\0")
    && (!c.required || n[c.name] !== "")), "NATIVE_SKU_EFFECTIVE_COLUMNS", "Exact complete normalized SKU row required");
  requireDomain(n["来源编号"] === s.sourceKey && row.nativeSkuId !== s.sourceKey && text(n["SKU编码"])
    && (n["状态"] === "正常" || n["状态"] === "停用"),
  "NATIVE_SKU_CANONICAL", "New native SKU ID must be independent of canonical source identity; exact code/state required");
  const refs = row.references;
  requireDomain(refs?.product?.nativeSnapshot && Object.keys(refs.product.nativeSnapshot).length === PRODUCT_NATIVE_COLUMNS.length
    && PRODUCT_NATIVE_COLUMNS.every(key => Object.hasOwn(refs.product.nativeSnapshot, key))
    && refs.product.nativeSnapshot.id === refs.product.nativeId
    && text(refs.product.nativeSnapshot.product_code) && text(refs.product.nativeSnapshot.name)
    && Number.isSafeInteger(refs.product.nativeSnapshot.version)
    && typeof refs.product.nativeSnapshot.enabled === "boolean"
    && CATALOGUE_PRICE_KEYS.every(key => refs.product.nativeSnapshot[key] === null
      || typeof refs.product.nativeSnapshot[key] === "string"),
  "NATIVE_SKU_PRODUCT_SNAPSHOT", "Full exact native PRODUCT snapshot, including nine price values, required");
  for (const ref of Object.values(refs)) {
    requireDomain(text(ref.sourceKey) && ref.nativeSnapshot?.id === ref.nativeId, "NATIVE_SKU_REFERENCE", "Exact same-batch reference snapshot required");
    entityId("sku", ref.nativeId);
  }
  requireDomain(refs.product.sourceKey === n["商品来源编号"] && refs.color.nativeSnapshot.code === n["颜色编码"]
    && refs.color.nativeSnapshot.name === n["颜色名称"] && refs.fit.nativeSnapshot.code === n["版型编码"]
    && refs.size.sourceKey === n["新尺码字典ID"] && refs.size.nativeSnapshot.name === n["完整尺码"]
    && refs.sizeGroup.sourceKey === n["新尺码组ID"] && refs.sizeGroup.nativeSnapshot.name === n["新尺码组名称"]
    && refs.product.nativeSnapshot.size_group_id === refs.sizeGroup.nativeId,
  "NATIVE_SKU_REFERENCE", "Native reference decisions must match effective source fields and product size group");
  const ids = new Set<string>(), keys = new Set<string>(), positions = new Set<string>();
  let representatives = 0;
  for (const alias of row.aliases) {
    const old = alias.source, m = alias.mapping; sourceIdentity(old, row.batchId);
    requireDomain(m.oldSourceSkuId === old.sourceKey && m.canonicalSourceSkuId === s.sourceKey
      && m.productSourceId === refs.product.sourceKey && m.newSizeDictionaryId === n["新尺码字典ID"]
      && m.newSizeGroupId === n["新尺码组ID"] && m.canonicalMemberCount === String(row.aliases.length)
      && m.newSizeGroupName === n["新尺码组名称"] && m.newSizeCode === n["新尺码编码"]
      && m.newSizeName === n["完整尺码"] && m.colorCodeIdentity === n["颜色编码"]
      && m.fitCode === n["版型编码"] && m.canonicalState === n["状态"]
      && m.oldSkuCode === old.rawFields["SKU编码"] && m.oldState === old.rawFields["状态"]
      && m.sourceFile === old.fileRef && m.sourceSheet === old.sheet && m.sourceRow === old.rowNo
      && m.sourceSha256 === old.sourceFileSha256 && text(m.mappingBasis),
    "NATIVE_SKU_ALIAS_MAPPING", "Exact old occurrence and independently reviewed canonical alias mapping required");
    if (m.isRepresentative === "true") {
      representatives++;
      requireDomain(old.id === s.id && requestHash(old) === requestHash(s) && old.sourceKey === s.sourceKey,
      "NATIVE_SKU_REPRESENTATIVE", "Representative must be the exact canonical source occurrence");
    } else requireDomain(m.isRepresentative === "false" && old.sourceKey !== s.sourceKey,
      "NATIVE_SKU_REPRESENTATIVE", "Only one original occurrence can represent the canonical SKU");
    const position = JSON.stringify([old.sourceFileSha256, old.sheet, old.rowNo]);
    requireDomain(!ids.has(old.id) && !keys.has(old.sourceKey) && !positions.has(position),
      "NATIVE_SKU_ALIAS_DUPLICATE", "Old source occurrences must be unique within a complete group");
    ids.add(old.id); keys.add(old.sourceKey); positions.add(position);
  }
  requireDomain(representatives === 1 && text(row.importRecord.decisionReason) && text(row.importRecord.reviewedAt),
    "NATIVE_SKU_REVIEW", "One representative and explicit reviewed import record required");
  entityId("sku", row.importRecord.id);
  const nativeSku = { id: row.nativeSkuId, product_id: refs.product.nativeId, color_id: refs.color.nativeId,
    fit_id: refs.fit.nativeId, size_id: refs.size.nativeId, sku_code: n["SKU编码"] as string,
    enabled: n["状态"] === "正常", version: 1 as const };
  return { ...row, mappingVersion: HISTORY_MAPPING_VERSION, nativeSku, fingerprint: requestHash(row) };
}
export function validatePreparedNativeSkuImport(row: PreparedNativeSkuImport): void {
  const { mappingVersion: _mapping, nativeSku: _native, fingerprint: _hash, ...input } = row;
  requireDomain(requestHash(prepareNativeSkuImport(input)) === requestHash(row), "NATIVE_SKU_PREPARED_CHANGED", "Prepared SKU import changed");
}
export function nativeSkuAliasEvidence(row: PreparedNativeSkuImport, alias: NativeSkuAliasInput): JsonObject {
  const s = alias.source;
  return { id: s.id, batch_id: s.batchId, entity_type: "SKU", source_key: s.sourceKey, file_ref: s.fileRef,
    sheet: s.sheet, row_no: s.rowNo, source_file_sha256: s.sourceFileSha256, row_sha256: s.rowSha256,
    raw_fields: s.rawFields, normalized_fields: s.normalizedFields, field_provenance: { ...s.fieldProvenance,
      native_sku_import: { validator_version: NATIVE_SKU_IMPORT_VERSION, selection: { ...row.selection }, row_fingerprint: row.fingerprint,
        canonical_source_key: row.canonicalSource.sourceKey, native_sku_id: row.nativeSku.id, mapping: { ...alias.mapping },
        native_sku: { ...row.nativeSku }, references: Object.fromEntries(Object.entries(row.references).map(([key, ref]) => [key,
          { sourceKey: ref.sourceKey, nativeId: ref.nativeId, nativeSnapshot: ref.nativeSnapshot }])) } } };
}
export async function stageNativeSkuImport(input: NativeSkuImportInput, options: {
  readonly mode?: "DRY_RUN" | "STAGE"; readonly store?: NativeSkuImportStore;
  /** Must independently authenticate exact CSV, original occurrences, alias completeness and dictionary/product bindings. */
  readonly authorize?: (row: PreparedNativeSkuImport) => Promise<void>;
} = {}): Promise<{ mode: "DRY_RUN" | "STAGE"; aliases: number; inserted: number; replayed: number; published: false; importReady: false }> {
  const row = prepareNativeSkuImport(input);
  if (options.mode === undefined || options.mode === "DRY_RUN") return { mode: "DRY_RUN", aliases: row.aliases.length,
    inserted: 0, replayed: 0, published: false, importReady: false };
  requireDomain(options.mode === "STAGE" && options.store && options.authorize,
    "NATIVE_SKU_AUTHORIZATION_REQUIRED", "Independent per-original-row and complete alias-group authority required");
  await options.authorize(structuredClone(row));
  return { mode: "STAGE", aliases: row.aliases.length, ...await options.store.stage(row), published: false, importReady: false };
}
