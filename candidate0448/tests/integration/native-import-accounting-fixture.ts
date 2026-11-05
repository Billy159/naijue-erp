/** Synthetic fixture factories lifted from existing protocol fixtures; no fake SQL clients. */
import { IMPORT_V2_TABLES } from "../../packages/application/src/import-v2-contract.ts";
import { CATALOGUE_PRICE_KEYS } from "../../packages/application/src/catalogue-price-input.ts";
import { NATIVE_PRODUCT_NULLABLE_POLICY, prepareNativeProductImportChunk } from "../../packages/application/src/native-product-import.ts";
import type { NativeProductImportChunk } from "../../packages/application/src/native-product-import.ts";
import type { NativePartyImportEntity, NativePartyImportInput } from "../../packages/application/src/native-party-import.ts";
import type { NativeSkuImportInput } from "../../packages/application/src/native-sku-import.ts";
import type { NativeStockGroupInput } from "../../packages/application/src/native-stock-contributor-import.ts";
import type { NativeBarcodeInput } from "../../packages/application/src/native-barcode-import.ts";
import type { NativeCatalogueImportChunk, NativeCatalogueImportRow, NativeCatalogueEntity, NativeCatalogueReference } from "../../packages/application/src/native-catalogue-import.ts";
import type { ImportSourceEvidence, JsonObject } from "../../packages/application/src/history-storage-contract.ts";
export const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const H = "a".repeat(64), J = "b".repeat(64), K = "c".repeat(64), hash = H;
export const ENGINE_TIME = "2026-10-21T00:00:00.123456Z";
export const ENGINE_NAMESPACE = "synthetic.accounting15";
function originalFields(raw: JsonObject): JsonObject {
  return { schema_version: 1, fields: Object.fromEntries(Object.entries(raw).map(([field, value]) =>
    [field, { origin: "ORIGINAL", reason: "Synthetic literal original cell", raw: value }])) };
}

export function engineFixtures() {
  const hall = partyInput("HALL"), warehouse = partyInput("WAREHOUSE", 30);
  const parties: NativePartyImportInput[] = [hall, warehouse].map((row, index) => {
    const fields = { ...row.source.rawFields, 来源编号: index === 0 ? "HALL-1" : "WH-1",
      ...(index === 1 ? { 所属厅来源编号: "HALL-1" } : {}) };
    return { ...row, fixedSourceNamespace: ENGINE_NAMESPACE,
      selection: { ...row.selection, selectionSha256: J },
      source: { ...row.source, id: id(1000 + index), rawFields: fields, normalizedFields: fields,
        sourceKey: fields["来源编号"], fieldProvenance: originalFields(fields) },
      bindings: index === 1 ? { 所属厅来源编号: { sourceKey: "HALL-1", nativeId: id(10) } } : {},
      ...(index === 1 ? { warehouseRecord: { ...row.warehouseRecord!, reviewedAt: ENGINE_TIME } } : {}) };
  });
  const rows: NativeCatalogueImportRow[] = [];
  const add = (entity: NativeCatalogueEntity, n: number, key: string, values: JsonObject,
    references: Record<string, NativeCatalogueReference> = {}) => {
    const raw = { sourceId: key, ...values };
    rows.push({ source: { id: id(100 + n), batchId: id(1), entityType: entity, sourceKey: key,
      fileRef: "synthetic-dictionary.json", sheet: entity, rowNo: String(n), sourceFileSha256: H, rowSha256: J,
      rawFields: raw, normalizedFields: raw, fieldProvenance: originalFields(raw) },
      sourceKeyField: "sourceId", nativeId: entity === "SIZE_GROUP_MEMBER" ? null : id(n),
      decisions: Object.fromEntries(Object.keys(values).map(k => [k, { kind: "SOURCE_FIELD", field: k }])), references });
  };
  add("CATEGORY", 60, "CAT-1", { name: "SYNTHETIC ROOT", display_order: "0" });
  add("COLOR", 21, "COLOR-1", { code: "C1", name: "Synthetic blue", enabled: true });
  add("FIT", 22, "FIT-A", { code: "A", name: "Synthetic fit", enabled: true });
  add("SIZE", 23, "SIZE-M", { code: "M", name: "Synthetic M" });
  add("SIZE_GROUP", 24, "GROUP", { code: "G", name: "Synthetic group" });
  add("SIZE_GROUP_MEMBER", 25, "MEMBER-1", { display_order: "0" }, {
    size_group_id: { entity: "SIZE_GROUP", sourceKey: "GROUP", nativeId: id(24), nativeSnapshot: { id: id(24), code: "G", name: "Synthetic group" } },
    size_id: { entity: "SIZE", sourceKey: "SIZE-M", nativeId: id(23), nativeSnapshot: { id: id(23), code: "M", name: "Synthetic M" } },
  });
  const catalogue: NativeCatalogueImportChunk = { batchId: id(1), fixedSourceNamespace: ENGINE_NAMESPACE,
    selection: { source: "REVIEWED_DICTIONARY_OCCURRENCES_V1", baseManifestSha256: H, selectionSha256: J,
      approvalSha256: K, occurrenceContractSha256: H }, rows };
  const p = productInput(1, false), first = p.rows[0]!;
  const product: NativeProductImportChunk = { ...p, fixedSourceNamespace: ENGINE_NAMESPACE,
    rows: [{ ...first, product: { ...first.product, nativeId: id(20) },
      references: { ...first.references,
        category: { ...first.references.category, path: [{ nativeId: id(60), name: "SYNTHETIC ROOT", expectedVersion: 1 }] },
        sizeGroup: { ...first.references.sizeGroup, nativeId: id(24), code: "G", name: "Synthetic group" } } }] };
  const skuBase = skuInput(), productKey = product.rows[0]!.source.sourceKey;
  const sku: NativeSkuImportInput = { ...skuBase, fixedSourceNamespace: ENGINE_NAMESPACE,
    canonicalSource: { ...skuBase.canonicalSource, rawFields: { ...skuBase.canonicalSource.rawFields, 商品来源编号: productKey },
      normalizedFields: { ...skuBase.canonicalSource.normalizedFields, 商品来源编号: productKey },
      fieldProvenance: originalFields({ ...skuBase.canonicalSource.rawFields, 商品来源编号: productKey }) },
    references: { ...skuBase.references, product: { sourceKey: productKey, nativeId: id(20),
      nativeSnapshot: prepareNativeProductImportChunk(product).nativeProducts[0]! as unknown as JsonObject } },
    aliases: skuBase.aliases.map(a => ({ ...a, source: { ...a.source,
      rawFields: { ...a.source.rawFields, 商品来源编号: productKey }, normalizedFields: { ...a.source.normalizedFields, 商品来源编号: productKey },
      fieldProvenance: originalFields({ ...a.source.rawFields, 商品来源编号: productKey }) }, mapping: { ...a.mapping, productSourceId: productKey } })),
    importRecord: { ...skuBase.importRecord, reviewedAt: ENGINE_TIME } };
  const stockBase = stockInput();
  const stock: NativeStockGroupInput = { ...stockBase, fixedSourceNamespace: ENGINE_NAMESPACE,
    canonicalStock: { ...stockBase.canonicalStock, 核准库存数量: "-7" },
    contributors: stockBase.contributors.map((c, i) => {
      const signedQuantity = i === 0 ? "-7" : "0", raw = { ...c.source.rawFields, 核准库存数量: signedQuantity };
      return { source: { ...c.source, rawFields: raw, normalizedFields: raw, fieldProvenance: originalFields(raw) },
        lineage: { ...c.lineage, signedQuantity, productSourceId: productKey } };
    }) };
  const barcode: NativeBarcodeInput = { ...barcodeInput(), fixedSourceNamespace: ENGINE_NAMESPACE };
  return { parties, catalogue, product, sku, stock, barcode };
}
const columns = (entity: string): JsonObject => Object.fromEntries(IMPORT_V2_TABLES.find(t => t.entity === entity)!.columns.map(c => [c.name, ""]));
function source(entity: string, n: number, key: string, raw: JsonObject, normalized: JsonObject = raw): ImportSourceEvidence {
  return { id: id(n), batchId: id(1), entityType: entity, sourceKey: key,
    fileRef: "synthetic-original.xlsx", sheet: "SYNTHETIC", rowNo: String(n), sourceFileSha256: H, rowSha256: J,
    rawFields: raw, normalizedFields: normalized, fieldProvenance: { schema_version: 1,
      fields: Object.fromEntries(Object.entries(raw).map(([field, value]) => [field,
        { origin: "ORIGINAL", reason: "Synthetic literal", raw: value }])) } };
}
function skuInput(): NativeSkuImportInput {
  const n = { ...columns("SKU"), 来源编号: id(10), SKU编码: id(10), 商品来源编号: "PRODUCT-1",
    颜色编码: "C1", 颜色名称: "Synthetic blue", 版型编码: "A", 完整尺码: "Synthetic M", 状态: "正常", 切换范围: "本次完整核准",
    新尺码字典ID: "SIZE-M", 新尺码组ID: "GROUP", 新尺码组名称: "Synthetic group", 合并来源SKU数: "2" };
  const representative = source("SKU", 110, id(10), n);
  const old = source("SKU", 111, id(11), { ...n, 来源编号: id(11), SKU编码: id(11), 状态: "停用" });
  const mapping = (s: ImportSourceEvidence, isRepresentative: "true" | "false") => ({
    oldSourceSkuId: s.sourceKey, canonicalSourceSkuId: id(10), isRepresentative,
    canonicalMemberCount: "2", productSourceId: "PRODUCT-1", newSizeDictionaryId: "SIZE-M",
    newSizeGroupId: "GROUP", newSizeGroupName: "Synthetic group", newSizeCode: "", newSizeName: "Synthetic M",
    colorCodeIdentity: "C1", fitCode: "A", canonicalState: "正常",
    oldSkuCode: s.rawFields["SKU编码"] as string, oldState: s.rawFields["状态"] as string,
    sourceFile: s.fileRef, sourceSheet: s.sheet, sourceRow: s.rowNo, sourceSha256: s.sourceFileSha256,
    mappingBasis: "Synthetic reviewed alias" });
  return { batchId: id(1), fixedSourceNamespace: "synthetic:sku", selection: {
    source: "BASE_V2", entity: "SKU", path: "business/02合法SKU.csv", baseManifestSha256: H,
    selectionSha256: J, approvalSha256: K, csvSha256: H, aliasCsvSha256: J },
    canonicalSource: representative, nativeSkuId: id(50), references: {
      product: { sourceKey: "PRODUCT-1", nativeId: id(20), nativeSnapshot: {
        id: id(20), product_code: "P1", name: "Synthetic product", category_id: id(60),
        supplier_id: null, season_id: null, size_group_id: id(24), year: null,
        system_item_code: null, thickness: null, collar_pants_type: null, enabled: true, version: 1,
        ...Object.fromEntries(CATALOGUE_PRICE_KEYS.map(key => [key, null])) } },
      color: { sourceKey: "COLOR-1", nativeId: id(21), nativeSnapshot: { id: id(21), code: "C1", name: "Synthetic blue", enabled: true, version: 1 } },
      fit: { sourceKey: "FIT-A", nativeId: id(22), nativeSnapshot: { id: id(22), code: "A", name: "Synthetic fit", enabled: true, version: 1 } },
      size: { sourceKey: "SIZE-M", nativeId: id(23), nativeSnapshot: { id: id(23), code: "M", name: "Synthetic M" } },
      sizeGroup: { sourceKey: "GROUP", nativeId: id(24), nativeSnapshot: { id: id(24), code: "G", name: "Synthetic group" } }
    }, aliases: [{ source: representative, mapping: mapping(representative, "true") }, { source: old, mapping: mapping(old, "false") }],
    importRecord: { id: id(30), reviewedAt: "2026-01-01T00:00:00Z", decisionReason: "Synthetic exact mapping review" } };
}
function stockInput(): NativeStockGroupInput {
  const key = "STOCK:synthetic", effective = { ...columns("INVENTORY_BASELINE"), 来源编号: key,
    仓库来源编号: "WH-1", SKU来源编号: id(10), 核准库存数量: "-3", 核准依据: "Synthetic reviewed signed sum",
    合并输入库存行数: "2", 来源单位集合快照: '["件"]' };
  const values = [-5, 2];
  const contributors = values.map((quantity, index) => {
    const keyOld = `STOCK:old:${index}`, oldSku = index === 0 ? id(10) : id(11);
    const raw = { 来源编号: keyOld, SKU来源编号: oldSku, 仓库来源编号: "WH-1", 核准库存数量: String(quantity) };
    const s = source("INVENTORY_BASELINE", 200 + index, keyOld, raw);
    return { source: s, lineage: { validator_version: "STOCK_CONTRIBUTOR_LINEAGE_V1" as const,
      oldStockSourceId: keyOld, canonicalStockRowSourceId: key, warehouseSourceId: "WH-1",
      oldSkuSourceId: oldSku, canonicalSkuSourceId: id(10), productSourceId: "PRODUCT-1",
      signedQuantity: String(quantity), sourceUnit: "件", sourceFile: s.fileRef, sourceSheet: s.sheet,
      sourceRow: s.rowNo, sourceSha256: s.sourceFileSha256 } };
  });
  return { batchId: id(1), fixedSourceNamespace: "synthetic:stock", selection: {
    source: "BASE_V2", entity: "INVENTORY_BASELINE", path: "business/12切换库存.csv",
    baseManifestSha256: H, selectionSha256: J, approvalSha256: K, csvSha256: H, lineageCsvSha256: J },
    canonicalStock: effective, warehouse: { sourceKey: "WH-1", nativeId: id(40) },
    sku: { canonicalSourceKey: id(10), nativeId: id(50) }, contributors };
}
function barcodeInput(): NativeBarcodeInput {
  const raw = { 来源编号: "PRIMARY:synthetic", 条码: "0000123400", SKU来源编号: id(11), 条码性质: "主码",
    原条码方案: "Synthetic scheme", 状态: "正常", 绑定范围: "SKU" };
  const n = { ...columns("BARCODE"), ...raw, SKU来源编号: id(10), 合并前SKU来源编号: id(11),
    原始条码性质快照: "主码", 主旧码归一化依据: "EXISTING_MAIN_REPRESENTATIVE_THEN_STABLE_SOURCE_ID" };
  return { batchId: id(1), fixedSourceNamespace: "synthetic:barcode", selection: {
    source: "V3_BARCODE_REPLACEMENT", entity: "BARCODE", path: "business/03历史条码.csv",
    baseManifestSha256: H, selectionSha256: J, approvalSha256: K, csvSha256: H, excludedSourceIdsSetSha256: J },
    source: source("BARCODE", 300, "PRIMARY:synthetic", raw, n), nativeBarcodeId: id(301),
    sku: { canonicalSourceKey: id(10), nativeId: id(50), oldSourceSkuKey: id(11) },
    scheme: { id: id(302), snapshot: { id: id(302), name: "Synthetic scheme", barcode_type: "RAW",
      rule_description: "Synthetic only", code_length: 10, rule_version: "1", status: "HISTORICAL" } } };
}
function partyInput(entity: NativePartyImportEntity = 'CUSTOMER', offset = 0): NativePartyImportInput {
  const table = IMPORT_V2_TABLES.find(t => t.entity === entity)!, fields = Object.fromEntries(table.columns.map(c => [c.name, '']));
  Object.assign(fields, { '来源编号': `legacy-${entity}-${offset}` });
  let nativeSnapshot: NativePartyImportInput['nativeSnapshot'], enumMappings: NativePartyImportInput['enumMappings'];
  if (entity === 'CUSTOMER' || entity === 'SUPPLIER') {
    Object.assign(fields, { '原编码': ` 0001-${offset} `, '名称': '原始名称', '状态': '原停用' });
    nativeSnapshot = { id: id(10 + offset), code: fields['原编码']!, name: '原始名称', enabled: false, version: 1, created_at: null, updated_at: null };
    enumMappings = { '状态': { raw: '原停用', native: false, evidenceRef: 'reviewed-state-map#1' } };
  } else if (entity === 'HALL') {
    Object.assign(fields, { '厅名称': '原始厅', '状态': '原正常' });
    nativeSnapshot = { id: id(10 + offset), name: '原始厅', default_customer_id: null, default_sales_warehouse_id: null, enabled: true, version: 1 };
    enumMappings = { '状态': { raw: '原正常', native: true, evidenceRef: 'reviewed-state-map#2' } };
  } else if (entity === 'WAREHOUSE') {
    Object.assign(fields, { '仓库名称': '原仓', '所属厅来源编号': 'legacy-HALL-0', '状态': '原正常', '切换范围': '本次完整核准' });
    nativeSnapshot = { id: id(10 + offset), name: '原仓', hall_id: id(10), enabled: true, version: 1 };
    enumMappings = { '状态': { raw: '原正常', native: true, evidenceRef: 'reviewed-warehouse-state' } };
  } else {
    Object.assign(fields, { '姓名': '原员工', '角色': '原营业员', '任职状态': '原离职', '联系方式': '001234' });
    nativeSnapshot = { id: id(10 + offset), name: '原员工', hall_id: null, role: 'SALESPERSON', contact: '001234', employment_status: 'LEFT', version: 1 };
    enumMappings = { '角色': { raw: '原营业员', native: 'SALESPERSON', evidenceRef: 'reviewed-role' }, '任职状态': { raw: '原离职', native: 'LEFT', evidenceRef: 'reviewed-employment' } };
  }
  return { batchId: id(1), fixedSourceNamespace: 'synthetic-only', selection: { baseManifestSha256: hash, selectionSha256: hash, approvalSha256: hash, csvSha256: hash, entity, source: 'BASE_V2', path: table.file },
    source: { id: id(100 + offset), batchId: id(1), entityType: entity, sourceKey: fields['来源编号']!, fileRef: 'synthetic-original.xlsx', sheet: entity,
      rowNo: String(offset + 2), sourceFileSha256: hash, rowSha256: hash, rawFields: { ...fields }, normalizedFields: fields, fieldProvenance: { schema_version: 1, fields: {} } },
    nativeSnapshot, enumMappings, bindings: entity === 'WAREHOUSE' ? { '所属厅来源编号': { sourceKey: 'legacy-HALL-0', nativeId: id(10) } } : {},
    ...(entity === 'WAREHOUSE' ? { warehouseRecord: { id: id(500 + offset), reviewedAt: '2026-10-21T13:00:00.000Z', decisionReason: 'SYNTHETIC_REVIEWED_WAREHOUSE_MAPPING' } } : {}) };
}
function productInput(count = 1, withOptionalReferences = true): NativeProductImportChunk {
  return { batchId: id(1), fixedSourceNamespace: "SYNTHETIC_NATIVE_PRODUCT_INPUT", selection: {
    baseManifestSha256: "a".repeat(64), selectionSha256: "b".repeat(64), approvalSha256: "c".repeat(64), csvSha256: "d".repeat(64),
    entity: "PRODUCT", source: "BASE_V2", path: "business/01商品.csv"
  }, rows: Array.from({ length: count }, (_, index) => {
    const n = Object.fromEntries(IMPORT_V2_TABLES.find(table => table.entity === "PRODUCT")!.columns.map(column => [column.name, ""]));
    Object.assign(n, { 来源编号: `SYNTHETIC_LEGACY_PRODUCT_${index}`, 款号: `SYNTHETIC_P${index}`, 商品名称: `SYNTHETIC PRODUCT ${index}`,
      分类路径: "SYNTHETIC CATEGORY PATH (opaque)", 尺码组: "SYNTHETIC GROUP", 状态: "正常", 零售价: "1.25", 年份: "2026",
      采购价: "0", 系统货号: "SYNTHETIC SYSTEM CODE", 厚薄: "SYNTHETIC THICKNESS", 领型或裤型: "SYNTHETIC COLLAR" });
    if (withOptionalReferences) { n["供应商来源编号"] = "SYNTHETIC_SUPPLIER_SOURCE"; n["季节"] = "SYNTHETIC SEASON"; }
    return { source: { id: id(100 + index), batchId: id(1), entityType: "PRODUCT", sourceKey: n["来源编号"]!,
      fileRef: "synthetic-original.xlsx", sheet: "SYNTHETIC 商品", rowNo: String(2 + index), sourceFileSha256: "e".repeat(64), rowSha256: "f".repeat(64),
      rawFields: { ...n }, normalizedFields: n, fieldProvenance: { schema_version: 1,
        fields: Object.fromEntries(Object.entries(n).map(([key, value]) => [key, { origin: "ORIGINAL", reason: "Literal synthetic source cell", raw: value }])) } },
      product: { sourceKey: n["来源编号"]!, nativeId: id(200 + index), expectedVersion: 1 },
      blankPricePolicy: "V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET", nullableFieldPolicy: NATIVE_PRODUCT_NULLABLE_POLICY,
      references: {
        category: { sourceValue: n["分类路径"]!, mappingSha256: "1".repeat(64), path: [
          { nativeId: id(10), name: "SYNTHETIC ROOT", expectedVersion: 2 }, { nativeId: id(11), name: "SYNTHETIC LEAF", expectedVersion: 3 }] },
        sizeGroup: { sourceValue: n["尺码组"]!, nativeId: id(12), code: "SYNTHETIC_G", name: "SYNTHETIC GROUP", mappingSha256: "2".repeat(64) },
        season: withOptionalReferences ? { sourceValue: n["季节"]!, nativeId: id(13), code: "SYNTHETIC_SEASON", name: "SYNTHETIC SEASON", mappingSha256: "3".repeat(64) } : null,
        supplier: withOptionalReferences ? { sourceValue: n["供应商来源编号"]!, nativeId: id(14), code: "SYNTHETIC_SUPPLIER", name: "SYNTHETIC SUPPLIER", mappingSha256: "4".repeat(64), enabled: false, expectedVersion: 4 } : null
      }
    };
  }) };
}
