/** SYNTHETIC protocol only, not a PostgreSQL execution or real import claim. */
import assert from "node:assert/strict";
import test from "node:test";
import { CATALOGUE_PRICE_KEYS, validateCompleteCataloguePrices } from "../packages/application/src/catalogue-price-input.ts";
import { CATALOGUE_SOURCE_PRICE_FIELDS, createCatalogueSourcePriceProof } from "../packages/application/src/catalogue-source-proof.ts";
import { PostgresImportedCatalogueCompletenessVerifier } from "../adapters/postgres/src/catalogue-completeness.ts";
import { sid } from "./support/synthetic-fixtures.ts";
const product = sid("product", 100);
const prices = () => Object.fromEntries(CATALOGUE_PRICE_KEYS.map(key => [key, key === "retail_price" ? "1.25" : null]));
const raw = () => Object.fromEntries(CATALOGUE_PRICE_KEYS.map(key => [CATALOGUE_SOURCE_PRICE_FIELDS[key], key === "retail_price" ? "1.25" : null]));
function evidence(id = product): Record<string, unknown> {
  const rawFields = raw(); const proof = createCatalogueSourcePriceProof({ nativeProductId: id, productVersion: 1, rawFields, blankPricePolicy: "EXPLICIT_NULL_ONLY" });
  return { product_id: id, product_version: 1, ...prices(), source_row_id: sid("product", 500), batch_id: sid("product", 501),
    source_key: "SYNTHETIC-ORIGINAL-NOT-UUID", file_ref: "synthetic.csv", sheet: "PRODUCT", row_no: "2",
    source_file_sha256: "a".repeat(64), row_sha256: "b".repeat(64), raw_fields: rawFields,
    field_provenance: { schema_version: 1, fields: {}, ...proof }, batch_status: "IMPORTED", mapping_version: "V2_HISTORY_NULLABLE_1", history_validation_passed: true };
}
const verifier = new PostgresImportedCatalogueCompletenessVerifier();
const verify = (rows: Record<string, unknown>[]) => verifier.assertComplete({ productIds: [product], query: async () => ({ rows, rowCount: rows.length }) });
test("nine-price validator distinguishes explicit null and zero; rejects omissions/undefined/coercion/overflow", () => {
  assert.equal(validateCompleteCataloguePrices({ ...prices(), purchase_price: "0" }).purchase_price, "0.00");
  assert.equal(validateCompleteCataloguePrices(prices()).purchase_price, null);
  const missing = prices(); delete missing.minimum_price;
  for (const input of [missing, { ...prices(), minimum_price: undefined }, { ...prices(), extra: null },
    ...["", " ", "01", "-0", "1.001", "1e2", 0, false, "10000000000000000.00"].map(value => ({ ...prices(), minimum_price: value }))])
    assert.throws(() => validateCompleteCataloguePrices(input));
});
test("source proof requires all raw own keys; reviewed exact-column blank policy never permits missing or whitespace", () => {
  const fields = raw(); fields[CATALOGUE_SOURCE_PRICE_FIELDS.minimum_price] = "";
  assert.throws(() => createCatalogueSourcePriceProof({ nativeProductId: product, productVersion: 1, rawFields: fields, blankPricePolicy: "EXPLICIT_NULL_ONLY" }));
  assert.equal(createCatalogueSourcePriceProof({ nativeProductId: product, productVersion: 1, rawFields: fields,
    blankPricePolicy: "V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET" }).product_input_proof.prices.minimum_price, null);
  for (const rawFields of [{ ...fields, [CATALOGUE_SOURCE_PRICE_FIELDS.minimum_price]: " " }, Object.fromEntries(Object.entries(fields).filter(([key]) => key !== CATALOGUE_SOURCE_PRICE_FIELDS.minimum_price))])
    assert.throws(() => createCatalogueSourcePriceProof({ nativeProductId: product, productVersion: 1, rawFields, blankPricePolicy: "V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET" }));
});
test("persisted verifier uses original transaction with explicit target binding/published batch/source+product locks", async () => {
  let calls = 0;
  await verifier.assertComplete({ productIds: [product, product], query: async (sql, values) => {
    calls++; assert.deepEqual(values, [[product], 2]);
    for (const expected of ["s.entity_type = 'PRODUCT'", "s.field_provenance->>'native_product_id' = p.id::text", "b.status = 'IMPORTED'",
      "b.history_validation_passed", "FOR SHARE OF p, s, b"]) assert.ok(sql.includes(expected));
    assert.ok(!sql.includes("schema_migration")); return { rows: [evidence()], rowCount: 1 };
  } }); assert.equal(calls, 1);
});
test("persisted verifier rejects absent/duplicate/foreign/changed/unpublished proof and source/raw tampering", async () => {
  const base = evidence(); const metadata = base.field_provenance as Record<string, unknown>;
  const proof = metadata.product_input_proof as Record<string, unknown>;
  const invalid: Record<string, unknown>[][] = [[], [base, base], [{ ...base, product_id: sid("product", 999) }],
    [{ ...base, product_version: 2 }], [{ ...base, retail_price: "1.26" }], [{ ...base, minimum_price: "0.00" }],
    [{ ...base, batch_status: "STAGED" }], [{ ...base, history_validation_passed: false }], [{ ...base, row_sha256: "" }],
    [{ ...base, raw_fields: {} }], [{ ...base, raw_fields: { ...raw(), 零售价: "1.26" } }],
    [{ ...base, field_provenance: { ...metadata, native_product_id: sid("product", 999) } }],
    [{ ...base, field_provenance: { ...metadata, product_input_proof: { ...proof, validator_version: "SCHEMA_ONLY" } } }],
    [{ ...base, field_provenance: { ...metadata, product_input_proof: { ...proof, prices: { ...prices(), minimum_price: undefined } } } }]];
  for (const rows of invalid) await assert.rejects(verify(rows));
  await verify([base]);
});
test("persisted verifier bounds target batches to 200 without pool/independent transaction or global success cache", async () => {
  const ids = Array.from({ length: 401 }, (_, index) => sid("product", 1000 + index)); let calls = 0;
  await verifier.assertComplete({ productIds: ids, query: async (_sql, values) => {
    calls++; const batch = values![0] as typeof ids; assert.ok(batch.length <= 200); return { rows: batch.map(id => evidence(id)), rowCount: batch.length };
  } }); assert.equal(calls, 3);
  await assert.rejects(verify([]));
});
test("SYNTHETIC proof writer locks reviewed batch/native prices then inserts full immutable source evidence, never publishes", async () => {
  const { insertValidatedCatalogueSourceProof } = await import("../adapters/postgres/src/catalogue-completeness.ts");
  const sourceRowId = sid("product", 500), batchId = sid("product", 501); const calls: string[] = [];
  await insertValidatedCatalogueSourceProof(async (sql, values) => {
    calls.push(sql); assert.ok(!/BEGIN|COMMIT|UPDATE naijue_erp|DELETE FROM/.test(sql));
    if (sql.includes(":write-lock")) return { rows: [], rowCount: 1 };
    if (sql.includes(":write-batch")) return { rows: [{ id: batchId, status: "VALIDATING", mapping_version: "V2_HISTORY_NULLABLE_1" }], rowCount: 1 };
    if (sql.includes(":write-target")) return { rows: [{ id: product, version: 1, ...prices() }], rowCount: 1 };
    const metadata = JSON.parse(values![10] as string); assert.equal(metadata.native_product_id, product); assert.equal(metadata.product_input_proof.prices.minimum_price, null);
    assert.deepEqual(JSON.parse(values![8] as string), raw()); return { rows: [{ id: sourceRowId }], rowCount: 1 };
  }, { sourceRowId, batchId, nativeProductId: product, sourceKey: "original-not-native", fileRef: "synthetic.csv", sheet: "PRODUCT", rowNo: "2",
    sourceFileSha256: "a".repeat(64), rowSha256: "b".repeat(64), rawFields: raw(), normalizedFields: {}, fields: {}, blankPricePolicy: "EXPLICIT_NULL_ONLY" });
  assert.equal(calls.length, 4);
  assert.match(calls[0]!, /SELECT naijue_erp.cutoff_import_lock/);
  assert.match(calls[1]!, /write-batch.*SELECT.*FOR UPDATE/);
  assert.match(calls[2]!, /write-target/);
  assert.match(calls[3]!, /write-proof/);
});
test("SYNTHETIC proof writer mismatch rejects before immutable insert", async () => {
  const { insertValidatedCatalogueSourceProof } = await import("../adapters/postgres/src/catalogue-completeness.ts"); let writes = 0;
  const batchId = sid("product", 501);
  await assert.rejects(insertValidatedCatalogueSourceProof(async sql => {
    if (sql.includes(":write-lock")) return { rows: [], rowCount: 1 };
    if (sql.includes(":write-batch")) return { rows: [{ id: batchId, status: "VALIDATING", mapping_version: "V2_HISTORY_NULLABLE_1" }], rowCount: 1 };
    if (sql.includes(":write-target")) return { rows: [{ id: product, version: 1, ...prices(), retail_price: "9.99" }], rowCount: 1 };
    writes++; return { rows: [], rowCount: 0 };
  }, { sourceRowId: sid("product", 500), batchId, nativeProductId: product, sourceKey: "original", fileRef: "synthetic.csv", sheet: "PRODUCT", rowNo: "2",
    sourceFileSha256: "a".repeat(64), rowSha256: "b".repeat(64), rawFields: raw(), normalizedFields: {}, fields: {}, blankPricePolicy: "EXPLICIT_NULL_ONLY" }), { code: "NATIVE_CATALOGUE_FACTS_UNAVAILABLE" });
  assert.equal(writes, 0);
});
test("SYNTHETIC missing source-proof schema is explicit unavailable, never proof or a default verifier", async () => {
  await assert.rejects(verifier.assertComplete({ productIds: [product], query: async () => { throw Object.assign(new Error("synthetic absent relation"), { code: "42P01" }); } }), { code: "NATIVE_CATALOGUE_FACTS_UNAVAILABLE" });
});


import { createMaintainedCatalogue26TransactionProof } from "../adapters/postgres/src/catalogue-completeness.ts";
import type { PgSalesClient } from "../adapters/postgres/src/sales-unit-of-work.ts";
import type { NativeRuntime26Capability } from "../packages/application/src/native-import-schema-contract.ts";
type H06Facts = Record<string, unknown>;
const h06 = { product: sid("product", 610), sku: sid("sku", 611), code: sid("barcode", 612), category: sid("category", 613), group: sid("sizeGroup", 614), color: sid("color", 615), fit: sid("fit", 616), size: sid("size", 617), scheme: sid("product", 618), operation: sid("operation", 619), batch: sid("product", 620), image: sid("product", 621) };
const h06Root = (v = 1): H06Facts => ({ id: h06.product, product_code: "SYNTHETIC-H06", name: "SYNTHETIC COMPLETE", category_id: h06.category, supplier_id: null, season_id: null,
  size_group_id: h06.group, year: null, system_item_code: null, thickness: null, collar_pants_type: null, default_barcode_scheme_id: h06.scheme,
  enabled: true, version: v, deleted_at: null, ...prices(), season_ids: [] });
const h06Sku = (operation: string | null = h06.operation): H06Facts => ({ id: h06.sku, product_id: h06.product, color_id: h06.color, fit_id: h06.fit, size_id: h06.size, sku_code: "SYNTHETIC-H06-SKU", enabled: true, version: 1, created_operation_id: operation });
const h06Code = (): H06Facts => ({ id: h06.code, barcode: "001-SYNTHETIC-H06", sku_id: h06.sku, barcode_kind: "MAIN", scheme_id: h06.scheme, enabled: true });
const h06Image = (): H06Facts => ({ id: h06.image, product_id: h06.product, file_ref: "private:SYNTHETIC-H06", mime: "image/webp", byte_size: "120", display_order: -1,
  created_at: "2026-10-22T00:00:00.000Z", created_by_account_id: null, version: 1, image_role: "DETAIL", color_id: null });
function h06Audit(v: number, before: H06Facts | null, after: H06Facts): H06Facts {
  const op = v === 1 ? h06.operation : sid("operation", 700 + v), actor = sid("account", 624);
  return { id: sid("audit", 800 + v), operation_id: op, actor_account_id: actor, object_type: "PRODUCT", object_id: h06.product, action: v === 1 ? "CREATE" : "EDIT", old_version: v === 1 ? null : v - 1, new_version: v,
    before_values: structuredClone(before), after_values: structuredClone(after), occurred_at: "2026-10-22T00:00:00.000Z", receipt_id: op, receipt_actor: actor, target_type: "PRODUCT", target_id: h06.product, receipt_action: v === 1 ? "CREATE" : "EDIT", status: "COMMITTED",
    request_key: "SYNTHETIC-H06-" + v, request_hash: "c".repeat(64), result_data: { operationId: op, kind: "PRODUCT", targetId: h06.product, version: v }, completed_at: "2026-10-22T00:00:00.000000Z", committed_before: true };
}
interface H06Fixture { root: H06Facts; audits: H06Facts[]; sources: H06Facts[]; skus: H06Facts[]; codes: H06Facts[]; images: H06Facts[]; importSkus: H06Facts[]; importCodes: H06Facts[] }
function h06Native(): H06Fixture {
  const sku = h06Sku(), code = h06Code(), root = h06Root();
  return { root, audits: [h06Audit(1, null, { ...root, skus: [sku], barcodes: [code] })], sources: [], skus: [{ facts: sku, native_creation_valid: true, committed_before: true }], codes: [{ facts: code, committed_before: true }], images: [], importSkus: [], importCodes: [] };
}
function h06Source(type: string, metadata: H06Facts): H06Facts {
  return { id: sid("product", type === "PRODUCT" ? 630 : type === "SKU" ? 631 : 632), batch_id: h06.batch, source_key: "SYNTHETIC-" + type, file_ref: "synthetic.csv", sheet: type, row_no: "2", source_file_sha256: "a".repeat(64), row_sha256: "b".repeat(64), field_provenance: metadata, committed_before: true };
}
function h06Imported(): H06Fixture {
  const fixture = h06Native(), root: H06Facts = { ...h06Root(), default_barcode_scheme_id: null }, sku = h06Sku(null), code = h06Code();
  const proof = createCatalogueSourcePriceProof({ nativeProductId: h06.product, productVersion: 1, rawFields: raw(), blankPricePolicy: "EXPLICIT_NULL_ONLY" });
  fixture.root = { ...root, version: 2, name: "SYNTHETIC EDIT" }; fixture.audits = [h06Audit(2, { version: 1, name: root.name }, { version: 2, name: fixture.root.name })];
  fixture.sources = [{ ...h06Source("PRODUCT", { schema_version: 1, ...proof, fields: { native_product_import: { validator_version: "NATIVE_PRODUCT_IMPORT_V2_EXACT26", schema_profile: "EXACT26", row_fingerprint: "f".repeat(64), native_product: root } } }), raw_fields: raw(), published: true }];
  fixture.skus = [{ facts: sku, native_creation_valid: false, committed_before: true }];
  fixture.importSkus = [{ ...h06Source("SKU", { native_sku_import: { native_sku: sku, native_sku_id: h06.sku, mapping: { oldSourceSkuId: "SYNTHETIC-SKU", canonicalSourceSkuId: "SYNTHETIC-SKU", productSourceId: "SYNTHETIC-PRODUCT", canonicalMemberCount: "1", isRepresentative: "true" }, canonical_source_key: "SYNTHETIC-SKU", validator_version: "NATIVE_SKU_IMPORT_EXACT26_V1", schema_profile: "EXACT26", row_fingerprint: "d".repeat(64),
    references: { product: { nativeId: h06.product }, color: { nativeId: h06.color }, fit: { nativeId: h06.fit }, size: { nativeId: h06.size } } } }), old_source_sku_id: "SYNTHETIC-SKU", canonical_sku_id: h06.sku, canonical_source_key: "SYNTHETIC-SKU", source_row_id: sid("product", 631), bound_record: true }];
  fixture.importCodes = [{ ...h06Source("BARCODE", { native_sku_id: h06.sku, native_barcode: code.barcode, native_barcode_import: { validator_version: "NATIVE_BARCODE_IMPORT_V1", row_fingerprint: "e".repeat(64), native_barcode: code } }) }]; return fixture;
}
function h06Protocol(fixture = h06Native(), override?: (sql: string, rows: H06Facts[]) => H06Facts[]) {
  let active = true, ready = 0; const calls: string[] = [];
  const client: PgSalesClient = { async query(sql, values = []) {
    calls.push(sql); assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|COMMIT|ROLLBACK)\b/);
    let rows: H06Facts[];
    if (sql.includes("maintained-catalogue26:new-capacity")) rows = [{occupied:false}];
    else if (sql.includes("maintained-catalogue26:roots")) rows = [{ ...fixture.root, committed_before: true }];
    else if (sql.includes("maintained-catalogue26:product-source")) { assert.match(sql, /FINAL_COMPLETE_SCOPE/); assert.match(sql, /import_history_closure_manifest/); assert.match(sql, /age\(s.xmin\)/); rows = fixture.sources; }
    else if (sql.includes("maintained-catalogue26:chain")) { assert.equal(values[2], 1025); assert.match(sql, /age\(a.xmin\).*age\(r.xmin\)/s); rows = fixture.audits; }
    else if (sql.includes("maintained-catalogue26:import-skus")) rows = fixture.importSkus;
    else if (sql.includes("maintained-catalogue26:import-barcodes")) rows = fixture.importCodes;
    else if (sql.includes("maintained-catalogue26:skus")) { assert.match(sql, /native_creation_operation_valid\('SKU'/); assert.ok(!sql.includes("native_creation_operation_valid('PRODUCT'")); rows = fixture.skus; }
    else if (sql.includes("maintained-catalogue26:barcodes")) rows = fixture.codes;
    else if (sql.includes("maintained-catalogue26:images")) rows = fixture.images;
    else if (sql.includes("maintained-catalogue26:reference:")) rows = (values[0] as string[]).map(id => ({ facts: { id } }));
    else if (sql.includes("maintained-catalogue26:category")) rows = [{ id: h06.category, parent_id: null, deleted_at: null }];
    else if (sql.includes("maintained-catalogue26:membership")) rows = [{ size_group_id: h06.group, size_id: h06.size }];
    else if (sql.includes("native-catalogue-completeness:source-proof")) { rows = [{ ...evidence(h06.product), product_version: fixture.root.version }]; }
    else throw Error("Unexpected H06 synthetic SQL " + sql);
    rows = structuredClone(override ? override(sql, rows) : rows); return { rows, rowCount: rows.length };
  }, release() { throw Error("Borrowed proof must not release the actual UOW client"); } };
  const runtime: NativeRuntime26Capability = { profile: "EXACT26", contract: "NATIVE_RUNTIME26_V1", async assertReady(target, purpose) { assert.equal(target, client); assert.equal(purpose, "INVENTORY_ADMISSION"); ready++; } };
  const pair = createMaintainedCatalogue26TransactionProof(client, runtime, () => { if (!active) throw Error("SYNTHETIC_SCOPE_CLOSED"); });
  return { client, runtime, pair, calls, checks: () => ready, close: () => { active = false; }, verify: () => pair.verifier.assertComplete({ productIds: [h06.product], query: pair.query }) };
}
test("H06 native CREATE and sparse price/name/image edits reconstruct full facts without inventing NULL or MAIN", async () => {
  const fixture = h06Native(), first = h06Root(), next = { ...first, version: 2, name: "SYNTHETIC CHANGED", minimum_price: "0.00" }, image = h06Image();
  fixture.root = { ...next, version: 3 }; fixture.images = [{ facts: image, committed_before: true }];
  fixture.audits.push(h06Audit(2, { version: 1, name: first.name, minimum_price: null }, { version: 2, name: next.name, minimum_price: "0.00" }), h06Audit(3, { version: 2, images: [] }, { version: 3, images: [image] }));
  const p = h06Protocol(fixture); await p.verify(); assert.equal(p.checks(), 2); assert.ok(!p.calls.some(s => s.includes("native-catalogue-completeness:source-proof")));
  await p.verify(); assert.equal(p.checks(), 4); assert.equal(p.calls.filter(s => s.includes("maintained-catalogue26:roots")).length, 2);
  const noMain = h06Native(); noMain.codes = []; (noMain.audits[0]!.after_values as H06Facts).barcodes = []; await h06Protocol(noMain).verify();
});
test("H06 published full import plus maintenance preserves exact canonical aliases and untouched imported routing", async () => {
  const fixture = h06Imported(), alias = structuredClone(fixture.importSkus[0]!); alias.id = sid("product", 633); alias.source_row_id = alias.id; alias.source_key = "SYNTHETIC-ALIAS"; alias.old_source_sku_id = alias.source_key; const aliasProof = (alias.field_provenance as H06Facts).native_sku_import as H06Facts; aliasProof.mapping = { oldSourceSkuId: alias.source_key, canonicalSourceSkuId: "SYNTHETIC-SKU", productSourceId: "SYNTHETIC-PRODUCT", canonicalMemberCount: "2", isRepresentative: "false" }; (((fixture.importSkus[0]!.field_provenance as H06Facts).native_sku_import as H06Facts).mapping as H06Facts).canonicalMemberCount = "2"; fixture.importSkus.push(alias);
  await h06Protocol(fixture).verify();
  fixture.root = h06Root(); fixture.audits = []; const p = h06Protocol(fixture); await p.verify(); assert.equal(p.calls.filter(s => s.includes("native-catalogue-completeness:source-proof")).length, 1);
  assert.ok(!p.calls.some(s => s.includes("maintained-catalogue26:skus")));
});
test("H06 missing/foreign/mismatched/uncommitted receipt and chain gaps never fallback", async () => {
  const changes: ((f: H06Fixture) => void)[] = [f => { f.audits = []; }, f => { f.audits[0]!.receipt_id = null; }, f => { f.audits[0]!.receipt_actor = sid("account", 999); }, f => { f.audits[0]!.receipt_action = "EDIT"; },
    f => { f.audits[0]!.status = "PREPARED"; }, f => { f.audits[0]!.completed_at = "2026-10-22T00:00:01Z"; }, f => { f.audits[0]!.committed_before = false; }, f => { (f.audits[0]!.result_data as H06Facts).version = 2; },
    f => { f.audits[0]!.before_values = {}; }, f => { delete (f.audits[0]!.after_values as H06Facts).minimum_price; }, f => { f.audits = [h06Audit(2, { version: 1 }, { version: 2 })]; f.root.version = 2; },
    f => { f.root.version = 3; f.audits.push(h06Audit(3, { version: 2 }, { version: 3 })); }, f => { (f.audits[0]!.after_values as H06Facts).not_approved = true; }];
  for (const change of changes) { const fixture = h06Native(); change(fixture); const p = h06Protocol(fixture); await assert.rejects(p.verify()); assert.ok(!p.calls.some(s => s.includes("native-catalogue-completeness:source-proof"))); }
});
test("H06 full terminal root and every SKU/barcode/relationship reject missing, extra, or forged current facts", async () => {
  for (const change of [((f: H06Fixture) => { f.root.name = "UNPROVEN CURRENT"; }), f => { f.skus = []; }, f => { f.skus[0]!.native_creation_valid = false; }, f => { f.skus[0]!.committed_before = false; },
    f => { (f.skus[0]!.facts as H06Facts).size_id = sid("size", 999); }, f => { (f.skus[0]!.facts as H06Facts).enabled = false; }, f => { f.codes = []; }, f => { f.codes.push({ facts: { ...h06Code(), id: sid("barcode", 999), barcode: "UNPROVEN" }, committed_before: true }); },
    f => { f.root.deleted_at = "2026-10-22T00:00:00Z"; }] as ((f: H06Fixture) => void)[]) { const fixture = h06Native(); change(fixture); await assert.rejects(h06Protocol(fixture).verify()); }
  for (const tag of [":reference:color", ":membership", ":category"]) await assert.rejects(h06Protocol(h06Native(), (sql, rows) => sql.includes(tag) ? [] : rows).verify());
});
test("H06 imported baseline rejects STAGED/price-only/raw tamper/ambiguous alias and binding gaps", async () => {
  const mutations: ((f: H06Fixture) => void)[] = [f => { f.sources[0]!.published = false; }, f => { f.sources.push(structuredClone(f.sources[0]!)); }, f => { (f.sources[0]!.field_provenance as H06Facts).fields = {}; },
    f => { f.sources[0]!.raw_fields = { ...raw(), 零售价: "1.26" }; }, f => { f.sources[0]!.row_sha256 = ""; }, f => { f.importSkus[0]!.bound_record = false; }, f => { f.importSkus[0]!.canonical_source_key = "OTHER"; },
    f => { const alias = structuredClone(f.importSkus[0]!); alias.id = sid("product", 640); alias.source_row_id = alias.id; alias.source_key = alias.old_source_sku_id = "ALIAS"; ((alias.field_provenance as H06Facts).native_sku_import as H06Facts).native_sku = { ...h06Sku(null), sku_code: "CONFLICT" }; f.importSkus.push(alias); }, f => { f.importCodes = []; }];
  for (const mutate of mutations) { const fixture = h06Imported(); mutate(fixture); await assert.rejects(h06Protocol(fixture).verify()); }
});
test("H06 legitimate child enable/version deltas and native additions retain identity while missing before-values fail", async () => {
  const fixture = h06Native(), old = h06Sku(), next = { ...old, enabled: false, version: 2 };
  fixture.root.version = 2; fixture.skus = [{ facts: next, native_creation_valid: true, committed_before: true }]; fixture.audits.push(h06Audit(2, { version: 1, skus: [old] }, { version: 2, skus: [next] }));
  await h06Protocol(fixture).verify(); delete (fixture.audits[1]!.before_values as H06Facts).skus; await assert.rejects(h06Protocol(fixture).verify());
  const added = h06Native(), sku2 = { ...h06Sku(sid("operation", 702)), id: sid("sku", 650), sku_code: "SYNTHETIC-NEW", color_id: sid("color", 651) };
  added.root.version = 2; added.skus.push({ facts: sku2, native_creation_valid: true, committed_before: true }); added.audits.push(h06Audit(2, { version: 1, skus: [] }, { version: 2, skus: [sku2] })); await h06Protocol(added).verify();
});
test("H06 1024 complete steps pass; 1025th step fails without a truncated success", async () => {
  const fixture = h06Native();
  for (let v = 2; v <= 1024; v++) fixture.audits.push(h06Audit(v, { version: v - 1, name: v === 2 ? "SYNTHETIC COMPLETE" : "SYNTHETIC " + (v - 1) }, { version: v, name: "SYNTHETIC " + v }));
  fixture.root = { ...fixture.root, version: 1024, name: "SYNTHETIC 1024" }; await h06Protocol(fixture).verify();
  fixture.audits.push(h06Audit(1025, { version: 1024 }, { version: 1025 })); fixture.root.version = 1025; await assert.rejects(h06Protocol(fixture).verify(), /1024 steps/);
});
test("H06 original client/private query pair rejects foreign or copied query, boolean runtime, revoked and closed scope", async () => {
  const p = h06Protocol(), foreign = h06Protocol();
  for (const query of [foreign.pair.query, async (...args: Parameters<typeof p.pair.query>) => p.pair.query(...args)]) await assert.rejects(p.pair.verifier.assertComplete({ productIds: [h06.product], query }));
  const runtime = { ...p.runtime, async assertReady() { return true; } } as unknown as NativeRuntime26Capability;
  const pair = createMaintainedCatalogue26TransactionProof(p.client, runtime, () => {}); await assert.rejects(pair.verifier.assertComplete({ productIds: [h06.product], query: pair.query }), /boolean substitute/);
  const revoked = Error("SYNTHETIC_REVOKED"), rejected = createMaintainedCatalogue26TransactionProof(p.client, { ...p.runtime, async assertReady() { throw revoked; } }, () => {});
  await assert.rejects(rejected.verifier.assertComplete({ productIds: [h06.product], query: rejected.query }), e => e === revoked);
  p.close(); await assert.rejects(p.verify(), /SCOPE_CLOSED/); await assert.rejects(p.pair.query("SELECT 1"), /SCOPE_CLOSED/);
});
test("H06 source errors propagate without fallback, and closing during an in-flight read invalidates the result", async () => {
  const failure = Object.assign(Error("SYNTHETIC_SOURCE_SCHEMA_UNAVAILABLE"), { code: "42703" }); const p = h06Protocol();
  const client: PgSalesClient = { async query() { throw failure; }, release() {} }, runtime: NativeRuntime26Capability = { ...p.runtime, async assertReady() {} };
  const pair = createMaintainedCatalogue26TransactionProof(client, runtime, () => {}); await assert.rejects(pair.verifier.assertComplete({ productIds: [h06.product], query: pair.query }), { code: "NATIVE_CATALOGUE_FACTS_UNAVAILABLE" });
  const unexpected = Error("ORIGINAL_DATABASE_ERROR"), original = createMaintainedCatalogue26TransactionProof({ async query() { throw unexpected; }, release() {} }, runtime, () => {});
  await assert.rejects(original.verifier.assertComplete({ productIds: [h06.product], query: original.query }), e => e === unexpected);
  let active = true; const delayed = createMaintainedCatalogue26TransactionProof({ async query() { active = false; return { rows: [], rowCount: 0 }; }, release() {} }, runtime, () => { if (!active) throw Error("CLOSED_IN_FLIGHT"); });
  await assert.rejects(delayed.verifier.assertComplete({ productIds: [h06.product], query: delayed.query }), /CLOSED_IN_FLIGHT/);
});

test("H06 declared aliases, price evidence and migration defaults fail as unavailable rather than fabricating completeness", async () => {
  for (const mutate of [((f: H06Fixture) => { const proof = ((f.importSkus[0]!.field_provenance as H06Facts).native_sku_import as H06Facts); (proof.mapping as H06Facts).canonicalMemberCount = "2"; }),
    f => { const baseline = (((f.sources[0]!.field_provenance as H06Facts).fields as H06Facts).native_product_import as H06Facts).native_product as H06Facts; baseline.default_barcode_scheme_id = h06.scheme; },
    f => { f.root.minimum_price = undefined; }, f => { (f.sources[0]!.raw_fields as H06Facts).零售价 = ""; }] as ((f: H06Fixture) => void)[]) {
    const fixture = h06Imported(); mutate(fixture); await assert.rejects(h06Protocol(fixture).verify(), { code: "NATIVE_CATALOGUE_FACTS_UNAVAILABLE" });
  }
});
test("H06 refuses immutable SKU changes, version-only audit and excessive nesting", async () => {
  for (const type of ["immutable", "noop", "depth"] as const) {
    const fixture = h06Native(); fixture.root.version = 2; let before: H06Facts = { version: 1 }, after: H06Facts = { version: 2 };
    if (type === "immutable") { const old = h06Sku(), next = { ...old, sku_code: "ILLEGAL", version: 2 }; before.skus = [old]; after.skus = [next]; fixture.skus = [{ facts: next, native_creation_valid: true, committed_before: true }]; }
    if (type === "depth") { let deep: unknown = "synthetic"; for (let i = 0; i < 18; i++) deep = { nested: deep }; after.images = deep; }
    fixture.audits.push(h06Audit(2, before, after)); await assert.rejects(h06Protocol(fixture).verify(), { code: "NATIVE_CATALOGUE_FACTS_UNAVAILABLE" });
  }
});

function a01Completion(oldVersion: number | null = 1): import("../packages/application/src/maintenance-commit-ports.ts").MaintenanceCompletion {
  return {operationId:sid("operation",910), actorAccountId:sid("account",624), kind:"PRODUCT",targetId:h06.product,action:oldVersion===null?"CREATE":"EDIT",requestKey:"SYNTHETIC-A01",requestHash:"a".repeat(64),oldVersion,newVersion:(oldVersion??0)+1,beforeValues:oldVersion===null?null:{version:oldVersion,name:"SYNTHETIC COMPLETE"},afterValues:{version:(oldVersion??0)+1,name:"SYNTHETIC-A01"},completedAt:"2026-10-22T00:00:00.000Z"};
}
test("A01 admission reconstructs same-client committed capacity once and binds exact operation/version and active scope",async()=>{
 const p=h06Protocol();const c=a01Completion();await p.pair.assertPendingCapacity(c);const n=p.calls.length;
 await p.pair.assertPendingCapacity(structuredClone(c));assert.equal(p.calls.length,n);
 await assert.rejects(p.pair.assertPendingCapacity({...c,afterValues:{name:"CHANGED"}}),{code:"PRODUCT_EVIDENCE_CAPACITY_NOT_READY"});
 await assert.rejects(p.pair.assertPendingCapacity({...c,operationId:sid("operation",911)}),{code:"PRODUCT_EVIDENCE_CAPACITY_NOT_READY"});
 assert.equal(p.calls.filter(sql=>sql.includes("maintained-catalogue26:chain")).length,1);
 p.close();await assert.rejects(p.pair.assertPendingCapacity(c),/SYNTHETIC_SCOPE_CLOSED/);
 const broken=h06Native();broken.audits[0]!.receipt_id=null;await assert.rejects(h06Protocol(broken).pair.assertPendingCapacity(c));
});
test("A01 imported baseline and CREATE anchor capacity use original evidence and reject occupied identities",async()=>{
 const imported=h06Protocol(h06Imported());await imported.pair.assertPendingCapacity(a01Completion(2));
 const p=h06Protocol();await p.pair.assertPendingCapacity(a01Completion(null));assert.equal(p.checks(),1);assert.equal(p.calls.length,1);
 await assert.rejects(h06Protocol(h06Native(),(sql,rows)=>sql.includes(":new-capacity")?[{occupied:true}]:rows).pair.assertPendingCapacity(a01Completion(null)),{code:"PRODUCT_EVIDENCE_CAPACITY_NOT_READY"});
});
test("A01 actual proof admits step 1024 and rejects step 1025 without truncating the committed chain",async()=>{
 for(const count of [1023,1024]){
  const f=h06Native();let name=f.root.name;
  for(let v=2;v<=count;v++){const next="SYNTHETIC-"+v;f.audits.push(h06Audit(v,{version:v-1,name},{version:v,name:next}));name=next;}
  f.root={...f.root,version:count,name};const p=h06Protocol(f);
  if(count===1023) await p.pair.assertPendingCapacity(a01Completion(count));
  else await assert.rejects(p.pair.assertPendingCapacity(a01Completion(count)),{code:"PRODUCT_EVIDENCE_CAPACITY_EXCEEDED"});
  assert.equal(p.calls.filter(sql=>sql.includes("maintained-catalogue26:chain")).length,1);
 }
});
