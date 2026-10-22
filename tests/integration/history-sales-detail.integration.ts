/** Actual immutable historical SALES_LINE staging; deliberately no publication or live stock. */
import test from "node:test";
import assert from "node:assert/strict";
import { integrationSettings } from "./safety.ts";
import { openFreshHistoryTypedDatabase } from "./history-typed-database.ts";
import { assertNativeImportAccountingGuards } from "../../adapters/postgres/src/native-import-accounting-capability.ts";
import { engineFixtures, ENGINE_NAMESPACE, ENGINE_TIME, id } from "./native-import-accounting-fixture.ts";
import { IMPORT_V2_TABLES } from "../../packages/application/src/import-v2-contract.ts";
import { prepareNativePartyImportChunk } from "../../packages/application/src/native-party-import.ts";
import type { NativePartyImportInput } from "../../packages/application/src/native-party-import.ts";
import { prepareNativeCatalogueImportChunk } from "../../packages/application/src/native-catalogue-import.ts";
import { prepareNativeProductImportChunk } from "../../packages/application/src/native-product-import.ts";
import { prepareNativeSkuImport } from "../../packages/application/src/native-sku-import.ts";
import { prepareNativeStockGroup } from "../../packages/application/src/native-stock-contributor-import.ts";
import { PostgresNativePartyImportStore } from "../../adapters/postgres/src/native-party-import.ts";
import { PostgresNativeCatalogueImportStore } from "../../adapters/postgres/src/native-catalogue-import.ts";
import { PostgresNativeProductImportStore } from "../../adapters/postgres/src/native-product-import.ts";
import { PostgresNativeSkuImportStore } from "../../adapters/postgres/src/native-sku-import.ts";
import { PostgresNativeStockContributorStore } from "../../adapters/postgres/src/native-stock-contributor-import.ts";
import { expectExactSqlFailure } from "./database.ts";
import { PostgresCutoffImportStore } from "../../adapters/postgres/src/inventory-cutoff-import-store.ts";
import { PostgresV3HistoryHeaderStagingStore } from "../../adapters/postgres/src/import-v3-history-header-staging-store.ts";
import { PostgresHistorySalesDetailStagingStore, createPostgresHistorySalesDetailBindingResolver } from "../../adapters/postgres/src/import-v3-history-sales-detail-staging-store.ts";
import { prepareV3HistoryHeaderChunk } from "../../packages/application/src/import-v3-history-header-staging.ts";
import type { HistoryHeaderInput } from "../../packages/application/src/import-v3-history-header.ts";
import { prepareHistorySalesDetailChunk } from "../../packages/application/src/import-v3-history-sales-detail.ts";
import { syntheticSalesDetailChunk } from "../support/synthetic-sales-detail-fixtures.ts";
import { entityId } from "../../packages/domain/src/values.ts";
import type { PgSalesPool } from "../../adapters/postgres/src/sales-unit-of-work.ts";
import type { JsonObject } from "../../packages/application/src/history-storage-contract.ts";

const hash = "a".repeat(64), selectionHash = "b".repeat(64);
const provenance = (raw: JsonObject): JsonObject => ({ schema_version: 1,
  fields: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, { origin: "ORIGINAL", reason: "Exact synthetic original cell", raw: v }])) });

test("fresh PG16 historical header → read-only exact resolver → SALES_LINE staging/replay, original values retained", async t => {
  assert.equal(process.env.NAIJUE_PG_TEST_SUITE, "history-sales-detail-0001-0016", "Explicit independent PhaseA suite required");
  const database = await openFreshHistoryTypedDatabase(integrationSettings(process.env));
  try {
    const pool = database.pool, f = engineFixtures();
    const capabilityClient = await pool.connect();
    try { await assertNativeImportAccountingGuards(capabilityClient); } finally { capabilityClient.release(); }
    const customerFields = Object.fromEntries(IMPORT_V2_TABLES.find(table => table.entity === "CUSTOMER")!.columns.map(c => [c.name, ""]));
    Object.assign(customerFields, { 来源编号: "CUSTOMER-1", 原编码: "SYNTHETIC-CUST-1", 名称: "SYNTHETIC CUSTOMER", 状态: "正常" });
    const customer: NativePartyImportInput = { batchId: id(1), fixedSourceNamespace: ENGINE_NAMESPACE,
      selection: { baseManifestSha256: hash, selectionSha256: selectionHash, approvalSha256: hash, csvSha256: hash,
        entity: "CUSTOMER", source: "BASE_V2", path: "business/04客户.csv" },
      source: { id: id(1070), batchId: id(1), entityType: "CUSTOMER", sourceKey: "CUSTOMER-1", fileRef: "synthetic-customer.xlsx",
        sheet: "CUSTOMER", rowNo: "2", sourceFileSha256: hash, rowSha256: hash, rawFields: customerFields,
        normalizedFields: customerFields, fieldProvenance: provenance(customerFields) },
      nativeSnapshot: { id: id(70), code: "SYNTHETIC-CUST-1", name: "SYNTHETIC CUSTOMER", enabled: true,
        version: 1, created_at: null, updated_at: null },
      enumMappings: { 状态: { raw: "正常", native: true, evidenceRef: "synthetic-exact-state-mapping" } }, bindings: {} };
    const n = Object.fromEntries(IMPORT_V2_TABLES.find(table => table.entity === "SALES_HEADER")!.columns.map(c => [c.name, ""]));
    Object.assign(n, { 来源编号: "HISTORY-SALES-1", 原单号: "0000123", 业务日期: "2024-02-29", 原审核状态: "已审核",
      创建厅归属来源: "UNKNOWN", 创建厅归属原因: "UNKNOWN_ORIGINAL_CREATOR_UNMATCHED", 单据类型: "销售",
      所属厅来源编号: "HALL-1", 客户来源编号: "CUSTOMER-1", 仓库来源编号: "WH-1",
      优惠前金额: "10.00", 整单优惠: "1", 应结金额: "8.50" });
    const raw = { ...n }; delete raw["创建厅归属来源"]; delete raw["创建厅归属原因"];
    const headerInput: HistoryHeaderInput = { batchId: id(1), fixedSourceNamespace: ENGINE_NAMESPACE,
      selection: { baseManifestSha256: hash, selectionSha256: selectionHash, approvalSha256: hash, csvSha256: hash,
        source: "BASE_V2", entity: "SALES_HEADER", path: "business/13历史销货单头.csv" },
      source: { id: id(1600), batchId: id(1), entityType: "SALES_HEADER", sourceKey: "HISTORY-SALES-1", fileRef: "synthetic-header.xlsx",
        sheet: "HEADER", rowNo: "2", sourceFileSha256: hash, rowSha256: hash, rawFields: raw, normalizedFields: n, fieldProvenance: provenance(raw) },
      bindings: { 所属厅来源编号: { sourceKey: "HALL-1", nativeId: id(10) }, 客户来源编号: { sourceKey: "CUSTOMER-1", nativeId: id(70) },
        仓库来源编号: { sourceKey: "WH-1", nativeId: id(40) } },
      creatorHallOverlay: { evidenceRef: "synthetic-reviewed-unknown-creator.csv#2", file: "synthetic-header.xlsx", sheet: "HEADER", row: "2",
        sourceId: "HISTORY-SALES-1", documentNumber: "0000123", personField: "营业员来源编号", personId: "",
        uploadedWarehouseDerivedHall: "", candidateCreatorHall: "", provenance: "UNKNOWN", reason: "UNKNOWN_ORIGINAL_CREATOR_UNMATCHED" } };
    const headerChunk = prepareV3HistoryHeaderChunk([headerInput]), header = headerChunk.rows[0]!.prepared.header;
    const baseLine = syntheticSalesDetailChunk(), baseSource = baseLine.rows[0]!.source;
    const lineRaw: JsonObject = { ...baseSource.rawFields, 单据来源编号: "HISTORY-SALES-1", SKU来源编号: id(11) };
    const lineEffective: JsonObject = { ...baseSource.normalizedFields, 单据来源编号: "HISTORY-SALES-1", SKU来源编号: id(10) };
    const source = { ...baseSource, id: id(1601), rawFields: lineRaw, normalizedFields: lineEffective, fieldProvenance: provenance(lineRaw) };
    const query = { entity: "SALES_LINE" as const, sourceKey: source.sourceKey, rawFields: lineRaw, normalizedFields: lineEffective };
    const resolve = createPostgresHistorySalesDetailBindingResolver(pool, { batchId: id(1), fixedSourceNamespace: ENGINE_NAMESPACE, selectionSha256: selectionHash });
    const count = async (table: string) => (await pool.query(`SELECT count(*)::integer n FROM naijue_erp.${table}`)).rows[0]!.n;
    await t.test("actual imported native dependencies and original header preserve unknown identities/times and imbalanced money", async () => {
      await pool.query("INSERT INTO naijue_erp.staff(id,name,role,employment_status,version) VALUES($1,'SYNTHETIC NONLOGIN HISTORY ACTOR','WAREHOUSE','在职',1)", [id(801)]);
      await pool.query(`INSERT INTO naijue_erp.user_account(id,staff_id,login_name,password_hash,login_enabled,auth_version,version,created_at,updated_at)
        VALUES($1,$2,'SYNTHETIC_HISTORY_NONLOGIN','SYNTHETIC_DISABLED_NONLOGIN_NOT_A_PASSWORD_HASH',false,1,1,$3,$3)`, [id(802), id(801), ENGINE_TIME]);
      await new PostgresCutoffImportStore(pool).execute({ action: "IMPORT_STAGE", actorAccountId: entityId("account", id(802)), batchId: id(1), requestKey: "HISTORY-STAGE",
        sourceName: ENGINE_NAMESPACE, sourceManifestRef: "synthetic:exact-history-fixture-v1", sourceHash: selectionHash, cutoffAt: "2026-10-20T00:00:00Z",
        mappingVersion: "V2_HISTORY_NULLABLE_1", expected: { WAREHOUSE: 1, SKU: 1, INVENTORY_LEDGER: 1, IMPORT_BATCH: 1 },
        historyMetadata: { expectedCounts: { import_source_row: 16, import_sku_alias: 2, import_stock_contributor: 2, barcodes: 0,
          history_sales_header: 1, history_sales_line: 1, history_sales_settlement: 0, history_transfer_header: 0, history_transfer_line: 0 }, payloadHash: hash } }, ENGINE_TIME);
      await new PostgresNativePartyImportStore(pool).stage(prepareNativePartyImportChunk([...f.parties, customer]));
      await new PostgresNativeCatalogueImportStore(pool).stage(prepareNativeCatalogueImportChunk(f.catalogue));
      await new PostgresNativeProductImportStore(pool).stage(prepareNativeProductImportChunk(f.product));
      await new PostgresNativeSkuImportStore(pool).stage(prepareNativeSkuImport(f.sku));
      const store = new PostgresV3HistoryHeaderStagingStore(pool);
      assert.deepEqual(await store.stage(headerChunk), { inserted: 1, replayed: 0 });
      assert.deepEqual(await store.stage(headerChunk), { inserted: 0, replayed: 1 });
      assert.deepEqual((await pool.query(`SELECT salesperson_id,created_by_source_key,approved_by_source_key,created_hall_id,created_local_at,
        approved_local_at,gross_amount::text,order_discount::text,net_due::text FROM naijue_erp.history_sales_header`)).rows,
      [{ salesperson_id: null, created_by_source_key: null, approved_by_source_key: null, created_hall_id: null, created_local_at: null,
        approved_local_at: null, gross_amount: "10.00", order_discount: "1.00", net_due: "8.50" }]);
    });
    await t.test("schema16 retains exact alias identity and contributor alias-target rejection, no stock postings", async () => {
      await new PostgresNativeStockContributorStore(pool).stage(prepareNativeStockGroup(f.stock));
      await expectExactSqlFailure(pool, "23514", "alias must retain its original source identity", "guard_history_insert",
        c => c.query(`INSERT INTO naijue_erp.import_sku_alias(batch_id,old_source_sku_id,canonical_sku_id,source_row_id,canonical_source_key,mapping_basis)
          VALUES($1,'WRONG-ALIAS-IDENTITY',$2,$3,$4,'Synthetic negative original predicate')`, [id(1), id(50), id(111), id(10)]).then(() => {}));
      await expectExactSqlFailure(pool, "23514", "contributor alias target differs", "guard_history_insert",
        c => c.query(`INSERT INTO naijue_erp.import_stock_contributor(batch_id,source_row_id,warehouse_id,canonical_sku_id,old_source_sku_id,
          canonical_stock_source_key,source_unit,signed_quantity,baseline_ledger_id) VALUES($1,$2,$3,$4,$5,'STOCK:synthetic','件',-7,NULL)`,
        [id(1), id(200), id(40), id(999), id(10)]).then(() => {}));
      assert.equal(await count("import_sku_alias"), 2); assert.equal(await count("import_stock_contributor"), 2);
      assert.equal(await count("inventory_ledger"), 0); assert.equal(await count("inventory_balance"), 0);
    });
    await t.test("actual read-only resolver returns creator-backed old alias and original selected header; wrong scope/key refused", async () => {
      assert.deepEqual(await resolve(query), { header: { sourceKey: "HISTORY-SALES-1", nativeId: header.id, sourceRowId: id(1600),
        sourceFileSha256: hash, rowSha256: hash, version: 1 }, sku: { oldSourceSkuKey: id(11), canonicalSourceKey: id(10), nativeId: id(50),
        aliasSourceRowId: id(111), importRecordId: id(30) } });
      await assert.rejects(resolve({ ...query, sourceKey: "WRONG-LINE-IDENTITY" }), { code: "HISTORY_SALES_DETAIL_RESOLVER_QUERY" });
      await assert.rejects(resolve({ ...query, rawFields: { ...lineRaw, SKU来源编号: id(999) } }), { code: "HISTORY_SALES_DETAIL_RESOLVER_MISSING" });
      await assert.rejects(createPostgresHistorySalesDetailBindingResolver(pool, { batchId: id(1), fixedSourceNamespace: ENGINE_NAMESPACE, selectionSha256: "f".repeat(64) })(query),
        { code: "HISTORY_SALES_DETAIL_RESOLVER_SCOPE" });
    });
    await t.test("typed line INSERT rollback and exact immutable replay retain original signed quantity and money without recalculation", async () => {
      const bindings = await resolve(query), input = { ...baseLine, fixedSourceNamespace: ENGINE_NAMESPACE,
        selection: { ...baseLine.selection, selectionSha256: selectionHash }, rows: [{ source, ...bindings }] };
      const prepared = prepareHistorySalesDetailChunk(input), failure = Error("SYNTHETIC_AFTER_REAL_HISTORY_LINE_INSERT");
      const faultPool: PgSalesPool = { async connect() { const c = await pool.connect(); return {
        async query(sql, parameters = []) { const result = await c.query(sql, parameters);
          if (sql.includes("sales-detail:insert-line")) throw failure; return result; }, release(e) { c.release(e); },
      }; } };
      const before = await count("import_source_row");
      await assert.rejects(new PostgresHistorySalesDetailStagingStore(faultPool).stage(prepared), e => e === failure);
      assert.equal(await count("history_sales_line"), 0); assert.equal(await count("import_source_row"), before);
      const store = new PostgresHistorySalesDetailStagingStore(pool);
      assert.deepEqual(await store.stage(prepared), { inserted: 1, replayed: 0 });
      assert.deepEqual(await store.stage(prepared), { inserted: 0, replayed: 1 });
      assert.deepEqual((await pool.query(`SELECT line_no,quantity::text,deal_price::text,line_amount::text,
        product_code_snapshot,barcode_snapshot FROM naijue_erp.history_sales_line`)).rows,
        [{ line_no: 7, quantity: "-2", deal_price: "0.03", line_amount: "-0.12", product_code_snapshot: "0007", barcode_snapshot: "0000123" }]);
      assert.equal(await count("import_source_row"), 16);
      for (const table of ["inventory_ledger", "inventory_balance", "sales_header", "sales_line", "sales_settlement", "import_record_accounting_claim"]) assert.equal(await count(table), 0);
      assert.equal(await count("operation_receipt"), 1); assert.equal(await count("audit_change"), 1);
      assert.deepEqual((await pool.query("SELECT status,checkpoint->>'cursor' cursor FROM naijue_erp.import_batch")).rows, [{ status: "STAGED", cursor: "0" }]);
    });
  } finally { await database.close(); }
});
