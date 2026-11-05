/** TEST ONLY: constructs a lawful synthetic published-source prerequisite for
 * native SALE acceptance. NOT historical/native import lifecycle acceptance.
 * No migrations, production adapters, constraints or receipt/audit writers are
 * replaced. Uses the formal V2 metadata DTO and unmodified driver protocol;
 * independent application reconciliation and original SQL guards both run. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { insertValidatedCatalogueSourceProof } from "../../adapters/postgres/src/catalogue-completeness.ts";
import { PostgresCutoffImportStore } from "../../adapters/postgres/src/inventory-cutoff-import-store.ts";
import type { PgSalesPool, PgSalesClient } from "../../adapters/postgres/src/sales-unit-of-work.ts";
import { PostgresPartyUnitOfWork } from "../../adapters/postgres/src/party-maintenance-store.ts";
import { createPartyMaintenanceService } from "../../packages/application/src/party-maintenance-service.ts";
import { createSourcePartyAuthorization } from "../../packages/application/src/party-maintenance-policy.ts";
import { createApprovedPartyCodeAllocator } from "../../packages/application/src/party-numbering.ts";
import { createCutoffImportService } from "../../packages/application/src/inventory-cutoff-import.ts";
import type { CutoffImportCommand } from "../../packages/application/src/inventory-cutoff-import.ts";
import { CATALOGUE_PRICE_KEYS } from "../../packages/application/src/catalogue-price-input.ts";
import { createCatalogueSourcePriceProof } from "../../packages/application/src/catalogue-source-proof.ts";
import { syntheticId, SYNTHETIC_PASSWORD_SENTINEL } from "./fixtures.ts";
import type { EntityKind } from "../../packages/domain/src/values.ts";

export const SALE_TIME = "2026-10-21T12:00:00.000Z";
export const saleIds = Object.freeze({ hall: syntheticId("hall", 100001), warehouse: syntheticId("warehouse", 100002),
  staff: syntheticId("staff", 100003), account: syntheticId("account", 100004),
  maintainerStaff: syntheticId("staff", 100005), maintainerAccount: syntheticId("account", 100006),
  customer: syntheticId("customer", 100007), supplier: syntheticId("supplier", 100008), category: syntheticId("category", 100009),
  color: syntheticId("color", 100010), fit: syntheticId("fit", 100011), size: syntheticId("size", 100012), group: syntheticId("sizeGroup", 100013),
  product: syntheticId("product", 100014), sku: syntheticId("sku", 100015), barcode: syntheticId("barcode", 100016),
  method: syntheticId("paymentMethod", 100017), payment: syntheticId("paymentAccount", 100018), batch: syntheticId("operation", 100019) });
export const saleActor = Object.freeze({ accountId: saleIds.account, hallId: saleIds.hall });
export const HISTORY_TABLES = ["history_sales_header", "history_sales_line", "history_sales_settlement", "history_transfer_header",
  "history_transfer_line", "import_source_row", "import_sku_alias", "import_stock_contributor"] as const;
export const SALE_HISTORY_COUNTS = Object.freeze({ history_sales_header: 0, history_sales_line: 0, history_sales_settlement: 0,
  history_transfer_header: 0, history_transfer_line: 0, import_source_row: 3, import_sku_alias: 1, import_stock_contributor: 0, barcodes: 1 });
export const SALE_IMPORT_COUNTS = Object.freeze({ WAREHOUSE: 1, SKU: 1, INVENTORY_LEDGER: 0, IMPORT_BATCH: 1 });
export const SALE_SOURCE_NAMESPACE = "synthetic-native-sale-schema11";
export const SALE_SOURCE_SHA256 = "2b2febc9dd224f21982842c34e1bfcca935d0ba66e1c5ba05ac8e5eba24d1c02";
export const SALE_SOURCE_REF = "tests/integration/fixtures/native-sales-schema11-source.ndjson";
const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
export async function readNativeSalesSchema11Source() {
  const bytes = await readFile(new URL("./fixtures/native-sales-schema11-source.ndjson", import.meta.url));
  assert.equal(sha256(bytes), SALE_SOURCE_SHA256, "Frozen synthetic SALE source bytes changed; review before connecting");
  const lines = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trimEnd().split("\n");
  assert.equal(lines.length, 4);
  const rows = lines.map((line, index) => ({ raw: JSON.parse(line) as Record<string, unknown>, rowNo: String(index + 1), rowSha256: sha256(line) }));
  assert.deepEqual(rows.map(row => row.raw.entity), ["PRODUCT", "SKU", "BARCODE", "WAREHOUSE"]);
  return { sourceFileSha256: sha256(bytes), rows, product: rows[0]!, sku: rows[1]!, barcode: rows[2]!, warehouse: rows[3]! };
}
export type SaleSource = Awaited<ReturnType<typeof readNativeSalesSchema11Source>>;
const originalFields = (raw: Readonly<Record<string, unknown>>) => Object.fromEntries(Object.entries(raw).map(([key, value]) =>
  [key, { origin: "ORIGINAL", raw: value, reason: "Exact synthetic NDJSON field; no real intake or production claim" }]));

/** These counts are queried, never copied from expected. The original publication
 * trigger independently checks counts, barcode reconciliation, aliases and proof. */
export async function assertNativeSaleHistoryCounts(query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>) {
  const counts: Record<string, number> = {};
  for (const table of HISTORY_TABLES) counts[table] = Number((await query(`SELECT count(*)::integer AS n FROM naijue_erp.${table} WHERE batch_id=$1`, [saleIds.batch])).rows[0]!.n);
  counts.barcodes = Number((await query(`SELECT count(*)::integer AS n FROM naijue_erp.import_source_row s
    JOIN naijue_erp.sku_barcode b ON b.barcode=s.field_provenance->>'native_barcode' AND b.sku_id::text=s.field_provenance->>'native_sku_id'
    WHERE s.batch_id=$1 AND s.entity_type='BARCODE'`, [saleIds.batch])).rows[0]!.n);
  assert.deepEqual(counts, SALE_HISTORY_COUNTS, "independently counted complete synthetic history scope");
  await query("SELECT naijue_erp.validate_history_product_proofs($1::uuid)", [saleIds.batch]);
  return counts;
}

function importer(pool: PgSalesPool, source: SaleSource) {
  return createCutoffImportService({ store: new PostgresCutoffImportStore(pool), now: () => SALE_TIME,
    authorization: { async assertAllowed(account, command) {
      assert.equal(account, saleIds.account); assert.equal(command.batchId, saleIds.batch);
      if (command.action === "IMPORT_STAGE") {
        assert.equal(command.sourceName, SALE_SOURCE_NAMESPACE); assert.equal(command.sourceHash, source.sourceFileSha256);
        assert.equal(command.sourceManifestRef, SALE_SOURCE_REF); assert.deepEqual(command.expected, SALE_IMPORT_COUNTS);
        assert.deepEqual(command.historyMetadata, { expectedCounts: SALE_HISTORY_COUNTS, payloadHash: source.sourceFileSha256 });
      }
    } } });
}
/** Never retry or disguise uncertain COMMIT acknowledgement. Before COMMIT,
 * failed work is rolled back; failed rollback/unknown COMMIT discards its client. */
export async function runSaleFixtureTransaction<T>(pool: PgSalesPool, work: (client: PgSalesClient) => Promise<T>): Promise<T> {
  const client = await pool.connect(); let began = false, commitAttempted = false, discard = false;
  try {
    await client.query("BEGIN"); began = true;
    const result = await work(client); commitAttempted = true; await client.query("COMMIT"); return result;
  } catch (error) {
    if (commitAttempted || !began) discard = true;
    else try { await client.query("ROLLBACK"); } catch (rollbackError) {
      discard = true; throw new AggregateError([error, rollbackError], "Synthetic fixture work and rollback failed; owned client discarded");
    }
    throw error;
  } finally { client.release(discard); }
}
/** The real application validates this DTO before any store connection. */
export function nativeSalesSchema11StageCommand(source: SaleSource): Extract<CutoffImportCommand, { readonly action: "IMPORT_STAGE" }> {
  return { action: "IMPORT_STAGE", actorAccountId: saleIds.account,
    batchId: saleIds.batch, requestKey: "SALE_FIXTURE_STAGE", sourceName: SALE_SOURCE_NAMESPACE, sourceHash: source.sourceFileSha256,
    sourceManifestRef: SALE_SOURCE_REF, cutoffAt: SALE_TIME, mappingVersion: "V2_HISTORY_NULLABLE_1", expected: SALE_IMPORT_COUNTS,
    historyMetadata: { expectedCounts: SALE_HISTORY_COUNTS, payloadHash: source.sourceFileSha256 } };
}
export async function seedNativeSalesSchema11Fixture(pool: Pool): Promise<SaleSource> {
  assert.deepEqual((await pool.query("SELECT version FROM naijue_erp.schema_migration ORDER BY version")).rows.map(row => row.version), [1,2,3,4,5,6,7,8,9,10,11]);
  for (const table of ["product", "sku", "import_batch", "sales_header", "inventory_balance", "inventory_ledger"])
    assert.equal((await pool.query(`SELECT count(*)::integer AS n FROM naijue_erp.${table}`)).rows[0]!.n, 0);
  const source = await readNativeSalesSchema11Source();
  await runSaleFixtureTransaction(pool, async client => {
    await client.query("INSERT INTO naijue_erp.hall(id,name,enabled,version) VALUES($1,'SYNTHETIC SALE HALL',true,1)", [saleIds.hall]);
    assert.equal(source.warehouse.raw["所属厅来源编号"], "SYNTHETIC-HALL-1"); assert.equal(source.warehouse.raw["状态"], "正常");
    await client.query("INSERT INTO naijue_erp.warehouse(id,hall_id,name,enabled,version) VALUES($1,$2,$3,true,1)", [saleIds.warehouse, saleIds.hall, source.warehouse.raw["仓库名称"]]);
    await client.query(`INSERT INTO naijue_erp.staff(id,name,hall_id,role,employment_status,version)
      VALUES($1,'SYNTHETIC SALE ACTOR',$2,'SALESPERSON','在职',1),($3,'SYNTHETIC MAINTAINER',NULL,'WAREHOUSE','在职',1)`, [saleIds.staff, saleIds.hall, saleIds.maintainerStaff]);
    // Enabled stored action identity with a NON-HASH sentinel: authentication is
    // synthetic and cannot perform password login. This is not login acceptance.
    await client.query(`INSERT INTO naijue_erp.user_account(id,staff_id,login_name,password_hash,login_enabled,auth_version,version,created_at,updated_at)
      VALUES($1,$2,'SYNTHETIC_SALE_NONPASSWORD',$3,true,1,1,$4,$4),($5,$6,'SYNTHETIC_SALE_MAINTAINER',$3,false,1,1,$4,$4)`,
      [saleIds.account, saleIds.staff, SYNTHETIC_PASSWORD_SENTINEL, SALE_TIME, saleIds.maintainerAccount, saleIds.maintainerStaff]);
    await client.query("INSERT INTO naijue_erp.product_category(id,name,display_order,version) VALUES($1,'SYNTHETIC SALE CATEGORY',1,1)", [saleIds.category]);
    await client.query("INSERT INTO naijue_erp.color(id,code,name,enabled,version) VALUES($1,'SYN_SALE_COLOR','合成颜色',true,1)", [saleIds.color]);
    await client.query("INSERT INTO naijue_erp.fit(id,code,name,enabled,version) VALUES($1,'Z','合成版型',true,1)", [saleIds.fit]);
    await client.query("INSERT INTO naijue_erp.size(id,code,name) VALUES($1,'SYN_SALE_SIZE','合成尺码')", [saleIds.size]);
    await client.query("INSERT INTO naijue_erp.size_group(id,code,name) VALUES($1,'SYN_SALE_GROUP','合成尺码组')", [saleIds.group]);
    await client.query("INSERT INTO naijue_erp.size_group_member(size_group_id,size_id,display_order) VALUES($1,$2,1)", [saleIds.group, saleIds.size]);
    await client.query("INSERT INTO naijue_erp.payment_method(id,name,enabled,version) VALUES($1,'SYNTHETIC SALE METHOD',true,1)", [saleIds.method]);
    await client.query("INSERT INTO naijue_erp.payment_account(id,name,payment_method_id,enabled,version) VALUES($1,'SYNTHETIC SALE PAYMENT',$2,true,1)", [saleIds.payment, saleIds.method]);
    await client.query("INSERT INTO naijue_erp.payment_account_hall(payment_account_id,hall_id) VALUES($1,$2)", [saleIds.payment, saleIds.hall]);
  });
  let sequence = 110000;
  const parties = createPartyMaintenanceService({ unitOfWork: new PostgresPartyUnitOfWork(pool), authorization: createSourcePartyAuthorization(),
    codes: createApprovedPartyCodeAllocator(), now: () => SALE_TIME,
    newId: <K extends EntityKind>(kind: K) => syntheticId(kind, kind === "customer" ? 100007 : kind === "supplier" ? 100008 : sequence++) });
  const maintainer = { accountId: saleIds.maintainerAccount, hallId: null, role: "WAREHOUSE" as const };
  const customer = await parties.execute({ actor: maintainer, kind: "CUSTOMER", action: "CREATE", name: "SYNTHETIC SALE CUSTOMER", requestKey: "SALE_REFERENCE_CUSTOMER" });
  const supplier = await parties.execute({ actor: maintainer, kind: "SUPPLIER", action: "CREATE", name: "SYNTHETIC SALE SUPPLIER", requestKey: "SALE_REFERENCE_SUPPLIER" });
  assert.equal(customer.partyId, saleIds.customer); assert.equal(supplier.partyId, saleIds.supplier);
  await importer(pool, source).execute(nativeSalesSchema11StageCommand(source));
  await runSaleFixtureTransaction(pool, async catalogue => {
    await catalogue.query("SELECT naijue_erp.cutoff_import_lock()"); // Source/native creation uses publication lock order.
    const query = (sql: string, values?: unknown[]) => catalogue.query(sql, values);
    const proof = createCatalogueSourcePriceProof({ nativeProductId: saleIds.product, productVersion: 1, rawFields: source.product.raw,
      blankPricePolicy: "V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET" });
    await catalogue.query(`INSERT INTO naijue_erp.product(id,product_code,name,category_id,supplier_id,size_group_id,${CATALOGUE_PRICE_KEYS.join(",")},enabled,version)
      VALUES($1,$2,$3,$4,$5,$6,${CATALOGUE_PRICE_KEYS.map((_, index) => `$${index + 7}::numeric`).join(",")},true,1)`,
      [saleIds.product, source.product.raw["款号"], source.product.raw["商品名称"], saleIds.category, supplier.partyId, saleIds.group,
        ...CATALOGUE_PRICE_KEYS.map(key => proof.product_input_proof.prices[key])]);
    await insertValidatedCatalogueSourceProof(query, { sourceRowId: syntheticId("product", 100020), batchId: saleIds.batch,
      nativeProductId: saleIds.product, sourceKey: String(source.product.raw["来源编号"]), fileRef: SALE_SOURCE_REF, sheet: "SYNTHETIC_NDJSON", rowNo: source.product.rowNo,
      sourceFileSha256: source.sourceFileSha256, rowSha256: source.product.rowSha256, rawFields: source.product.raw, normalizedFields: source.product.raw,
      fields: originalFields(source.product.raw), blankPricePolicy: "V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET" });
    await catalogue.query(`INSERT INTO naijue_erp.sku(id,product_id,color_id,fit_id,size_id,sku_code,enabled,version) VALUES($1,$2,$3,$4,$5,$6,true,1)`,
      [saleIds.sku, saleIds.product, saleIds.color, saleIds.fit, saleIds.size, source.sku.raw["SKU编码"]]);
    for (const [row, sourceId, metadata] of [
      [source.sku, syntheticId("product", 100021), { native_sku_id: saleIds.sku }],
      [source.barcode, syntheticId("product", 100022), { native_sku_id: saleIds.sku, native_barcode: source.barcode.raw["条码"] }]
    ] as const) await catalogue.query(`INSERT INTO naijue_erp.import_source_row(id,batch_id,entity_type,source_key,file_ref,sheet,row_no,source_file_sha256,row_sha256,raw_fields,normalized_fields,field_provenance)
      VALUES($1,$2,$3,$4,$5,'SYNTHETIC_NDJSON',$6::bigint,$7,$8,$9::jsonb,$9::jsonb,$10::jsonb)`,
      [sourceId, saleIds.batch, row.raw.entity, row.raw["来源编号"], SALE_SOURCE_REF, row.rowNo, source.sourceFileSha256, row.rowSha256, JSON.stringify(row.raw),
        JSON.stringify({ schema_version: 1, fields: originalFields(row.raw), ...metadata })]);
    await catalogue.query(`INSERT INTO naijue_erp.import_sku_alias(batch_id,old_source_sku_id,canonical_sku_id,source_row_id,canonical_source_key,mapping_basis)
      VALUES($1,$2,$3,$4,$5,'EXACT_SYNTHETIC_SOURCE_BINDING')`, [saleIds.batch, source.sku.raw["来源编号"], saleIds.sku, syntheticId("product", 100021), source.sku.raw["规范SKU来源编号"]]);
    assert.equal(source.barcode.raw["条码性质"], "主码"); assert.equal(source.barcode.raw["状态"], "正常");
    await catalogue.query("INSERT INTO naijue_erp.sku_barcode(id,barcode,sku_id,barcode_kind,scheme_id,enabled) VALUES($1,$2,$3,'MAIN',NULL,true)",
      [saleIds.barcode, source.barcode.raw["条码"], saleIds.sku]);
  });
  await importer(pool, source).execute({ action: "IMPORT_CHUNK", actorAccountId: saleIds.account, batchId: saleIds.batch,
    requestKey: "SALE_FIXTURE_MEMBERS", expectedSequence: 0, expectedCursor: 0, items: [
      { targetType: "WAREHOUSE", targetId: saleIds.warehouse, sourceEntityType: "WAREHOUSE", sourceKey: String(source.warehouse.raw["来源编号"]), sourceRecordHash: source.warehouse.rowSha256, sourceFileRef: SALE_SOURCE_REF },
      { targetType: "SKU", targetId: saleIds.sku, sourceEntityType: "SKU", sourceKey: String(source.sku.raw["规范SKU来源编号"]), sourceRecordHash: source.sku.rowSha256, sourceFileRef: SALE_SOURCE_REF }
    ] });
  // Actual party service output was checked against explicit fixture bindings.
  assert.notEqual(customer.partyId, supplier.partyId);
  return source;
}
export async function publishNativeSalesSchema11Fixture(pool: Pool, source: SaleSource) {
  const command: CutoffImportCommand = { action: "IMPORT_PUBLISH", actorAccountId: saleIds.account, batchId: saleIds.batch,
    requestKey: "SALE_FIXTURE_PUBLISH", expectedSequence: 1, expectedCursor: 2, approval: { completeScope: true, absentMeansZero: true,
      allFilesVerified: true, finalDeltaVerified: true, noUnresolvedExceptions: true, sourceHash: source.sourceFileSha256, sourceManifestRef: SALE_SOURCE_REF } };
  await assertNativeSaleHistoryCounts((sql, parameters) => pool.query(sql, parameters)); // Extra fixture observation, not a publication grant.
  const result = await importer(pool, source).execute(command);
  assert.equal(result.status, "IMPORTED");
  assert.deepEqual((await pool.query("SELECT history_expected_counts,history_actual_counts,history_validation_passed FROM naijue_erp.import_batch WHERE id=$1", [saleIds.batch])).rows,
    [{ history_expected_counts: SALE_HISTORY_COUNTS, history_actual_counts: SALE_HISTORY_COUNTS, history_validation_passed: true }]);
  return result;
}
