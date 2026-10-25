import assert from "node:assert/strict";
import test from "node:test";
import { PostgresNativeProductImportStore, PostgresNativeProductImportStore26 } from "../adapters/postgres/src/native-product-import.ts";
import { CATALOGUE_PRICE_KEYS } from "../packages/application/src/catalogue-price-input.ts";
import { CATALOGUE_SOURCE_PRICE_FIELDS } from "../packages/application/src/catalogue-source-proof.ts";
import { IMPORT_V2_TABLES } from "../packages/application/src/import-v2-contract.ts";
import { nativeProductImportEvidence, nativeProductImportEvidence26, nativeProductImportEvidences26, NATIVE_PRODUCT_IMPORT_VERSION_26, NATIVE_PRODUCT_NULLABLE_POLICY, prepareNativeProductImportChunk, prepareNativeProductImportChunk26, stageNativeProductImportChunk } from "../packages/application/src/native-product-import.ts";
import type { NativeProductImportChunk, NativeProductImportChunk26, NativeProductImportValues, PreparedNativeProductImportChunk26 } from "../packages/application/src/native-product-import.ts";
import { requestHash } from "../packages/application/src/request-hash.ts";

// Deliberately fictional identities, labels, rows, digests and prices only.
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
function input(count = 1, withOptionalReferences = true): NativeProductImportChunk {
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
type RecordRow = Record<string, unknown>;
/** Transactional copy-on-write SQL protocol fake. NOT PostgreSQL behavior proof. */
function protocol(chunk: NativeProductImportChunk | NativeProductImportChunk26 = input(), options: { runtimeFailureAt?: number; runtimeBoolean?: boolean; badReadback?: boolean; failProofAt?: number; commitUnknown?: boolean; rollbackFails?: boolean; staleReference?: string; wrongBatch?: boolean; missingSchema?: boolean; schemaVersions?: number[] } = {}) {
  const exact26 = "schemaProfile" in chunk;
  let runtimeChecks = 0;
  let native = new Map<string, NativeProductImportValues>(), sources = new Map<string, RecordRow>();
  let draftNative = new Map(native), draftSources = new Map(sources), inTransaction = false;
  let connects = 0, proofWrites = 0, nativeWrites = 0; let discarded: Error | boolean | undefined;
  let commitUnknown = options.commitUnknown;
  const calls: { sql: string; values: unknown[] }[] = [];
  const result = (rows: RecordRow[]) => ({ rows, rowCount: rows.length });
  const client = { async query(sql: string, values: unknown[] = []) {
    calls.push({ sql, values });
    if (sql.startsWith("BEGIN")) { assert.equal(inTransaction, false); inTransaction = true; draftNative = structuredClone(native); draftSources = structuredClone(sources); return result([]); }
    if (sql === "ROLLBACK") { inTransaction = false; if (options.rollbackFails) throw Error("SYNTHETIC rollback failure"); return result([]); }
    if (sql === "COMMIT") {
      assert.equal(inTransaction, true); native = structuredClone(draftNative); sources = structuredClone(draftSources); inTransaction = false;
      if (commitUnknown) { commitUnknown = false; throw Error("SYNTHETIC commit acknowledgement lost"); } return result([]);
    }
    assert.equal(inTransaction, true);
    if (sql.includes("native-product-import:schema")) return result([{ installed_versions: options.missingSchema ? null : options.schemaVersions ?? [1,2,3,4,5,6,7,8,9,10,11] }]);
    if (sql.includes("native-product-import:batch")) return result([{ id: chunk.batchId, mapping_version: "V2_HISTORY_NULLABLE_1", status: "STAGED",
      source_hash: options.wrongBatch ? "0".repeat(64) : chunk.selection.selectionSha256, source_name: chunk.fixedSourceNamespace }]);
    if (sql.includes("native-product-import:target")) {
      assert.match(sql, /FOR UPDATE/);
      if (exact26) assert.match(sql, /to_jsonb\(p\)/);
      else for (const key of [...Object.keys(prepareNativeProductImportChunk(chunk).nativeProducts[0]!)]) assert.ok(sql.includes(`p.${key}`));
      return result([...draftNative.values()].filter(p => p.id === values[0] || p.product_code === values[2]).map(p => ({ id: p.id, native_equal: requestHash(p) === requestHash(JSON.parse(values[1] as string)) })));
    }
    if (sql.includes("native-product26:season-source")) {
      assert.equal(values[1], chunk.batchId); assert.match(sql, /FOR SHARE OF n,c,s/);
      assert.match(sql, /s.entity_type=c.entity_type AND s.source_key=c.source_key/);
      const snapshot = JSON.parse(values[3] as string);
      assert.equal(snapshot.id, values[0]);
      return result(options.staleReference === "missingSeasonSource" ? [] : [{ id: values[0], snapshot_equal: options.staleReference !== "seasonSnapshot" }]);
    }
    if (sql.includes("native-product26:readback")) {
      assert.match(sql, /to_jsonb\(p\)/);
      const p = draftNative.get(values[0] as string);
      return result(p ? [{ id: p.id, native_equal: !options.badReadback && requestHash(p) === requestHash(JSON.parse(values[1] as string)) }] : []);
    }
    if (sql.includes("native-product-import:category")) { if (exact26) assert.match(sql, /deleted_at IS NULL/); return result([
      { id: id(10), parent_id: null, name: "SYNTHETIC ROOT", version: 2 },
      { id: id(11), parent_id: options.staleReference === "category" ? null : id(10), name: "SYNTHETIC LEAF", version: 3 }
    ]); }
    if (sql.includes("native-product-import:size-group */")) return result(options.staleReference === "sizeGroup" ? [] : [{ id: id(12), code: "SYNTHETIC_G", name: "SYNTHETIC GROUP" }]);
    if (sql.includes("native-product-import:size-group-member")) {
      assert.match(sql, /FOR SHARE OF m, z/);
      return result(options.staleReference === "emptySizeGroup" ? [] : [{ size_group_id: id(12), size_id: id(15) }]);
    }
    if (sql.includes("native-product-import:season")) return result([{ id: id(13), code: exact26 ? "SEASON_SPRING" : "SYNTHETIC_SEASON", name: options.staleReference === "season" ? "CHANGED SYNTHETIC" : exact26 ? "春" : "SYNTHETIC SEASON" }]);
    if (sql.includes("native-product-import:supplier")) return result([{ id: id(14), code: "SYNTHETIC_SUPPLIER", name: "SYNTHETIC SUPPLIER", enabled: false, version: options.staleReference === "supplier" ? 5 : 4 }]);
    if (sql.includes("native-product-import:create")) {
      const columns = sql.match(/product \(([^)]+)\)/)![1]!.split(/,\s*/);
      const product = Object.fromEntries(columns.map((key, index) => [key, values[index]])) as unknown as NativeProductImportValues;
      assert.equal(draftNative.has(product.id), false); draftNative.set(product.id, product); nativeWrites++; return result([{ id: product.id }]);
    }
    if (sql.includes("native-product-import:replay")) return result([...draftSources.values()].filter(s => s.id === values[0] || (s.batch_id === values[2]
      && ((s.entity_type === "PRODUCT" && (s.source_key === values[3] || (s.field_provenance as RecordRow).native_product_id === values[4]))
        || (s.source_file_sha256 === values[5] && s.sheet === values[6] && s.row_no === values[7])))).slice(0, 2)
      .map(s => ({ source_equal: requestHash(s) === requestHash(JSON.parse(values[1] as string)) })));
    if (sql.includes("write-batch")) return result([{ id: chunk.batchId, mapping_version: "V2_HISTORY_NULLABLE_1", status: "STAGED" }]);
    if (sql.includes("write-target")) { const p = draftNative.get(values[0] as string); return result(p ? [{ id: p.id, version: p.version, ...Object.fromEntries(CATALOGUE_PRICE_KEYS.map(key => [key, p[key]])) }] : []); }
    if (sql.includes("write-proof")) {
      proofWrites++; if (proofWrites === options.failProofAt) throw Error("SYNTHETIC proof insert failure");
      const metadata = JSON.parse(values[10] as string), product = draftNative.get(metadata.native_product_id);
      assert.ok(product); assert.equal(metadata.product_input_proof.product_version, 1);
      for (const key of CATALOGUE_PRICE_KEYS) assert.equal(metadata.product_input_proof.prices[key], product[key]);
      const source = { id: values[0], batch_id: values[1], entity_type: "PRODUCT", source_key: values[2], file_ref: values[3], sheet: values[4], row_no: values[5],
        source_file_sha256: values[6], row_sha256: values[7], raw_fields: JSON.parse(values[8] as string), normalized_fields: JSON.parse(values[9] as string), field_provenance: metadata };
      assert.equal(draftSources.has(source.id as string), false); draftSources.set(source.id as string, source); return result([{ id: source.id }]);
    }
    if (/cutoff_import_lock/.test(sql)) return result([]);
    throw Error(`Unexpected synthetic SQL: ${sql}`);
  }, release(error?: Error | boolean) { discarded = error; } };
  const pool = { async connect() { connects++; return client; } };
  const store = new PostgresNativeProductImportStore(pool);
  const successor = new PostgresNativeProductImportStore26(pool, { profile: "EXACT26", contract: "NATIVE_RUNTIME26_V1", async assertReady(target, purpose) {
    assert.equal(target, client); assert.equal(purpose, "IMPORT_PRODUCT_SEASONS"); runtimeChecks++;
    if (runtimeChecks === options.runtimeFailureAt) throw Error("SYNTHETIC exact26 runtime rejected");
    if (options.runtimeBoolean) return true as unknown as undefined;
  } });
  return { store, successor, runtimeChecks: () => runtimeChecks, calls, native: () => native, sources: () => sources, connects: () => connects, proofWrites: () => proofWrites, nativeWrites: () => nativeWrites, discarded: () => discarded,
    seedProduct(p: NativeProductImportValues) { native.set(p.id, structuredClone(p)); }, seedSource(s: RecordRow) { sources.set(s.id as string, structuredClone(s)); } };
}

test("native PRODUCT DRY_RUN validates but never connects; STAGE requires independent exact-file/row/mapping authority", async () => {
  const h = protocol(); assert.deepEqual(await stageNativeProductImportChunk(input(), { store: h.store }), { mode: "DRY_RUN", rows: 1, inserted: 0, replayed: 0, published: false, importReady: false });
  await assert.rejects(stageNativeProductImportChunk(input(), { mode: "STAGE", store: h.store }), { code: "NATIVE_PRODUCT_AUTHORIZATION_REQUIRED" }); assert.equal(h.connects(), 0);
  await assert.rejects(stageNativeProductImportChunk(input(), { mode: "STAGE", store: h.store, async authorize() { throw Error("SYNTHETIC source authority denied"); } }), /authority denied/); assert.equal(h.connects(), 0);
});
test("native PRODUCT source directly determines every native field, preserved explicit nulls and exact nine prices", () => {
  const chunk = input(1, false), prepared = prepareNativeProductImportChunk(chunk), p = prepared.nativeProducts[0]!;
  assert.equal(p.purchase_price, "0.00"); assert.equal(p.retail_price, "1.25"); assert.equal(p.minimum_price, null);
  assert.equal(p.supplier_id, null); assert.equal(p.season_id, null); assert.equal(p.category_id, id(11)); assert.equal(p.size_group_id, id(12));
  assert.equal(p.year, 2026); assert.equal(p.system_item_code, "SYNTHETIC SYSTEM CODE"); assert.equal(p.version, 1); assert.equal(p.enabled, true);
  const row = chunk.rows[0]!;
  for (const key of ["年份", "系统货号", "厚薄", "领型或裤型"]) {
    row.source.rawFields[key] = ""; row.source.normalizedFields[key] = "";
    (row.source.fieldProvenance.fields as Record<string, { raw: string }>)[key]!.raw = "";
  }
  const blank = prepareNativeProductImportChunk(chunk).nativeProducts[0]!;
  assert.equal(blank.year, null); assert.equal(blank.system_item_code, null); assert.equal(blank.thickness, null); assert.equal(blank.collar_pants_type, null);
});
test("native PRODUCT refuses missing raw/normalized nine-price columns rather than completing with null", () => {
  for (const field of Object.values(CATALOGUE_SOURCE_PRICE_FIELDS)) {
    const raw = input(); delete raw.rows[0]!.source.rawFields[field]; assert.throws(() => prepareNativeProductImportChunk(raw), { code: "INCOMPLETE_CATALOGUE_PRICE_INPUT" });
    const normalized = input(); delete normalized.rows[0]!.source.normalizedFields[field]; assert.throws(() => prepareNativeProductImportChunk(normalized), { code: "PRODUCT_STAGE_COLUMNS" });
  }
});
test("native PRODUCT rejects incomplete provenance, transformations, whitespace, unknown states and invalid integer values before connecting", () => {
  const changes: ((c: NativeProductImportChunk) => void)[] = [
    c => { delete (c.rows[0]!.source.fieldProvenance.fields as RecordRow)["分类路径"]; },
    c => { (c.rows[0]!.source.fieldProvenance.fields as Record<string, RecordRow>)["商品名称"]!.origin = "UNKNOWN"; },
    c => { delete c.rows[0]!.source.rawFields["厚薄"]; },
    c => { c.rows[0]!.source.normalizedFields["系统货号"] = "UNAPPROVED SYNTHETIC CHANGE"; },
    c => { for (const values of [c.rows[0]!.source.normalizedFields, c.rows[0]!.source.rawFields]) values["商品名称"] = " "; },
    c => { for (const values of [c.rows[0]!.source.normalizedFields, c.rows[0]!.source.rawFields]) values["状态"] = "UNKNOWN"; },
    c => { for (const values of [c.rows[0]!.source.normalizedFields, c.rows[0]!.source.rawFields]) values["年份"] = "2147483648"; },
    c => { for (const values of [c.rows[0]!.source.normalizedFields, c.rows[0]!.source.rawFields]) values["年份"] = "2.5"; },
    c => { c.rows[0]!.source.rawFields["绑定范围"] = "PRODUCT"; },
    c => { (c.rows[0]!.product as { expectedVersion: number }).expectedVersion = 2; },
    c => { (c.rows[0]! as { nullableFieldPolicy: string }).nullableFieldPolicy = "LIVE_OPTIONAL"; }
  ];
  for (const change of changes) { const chunk = input(); change(chunk); assert.throws(() => prepareNativeProductImportChunk(chunk)); }
});
test("native PRODUCT requires explicit source-to-native reference mappings, full acyclic category path, optional-null decisions and unique product codes", () => {
  const changes: ((c: NativeProductImportChunk) => void)[] = [
    c => { (c.rows[0]!.references.sizeGroup as { sourceValue: string }).sourceValue = "WRONG SYNTHETIC SOURCE"; },
    c => { (c.rows[0]!.references as { supplier: null }).supplier = null; },
    c => { (c.rows[0]!.references as { season: null }).season = null; },
    c => { (c.rows[0]!.references.category as { path: readonly unknown[] }).path = []; },
    c => { (c.rows[0]!.references.category as { path: readonly unknown[] }).path = [c.rows[0]!.references.category.path[0]!, c.rows[0]!.references.category.path[0]!]; },
    c => { (c.rows[0]!.references.category as { path: readonly unknown[] }).path = [...c.rows[0]!.references.category.path, { nativeId: id(16), name: "SYNTHETIC ILLEGAL THIRD LEVEL", expectedVersion: 1 }]; },
    c => { (c.rows[0]!.references.category as { mappingSha256: string }).mappingSha256 = "missing"; }
  ];
  for (const change of changes) { const chunk = input(); change(chunk); assert.throws(() => prepareNativeProductImportChunk(chunk), { code: "NATIVE_PRODUCT_REFERENCE" }); }
  const repeated = input(2); for (const values of [repeated.rows[1]!.source.rawFields, repeated.rows[1]!.source.normalizedFields]) values["款号"] = repeated.rows[0]!.source.normalizedFields["款号"]!;
  (repeated.rows[1]!.source.fieldProvenance.fields as Record<string, RecordRow>)["款号"]!.raw = repeated.rows[0]!.source.normalizedFields["款号"]!;
  assert.throws(() => prepareNativeProductImportChunk(repeated), { code: "NATIVE_PRODUCT_DUPLICATE_CODE" });
});
test("native PRODUCT creates actual rows and immutable source+proof together; all native target locks/creates precede all source access", async () => {
  const chunk = input(2), h = protocol(chunk); let authorized = false;
  const result = await stageNativeProductImportChunk(chunk, { mode: "STAGE", store: h.store, async authorize(copy) {
    assert.equal(copy.rows[0]!.references.category.sourceValue, chunk.rows[0]!.source.normalizedFields["分类路径"]); authorized = true;
    (copy.nativeProducts[0]! as { name: string }).name = "AUTHORIZE COPY CANNOT MUTATE STORAGE";
  } });
  assert.equal(authorized, true); assert.deepEqual(result, { mode: "STAGE", rows: 2, inserted: 2, replayed: 0, published: false, importReady: false });
  assert.equal(h.native().size, 2); assert.equal(h.sources().size, 2);
  const sql = h.calls.map(call => call.sql); assert.equal(sql[0], "BEGIN ISOLATION LEVEL READ COMMITTED"); assert.match(sql[1]!, /cutoff_import_lock/);
  const batch = sql.findIndex(s => s.includes("native-product-import:batch"));
  const firstTarget = sql.findIndex(s => s.includes("native-product-import:target")), firstSource = sql.findIndex(s => s.includes("native-product-import:replay"));
  const lastCreate = sql.findLastIndex(s => s.includes("native-product-import:create")), lastTarget = sql.findLastIndex(s => s.includes("native-product-import:target"));
  assert.ok(batch < firstTarget && lastTarget < lastCreate && lastCreate < firstSource); assert.equal(sql.at(-1), "COMMIT");
  assert.ok(!sql.some(s => /UPDATE naijue_erp\.|INSERT INTO naijue_erp\.(sku|sku_barcode|inventory_|product_image|product_category|season|size_group)\b/.test(s)));
  for (const s of h.sources().values()) assert.equal((s.field_provenance as RecordRow).native_product_id !== s.source_key, true);
});
test("native PRODUCT exact replay is insert-free; native full-field drift or immutable evidence drift cannot inherit old proof", async () => {
  const chunk = input(), h = protocol(chunk), prepared = prepareNativeProductImportChunk(chunk);
  await h.store.stage(prepared); assert.deepEqual(await h.store.stage(prepared), { inserted: 0, replayed: 1 }); assert.equal(h.nativeWrites(), 1); assert.equal(h.proofWrites(), 1);
  for (const key of Object.keys(prepared.nativeProducts[0]!)) {
    if (key === "id") continue;
    const drift = protocol(chunk), changed = structuredClone(prepared.nativeProducts[0]!);
    (changed as unknown as RecordRow)[key] = key === "enabled" ? false : key === "version" || key === "year" ? 99 : "SYNTHETIC_DRIFT";
    drift.seedProduct(changed); drift.seedSource(nativeProductImportEvidence(prepared, 0).source);
    await assert.rejects(drift.store.stage(prepared), { code: "NATIVE_PRODUCT_TARGET_CONFLICT" }); assert.equal(drift.nativeWrites(), 0); assert.equal(drift.proofWrites(), 0);
  }
  const changedSource = protocol(chunk), source = nativeProductImportEvidence(prepared, 0).source; source.row_sha256 = "0".repeat(64);
  changedSource.seedProduct(prepared.nativeProducts[0]!); changedSource.seedSource(source);
  await assert.rejects(changedSource.store.stage(prepared), { code: "NATIVE_PRODUCT_REPLAY_CONFLICT" });
});
test("native PRODUCT refuses existing unproven target, source-only repair, changed mapping and target-code collisions", async () => {
  const chunk = input(), prepared = prepareNativeProductImportChunk(chunk), product = prepared.nativeProducts[0]!;
  const existing = protocol(chunk); existing.seedProduct(product);
  await assert.rejects(existing.store.stage(prepared), { code: "NATIVE_PRODUCT_UNPROVEN_EXISTING_TARGET" }); assert.equal(existing.sources().size, 0);
  const orphan = protocol(chunk); orphan.seedSource(nativeProductImportEvidence(prepared, 0).source);
  await assert.rejects(orphan.store.stage(prepared), { code: "NATIVE_PRODUCT_REPLAY_CONFLICT" }); assert.equal(orphan.native().size, 0);
  const collision = protocol(chunk); collision.seedProduct({ ...product, id: id(900) });
  await assert.rejects(collision.store.stage(prepared), { code: "NATIVE_PRODUCT_TARGET_CONFLICT" });
  const mapping = protocol(chunk); await mapping.store.stage(prepared);
  const changed = structuredClone(chunk); (changed.rows[0]!.references.sizeGroup as { mappingSha256: string }).mappingSha256 = "5".repeat(64);
  await assert.rejects(mapping.store.stage(prepareNativeProductImportChunk(changed)), { code: "NATIVE_PRODUCT_REPLAY_CONFLICT" });
});
test("native PRODUCT validates every actual dictionary reference and rolls back the whole chunk on late proof failure", async () => {
  for (const staleReference of ["category", "sizeGroup", "emptySizeGroup", "season", "supplier"]) {
    const h = protocol(input(), { staleReference }); await assert.rejects(h.store.stage(prepareNativeProductImportChunk(input())), { code: "NATIVE_PRODUCT_REFERENCE_STALE" });
    assert.equal(h.native().size, 0); assert.equal(h.sources().size, 0); assert.equal(h.calls.at(-1)!.sql, "ROLLBACK");
  }
  const chunk = input(2), h = protocol(chunk, { failProofAt: 2 });
  await assert.rejects(h.store.stage(prepareNativeProductImportChunk(chunk)), /proof insert failure/); assert.equal(h.nativeWrites(), 2); assert.equal(h.proofWrites(), 2);
  assert.equal(h.native().size, 0); assert.equal(h.sources().size, 0); assert.equal(h.calls.at(-1)!.sql, "ROLLBACK");
});
test("native PRODUCT commit uncertainty discards once without automatic retry; explicit identical retry resolves committed outcome", async () => {
  const chunk = input(), h = protocol(chunk, { commitUnknown: true }), prepared = prepareNativeProductImportChunk(chunk);
  await assert.rejects(h.store.stage(prepared), /acknowledgement lost/); assert.ok(h.discarded() instanceof Error); assert.equal(h.connects(), 1);
  assert.equal(h.native().size, 1); assert.equal(h.sources().size, 1); assert.equal(h.proofWrites(), 1);
  assert.deepEqual(await h.store.stage(prepared), { inserted: 0, replayed: 1 }); assert.equal(h.connects(), 2); assert.equal(h.nativeWrites(), 1); assert.equal(h.proofWrites(), 1);
});
test("native PRODUCT fails closed for schema/batch mismatch, rollback failure and altered prepared values", async () => {
  for (const options of [{ missingSchema: true }, { wrongBatch: true }]) {
    const h = protocol(input(), options); await assert.rejects(h.store.stage(prepareNativeProductImportChunk(input()))); assert.equal(h.nativeWrites(), 0); assert.equal(h.proofWrites(), 0);
  }
  const rollback = protocol(input(), { failProofAt: 1, rollbackFails: true });
  await assert.rejects(rollback.store.stage(prepareNativeProductImportChunk(input())), AggregateError); assert.ok(rollback.discarded() instanceof Error);
  const h = protocol(), prepared = prepareNativeProductImportChunk(input());
  const altered = structuredClone(prepared); (altered.nativeProducts[0]! as { name: string }).name = "SYNTHETIC TAMPER";
  await assert.rejects(h.store.stage(altered), { code: "NATIVE_PRODUCT_PREPARED_CHANGED" }); assert.equal(h.connects(), 0);
});
test("native PRODUCT supports reviewed schema11–17 but rejects missing, duplicate or future20 before targets/writes", async () => {
  const prefix = [1,2,3,4,5,6,7,8,9,10,11];
  for (const schemaVersions of [prefix, [...prefix,12], [...prefix,12,13], [...prefix,12,13,14], [...prefix,12,13,14,15], [...prefix,12,13,14,15,16], [...prefix,12,13,14,15,16,17]]) {
    const approved = protocol(input(), { schemaVersions });
    assert.deepEqual(await approved.store.stage(prepareNativeProductImportChunk(input())), { inserted: 1, replayed: 0 });
  }
  for (const schemaVersions of [prefix.filter(v => v !== 11), [...prefix,12,12], [...prefix,12,13,14,15,16,17,18,19,20],
    [...prefix,99], [], [...prefix,12.5]]) {
    const h = protocol(input(), { schemaVersions });
    await assert.rejects(h.store.stage(prepareNativeProductImportChunk(input())), { code: "NATIVE_PRODUCT_SCHEMA_NOT_READY" });
    assert.equal(h.nativeWrites(), 0); assert.equal(h.proofWrites(), 0);
    assert.ok(!h.calls.some(call => call.sql.includes("native-product-import:target"))); assert.equal(h.calls.at(-1)!.sql, "ROLLBACK");
  }
});

function input26(season: "" | "春" | "春、夏" = "春、夏", count = 1): NativeProductImportChunk26 {
  const old = input(count, false);
  return { ...old, schemaProfile: "EXACT26", validatorVersion: NATIVE_PRODUCT_IMPORT_VERSION_26, rows: old.rows.map(original => {
    const row = structuredClone(original);
    row.source.rawFields["季节"] = season; row.source.normalizedFields["季节"] = season;
    (row.source.fieldProvenance.fields as Record<string, unknown>)["季节"] = { origin: "ORIGINAL", reason: "SYNTHETIC ORIGINAL", raw: season };
    const selected = season === "" ? [] : season === "春" ? [0] : [0, 1];
    const references = selected.map(i => ({ sourceKey: ["春", "夏"][i]!, nativeId: id(13 + i), nativeSnapshot: {
      id: id(13 + i), code: ["SEASON_SPRING", "SEASON_SUMMER"][i]!, name: ["春", "夏"][i]!, display_order: i } }));
    return { ...row, references: { ...row.references, season: season === "春" ? { sourceValue: season, nativeId: id(13), code: "SEASON_SPRING", name: "春", mappingSha256: "3".repeat(64) } : null },
      seasonSelection: { version: "NATIVE_PRODUCT_SEASON_SELECTION_V1", mapping_sha256: "7".repeat(64), source_key: row.source.sourceKey,
        source_season: season, state: season === "" ? "UNKNOWN" : "KNOWN", season_ids: season === "" ? null : references.map(r => r.nativeId), references },
      ...(season === "春、夏" ? { legacyScalarCreation: { state: "LEGACY_SINGLE_SLOT_NOT_APPLICABLE_TO_CONFIRMED_MULTI_SELECTION" as const,
        value: null, appliesOnlyTo: "FRESH_NATIVE_PRODUCT_IN_NEW_DATABASE" as const, originalSeason: season } } : {}) };
  }) };
}
test("product26 runtime rejects absent forged revoked and wrong-profile inputs before targets; rechecks same client in transaction", async () => {
  const p = prepareNativeProductImportChunk26(input26());
  assert.throws(() => new PostgresNativeProductImportStore26({ async connect() { throw Error("must not connect"); } }, undefined as never));
  for (const options of [{ runtimeFailureAt: 1 }, { runtimeBoolean: true }]) {
    const h = protocol(input26(), options); await assert.rejects(h.successor.stage(p)); assert.equal(h.calls.length, 0); assert.ok(h.discarded() instanceof Error);
  }
  const late = protocol(input26(), { runtimeFailureAt: 2 }); await assert.rejects(late.successor.stage(p), /runtime rejected/);
  assert.equal(late.calls.at(-1)!.sql, "ROLLBACK"); assert.equal(late.nativeWrites(), 0);
  const old = protocol(); await assert.rejects(old.store.stage(p)); assert.equal(old.connects(), 0);
  await assert.rejects(old.successor.stage(prepareNativeProductImportChunk(input()) as PreparedNativeProductImportChunk26)); assert.equal(old.connects(), 0);
});
test("product26 batch proof preserves ordered single-row evidence for unknown single and multi seasons", async () => {
  for (const season of ["", "春", "春、夏"] as const) {
    const raw = input26(season, 3), prepared = prepareNativeProductImportChunk26(raw), before = structuredClone(prepared);
    const proofs = nativeProductImportEvidences26(prepared);
    assert.deepEqual(proofs, prepared.rows.map((_, index) => nativeProductImportEvidence26(prepared, index)));
    assert.deepEqual(prepared, before);
    const h = protocol(raw); assert.deepEqual(await h.successor.stage(prepared), { inserted: 3, replayed: 0 });
    for (let index = 0; index < prepared.rows.length; index++)
      assert.deepEqual(h.sources().get(prepared.rows[index]!.source.id), proofs[index]!.source);
    assert.deepEqual(await h.successor.stage(prepared), { inserted: 0, replayed: 3 });
    assert.equal(h.nativeWrites(), 3); assert.equal(h.proofWrites(), 3);
  }
});
test("product26 batch proof and writer reject changed prepared source or snapshot before connecting", async () => {
  const raw = input26("春、夏", 2), prepared = prepareNativeProductImportChunk26(raw);
  const changes = [
    (p: PreparedNativeProductImportChunk26) => { p.rows[1]!.source.rowSha256 = "0".repeat(64); },
    (p: PreparedNativeProductImportChunk26) => { (p.nativeProducts[1]! as unknown as RecordRow).season_ids = []; },
    (p: PreparedNativeProductImportChunk26) => { (p.rows[1]!.source.normalizedFields as RecordRow)["商品名称"] = "SYNTHETIC_CHANGED"; }
  ];
  for (const change of changes) {
    const changed = structuredClone(prepared); change(changed);
    assert.throws(() => nativeProductImportEvidences26(changed));
    const h = protocol(raw); await assert.rejects(h.successor.stage(changed)); assert.equal(h.connects(), 0);
  }
  for (const index of [-1, 0.5, prepared.rows.length]) assert.throws(() => nativeProductImportEvidence26(prepared, index));
});
test("product26 writes and reads back full unknown single multi snapshots and exact source once; replay is insert-free", async () => {
  for (const season of ["", "春", "春、夏"] as const) {
    const raw = input26(season), p = prepareNativeProductImportChunk26(raw), h = protocol(raw);
    assert.deepEqual(await h.successor.stage(p), { inserted: 1, replayed: 0 }); assert.equal(h.runtimeChecks(), 2);
    assert.deepEqual(h.native().get(p.nativeProducts[0]!.id), p.nativeProducts[0]);
    assert.deepEqual(h.sources().get(p.rows[0]!.source.id), nativeProductImportEvidence26(p, 0).source);
    const sql = h.calls.map(c => c.sql), readback = sql.findIndex(s => s.includes("product26:readback"));
    assert.ok(readback > sql.findIndex(s => s.includes("native-product-import:create")) && readback < sql.findIndex(s => s.includes("write-proof")));
    assert.equal(sql.filter(s => s.includes("product26:season-source")).length, season === "" ? 0 : season === "春" ? 1 : 2);
    assert.ok(!sql.some(s => s.includes("native-product-import:schema")));
    assert.deepEqual(await h.successor.stage(p), { inserted: 0, replayed: 1 }); assert.equal(h.nativeWrites(), 1); assert.equal(h.proofWrites(), 1);
  }
});
test("product26 refuses stale whole-season proof and complete-row readback drift; late proof failure rolls back all native rows", async () => {
  const raw = input26("春、夏", 2), p = prepareNativeProductImportChunk26(raw);
  for (const options of [{ staleReference: "missingSeasonSource" }, { staleReference: "seasonSnapshot" }, { badReadback: true }, { failProofAt: 2 }]) {
    const h = protocol(raw, options); await assert.rejects(h.successor.stage(p));
    assert.equal(h.native().size, 0); assert.equal(h.sources().size, 0); assert.equal(h.calls.at(-1)!.sql, "ROLLBACK");
  }
});
test("product26 rejects native/source adoption and drift including new columns; commit uncertainty is discarded without rollback or retry", async () => {
  const raw = input26(), p = prepareNativeProductImportChunk26(raw);
  for (const key of ["season_ids", "deleted_at", "default_barcode_scheme_id"]) {
    const h = protocol(raw), product = structuredClone(p.nativeProducts[0]!) as unknown as RecordRow;
    product[key] = key === "season_ids" ? [] : "SYNTHETIC_DRIFT";
    h.seedProduct(product as unknown as NativeProductImportValues); h.seedSource(nativeProductImportEvidence26(p, 0).source);
    await assert.rejects(h.successor.stage(p), { code: "NATIVE_PRODUCT_TARGET_CONFLICT" }); assert.equal(h.nativeWrites(), 0);
  }
  const orphan = protocol(raw); orphan.seedProduct(p.nativeProducts[0]!);
  await assert.rejects(orphan.successor.stage(p), { code: "NATIVE_PRODUCT_UNPROVEN_EXISTING_TARGET" });
  const unknown = protocol(raw, { commitUnknown: true }); await assert.rejects(unknown.successor.stage(p), /acknowledgement lost/);
  assert.equal(unknown.calls.at(-1)!.sql, "COMMIT"); assert.ok(unknown.discarded() instanceof Error); assert.equal(unknown.connects(), 1);
  assert.deepEqual(await unknown.successor.stage(p), { inserted: 0, replayed: 1 }); assert.equal(unknown.nativeWrites(), 1);
});
