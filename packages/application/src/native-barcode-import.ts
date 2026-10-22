import { requireDomain } from "../../domain/src/errors.ts";
import { entityId } from "../../domain/src/values.ts";
import { HISTORY_MAPPING_VERSION } from "./history-storage-contract.ts";
import type { ImportSourceEvidence, JsonObject } from "./history-storage-contract.ts";
import { IMPORT_V2_TABLES } from "./import-v2-contract.ts";
import { requestHash } from "./request-hash.ts";

export const NATIVE_BARCODE_IMPORT_VERSION = "NATIVE_BARCODE_IMPORT_V1";
export interface NativeBarcodeSelection {
  readonly source: "V3_BARCODE_REPLACEMENT"; readonly entity: "BARCODE"; readonly path: "business/03历史条码.csv";
  readonly baseManifestSha256: string; readonly selectionSha256: string; readonly approvalSha256: string;
  readonly csvSha256: string; readonly excludedSourceIdsSetSha256: string;
}
export interface NativeBarcodeInput {
  readonly batchId: string; readonly fixedSourceNamespace: string; readonly selection: NativeBarcodeSelection;
  readonly source: ImportSourceEvidence; readonly nativeBarcodeId: string;
  readonly sku: { readonly canonicalSourceKey: string; readonly nativeId: string; readonly oldSourceSkuKey: string };
  /** Original named scheme may only bind an exact existing native scheme, never silently become NULL. */
  readonly scheme: { readonly id: string; readonly snapshot: JsonObject };
}
export interface PreparedNativeBarcode extends NativeBarcodeInput {
  readonly mappingVersion: typeof HISTORY_MAPPING_VERSION;
  readonly nativeBarcode: { readonly id: string; readonly barcode: string; readonly sku_id: string;
    readonly barcode_kind: "MAIN" | "CONFIRMED_OLD"; readonly scheme_id: string; readonly enabled: boolean };
  readonly fingerprint: string;
}
export interface NativeBarcodeImportStore { stage(input: PreparedNativeBarcode): Promise<{ inserted: number; replayed: number }> }
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= 65536 && !v.includes("\0");
const hash = (v: unknown): boolean => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
export function prepareNativeBarcode(input: NativeBarcodeInput): PreparedNativeBarcode {
  const row = structuredClone(input), s = row.source, n = s.normalizedFields, raw = s.rawFields, selection = row.selection;
  entityId("sku", row.batchId); entityId("sku", row.nativeBarcodeId); entityId("sku", row.sku.nativeId);
  requireDomain(text(row.fixedSourceNamespace) && selection?.source === "V3_BARCODE_REPLACEMENT"
    && selection.entity === "BARCODE" && selection.path === "business/03历史条码.csv"
    && [selection.baseManifestSha256, selection.selectionSha256, selection.approvalSha256,
      selection.csvSha256, selection.excludedSourceIdsSetSha256].every(hash),
  "NATIVE_BARCODE_SELECTION", "Only exact 15018-row v3 effective SKU barcode selection is admissible");
  requireDomain(s && s.batchId === row.batchId && s.entityType === "BARCODE" && text(s.sourceKey)
    && text(s.fileRef) && text(s.sheet) && typeof s.rowNo === "string" && /^[1-9]\d*$/.test(s.rowNo)
    && BigInt(s.rowNo) <= 9223372036854775807n && hash(s.sourceFileSha256) && hash(s.rowSha256)
    && s.fieldProvenance?.schema_version === 1 && s.fieldProvenance.fields && typeof s.fieldProvenance.fields === "object",
  "NATIVE_BARCODE_SOURCE", "Exact selected original barcode occurrence required");
  entityId("sku", s.id);
  requireDomain(!Object.hasOwn(s.fieldProvenance, "native_sku_id") && !Object.hasOwn(s.fieldProvenance, "native_barcode")
    && !Object.hasOwn(s.fieldProvenance, "native_barcode_import"),
  "NATIVE_BARCODE_PROVENANCE", "Unaugmented original barcode provenance required");
  const columns = IMPORT_V2_TABLES.find(t => t.entity === "BARCODE")!.columns;
  requireDomain(Object.keys(n).length === columns.length && columns.every(c => Object.hasOwn(n, c.name)
    && typeof n[c.name] === "string" && (n[c.name] as string).length <= 65536 && !(n[c.name] as string).includes("\0")
    && (!c.required || n[c.name] !== "")), "NATIVE_BARCODE_COLUMNS", "Exact complete v3 effective barcode row required");
  requireDomain(n["来源编号"] === s.sourceKey && raw["来源编号"] === s.sourceKey
    && n["条码"] === raw["条码"] && text(n["条码"])
    && n["绑定范围"] === "SKU" && raw["绑定范围"] === "SKU"
    && n["SKU来源编号"] === row.sku.canonicalSourceKey && n["合并前SKU来源编号"] === row.sku.oldSourceSkuKey
    && raw["SKU来源编号"] === row.sku.oldSourceSkuKey
    && n["原始条码性质快照"] === raw["条码性质"]
    && n["状态"] === raw["状态"] && (n["状态"] === "正常" || n["状态"] === "停用")
    && n["原条码方案"] === raw["原条码方案"] && text(n["原条码方案"])
    && (n["条码性质"] === "主码" || n["条码性质"] === "已确认旧码"),
  "NATIVE_BARCODE_ORIGINAL", "Original SKU binding, raw code, state and scheme must be preserved; PRODUCT rows excluded");
  // v2 first-wins audit is not an independent business approval. Deliberately
  // block all 21 old MAIN -> CONFIRMED_OLD conversions until a versioned decision exists.
  requireDomain(!(raw["条码性质"] === "主码" && n["条码性质"] === "已确认旧码")
    && raw["条码性质"] === n["条码性质"],
  "NATIVE_BARCODE_MAIN_DOWNGRADE_NOT_APPROVED", "A historical audit proposal cannot demote an original MAIN barcode");
  for (const [field, value] of Object.entries(raw)) {
    const p = (s.fieldProvenance.fields as Record<string, JsonObject>)[field];
    requireDomain(p && ["ORIGINAL", "MIGRATION_DERIVED", "UNKNOWN"].includes(String(p.origin)) && text(p.reason)
      && Object.hasOwn(p, "raw") && requestHash(p.raw) === requestHash(value)
      && (p.origin !== "MIGRATION_DERIVED" || text(p.evidence_ref)),
    "NATIVE_BARCODE_PROVENANCE", "Every original barcode cell requires exact raw provenance");
  }
  entityId("sku", row.scheme.id);
  requireDomain(row.scheme.snapshot.id === row.scheme.id && row.scheme.snapshot.name === n["原条码方案"],
    "NATIVE_BARCODE_SCHEME", "An actual explicitly mapped original barcode scheme is required");
  const nativeBarcode = { id: row.nativeBarcodeId, barcode: n["条码"] as string,
    sku_id: row.sku.nativeId, barcode_kind: n["条码性质"] === "主码" ? "MAIN" as const : "CONFIRMED_OLD" as const,
    scheme_id: row.scheme.id, enabled: n["状态"] === "正常" };
  return { ...row, mappingVersion: HISTORY_MAPPING_VERSION, nativeBarcode, fingerprint: requestHash(row) };
}
export function validatePreparedNativeBarcode(row: PreparedNativeBarcode): void {
  const { mappingVersion: _mapping, nativeBarcode: _native, fingerprint: _hash, ...input } = row;
  requireDomain(requestHash(prepareNativeBarcode(input)) === requestHash(row),
    "NATIVE_BARCODE_PREPARED_CHANGED", "Prepared barcode changed");
}
export function nativeBarcodeSourceEvidence(row: PreparedNativeBarcode): JsonObject {
  const s = row.source;
  return { id: s.id, batch_id: s.batchId, entity_type: "BARCODE", source_key: s.sourceKey,
    file_ref: s.fileRef, sheet: s.sheet, row_no: s.rowNo, source_file_sha256: s.sourceFileSha256,
    row_sha256: s.rowSha256, raw_fields: s.rawFields, normalized_fields: s.normalizedFields,
    field_provenance: { ...s.fieldProvenance, native_sku_id: row.sku.nativeId,
      native_barcode: row.nativeBarcode.barcode,
      native_barcode_import: { validator_version: NATIVE_BARCODE_IMPORT_VERSION, selection: { ...row.selection },
        row_fingerprint: row.fingerprint, native_barcode: { ...row.nativeBarcode },
        canonical_source_key: row.sku.canonicalSourceKey, old_source_sku_key: row.sku.oldSourceSkuKey,
        scheme_snapshot: row.scheme.snapshot } } };
}
export async function stageNativeBarcode(input: NativeBarcodeInput, options: {
  readonly mode?: "DRY_RUN" | "STAGE"; readonly store?: NativeBarcodeImportStore;
  /** Independently check v3 inclusion, exact original row and all source/native bindings. */
  readonly authorize?: (row: PreparedNativeBarcode) => Promise<void>;
} = {}): Promise<{ mode: "DRY_RUN" | "STAGE"; inserted: number; replayed: number; published: false; importReady: false }> {
  const row = prepareNativeBarcode(input);
  if (options.mode === undefined || options.mode === "DRY_RUN") return { mode: "DRY_RUN", inserted: 0, replayed: 0, published: false, importReady: false };
  requireDomain(options.mode === "STAGE" && options.store && options.authorize,
    "NATIVE_BARCODE_AUTHORIZATION_REQUIRED", "Exact selected original barcode and native bindings require independent authority");
  await options.authorize(structuredClone(row));
  return { mode: "STAGE", ...await options.store.stage(row), published: false, importReady: false };
}
