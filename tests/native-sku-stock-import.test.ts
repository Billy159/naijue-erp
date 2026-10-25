import assert from "node:assert/strict";
import test from "node:test";
import { IMPORT_V2_TABLES } from "../packages/application/src/import-v2-contract.ts";
import { prepareNativeSkuImport, stageNativeSkuImport, prepareNativeSkuImport26, validatePreparedNativeSkuImport26, nativeSkuAliasEvidence26, NATIVE_SKU_IMPORT_VERSION_26 } from "../packages/application/src/native-sku-import.ts";
import type { NativeSkuImportInput, NativeSkuImportInput26 } from "../packages/application/src/native-sku-import.ts";
import { prepareNativeStockGroup, stageNativeStockContributors } from "../packages/application/src/native-stock-contributor-import.ts";
import type { NativeStockGroupInput } from "../packages/application/src/native-stock-contributor-import.ts";
import { prepareNativeBarcode, stageNativeBarcode } from "../packages/application/src/native-barcode-import.ts";
import type { NativeBarcodeInput } from "../packages/application/src/native-barcode-import.ts";
import type { ImportSourceEvidence, JsonObject } from "../packages/application/src/history-storage-contract.ts";
import { PostgresNativeSkuImportStore, PostgresNativeSkuImportStore26 } from "../adapters/postgres/src/native-sku-import.ts";
import type { NativeRuntime26Capability } from "../packages/application/src/native-import-schema-contract.ts";
import { PostgresNativeStockContributorStore, PostgresNativeStockContributorStore26 } from "../adapters/postgres/src/native-stock-contributor-import.ts";
import { PostgresNativeBarcodeImportStore, PostgresNativeBarcodeImportStore26 } from "../adapters/postgres/src/native-barcode-import.ts";
import { CATALOGUE_PRICE_KEYS } from "../packages/application/src/catalogue-price-input.ts";
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const H = "a".repeat(64), J = "b".repeat(64), K = "c".repeat(64);
function assertSqlBinds(sql: string, values: unknown[]): void {
  const used = [...new Set([...sql.matchAll(/\$(\d+)/g)].map(match => Number(match[1])))].sort((a, b) => a - b);
  assert.deepEqual(used, Array.from({ length: values.length }, (_, i) => i + 1), "SQL bind arguments must have no gaps or unused values");
  assert.doesNotMatch(sql, /SELECT\s+DISTINCT\b[\s\S]*FOR\s+(?:SHARE|UPDATE)\b/i,
    "PostgreSQL forbids DISTINCT with row locks; protocol fakes do not parse SQL");
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
function skuInput26(): NativeSkuImportInput26 {
  const input = skuInput(); Object.assign(input.references.product.nativeSnapshot, { season_ids: [id(70), id(71)], deleted_at: null, default_barcode_scheme_id: null });
  input.references.color.nativeSnapshot.deleted_at = null; input.references.fit.nativeSnapshot.deleted_at = null;
  return { ...input, schemaProfile: 'EXACT26', validatorVersion: NATIVE_SKU_IMPORT_VERSION_26 };
}
function sku26Protocol(options: { schema?: number; replay?: boolean; partial?: boolean; badCreate?: boolean; commitUnknown?: boolean; input?: NativeSkuImportInput26 } = {}) {
  const input = options.input ?? skuInput26(), calls: { sql: string; values: unknown[] }[] = [], releases: unknown[] = []; let connects = 0;
  const client = { async query(sql: string, values: unknown[] = []) {
    assertSqlBinds(sql, values); calls.push({ sql, values }); const answer = (rows: Record<string, unknown>[] = []) => ({ rows, rowCount: rows.length });
    if (sql === 'COMMIT') { if (options.commitUnknown) throw Error('SYNTHETIC unknown COMMIT26'); return answer(); }
    if (/^(BEGIN|ROLLBACK)/.test(sql) || sql.includes('native-sku:cutoff')) return answer();
    if (sql.includes('native-sku:schema')) return answer([{ installed_versions: Array.from({ length: options.schema ?? 26 }, (_, i) => i + 1) }]);
    if (sql.includes('native-sku:batch')) return answer([{ id: id(1), mapping_version: 'V2_HISTORY_NULLABLE_1', status: 'STAGED', source_hash: J, source_name: input.fixedSourceNamespace, already_published: false }]);
    if (sql.includes('native-sku:target')) return answer(options.replay || options.partial ? [{ id: input.nativeSkuId, native_equal: true }] : []);
    if (sql.includes('native-sku:product')) { assert.match(sql, /'season_ids',p.season_ids/); assert.match(sql, /'deleted_at',p.deleted_at/); assert.match(sql, /'default_barcode_scheme_id',p.default_barcode_scheme_id/); assert.deepEqual(JSON.parse(values[3] as string), input.references.product.nativeSnapshot); return answer([{ id: id(20), size_group_id: id(24), native_equal: true }]); }
    if (sql.includes('native-sku:catalogue:')) return answer([{ binding_equal: true, native_equal: true }]);
    if (sql.includes('native-sku:group-member')) return answer([{ size_group_id: id(24), size_id: id(23) }]);
    if (sql.includes('native-sku:record-replay')) return answer(options.replay || options.partial ? [{ id: input.importRecord.id, import_batch_id: id(1), source_entity_type: 'SKU', source_key: input.canonicalSource.sourceKey,
      source_record_hash: input.canonicalSource.rowSha256, source_file_ref: input.canonicalSource.fileRef, target_type: 'SKU', target_id: input.nativeSkuId, status: 'IMPORTED', decision_reason: input.importRecord.decisionReason, reviewed_equal: true }] : []);
    if (sql.includes('native-sku:source-replay') || sql.includes('native-sku:alias-replay')) { const sourceId = values[sql.includes('source-replay') ? 0 : 2]; return answer(options.replay || options.partial && sourceId === id(110) ? [{ equal: true }] : []); }
    if (sql.includes('native-sku:create')) { const columns = sql.match(/\(([^)]+)\)\s*VALUES/)![1]!.split(','), native = Object.fromEntries(columns.map((c, i) => [c, values[i]]));
      assert.equal(columns.length, 9); assert.equal(native.created_operation_id, null); return answer([{ id: native.id, native_snapshot: options.badCreate ? { ...native, created_operation_id: id(999) } : native }]); }
    if (sql.includes('native-sku:source-create')) { const source = JSON.parse(values[0] as string); assert.equal(source.field_provenance.native_sku_import.schema_profile, 'EXACT26'); assert.equal(source.field_provenance.native_sku_import.native_sku.created_operation_id, null); return answer([{ id: source.id }]); }
    if (sql.includes('native-sku:alias-create')) return answer([{ source_row_id: values[3] }]);
    if (sql.includes('native-sku:record-create')) return answer([{ id: input.importRecord.id }]);
    throw Error('Unexpected SKU26 protocol SQL');
  }, release(error?: unknown) { releases.push(error); } };
  const pool = { async connect() { connects++; return client; } };
  const runtime: NativeRuntime26Capability = { profile: 'EXACT26', contract: 'NATIVE_RUNTIME26_V1', async assertReady(target, purpose) { assert.equal(target, client); assert.equal(purpose, 'IMPORT_STAGE'); } };
  return { input, client, pool, runtime, calls, releases, connects: () => connects };
}
test('SKU26 explicit preparation keeps full product25/color6/fit6 and SKU9 with original alias source semantics', () => {
  const input = skuInput26(), original = structuredClone(input), prepared = prepareNativeSkuImport26(input); validatePreparedNativeSkuImport26(prepared); assert.deepEqual(input, original);
  assert.equal(Object.keys(prepared.references.product.nativeSnapshot).length, 25); assert.equal(Object.keys(prepared.nativeSku).length, 9); assert.equal(prepared.nativeSku.created_operation_id, null);
  assert.deepEqual(prepared.aliases.map(a => a.source), input.aliases.map(a => a.source));
  assert.equal((nativeSkuAliasEvidence26(prepared, prepared.aliases[0]!).field_provenance as JsonObject).native_sku_import !== undefined, true);
  assert.throws(() => prepareNativeSkuImport(input), { code: 'NATIVE_SKU_SUCCESSOR_EXPLICIT' });
  const missing = skuInput26(); delete missing.references.product.nativeSnapshot.season_ids; assert.throws(() => prepareNativeSkuImport26(missing), { code: 'NATIVE_SKU_PRODUCT_SNAPSHOT' });
  const bad = skuInput26(); bad.references.fit.nativeSnapshot.deleted_at = 'SYNTHETIC'; assert.throws(() => prepareNativeSkuImport26(bad), { code: 'NATIVE_SKU_CATALOGUE_METADATA' });
  const altered = structuredClone(prepared); (altered.nativeSku as unknown as JsonObject).created_operation_id = id(999); assert.throws(() => validatePreparedNativeSkuImport26(altered));
});
test('SKU26 requires actual same-client capability and refuses old store/profile before native target work', async () => {
  const f = sku26Protocol(), prepared = prepareNativeSkuImport26(f.input);
  await assert.rejects(new PostgresNativeSkuImportStore(f.pool).stage(prepared)); assert.equal(f.connects(), 0);
  assert.throws(() => new PostgresNativeSkuImportStore26(f.pool, undefined as never), { code: 'NATIVE_SKU_EXACT26_REQUIRED' });
  const boolean = { profile: 'EXACT26', contract: 'NATIVE_RUNTIME26_V1', async assertReady() { return true; } } as unknown as NativeRuntime26Capability;
  await assert.rejects(new PostgresNativeSkuImportStore26(f.pool, boolean).stage(prepared), /boolean substitute/); assert.equal(f.calls.length, 0);
  const wrong = sku26Protocol({ schema: 19 }); await assert.rejects(new PostgresNativeSkuImportStore26(wrong.pool, wrong.runtime).stage(prepareNativeSkuImport26(wrong.input)), { code: 'NATIVE_SKU_SCHEMA_NOT_READY' });
  assert.ok(!wrong.calls.some(c => c.sql.includes('native-sku:target')));
});
test('SKU26 binds full native product facts and creates original aliases atomically; partial replay cannot be adopted', async () => {
  for (const replay of [false, true]) { const f = sku26Protocol({ replay }), result = await new PostgresNativeSkuImportStore26(f.pool, f.runtime).stage(prepareNativeSkuImport26(f.input));
    assert.deepEqual(result, replay ? { inserted: 0, replayed: 2 } : { inserted: 2, replayed: 0 });
    assert.equal(f.calls.filter(c => c.sql.includes('native-sku:source-create')).length, replay ? 0 : 2); assert.equal(f.calls.at(-1)!.sql, 'COMMIT');
    assert.ok(!f.calls.some(c => /INSERT INTO naijue_erp\.(inventory_ledger|inventory_balance|sku_barcode)/.test(c.sql))); }
  const partial = sku26Protocol({ partial: true }); await assert.rejects(new PostgresNativeSkuImportStore26(partial.pool, partial.runtime).stage(prepareNativeSkuImport26(partial.input)), { code: 'NATIVE_SKU_PARTIAL_OR_ADOPTED' });
  assert.ok(!partial.calls.some(c => c.sql.includes('INSERT INTO')));
});
test('SKU26 full returned creation metadata must match and unknown COMMIT is discarded without retry', async () => {
  const bad = sku26Protocol({ badCreate: true }); await assert.rejects(new PostgresNativeSkuImportStore26(bad.pool, bad.runtime).stage(prepareNativeSkuImport26(bad.input)), { code: 'NATIVE_SKU_CREATE_SNAPSHOT' }); assert.equal(bad.calls.at(-1)!.sql, 'ROLLBACK');
  const unknown = sku26Protocol({ commitUnknown: true }); await assert.rejects(new PostgresNativeSkuImportStore26(unknown.pool, unknown.runtime).stage(prepareNativeSkuImport26(unknown.input)), /unknown COMMIT26/);
  assert.equal(unknown.calls.at(-1)!.sql, 'COMMIT'); assert.equal(unknown.calls.filter(c => c.sql === 'COMMIT').length, 1); assert.ok(unknown.releases[0] instanceof Error);
});
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
test("native SKU creator requires the complete representative + old alias group and never connects by default", async () => {
  const c = skuInput(), prepared = prepareNativeSkuImport(c);
  assert.equal(prepared.nativeSku.product_id, id(20)); assert.equal(prepared.nativeSku.version, 1);
  assert.equal((await stageNativeSkuImport(c)).mode, "DRY_RUN");
  await assert.rejects(stageNativeSkuImport(c, { mode: "STAGE" }), { code: "NATIVE_SKU_AUTHORIZATION_REQUIRED" });
  const broken = structuredClone(c); (broken.aliases as unknown as unknown[]).splice(1, 1);
  assert.throws(() => prepareNativeSkuImport(broken), { code: "NATIVE_SKU_ALIAS_MAPPING" });
  const drift = structuredClone(c); drift.references.size.nativeSnapshot.name = "Other";
  assert.throws(() => prepareNativeSkuImport(drift), { code: "NATIVE_SKU_REFERENCE" });
});
test("signed original stock contributions, including negatives, must exactly sum to one canonical key", async () => {
  const c = stockInput(), prepared = prepareNativeStockGroup(c);
  assert.equal(prepared.signedQuantity, "-3"); assert.equal((await stageNativeStockContributors(c)).baselinePosted, false);
  await assert.rejects(stageNativeStockContributors(c, { mode: "STAGE" }), { code: "NATIVE_STOCK_AUTHORIZATION_REQUIRED" });
  const wrong = structuredClone(c); wrong.canonicalStock["核准库存数量"] = "3";
  assert.throws(() => prepareNativeStockGroup(wrong), { code: "NATIVE_STOCK_CONSERVATION" });
  const lost = structuredClone(c); (lost.contributors as unknown as unknown[]).splice(0, 1);
  assert.throws(() => prepareNativeStockGroup(lost), { code: "NATIVE_STOCK_KEY" });
});
test("effective SKU barcodes exclude PRODUCT and old MAIN demotion until separately approved", async () => {
  const c = barcodeInput(); assert.equal(prepareNativeBarcode(c).nativeBarcode.barcode, "0000123400");
  assert.equal((await stageNativeBarcode(c)).mode, "DRY_RUN");
  await assert.rejects(stageNativeBarcode(c, { mode: "STAGE" }), { code: "NATIVE_BARCODE_AUTHORIZATION_REQUIRED" });
  const demoted = structuredClone(c); demoted.source.normalizedFields["条码性质"] = "已确认旧码";
  assert.throws(() => prepareNativeBarcode(demoted), { code: "NATIVE_BARCODE_MAIN_DOWNGRADE_NOT_APPROVED" });
  const productBound = structuredClone(c); productBound.source.rawFields["绑定范围"] = "PRODUCT";
  assert.throws(() => prepareNativeBarcode(productBound), { code: "NATIVE_BARCODE_ORIGINAL" });
});
test("SKU source-only SQL path creates native+all aliases+record atomically; unknown COMMIT is not retried", async () => {
  const c = skuInput(); let commits = 0, releases = 0, discard: Error | boolean | undefined;
  const calls: string[] = [];
  const client = { async query(sql: string, values: unknown[] = []) {
    assertSqlBinds(sql, values);
    calls.push(sql); if (sql.startsWith("BEGIN") || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
    if (sql === "COMMIT") { commits++; throw Error("Synthetic unknown COMMIT"); }
    if (sql.includes("native-sku:schema")) return { rows: [{ installed_versions: [1,2,3,4,5,6,7,8,9,10,11,12,13,14] }], rowCount: 1 };
    if (sql.includes("native-sku:batch")) return { rows: [{ id: id(1), mapping_version: "V2_HISTORY_NULLABLE_1",
      status: "STAGED", source_hash: J, source_name: c.fixedSourceNamespace, already_published: false }], rowCount: 1 };
    if (sql.includes("native-sku:product")) return { rows: [{ id: id(20), size_group_id: id(24), native_equal: true }], rowCount: 1 };
    if (sql.includes("native-sku:catalogue:")) return { rows: [{ binding_equal: true, native_equal: true }], rowCount: 1 };
    if (sql.includes("native-sku:group-member")) return { rows: [{ size_group_id: id(24), size_id: id(23) }], rowCount: 1 };
    if (sql.includes("native-sku:target") || sql.includes("native-sku:record-replay")
      || sql.includes("native-sku:source-replay") || sql.includes("native-sku:alias-replay")
      || sql.includes("native-sku:cutoff")) return { rows: [], rowCount: 0 };
    if (sql.includes("native-sku:create")) return { rows: [{ id: id(50) }], rowCount: 1 };
    if (sql.includes("native-sku:source-create")) return { rows: [{ id: (JSON.parse(values[0] as string) as JsonObject).id }], rowCount: 1 };
    if (sql.includes("native-sku:alias-create")) return { rows: [{ source_row_id: values[3] }], rowCount: 1 };
    if (sql.includes("native-sku:record-create")) return { rows: [{ id: c.importRecord.id }], rowCount: 1 };
    throw Error(`Unexpected synthetic SQL: ${sql}`);
  }, release(error?: Error | boolean) { releases++; discard = error; } };
  const store = new PostgresNativeSkuImportStore({ async connect() { return client; } });
  await assert.rejects(stageNativeSkuImport(c, { mode: "STAGE", store, async authorize() {} }), /unknown COMMIT/);
  assert.equal(commits, 1); assert.equal(releases, 1); assert.ok(discard instanceof Error);
  assert.equal(calls.filter(sql => sql === "ROLLBACK").length, 0, "Unknown COMMIT must not be masked by ROLLBACK");
  assert.ok(calls.findIndex(s => s.includes("native-sku:create")) < calls.findIndex(s => s.includes("native-sku:source-create")));
  assert.equal(calls.filter(s => s.includes("native-sku:source-create")).length, 2);
  assert.equal(calls.filter(s => s.includes("native-sku:alias-create")).length, 2);
  assert.ok(!calls.some(s => /INSERT INTO naijue_erp\.(sku_barcode|inventory_ledger|inventory_balance)\b|IMPORT_PUBLISH/.test(s)));
});
test("stock source-only SQL path writes exact signed originals but no baseline effect", async () => {
  const c = stockInput(), calls: string[] = [];
  const client = { async query(sql: string, values: unknown[] = []) {
    assertSqlBinds(sql, values);
    calls.push(sql);
    if (sql.startsWith("BEGIN") || sql === "COMMIT" || sql.includes("native-stock:cutoff")) return { rows: [], rowCount: 0 };
    if (sql.includes("native-stock:schema")) return { rows: [{ installed_versions: [1,2,3,4,5,6,7,8,9,10,11,12,13,14] }], rowCount: 1 };
    if (sql.includes("native-stock:batch")) return { rows: [{ id: id(1), mapping_version: "V2_HISTORY_NULLABLE_1",
      status: "STAGED", source_hash: J, source_name: c.fixedSourceNamespace, already_published: false }], rowCount: 1 };
    if (sql.includes("native-stock:warehouse") || sql.includes("native-stock:sku")) return { rows: [{ id: values[2] }], rowCount: 1 };
    if (sql.includes("native-stock:alias")) return { rows: [{ canonical_sku_id: id(50), canonical_source_key: id(10) }], rowCount: 1 };
    if (sql.includes("native-stock:group-identity") || sql.includes("native-stock:source-replay")
      || sql.includes("native-stock:contributor-replay")) return { rows: [], rowCount: 0 };
    if (sql.includes("native-stock:source-create")) return { rows: [{ id: (JSON.parse(values[0] as string) as JsonObject).id }], rowCount: 1 };
    if (sql.includes("native-stock:contributor-create")) return { rows: [{ source_row_id: values[1] }], rowCount: 1 };
    throw Error(`Unexpected synthetic SQL: ${sql}`);
  }, release() {} };
  const store = new PostgresNativeStockContributorStore({ async connect() { return client; } });
  assert.deepEqual(await stageNativeStockContributors(c, { mode: "STAGE", store, async authorize() {} }),
    { mode: "STAGE", contributors: 2, inserted: 2, replayed: 0, baselinePosted: false, published: false });
  assert.ok(!calls.some(s => /INSERT INTO naijue_erp\.(inventory_ledger|inventory_balance|operation_receipt)\b|UPDATE naijue_erp.import_batch/.test(s)));
  assert.equal(calls.at(-1), "COMMIT");
});
test("stock contributor replay verifies an already linked canonical baseline, never silently accepts another key", async () => {
  const c = stockInput();
  const replay = (valid: boolean) => {
    const client = { async query(sql: string, values: unknown[] = []) {
      assertSqlBinds(sql, values);
      if (sql.startsWith("BEGIN") || sql === "COMMIT" || sql === "ROLLBACK" || sql.includes("native-stock:cutoff")) return { rows: [], rowCount: 0 };
      if (sql.includes("native-stock:schema")) return { rows: [{ installed_versions: [1,2,3,4,5,6,7,8,9,10,11,12,13,14] }], rowCount: 1 };
      if (sql.includes("native-stock:batch")) return { rows: [{ id: id(1), mapping_version: "V2_HISTORY_NULLABLE_1",
        status: "VALIDATING", source_hash: J, source_name: c.fixedSourceNamespace, already_published: false }], rowCount: 1 };
      if (sql.includes("native-stock:warehouse") || sql.includes("native-stock:sku")) return { rows: [{ id: values[2] }], rowCount: 1 };
      if (sql.includes("native-stock:group-identity")) return { rows: [{ canonical_stock_source_key: "STOCK:synthetic" }], rowCount: 1 };
      if (sql.includes("native-stock:alias")) return { rows: [{ canonical_sku_id: id(50), canonical_source_key: id(10) }], rowCount: 1 };
      if (sql.includes("native-stock:source-replay") || sql.includes("native-stock:contributor-replay"))
        return { rows: [sql.includes("contributor") ? { equal: true, baseline_ledger_id: id(80) } : { equal: true }], rowCount: 1 };
      if (sql.includes("native-stock:linked-baseline")) return { rows: valid ? [{ id: id(80) }] : [], rowCount: valid ? 1 : 0 };
      throw Error(`Unexpected synthetic SQL: ${sql}`);
    }, release() {} };
    return new PostgresNativeStockContributorStore({ async connect() { return client; } });
  };
  assert.deepEqual(await stageNativeStockContributors(c, { mode: "STAGE", store: replay(true), async authorize() {} }),
    { mode: "STAGE", contributors: 2, inserted: 0, replayed: 2, baselinePosted: false, published: false });
  await assert.rejects(stageNativeStockContributors(c, { mode: "STAGE", store: replay(false), async authorize() {} }),
    { code: "NATIVE_STOCK_LINK_CONFLICT" });
});
test("barcode SQL path writes only original raw SKU code and its immutable source", async () => {
  const c = barcodeInput(), calls: string[] = [];
  const client = { async query(sql: string, values: unknown[] = []) {
    assertSqlBinds(sql, values);
    calls.push(sql);
    if (sql.startsWith("BEGIN") || sql === "COMMIT" || sql.includes("native-barcode:cutoff")) return { rows: [], rowCount: 0 };
    if (sql.includes("native-barcode:schema")) return { rows: [{ installed_versions: [1,2,3,4,5,6,7,8,9,10,11,12,13,14] }], rowCount: 1 };
    if (sql.includes("native-barcode:batch")) return { rows: [{ id: id(1), mapping_version: "V2_HISTORY_NULLABLE_1",
      status: "STAGED", source_hash: J, source_name: c.fixedSourceNamespace, already_published: false }], rowCount: 1 };
    if (sql.includes("native-barcode:sku-alias")) return { rows: [{ id: id(10) }], rowCount: 1 };
    if (sql.includes("native-barcode:scheme")) return { rows: [{ exact: true }], rowCount: 1 };
    if (sql.includes("native-barcode:target") || sql.includes("native-barcode:main") || sql.includes("native-barcode:source-replay")) return { rows: [], rowCount: 0 };
    if (sql.includes("native-barcode:create")) return { rows: [{ id: id(301) }], rowCount: 1 };
    if (sql.includes("native-barcode:source-create")) return { rows: [{ id: c.source.id }], rowCount: 1 };
    throw Error(`Unexpected synthetic SQL: ${sql}`);
  }, release() {} };
  const store = new PostgresNativeBarcodeImportStore({ async connect() { return client; } });
  assert.deepEqual(await stageNativeBarcode(c, { mode: "STAGE", store, async authorize() {} }),
    { mode: "STAGE", inserted: 1, replayed: 0, published: false, importReady: false });
  assert.ok(calls.some(s => s.includes("INSERT INTO naijue_erp.sku_barcode")));
  assert.ok(!calls.some(s => /INSERT INTO naijue_erp\.(inventory_ledger|inventory_balance)\b|DELETE /.test(s)));
});
test("all source-only stores preserve unknown COMMIT error and discard without ROLLBACK", async () => {
  for (const [label, run] of [
    ["SKU", (pool: ConstructorParameters<typeof PostgresNativeSkuImportStore>[0]) => {
      const store = new PostgresNativeSkuImportStore(pool);
      Object.assign(store, { write: async () => ({ inserted: 1, replayed: 0 }) });
      return store.stage(prepareNativeSkuImport(skuInput()));
    }],
    ["BARCODE", (pool: ConstructorParameters<typeof PostgresNativeBarcodeImportStore>[0]) => {
      const store = new PostgresNativeBarcodeImportStore(pool);
      Object.assign(store, { write: async () => ({ inserted: 1, replayed: 0 }) });
      return store.stage(prepareNativeBarcode(barcodeInput()));
    }],
    ["STOCK", (pool: ConstructorParameters<typeof PostgresNativeStockContributorStore>[0]) => {
      const store = new PostgresNativeStockContributorStore(pool);
      Object.assign(store, { write: async () => ({ inserted: 1, replayed: 0 }) });
      return store.stage(prepareNativeStockGroup(stockInput()));
    }]
  ] as const) {
    const calls: string[] = [], unknownCommit = Error(`${label} unknown COMMIT`);
    let discarded: Error | boolean | undefined;
    const client = { async query(sql: string) {
      calls.push(sql);
      if (sql === "COMMIT") throw unknownCommit;
      if (sql === "ROLLBACK") throw Error("ROLLBACK must not run after unknown COMMIT");
      return { rows: [], rowCount: 0 };
    }, release(error?: Error | boolean) { discarded = error; } };
    await assert.rejects(run({ async connect() { return client; } }), error => error === unknownCommit);
    assert.deepEqual(calls, ["BEGIN ISOLATION LEVEL READ COMMITTED", "COMMIT"]);
    assert.equal(discarded, unknownCommit);
  }
});
test("SKU, barcode and stock SQL paths refuse future schema19 before targets or writes", async () => {
  for (const [label, run, code] of [
    ["SKU", (pool: ConstructorParameters<typeof PostgresNativeSkuImportStore>[0]) =>
      new PostgresNativeSkuImportStore(pool).stage(prepareNativeSkuImport(skuInput())), "NATIVE_SKU_SCHEMA_NOT_READY"],
    ["BARCODE", (pool: ConstructorParameters<typeof PostgresNativeBarcodeImportStore>[0]) =>
      new PostgresNativeBarcodeImportStore(pool).stage(prepareNativeBarcode(barcodeInput())), "NATIVE_BARCODE_SCHEMA_NOT_READY"],
    ["STOCK", (pool: ConstructorParameters<typeof PostgresNativeStockContributorStore>[0]) =>
      new PostgresNativeStockContributorStore(pool).stage(prepareNativeStockGroup(stockInput())), "NATIVE_STOCK_SCHEMA_NOT_READY"]
  ] as const) {
    const calls: string[] = [];
    const client = { async query(sql: string) {
      calls.push(sql);
      if (sql.includes(":schema")) return { rows: [{ installed_versions: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19] }], rowCount: 1 };
      if (sql.startsWith("BEGIN") || sql === "ROLLBACK" || sql.includes(":cutoff")) return { rows: [], rowCount: 0 };
      throw Error(`${label} target/write reached after unknown schema`);
    }, release() {} };
    await assert.rejects(run({ async connect() { return client; } }), { code });
    assert.equal(calls.at(-1), "ROLLBACK");
    assert.ok(!calls.some(sql => /\bINSERT INTO\b|:batch|:target/.test(sql)));
  }
});

function leaf26Protocol(kind: 'barcode' | 'stock', options: { schema?: number; replay?: boolean; partial?: boolean; deny?: boolean; booleanProof?: boolean; commitUnknown?: boolean } = {}) {
  const input = kind === 'stock' ? stockInput() : barcodeInput(), calls: Array<{sql: string; values: unknown[]}> = [], releaseErrors: Array<Error | undefined> = [];
  let proofs = 0, connects = 0;
  const answer = (rows: Record<string, unknown>[] = []) => ({rows, rowCount: rows.length});
  const client = { async query(sql: string, values: unknown[] = []) {
    assertSqlBinds(sql, values); calls.push({sql, values});
    if (sql === 'COMMIT' && options.commitUnknown) throw Error('leaf26 COMMIT unknown');
    if (sql.startsWith('BEGIN') || sql === 'COMMIT' || sql === 'ROLLBACK' || sql.includes(':cutoff')) return answer();
    if (sql.includes(':schema')) return answer([{installed_versions: Array.from({length: options.schema ?? 26}, (_, i) => i + 1)}]);
    if (sql.includes(':batch')) return answer([{id:id(1),mapping_version:'V2_HISTORY_NULLABLE_1',status:'STAGED',source_hash:J,source_name:input.fixedSourceNamespace,already_published:false}]);
    if (kind === 'stock') {
      if (sql.includes('native-stock:warehouse') || sql.includes('native-stock:sku')) return answer([{id:values[2]}]);
      if (sql.includes('native-stock:alias')) return answer([{canonical_sku_id:id(50),canonical_source_key:id(10)}]);
      if (sql.includes('native-stock:group-identity')) return answer();
      if (sql.includes('native-stock:source-replay')) return answer(options.replay || options.partial ? [{equal:true}] : []);
      if (sql.includes('native-stock:contributor-replay')) return answer(options.replay ? [{equal:true,baseline_ledger_id:null}] : []);
      if (sql.includes('native-stock:source-create')) return answer([{id:JSON.parse(values[0] as string).id}]);
      if (sql.includes('native-stock:contributor-create')) { assert.ok(['-5','2'].includes(values[7] as string)); return answer([{source_row_id:values[1]}]); }
    } else {
      if (sql.includes('native-barcode:sku-alias')) return answer([{id:id(10)}]);
      if (sql.includes('native-barcode:scheme')) return answer([{exact:true}]);
      if (sql.includes('native-barcode:target')) return answer(options.replay || options.partial ? [{id:id(301),exact:true}] : []);
      if (sql.includes('native-barcode:main')) return answer(options.replay || options.partial ? [{id:id(301)}] : []);
      if (sql.includes('native-barcode:source-replay')) return answer(options.replay ? [{exact:true}] : []);
      if (sql.includes('native-barcode:create')) { assert.equal(values[1], '0000123400'); return answer([{id:id(301)}]); }
      if (sql.includes('native-barcode:source-create')) return answer([{id:(input as NativeBarcodeInput).source.id}]);
    }
    throw Error('Unexpected leaf26 protocol SQL');
  }, release(error?: Error) { releaseErrors.push(error); } };
  const pool = {async connect() { connects++; return client; }};
  const runtime: NativeRuntime26Capability = {profile:'EXACT26',contract:'NATIVE_RUNTIME26_V1',async assertReady(c, purpose) {
    proofs++; assert.equal(c,client); assert.equal(purpose,'IMPORT_STAGE'); assert.equal(calls.length,0);
    if (options.deny) throw Object.assign(Error('Original live lease required'),{code:'NATIVE_RUNTIME26_NOT_READY'});
    if (options.booleanProof) return true as never;
  }};
  return {input,calls,pool,runtime,client,releaseErrors,proofs:()=>proofs,connects:()=>connects};
}
test('leaf26 barcode and signed stock require actual original-client proof before SQL and keep legacy prefix26 refused',async()=>{
  for(const kind of ['barcode','stock'] as const){
    const Store = kind==='barcode'?PostgresNativeBarcodeImportStore26:PostgresNativeStockContributorStore26;
    const f=leaf26Protocol(kind);assert.throws(()=>new Store(f.pool,undefined as never),/runtime capability/);assert.equal(f.connects(),0);
    const prepared = kind==='barcode'?prepareNativeBarcode(f.input as NativeBarcodeInput):prepareNativeStockGroup(f.input as NativeStockGroupInput);
    const old = kind==='barcode'?new PostgresNativeBarcodeImportStore(f.pool):new PostgresNativeStockContributorStore(f.pool);
    await assert.rejects(old.stage(prepared as never),{code:kind==='barcode'?'NATIVE_BARCODE_SCHEMA_NOT_READY':'NATIVE_STOCK_SCHEMA_NOT_READY'});
    assert.equal(f.calls.some(c=>/:batch|:create|:source-create/.test(c.sql)),false);
    for(const option of [{deny:true},{booleanProof:true}]){const denied=leaf26Protocol(kind,option);await assert.rejects(new Store(denied.pool,denied.runtime).stage(prepared as never));assert.equal(denied.calls.length,0);assert.equal(denied.releaseErrors.length,1);assert.ok(denied.releaseErrors[0]);}
    for(const schema of [19,27]){const wrong=leaf26Protocol(kind,{schema});await assert.rejects(new Store(wrong.pool,wrong.runtime).stage(prepared as never));assert.equal(wrong.calls.some(c=>c.sql.includes(':batch')),false);}
  }
});
test('leaf26 exact schema preserves signed contributors and raw barcode immutable source with complete replay only',async()=>{
  for(const kind of ['barcode','stock'] as const)for(const replay of [false,true]){
    const f=leaf26Protocol(kind,{replay}),prepared=kind==='barcode'?prepareNativeBarcode(f.input as NativeBarcodeInput):prepareNativeStockGroup(f.input as NativeStockGroupInput);
    const store=kind==='barcode'?new PostgresNativeBarcodeImportStore26(f.pool,f.runtime):new PostgresNativeStockContributorStore26(f.pool,f.runtime);
    assert.deepEqual(await store.stage(prepared as never),{inserted:replay?0:kind==='stock'?2:1,replayed:replay?kind==='stock'?2:1:0});assert.equal(f.proofs(),1);assert.equal(f.calls.at(-1)!.sql,'COMMIT');
    assert.equal(f.calls.some(c=>/INSERT INTO naijue_erp\.(inventory_ledger|inventory_balance|operation_receipt)\b|UPDATE naijue_erp.import_batch|DELETE /.test(c.sql)),false);
  }
  for(const kind of ['barcode','stock'] as const){const f=leaf26Protocol(kind,{partial:true}),store=kind==='barcode'?new PostgresNativeBarcodeImportStore26(f.pool,f.runtime):new PostgresNativeStockContributorStore26(f.pool,f.runtime),prepared=kind==='barcode'?prepareNativeBarcode(f.input as NativeBarcodeInput):prepareNativeStockGroup(f.input as NativeStockGroupInput);await assert.rejects(store.stage(prepared as never),{code:kind==='barcode'?'NATIVE_BARCODE_REPLAY_CONFLICT':'NATIVE_STOCK_REPLAY_CONFLICT'});assert.equal(f.calls.at(-1)!.sql,'ROLLBACK');}
});
test('leaf26 unknown COMMIT discards original client without rollback, retry or extra source writes',async()=>{
  for(const kind of ['barcode','stock'] as const){const f=leaf26Protocol(kind,{commitUnknown:true}),store=kind==='barcode'?new PostgresNativeBarcodeImportStore26(f.pool,f.runtime):new PostgresNativeStockContributorStore26(f.pool,f.runtime),prepared=kind==='barcode'?prepareNativeBarcode(f.input as NativeBarcodeInput):prepareNativeStockGroup(f.input as NativeStockGroupInput);await assert.rejects(store.stage(prepared as never),/COMMIT unknown/);assert.equal(f.connects(),1);assert.equal(f.calls.filter(c=>c.sql==='COMMIT').length,1);assert.equal(f.calls.some(c=>c.sql==='ROLLBACK'),false);assert.ok(f.releaseErrors[0]);}
});


// v18 protocol tests run original writer SQL with synthetic original DTOs, no PostgreSQL.
function v18Remap<T>(input: T, replacements: Record<string, string>): T {
  return JSON.parse(JSON.stringify(input), (_key, value) => typeof value === 'string' && Object.hasOwn(replacements, value) ? replacements[value] : value) as T;
}
function v18SkuRows() {
  const first = skuInput26(), second = v18Remap(first, {
    [id(10)]:id(1010),[id(11)]:id(1011),[id(50)]:id(1050),[id(30)]:id(1030),
    [id(110)]:id(1110),[id(111)]:id(1111),'110':'1110','111':'1111',
    [id(21)]:id(121),'C1':'C2','COLOR-1':'COLOR-2'
  });
  return [prepareNativeSkuImport26(first), prepareNativeSkuImport26(second)];
}
function v18StockGroups() {
  const first = stockInput(), second = v18Remap(first, {
    'STOCK:synthetic':'STOCK:synthetic:second','STOCK:old:0':'STOCK:second:0','STOCK:old:1':'STOCK:second:1',
    'WH-1':'WH-2',[id(40)]:id(41),[id(200)]:id(1200),[id(201)]:id(1201),'200':'1200','201':'1201'
  });
  return [prepareNativeStockGroup(first),prepareNativeStockGroup(second)];
}
function v18BatchProtocol(kind: 'sku'|'stock', options: { replay?: boolean; failSecond?: boolean; denyPrecommit?: boolean; commitUnknown?: boolean; linked?: boolean; failRollback?: boolean } = {}) {
  const skuRows=v18SkuRows(), stockGroups=v18StockGroups();
  const delegates=kind==='sku'?skuRows.map(input=>sku26Protocol({input,replay:options.replay}).client)
    :stockGroups.map(()=>leaf26Protocol('stock',{replay:options.replay}).client);
  const calls:Array<{sql:string;values:unknown[]}>=[],releases:Array<unknown>=[];let current=0,proofs=0,connects=0;
  const answer=(rows:Record<string,unknown>[]=[])=>( {rows,rowCount:rows.length} );
  const client={async query(sql:string,values:unknown[]=[]){
    assertSqlBinds(sql,values);calls.push({sql,values});
    if(sql.includes('native-sku:target'))current=values[0]===skuRows[0]!.nativeSku.id?0:1;
    if(sql.includes('native-stock:warehouse'))current=values[2]===stockGroups[0]!.warehouse.nativeId?0:1;
    if(sql==='COMMIT'&&options.commitUnknown)throw Error('V18_UNKNOWN_COMMIT');
    if(sql==='ROLLBACK'&&options.failRollback)throw Error('V18_ROLLBACK_FAILED');
    if(options.failSecond&&current===1&&(sql.includes('native-sku:product')||sql.includes('native-stock:warehouse')))return answer();
    if(sql.includes('native-stock:batch-null-baselines'))return answer((values[1] as string[]).map(source_row_id=>({source_row_id,baseline_ledger_id:options.linked?id(999):null})));
    return delegates[current]!.query(sql,values);
  },release(reason?:unknown){releases.push(reason);}};
  const runtime:NativeRuntime26Capability={profile:'EXACT26',contract:'NATIVE_RUNTIME26_V1',async assertReady(c,purpose){
    assert.equal(c,client);assert.equal(purpose,'IMPORT_STAGE');proofs++;
    if(proofs===3&&options.denyPrecommit)throw Object.assign(Error('V18_PRECOMMIT_DENIED'),{code:'NATIVE_RUNTIME26_NOT_READY'});
  }};
  // Simulates the existing issuer's automatic connect verification; the real PG issuer is tested by C.
  const pool={async connect(){connects++;await runtime.assertReady(client,'IMPORT_STAGE');return client;}};
  return {calls,releases,proofs:()=>proofs,connects:()=>connects,skuRows,stockGroups,
    run:()=>kind==='sku'?new PostgresNativeSkuImportStore26(pool,runtime).stageBatch(skuRows)
      :new PostgresNativeStockContributorStore26(pool,runtime).stageBatch(stockGroups),pool,runtime};
}
for(const kind of ['sku','stock'] as const){
  test(`v18 ${kind} complete batch uses original per-item SQL and one COMMIT with precommit same-lease proof`,async()=>{
    for(const replay of [false,true]){
      const f=v18BatchProtocol(kind,{replay}),result=await f.run();
      assert.equal(result.items.length,2);assert.equal(result.inserted,replay?0:4);assert.equal(result.replayed,replay?4:0);
      assert.equal(f.connects(),1);assert.equal(f.proofs(),3);assert.deepEqual(f.releases,[undefined]);
      assert.equal(f.calls.filter(c=>c.sql==='COMMIT').length,1);assert.equal(f.calls.filter(c=>c.sql.startsWith('BEGIN')).length,1);
      assert.equal(f.calls.filter(c=>c.sql.includes(`native-${kind}:schema`)).length,2);
      assert.equal(f.calls.filter(c=>c.sql.includes(`native-${kind}:batch */`)).length,2);
      assert.ok(!f.calls.some(c=>/INSERT INTO naijue_erp\.(inventory_ledger|inventory_balance|operation_receipt)/.test(c.sql)));
      if(kind==='stock')assert.equal(f.calls.filter(c=>c.sql.includes('batch-null-baselines')).length,1);
    }
  });
  test(`v18 ${kind} later valid item with actual relation refusal rolls back the whole uncommitted batch`,async()=>{
    const f=v18BatchProtocol(kind,{failSecond:true});await assert.rejects(f.run(),{code:kind==='sku'?'NATIVE_SKU_PRODUCT_BINDING':'NATIVE_STOCK_WAREHOUSE_BINDING'});
    assert.ok(f.calls.some(c=>c.sql.includes(kind==='sku'?'native-sku:record-create':'native-stock:contributor-create')),'first complete item really reached original writes');
    assert.equal(f.calls.filter(c=>c.sql==='ROLLBACK').length,1);assert.ok(!f.calls.some(c=>c.sql==='COMMIT'));
    assert.deepEqual(f.releases,[undefined]);assert.equal(f.proofs(),2);
  });
  test(`v18 ${kind} precommit refusal rolls back, COMMIT unknown discards without rollback or retry`,async()=>{
    const denied=v18BatchProtocol(kind,{denyPrecommit:true});await assert.rejects(denied.run(),{code:'NATIVE_RUNTIME26_NOT_READY'});
    assert.equal(denied.proofs(),3);assert.equal(denied.calls.at(-1)!.sql,'ROLLBACK');assert.ok(!denied.calls.some(c=>c.sql==='COMMIT'));
    const unknown=v18BatchProtocol(kind,{commitUnknown:true});await assert.rejects(unknown.run(),/V18_UNKNOWN_COMMIT/);
    assert.equal(unknown.calls.filter(c=>c.sql==='COMMIT').length,1);assert.ok(!unknown.calls.some(c=>c.sql==='ROLLBACK'));
    assert.ok(unknown.releases[0] instanceof Error);assert.equal(unknown.connects(),1);
    const rollback=v18BatchProtocol(kind,{failSecond:true,failRollback:true});await assert.rejects(rollback.run(),AggregateError);assert.ok(rollback.releases[0] instanceof Error);
  });
  test(`v18 ${kind} empty oversized duplicate mixed-selection and changed DTO batches stop before connecting`,async()=>{
    const f=v18BatchProtocol(kind),rows=kind==='sku'?f.skuRows:f.stockGroups;
    const run=(items:unknown)=>kind==='sku'?new PostgresNativeSkuImportStore26(f.pool,f.runtime).stageBatch(items as typeof f.skuRows)
      :new PostgresNativeStockContributorStore26(f.pool,f.runtime).stageBatch(items as typeof f.stockGroups);
    await assert.rejects(run([]),{code:`NATIVE_${kind.toUpperCase()}_BATCH_BOUND`});
    await assert.rejects(run(Array.from({length:101},()=>rows[0])),{code:`NATIVE_${kind.toUpperCase()}_BATCH_BOUND`});
    await assert.rejects(run([rows[0],rows[0]]),{code:`NATIVE_${kind.toUpperCase()}_BATCH_DUPLICATE`});
    const mixed=rows.map((row,index)=>index===1?{...structuredClone(row),fixedSourceNamespace:row.fixedSourceNamespace+':changed'}:structuredClone(row));
    // Re-prepare each legal item to isolate cross-item scope, rather than testing a stale fingerprint.
    const inputs=kind==='sku'?[skuInput26(),v18Remap(skuInput26(),{[id(10)]:id(1010),[id(11)]:id(1011),[id(50)]:id(1050),[id(30)]:id(1030),[id(110)]:id(1110),[id(111)]:id(1111),'110':'1110','111':'1111',[id(21)]:id(121),'C1':'C2','COLOR-1':'COLOR-2'})]
      :[stockInput(),v18Remap(stockInput(),{'STOCK:synthetic':'STOCK:synthetic:second','STOCK:old:0':'STOCK:second:0','STOCK:old:1':'STOCK:second:1','WH-1':'WH-2',[id(40)]:id(41),[id(200)]:id(1200),[id(201)]:id(1201),'200':'1200','201':'1201'})];
    inputs[1]={...inputs[1]!,fixedSourceNamespace:inputs[1]!.fixedSourceNamespace+':other'};
    await assert.rejects(run(inputs.map(input=>kind==='sku'?prepareNativeSkuImport26(input as NativeSkuImportInput26):prepareNativeStockGroup(input as NativeStockGroupInput))),{code:`NATIVE_${kind.toUpperCase()}_BATCH_SCOPE`});
    await assert.rejects(run(mixed));assert.equal(f.connects(),0);
  });
}
test('v18 stock exact bounded member readback refuses any linked baseline before COMMIT',async()=>{
  const f=v18BatchProtocol('stock',{linked:true});await assert.rejects(f.run(),{code:'NATIVE_STOCK_BATCH_NULL_BASELINE'});
  assert.equal(f.calls.at(-1)!.sql,'ROLLBACK');assert.ok(!f.calls.some(c=>c.sql==='COMMIT'));
});

test('v18 stock preserves the original legal4MiB input plus prepared serialization margin and bounds the whole batch',async()=>{
  const f=v18BatchProtocol('stock'),input=stockInput();
  const provenance=input.contributors[0]!.source.fieldProvenance;provenance.fixture_padding='';
  const base=Buffer.byteLength(JSON.stringify(input),'utf8');provenance.fixture_padding='X'.repeat(4*1024*1024-base);
  assert.equal(Buffer.byteLength(JSON.stringify(input),'utf8'),4*1024*1024);
  const group=prepareNativeStockGroup(input),bytes=Buffer.byteLength(JSON.stringify(group),'utf8');
  assert.ok(bytes>4*1024*1024&&bytes<=4*1024*1024+4096);
  const actual=await new PostgresNativeStockContributorStore26(f.pool,f.runtime).stageBatch([group]);assert.equal(actual.inserted,2);
  const denied=v18BatchProtocol('stock');
  const {mappingVersion:_mapping,fingerprint:_fingerprint,signedQuantity:_quantity,...secondInput}=denied.stockGroups[1]!;
  secondInput.contributors[0]!.source.fieldProvenance.fixture_padding='Y'.repeat(10000);
  const second=prepareNativeStockGroup(secondInput);
  await assert.rejects(new PostgresNativeStockContributorStore26(denied.pool,denied.runtime).stageBatch([group,second]),{code:'NATIVE_STOCK_BATCH_BOUND'});
  assert.equal(denied.connects(),0);
});
