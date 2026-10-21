/** SYNTHETIC source/protocol only; no real import, database or publication. */
import assert from "node:assert/strict";
import test from "node:test";
import { IMPORT_V2_TABLES } from "../packages/application/src/import-v2-contract.ts";
import { CATALOGUE_SOURCE_PRICE_FIELDS } from "../packages/application/src/catalogue-source-proof.ts";
import { prepareProductEvidenceChunk, stageProductEvidenceChunk } from "../packages/application/src/product-evidence-staging.ts";
import type { ProductEvidenceChunk } from "../packages/application/src/product-evidence-staging.ts";
import { PostgresProductEvidenceStagingStore } from "../adapters/postgres/src/product-evidence-staging.ts";
import { sid } from "./support/synthetic-fixtures.ts";
const batchId = sid("product", 400), targetId = sid("product", 401), sourceId = sid("product", 402);
function input(): ProductEvidenceChunk {
  const normalized = Object.fromEntries(IMPORT_V2_TABLES.find(row => row.entity === "PRODUCT")!.columns.map(column => [column.name, column.required ? `SYNTHETIC ${column.name}` : ""]));
  normalized["来源编号"] = "SOURCE-ORIGINAL-NOT-UUID"; normalized["零售价"] = "1.25";
  return { batchId, fixedSourceNamespace: "SYNTHETIC_SOURCE", selection: { baseManifestSha256: "a".repeat(64), selectionSha256: "b".repeat(64), approvalSha256: "c".repeat(64),
    entity: "PRODUCT", source: "BASE_V2", path: "business/01商品.csv", csvSha256: "d".repeat(64) }, rows: [{
      source: { id: sourceId, batchId, entityType: "PRODUCT", sourceKey: normalized["来源编号"]!, fileRef: "synthetic-original.xlsx", sheet: "商品", rowNo: "2",
        sourceFileSha256: "e".repeat(64), rowSha256: "f".repeat(64), rawFields: { ...normalized }, normalizedFields: normalized, fieldProvenance: { schema_version: 1, fields: {} } },
      product: { sourceKey: normalized["来源编号"]!, nativeId: targetId, expectedVersion: 1 }, blankPricePolicy: "V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET"
    }] };
}
function protocol(options: { replay?: boolean; changed?: boolean; missing?: boolean; failInsert?: boolean; commitUnknown?: boolean; priceMismatch?: boolean } = {}) {
  const calls: string[] = []; let release: Error | boolean | undefined; let writes = 0;
  const prices = Object.fromEntries(Object.keys(CATALOGUE_SOURCE_PRICE_FIELDS).map(key => [key, key === "retail_price" ? "1.25" : null]));
  const chunk = input();
  const client = { async query(sql: string, values?: unknown[]) {
    calls.push(sql);
    if (sql === "COMMIT" && options.commitUnknown) throw new Error("SYNTHETIC lost commit acknowledgement");
    if (sql.includes("product-stage:batch")) return { rows: [{ id: batchId, mapping_version: "V2_HISTORY_NULLABLE_1", status: "STAGED", source_hash: chunk.selection.selectionSha256, source_name: chunk.fixedSourceNamespace }], rowCount: 1 };
    if (sql.includes("product-stage:target")) return { rows: options.missing ? [] : [{ id: targetId, version: 1, product_code: chunk.rows[0]!.source.normalizedFields["款号"], name: chunk.rows[0]!.source.normalizedFields["商品名称"] }], rowCount: options.missing ? 0 : 1 };
    if (sql.includes("product-stage:replay-prices")) return { rows: [{ prices_equal: !options.priceMismatch }], rowCount: 1 };
    if (sql.includes("product-stage:replay")) return { rows: options.replay ? [{ source_equal: !options.changed }] : [], rowCount: options.replay ? 1 : 0 };
    if (sql.includes("write-batch")) return { rows: [{ id: batchId, mapping_version: "V2_HISTORY_NULLABLE_1", status: "STAGED" }], rowCount: 1 };
    if (sql.includes("write-target")) return { rows: [{ id: targetId, version: 1, ...prices, ...(options.priceMismatch ? { retail_price: "9.99" } : {}) }], rowCount: 1 };
    if (sql.includes("write-proof")) {
      writes++; if (options.failInsert) throw new Error("SYNTHETIC immutable insert failure");
      const metadata = JSON.parse(values![10] as string); assert.equal(metadata.native_product_id, targetId);
      assert.equal(metadata.fields.product_staging.selection.selectionSha256, chunk.selection.selectionSha256);
      assert.equal(metadata.product_input_proof.prices.minimum_price, null);
      return { rows: [{ id: sourceId }], rowCount: 1 };
    }
    return { rows: [], rowCount: null };
  }, release(error?: Error | boolean) { release = error; } };
  let connects = 0;
  const store = new PostgresProductEvidenceStagingStore({ async connect() { connects++; return client; } });
  return { store, calls, writes: () => writes, connects: () => connects, discarded: () => release };
}
test("PRODUCT staging default DRY_RUN never connects or publishes; explicit STAGE requires exact-source authorizer", async () => {
  const h = protocol(); assert.deepEqual(await stageProductEvidenceChunk(input(), { store: h.store }), { mode: "DRY_RUN", rows: 1, inserted: 0, replayed: 0, published: false, importReady: false });
  assert.equal(h.connects(), 0); await assert.rejects(stageProductEvidenceChunk(input(), { mode: "STAGE", store: h.store }), { code: "PRODUCT_STAGE_AUTHORIZATION_REQUIRED" });
  assert.equal(h.connects(), 0);
});
test("PRODUCT staging rejects missing raw9 key, changed approved-price values unsupported by this proof, false native mapping and duplicate target", () => {
  const absent = structuredClone(input()); delete absent.rows[0]!.source.rawFields["最低售价"];
  assert.throws(() => prepareProductEvidenceChunk(absent), { code: "INCOMPLETE_CATALOGUE_PRICE_INPUT" });
  const changed = structuredClone(input()); changed.rows[0]!.source.normalizedFields["零售价"] = "1.26";
  assert.throws(() => prepareProductEvidenceChunk(changed), { code: "PRODUCT_STAGE_PRICE_TRANSFORMATION_UNSUPPORTED" });
  const foreign = input(); assert.throws(() => prepareProductEvidenceChunk({ ...foreign, rows: [{ ...foreign.rows[0]!, product: { ...foreign.rows[0]!.product, sourceKey: "OTHER" } }] }), { code: "PRODUCT_STAGE_BINDING" });
  const duplicate = input(); assert.throws(() => prepareProductEvidenceChunk({ ...duplicate, rows: [duplicate.rows[0]!, duplicate.rows[0]!] }), { code: "PRODUCT_STAGE_DUPLICATE" });
});
test("PRODUCT stage invokes real proof writer atomically using cutoff→batch→actual native binding and never publication", async () => {
  const h = protocol(); let authorized = false;
  const result = await stageProductEvidenceChunk(input(), { mode: "STAGE", store: h.store, async authorize(chunk) { assert.equal(chunk.rows[0]!.product.nativeId, targetId); authorized = true; } });
  assert.equal(authorized, true); assert.equal(result.inserted, 1); assert.equal(result.published, false); assert.equal(h.writes(), 1);
  assert.equal(h.calls[0], "BEGIN ISOLATION LEVEL READ COMMITTED"); assert.match(h.calls[1]!, /cutoff_import_lock/); assert.match(h.calls[2]!, /FOR UPDATE/);
  assert.equal(h.calls.at(-1), "COMMIT"); assert.ok(!h.calls.some(sql => /UPDATE naijue_erp.import_batch|INSERT INTO naijue_erp.product\b/.test(sql)));
});
test("PRODUCT exact replay is insert-free, changed/stale replay and missing native product fail with rollback", async () => {
  const exact = protocol({ replay: true }); assert.deepEqual(await exact.store.stage(prepareProductEvidenceChunk(input())), { inserted: 0, replayed: 1 }); assert.equal(exact.writes(), 0);
  for (const opts of [{ replay: true, changed: true }, { replay: true, priceMismatch: true }, { missing: true }, { priceMismatch: true }, { failInsert: true }]) {
    const h = protocol(opts); await assert.rejects(h.store.stage(prepareProductEvidenceChunk(input()))); assert.equal(h.calls.at(-1), "ROLLBACK"); assert.ok(!h.calls.includes("COMMIT"));
  }
});
test("PRODUCT commit uncertainty discards connection and never automatically retries", async () => {
  const h = protocol({ commitUnknown: true }); await assert.rejects(h.store.stage(prepareProductEvidenceChunk(input())), /lost commit/);
  assert.equal(h.connects(), 1); assert.ok(h.discarded() instanceof Error); assert.equal(h.writes(), 1);
});
test("PRODUCT SQL boundary rejects altered prepared chunk before acquiring a connection", async () => {
  const h = protocol(); const chunk = prepareProductEvidenceChunk(input());
  await assert.rejects(h.store.stage({ ...chunk, fingerprint: "0".repeat(64) }), { code: "PRODUCT_STAGE_CHANGED" }); assert.equal(h.connects(), 0);
});
