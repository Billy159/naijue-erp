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
