/** Fresh19 publication acceptance. Prior sealed18 success is reused as evidence;
 * new fixture bootstrap is necessary for this fresh target and is not counted as old acceptance. */
import test from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { integrationSettings } from "./safety.ts";
import { openFreshHistoryPublicationDatabase } from "./history-publication19-database.ts";
import { pinSyntheticClosureSourceFiles } from "./sealed-history18-source-pin.ts";
import { SyntheticPreparedClosureFacts } from "../support/history-closure-prepared-facts.ts";
import { HISTORY_CLOSURE_SOURCE_ENTITIES } from "../../packages/application/src/history-typed-closure.ts";
import type { HistoryTypedClosureStageInput } from "../../packages/application/src/history-typed-closure.ts";
import { PostgresHistoryTypedClosure19Store } from "../../adapters/postgres/src/history-typed-closure19.ts";
import { openAuthorizedHistoryClosureReader, HISTORY_CLOSURE_SOURCE_GROUPS, HISTORY_CLOSURE_SOURCE_GROUP_ENTITIES, HISTORY_CLOSURE_SOURCE_GROUP_RELATIONS } from "../../scripts/import-v2/authorized-history-closure-reader.mjs";
import type { HistoryClosureSourceFactory, HistoryClosureSourceGroup } from "../../scripts/import-v2/authorized-history-closure-reader.mjs";
import { assertNativeImportAccountingGuards,assertNativeImportAccountingSchema19Guards } from "../../adapters/postgres/src/native-import-accounting-capability.ts";
import { sealedHistory17Fixture } from "./sealed-history17-fixture.ts";
import { ENGINE_TIME, id } from "./native-import-accounting-fixture.ts";
import { entityId } from "../../packages/domain/src/values.ts";
import type { JsonObject } from "../../packages/application/src/history-storage-contract.ts";
import type { PgSalesPool } from "../../adapters/postgres/src/sales-unit-of-work.ts";
import { openAuthorizedV3HeaderReader } from "../../scripts/import-v2/authorized-header-reader.mjs";
import type { HeaderNativeBinding } from "../../packages/application/src/import-v3-history-header.ts";
import { openAuthorizedNativePaymentReader } from "../../scripts/import-v2/authorized-native-payment-reader.mjs";
import type { NativePaymentEntity, NativePaymentReference, NativePaymentImportRow } from "../../packages/application/src/native-payment-import.ts";
import { openAuthorizedSalesDetailReader } from "../../scripts/import-v2/authorized-sales-detail-reader.mjs";
import { openAuthorizedSettlementReader } from "../../scripts/import-v2/authorized-settlement-reader.mjs";
import { openAuthorizedV3Reader } from "../../scripts/import-v2/authorized-reader.mjs";
import { PostgresCutoffImportStore } from "../../adapters/postgres/src/inventory-cutoff-import-store.ts";
import { createCutoffImportService } from "../../packages/application/src/inventory-cutoff-import.ts";
import type { CutoffImportCommand } from "../../packages/application/src/inventory-cutoff-import.ts";
import { NATIVE_IMPORT_RECORD_ACCOUNTING_VERSION, NATIVE_IMPORT_STOCK_CONSERVATION_VERSION, nativeStockContributorsManifestHash, nativeStockEffectiveGroupsManifestHash } from "../../packages/application/src/native-import-record-accounting.ts";
import type { NativeAccountingChunkCommand, NativeAccountingPublishCommand } from "../../packages/application/src/native-import-record-accounting.ts";
import { PostgresNativePartyImportStore } from "../../adapters/postgres/src/native-party-import.ts";
import { PostgresNativeCatalogueImportStore } from "../../adapters/postgres/src/native-catalogue-import.ts";
import { PostgresNativeProductImportStore } from "../../adapters/postgres/src/native-product-import.ts";
import { PostgresNativeSkuImportStore } from "../../adapters/postgres/src/native-sku-import.ts";
import { PostgresNativeStockContributorStore } from "../../adapters/postgres/src/native-stock-contributor-import.ts";
import { PostgresNativePaymentImportStore } from "../../adapters/postgres/src/native-payment-import.ts";
import { prepareNativePartyImportChunk } from "../../packages/application/src/native-party-import.ts";
import { prepareNativeCatalogueImportChunk } from "../../packages/application/src/native-catalogue-import.ts";
import { prepareNativeProductImportChunk } from "../../packages/application/src/native-product-import.ts";
import { prepareNativeSkuImport } from "../../packages/application/src/native-sku-import.ts";
import { prepareNativeStockGroup } from "../../packages/application/src/native-stock-contributor-import.ts";
import { prepareNativePaymentImportChunk } from "../../packages/application/src/native-payment-import.ts";
import { prepareV3HistoryHeaderChunk } from "../../packages/application/src/import-v3-history-header-staging.ts";
import { PostgresV3HistoryHeaderStagingStore } from "../../adapters/postgres/src/import-v3-history-header-staging-store.ts";
import { prepareHistorySalesDetailChunk } from "../../packages/application/src/import-v3-history-sales-detail.ts";
import { createPostgresHistorySalesDetailBindingResolver, PostgresHistorySalesDetailStagingStore } from "../../adapters/postgres/src/import-v3-history-sales-detail-staging-store.ts";
import { prepareHistorySettlementChunk } from "../../packages/application/src/import-v3-history-settlement.ts";
import { createPostgresHistorySettlementBindingResolver, PostgresHistorySettlementStagingStore } from "../../adapters/postgres/src/import-v3-history-settlement-staging-store.ts";
import { prepareV3HistoryChunk } from "../../packages/application/src/import-v3-history-staging.ts";
import type { V3HistorySelectionBinding } from "../../packages/application/src/import-v3-history-staging.ts";
import { PostgresV3HistoryStagingStore } from "../../adapters/postgres/src/import-v3-history-staging-store.ts";

import Fastify from "fastify";
import { createImportedHistoryQueryHttpPlugin } from "../../apps/api/src/imported-history-query-http.ts";
import { PostgresImportedHistoryQueryReader } from "../../adapters/postgres/src/imported-history-query-reader.ts";
import { requestHash } from "../../packages/application/src/request-hash.ts";
import { stableImportId } from "../../packages/application/src/inventory-cutoff-import.ts";
import { quantity,businessDate } from "../../packages/domain/src/values.ts";
import { historyListQuery,historyDetailQuery } from "../support/imported-history-query-fixtures.ts";
import type { ImportedHistoryReadIntent } from "../../packages/application/src/imported-history-query-ports.ts";

test("fresh19 focused FINAL rollback, initial COMMIT uncertainty and replay conflict repair", async t => {
 assert.equal(process.env.NAIJUE_PG_TEST_SUITE,"history-publication-repair-0001-0019");
 const fixture = await sealedHistory17Fixture(t), { options, f, parties } = fixture, { sourceRoot, ...sourceOptions } = options;
 const sourceRoots = [options.base, options.v3Amendment, options.v3Approval, options.sourceRoot];
 const initialFilePins = await pinSyntheticClosureSourceFiles(sourceRoots);
 const facts = new SyntheticPreparedClosureFacts(options.batchId);
 const allocations: Array<Pick<HistoryTypedClosureStageInput["documents"][number], "kind" | "sourceKey" | "headerSourceRowId" | "headerId">> = [];
 let closureInput!: HistoryTypedClosureStageInput;
 const database = await openFreshHistoryPublicationDatabase(integrationSettings(process.env));
 try {
  const pool = database.pool, actor = entityId("account", id(802)), scope = { batchId: options.batchId, fixedSourceNamespace: options.fixedSourceNamespace, selectionSha256: fixture.selectionSha256 };
  const count = async (table: string) => Number((await pool.query(`SELECT count(*)::integer n FROM naijue_erp.${table}`)).rows[0]!.n);
  const stage: CutoffImportCommand = { action: "IMPORT_STAGE", actorAccountId: actor, batchId: options.batchId, requestKey: "SEALED17-STAGE", sourceName: options.fixedSourceNamespace, sourceHash: fixture.selectionSha256, sourceManifestRef: "synthetic:sealed-history17-selected-sql-slice", cutoffAt: ENGINE_TIME, mappingVersion: "V2_HISTORY_NULLABLE_1", expected: { WAREHOUSE: 2, SKU: 1, INVENTORY_LEDGER: 1, IMPORT_BATCH: 1 }, historyMetadata: { payloadHash: "f".repeat(64), expectedCounts: { import_source_row: 57, import_sku_alias: 2, import_stock_contributor: 2, barcodes: 0, history_sales_header: 2, history_sales_line: 32, history_sales_settlement: 2, history_transfer_header: 1, history_transfer_line: 1 } } };
  const warehouses = parties.filter(x => x.source.entityType === "WAREHOUSE");
  const chunk: NativeAccountingChunkCommand = { action: "IMPORT_CHUNK", actorAccountId: actor, batchId: options.batchId, requestKey: "SEALED17-CHUNK", expectedSequence: 0, expectedCursor: 0, accountingVersion: NATIVE_IMPORT_RECORD_ACCOUNTING_VERSION,
   items: [...warehouses.map(w => ({ targetType: "WAREHOUSE" as const, targetId: entityId("warehouse", w.nativeSnapshot.id as string), sourceEntityType: "WAREHOUSE", sourceKey: w.source.sourceKey, sourceFileRef: w.source.fileRef, sourceRecordHash: w.source.rowSha256, nativeRecord: w.warehouseRecord! })), { targetType: "SKU", targetId: entityId("sku", id(50)), sourceEntityType: "SKU", sourceKey: f.sku.canonicalSource.sourceKey, sourceFileRef: f.sku.canonicalSource.fileRef, sourceRecordHash: f.sku.canonicalSource.rowSha256, nativeRecord: f.sku.importRecord }, { targetType: "INVENTORY_LEDGER", sourceEntityType: "INVENTORY_BASELINE", sourceKey: "STOCK:synthetic", sourceFileRef: f.stock.selection.path, sourceRecordHash: requestHash(f.stock.canonicalStock), warehouseId: entityId("warehouse", id(40)), skuId: entityId("sku", id(50)), quantity: quantity("-7"), businessDate: businessDate("2026-10-04") }] };
  const publish: NativeAccountingPublishCommand = { action: "IMPORT_PUBLISH", actorAccountId: actor, batchId: options.batchId, requestKey: "SEALED17-NONZERO-MUST-REFUSE", expectedSequence: 1, expectedCursor: 4, accountingVersion: NATIVE_IMPORT_RECORD_ACCOUNTING_VERSION,
   approval: { completeScope: true, absentMeansZero: true, allFilesVerified: true, finalDeltaVerified: true, noUnresolvedExceptions: true, sourceHash: stage.sourceHash, sourceManifestRef: stage.sourceManifestRef },
   // This is only the exact registered synthetic selected native scope. Refusal MUST occur in historical readback before conservation/FINAL.
   stockConservation: { version: NATIVE_IMPORT_STOCK_CONSERVATION_VERSION, selectionSha256: stage.sourceHash, effectiveStockCsvSha256: f.stock.selection.csvSha256, contributorLineageCsvSha256: f.stock.selection.lineageCsvSha256, contributorCount: 2, effectiveGroupCount: 1, contributorsManifestHash: nativeStockContributorsManifestHash(f.stock.contributors.map(c => ({ sourceRowId: c.source.id, sourceKey: c.source.sourceKey, sourceFileSha256: c.source.sourceFileSha256, rowSha256: c.source.rowSha256, fileRef: c.source.fileRef, sheet: c.source.sheet, rowNo: c.source.rowNo, warehouseSourceKey: "WH-1", canonicalSkuSourceKey: f.sku.canonicalSource.sourceKey, oldSkuSourceId: c.lineage.oldSkuSourceId, canonicalStockSourceKey: "STOCK:synthetic", warehouseId: id(40), skuId: id(50), signedQuantity: c.lineage.signedQuantity, sourceUnit: "件" }))), effectiveGroupsManifestHash: nativeStockEffectiveGroupsManifestHash([{ canonicalStockSourceKey: "STOCK:synthetic", warehouseSourceKey: "WH-1", canonicalSkuSourceKey: f.sku.canonicalSource.sourceKey, warehouseId: id(40), skuId: id(50), signedQuantity: "-7", sourceUnit: "件", contributorCount: 2, effectiveRowHash: requestHash(f.stock.canonicalStock) }]), warehouses: [{ sourceKey: "WH-1", nativeId: id(40), signedQuantity: "-7" }, { sourceKey: "WH-2", nativeId: id(41), signedQuantity: "0" }], warehouseUnits: [{ warehouseSourceKey: "WH-1", sourceUnit: "件", signedQuantity: "-7" }] } };
  const commands = new Map([stage, chunk, publish].map(c => [c.requestKey, structuredClone(c)]));
  let publicationSourceAuthorization: ((plan: NativeAccountingPublishCommand["historyClosure"]) => Promise<void>) | undefined; let sourceAllowed = true;
  const authorization = { async assertAllowed(a: string, c: CutoffImportCommand) { assert.equal(a, actor); assert.deepEqual(c, commands.get(c.requestKey), "Exact independent synthetic command plan required"); if (c.action === "IMPORT_PUBLISH" && Object.hasOwn(c,"historyClosure")) { assert.ok(sourceAllowed,"SYNTHETIC_SOURCE_REVOKED"); assert.ok(publicationSourceAuthorization); await publicationSourceAuthorization((c as NativeAccountingPublishCommand).historyClosure); } } };
  const service = createCutoffImportService({ store: new PostgresCutoffImportStore(pool, { nativeAccountingAuthorization: authorization }), authorization, now: () => ENGINE_TIME });
  await (async () => {
   await pool.query("INSERT INTO naijue_erp.staff(id,name,role,employment_status,version) VALUES($1,'SYNTHETIC NONLOGIN SEALED IMPORTER','WAREHOUSE','在职',1)", [id(801)]);
   await pool.query("INSERT INTO naijue_erp.user_account(id,staff_id,login_name,password_hash,login_enabled,auth_version,version,created_at,updated_at) VALUES($1,$2,'SYNTHETIC_SEALED_NONLOGIN','SYNTHETIC_NOT_A_PASSWORD',false,1,1,$3,$3)", [actor, id(801), ENGINE_TIME]);
   await service.execute(stage);
   const partyChunk = prepareNativePartyImportChunk(parties); facts.parties(partyChunk); await new PostgresNativePartyImportStore(pool).stage(partyChunk);
   const catalogueChunk = prepareNativeCatalogueImportChunk(f.catalogue), productChunk = prepareNativeProductImportChunk(f.product), sku = prepareNativeSkuImport(f.sku), stock = prepareNativeStockGroup(f.stock);
   facts.catalogue(catalogueChunk); facts.products(productChunk); facts.sku(sku); facts.stock(stock);
   await new PostgresNativeCatalogueImportStore(pool).stage(catalogueChunk); await new PostgresNativeProductImportStore(pool).stage(productChunk); await new PostgresNativeSkuImportStore(pool).stage(sku); await new PostgresNativeStockContributorStore(pool).stage(stock);
   assert.equal((await service.execute(chunk)).cursor, 4); assert.equal(await count("inventory_ledger"), 1); assert.equal(await count("inventory_balance"), 1);
   assert.deepEqual((await pool.query("SELECT signed_quantity::text q FROM naijue_erp.import_stock_contributor ORDER BY signed_quantity")).rows, [{ q: "-7" }, { q: "0" }]);
  })();
  const headerBindings = async (q: { entity: string; normalizedFields: JsonObject }): Promise<Record<string, HeaderNativeBinding>> => {
   const fields = q.entity === "SALES_HEADER" ? [["所属厅来源编号", "HALL"], ["客户来源编号", "CUSTOMER"], ["仓库来源编号", "WAREHOUSE"]] : [["调出仓来源编号", "WAREHOUSE"], ["调入仓来源编号", "WAREHOUSE"]];
   const c = await pool.connect(); const bindings: Record<string, HeaderNativeBinding> = {};
   try { await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    for (const [field, entity] of fields) {
     const key = q.normalizedFields[field!]; const rows = entity === "WAREHOUSE" ? (await c.query("SELECT target_id id FROM naijue_erp.import_record WHERE import_batch_id=$1 AND source_entity_type='WAREHOUSE' AND source_key=$2 AND target_type='WAREHOUSE' AND status='IMPORTED'", [options.batchId, key])).rows : (await c.query(`SELECT ${entity === "HALL" ? "native_hall_id" : "native_customer_id"} id FROM naijue_erp.import_header_native_reference WHERE batch_id=$1 AND entity_type=$2 AND source_key=$3`, [options.batchId, entity, key])).rows;
     assert.equal(rows.length, 1); bindings[field!] = { sourceKey: key as string, nativeId: rows[0]!.id as string };
    } await c.query("COMMIT"); return bindings;
   } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  };
  await (async () => {
   const reader = await openAuthorizedV3HeaderReader({ ...sourceOptions, sourceRoot, resolveNativeBinding: headerBindings });
   try { assert.equal(reader.report.selectedRows, 3); assert.equal(reader.report.originalCellEvidenceRegenerated, true); assert.equal(reader.report.numericCellEvidence, 3);
    const store = new PostgresV3HistoryHeaderStagingStore(pool); let n = 0;
    for await (const record of reader.rows()) { const input = { batchId: options.batchId, fixedSourceNamespace: options.fixedSourceNamespace, ...record, bindings: await headerBindings({ entity: record.source.entityType, normalizedFields: record.source.normalizedFields }) }, prepared = prepareV3HistoryHeaderChunk([input]); await reader.authorize(prepared); facts.headers(prepared); for (const row of prepared.rows) { const p = row.prepared; allocations.push({ kind: p.entity === "SALES_HEADER" ? "SALES" : "TRANSFER", sourceKey: p.source.sourceKey, headerSourceRowId: p.source.id, headerId: p.header.id }); } assert.deepEqual(await store.stage(prepared), { inserted: 1, replayed: 0 });  n++; }
    assert.equal(n, 3);
   } finally { await reader.close(); } assert.deepEqual(await readdir(options.spoolParent), []);
   assert.deepEqual((await pool.query("SELECT business_type,salesperson_id,created_hall_id,created_by_source_key,created_local_at,gross_amount::text,order_discount::text,net_due::text FROM naijue_erp.history_sales_header ORDER BY business_type")).rows, ["RETURN", "SALE"].map(business_type => ({ business_type, salesperson_id: null, created_hall_id: null, created_by_source_key: null, created_local_at: null, gross_amount: "10.00", order_discount: "1.00", net_due: "8.50" })));
  })();
  const paymentDecision = async (q: { entity: NativePaymentEntity; sourceKey: string; rawFields: JsonObject }): Promise<Omit<NativePaymentImportRow, "source">> => {
   const allocation: Record<string, string> = { "method-A": id(910), "method-B": id(911), account: id(920) };
   const references: Record<string, NativePaymentReference> = {};
   const c = await pool.connect();
   try { await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    for (const [field, entity] of (q.entity === "PAYMENT_ACCOUNT" ? [["收款方式来源编号", "PAYMENT_METHOD"]] : q.entity === "PAYMENT_ACCOUNT_HALL" ? [["账户来源编号", "PAYMENT_ACCOUNT"], ["厅来源编号", "HALL"]] : []) as Array<[string, NativePaymentReference["entity"]]>) {
     const key = q.rawFields[field] as string, column = entity === "HALL" ? "native_hall_id" : entity === "PAYMENT_METHOD" ? "native_payment_method_id" : "native_payment_account_id", relation = entity === "HALL" ? "import_header_native_reference" : "import_native_payment_binding";
     const rows = (await c.query(`SELECT ${column} id,native_snapshot FROM naijue_erp.${relation} WHERE batch_id=$1 AND entity_type=$2 AND source_key=$3`, [options.batchId, entity, key])).rows; assert.equal(rows.length, 1); references[field] = { entity, sourceKey: key, nativeId: rows[0]!.id as string, nativeSnapshot: rows[0]!.native_snapshot as JsonObject };
    } await c.query("COMMIT");
   } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
   assert.ok(q.entity === "PAYMENT_ACCOUNT_HALL" || Object.hasOwn(allocation, q.sourceKey));
   return { nativeId: q.entity === "PAYMENT_ACCOUNT_HALL" ? null : allocation[q.sourceKey]!, enabledMapping: q.entity === "PAYMENT_ACCOUNT_HALL" ? null : { raw: q.rawFields.状态 as string, native: true, evidenceRef: "synthetic-independent-exact-state" }, references };
  };
  await (async () => {
   const reader = await openAuthorizedNativePaymentReader({ ...sourceOptions, resolveNativeBinding: paymentDecision });
   try { assert.equal(reader.report.selectedRows, 4); const store = new PostgresNativePaymentImportStore(pool);
    for (const kind of ["PAYMENT_METHOD", "PAYMENT_ACCOUNT", "PAYMENT_ACCOUNT_HALL"] as const) for await (const record of reader.rows(kind)) { const prepared = prepareNativePaymentImportChunk({ batchId: options.batchId, fixedSourceNamespace: options.fixedSourceNamespace, selection: record.selection, rows: [{ source: record.source, ...await paymentDecision({ entity: kind, sourceKey: record.source.sourceKey, rawFields: record.source.rawFields }) }] }); await reader.authorize(prepared); facts.payments(prepared); assert.equal((await store.stage(prepared)).inserted, 1);  }
   } finally { await reader.close(); } assert.deepEqual(await readdir(options.spoolParent), []); assert.equal(await count("import_native_payment_binding"), 4);
  })();
  await (async () => {
   const resolve = createPostgresHistorySalesDetailBindingResolver(pool, scope), reader = await openAuthorizedSalesDetailReader({ ...sourceOptions, resolveNativeBinding: resolve });
   try { assert.equal(reader.report.selectedRows, 32); const store = new PostgresHistorySalesDetailStagingStore(pool); let n = 0;
    for await (const record of reader.rows()) { const prepared = prepareHistorySalesDetailChunk({ batchId: options.batchId, fixedSourceNamespace: options.fixedSourceNamespace, selection: record.selection, moneyApprovals: record.moneyApprovals, rows: [{ source: record.source, ...await resolve({ entity: "SALES_LINE", sourceKey: record.source.sourceKey, rawFields: record.source.rawFields, normalizedFields: record.source.normalizedFields }) }] }); await reader.authorize(prepared); facts.sales(prepared); assert.deepEqual(await store.stage(prepared), { inserted: 1, replayed: 0 }); n++; } assert.equal(n, 32);
   } finally { await reader.close(); } assert.deepEqual(await readdir(options.spoolParent), []);
   assert.deepEqual((await pool.query("SELECT h.business_type,count(*)::integer n,min(l.quantity)::text quantity,min(l.deal_price)::text deal_price,min(l.line_amount)::text line_amount FROM naijue_erp.history_sales_line l JOIN naijue_erp.history_sales_header h ON h.id=l.header_id GROUP BY h.business_type ORDER BY h.business_type")).rows, [{ business_type: "RETURN", n: 16, quantity: "-2", deal_price: "1.00", line_amount: "-2.06" }, { business_type: "SALE", n: 16, quantity: "2", deal_price: "1.00", line_amount: "2.06" }]);
  })();
  await (async () => {
   const resolve = createPostgresHistorySettlementBindingResolver(pool, scope), reader = await openAuthorizedSettlementReader({ ...sourceOptions, resolveNativeBinding: resolve });
   try { const rows = []; let selection, moneyApprovals;
    for await (const record of reader.rows()) { selection = record.selection; moneyApprovals = record.moneyApprovals; rows.push({ source: record.source, ...await resolve({ entity: "SETTLEMENT", sourceKey: record.source.sourceKey, rawFields: record.source.rawFields, normalizedFields: record.source.normalizedFields }) }); }
    assert.equal(rows.length, 2); assert.ok(selection); assert.ok(moneyApprovals); const prepared = prepareHistorySettlementChunk({ batchId: options.batchId, fixedSourceNamespace: options.fixedSourceNamespace, selection, moneyApprovals, rows }); await reader.authorize(prepared); facts.settlements(prepared);
    const store = new PostgresHistorySettlementStagingStore(pool); await reader.authorize(prepared); assert.deepEqual(await store.stage(prepared), { inserted: 2, replayed: 0 });
    assert.deepEqual((await pool.query("SELECT direction,amount::text,payment_account_id,payment_method_id_snapshot,account_name_snapshot,method_name_snapshot FROM naijue_erp.history_sales_settlement ORDER BY direction")).rows, [{ direction: "RECEIVE", amount: "0.00", payment_account_id: id(920), payment_method_id_snapshot: null, account_name_snapshot: null, method_name_snapshot: null }, { direction: "REFUND", amount: "7.03", payment_account_id: id(920), payment_method_id_snapshot: id(911), account_name_snapshot: "Historical account name", method_name_snapshot: "Historical method name" }]);
   } finally { await reader.close(); } assert.deepEqual(await readdir(options.spoolParent), []);
  })();
  await (async () => {
   const resolve = async (q: { entity: string; normalizedFields: JsonObject }) => {
    assert.equal(q.entity, "TRANSFER_LINE"); const c = await pool.connect();
    try { await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); const hs = (await c.query("SELECT h.id FROM naijue_erp.history_transfer_header h JOIN naijue_erp.import_source_row s ON s.batch_id=h.batch_id AND s.id=h.source_row_id WHERE h.batch_id=$1 AND s.entity_type='TRANSFER_HEADER' AND s.source_key=$2", [options.batchId, q.normalizedFields.单据来源编号])).rows;
     const skus = (await c.query("SELECT DISTINCT a.canonical_sku_id id FROM naijue_erp.import_sku_alias a WHERE a.batch_id=$1 AND a.canonical_source_key=$2", [options.batchId, q.normalizedFields.SKU来源编号])).rows; assert.equal(hs.length, 1); assert.equal(skus.length, 1); await c.query("COMMIT"); return { header: { sourceKey: q.normalizedFields.单据来源编号 as string, nativeId: hs[0]!.id as string }, sku: { sourceKey: q.normalizedFields.SKU来源编号 as string, nativeId: skus[0]!.id as string } };
    } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
   };
   const { approvedMoneyOverlaySha256: _money, ...transferOptions } = sourceOptions; const reader = await openAuthorizedV3Reader({ ...transferOptions, resolveNativeBinding: resolve });
   try { let n = 0; for await (const record of reader.rows("TRANSFER_LINE")) { const prepared = prepareV3HistoryChunk({ batchId: options.batchId, fixedSourceNamespace: options.fixedSourceNamespace, selection: record.selection as V3HistorySelectionBinding, rows: [{ source: record.source, ...await resolve({ entity: "TRANSFER_LINE", normalizedFields: record.source.normalizedFields }) }] }); await reader.authorize(prepared); facts.transfers(prepared); const store = new PostgresV3HistoryStagingStore(pool); assert.deepEqual(await store.stage(prepared), { inserted: 1, replayed: 0 });  n++; } assert.equal(n, 1);
   } finally { await reader.close(); } assert.deepEqual(await readdir(options.spoolParent), []); assert.deepEqual((await pool.query("SELECT quantity::text FROM naijue_erp.history_transfer_line")).rows, [{ quantity: "-3" }]);
  })();
   // These are the explicitly authorized synthetic SQL-slice counts, not the full private input selection.
   assert.deepEqual(await pinSyntheticClosureSourceFiles(sourceRoots), initialFilePins);
   const sourceEntityCounts = { ...Object.fromEntries(HISTORY_CLOSURE_SOURCE_ENTITIES.map(e => [e, 0])), HALL: 1, WAREHOUSE: 2, STAFF: 0, CUSTOMER: 1, SUPPLIER: 0, BARCODE: 0, SEASON: 0, CATEGORY: 1, COLOR: 1, FIT: 1, SIZE: 1, SIZE_GROUP: 1, SIZE_GROUP_MEMBER: 1, PRODUCT: 1, SKU: 2, INVENTORY_BASELINE: 2, PAYMENT_METHOD: 2, PAYMENT_ACCOUNT: 1, PAYMENT_ACCOUNT_HALL: 1, SALES_HEADER: 2, SALES_LINE: 32, SETTLEMENT: 2, TRANSFER_HEADER: 1, TRANSFER_LINE: 1 };
   const expectedScope = { batchId: options.batchId, fixedSourceNamespace: options.fixedSourceNamespace, selectionSha256: fixture.selectionSha256, authorizedPayloadHash: "f".repeat(64), expectedCounts: stage.historyMetadata!.expectedCounts, expectedSourceEntityCounts: sourceEntityCounts };
   // Explicit SYNTHETIC producer ports only: rows were captured from the five real synthetic
   // readers' authorized prepared DTOs and the independent synthetic native prerequisite plan.
   // This cannot be used as the missing production source/mapping/header approval provider.
   const collected = facts.snapshot(), baselineId = stableImportId("baseline",options.fixedSourceNamespace,"INVENTORY_BASELINE","STOCK:synthetic");
   const snapshot = { ...collected, typedRows: collected.typedRows.map(row => row.relation === "import_stock_contributor" ? { ...row, projection: { ...(row.projection as Record<string,unknown>), baseline_ledger_id: baselineId } } : row) }, documentAllocations = structuredClone(allocations); let closedSessions = 0;
   const factory = (group: HistoryClosureSourceGroup): HistoryClosureSourceFactory => async (scope, context) => {
    assert.deepEqual(scope, expectedScope); assert.equal(context.group, group);
    const source = snapshot.sourceRows.filter(r => HISTORY_CLOSURE_SOURCE_GROUP_ENTITIES[group].includes((r.projection as { entity_type: typeof HISTORY_CLOSURE_SOURCE_ENTITIES[number] }).entity_type));
    const typed = snapshot.typedRows.filter(r => HISTORY_CLOSURE_SOURCE_GROUP_RELATIONS[group].includes(r.relation));
    return { verify: async () => { assert.deepEqual(await pinSyntheticClosureSourceFiles(sourceRoots), initialFilePins, "Every phase/replay rechecks full initial SYNTHETIC source bytes"); },
     sourceRows: function* () { yield* structuredClone(source); }, typedRows: function* () { yield* structuredClone(typed); },
     documents: function* () { if (group === "HEADERS") yield* structuredClone(documentAllocations); }, close: async () => { closedSessions++; } };
   };
   const openSources = Object.fromEntries(HISTORY_CLOSURE_SOURCE_GROUPS.map(g => [g, factory(g)])) as Record<HistoryClosureSourceGroup, HistoryClosureSourceFactory>;
   const composite = await openAuthorizedHistoryClosureReader({ scope: expectedScope, openSources, trustedSelectionSha256: fixture.selectionSha256, trustedAuthorizedPayloadHash: "f".repeat(64) });
   try {
    closureInput = await composite.expected();
    publicationSourceAuthorization = plan => composite.authorizeStage({ ...closureInput, plan: plan! });
    const publication: NativeAccountingPublishCommand = { ...publish, requestKey: "PUBLICATION19-EXACT", historyClosure: closureInput.plan };
    commands.set(publication.requestKey, structuredClone(publication));
    const historicalActor = { accountId: actor, hallId: entityId("hall",id(10)) };
    let scopedHall: string | null = null;
    const api = Fastify();
    await api.register(createImportedHistoryQueryHttpPlugin({ authenticate: async () => historicalActor, dependencies: {
      reader: new PostgresImportedHistoryQueryReader(pool), authorization: { async authorize(a,i) { return { dataset:"HISTORY",actorAccountId:a.accountId,kind:i.kind,operation:i.operation,targetId:i.operation==="detail"?i.parameters.documentId:null,scope:scopedHall===null?{kind:"ALL"}:{kind:"HALL_IDS",hallIds:[scopedHall]} }; } }
    } })); await api.ready();
    const http = async (kind:"sales"|"transfers", documentId?:string) => {
     const response=await api.inject({method:"POST",url:`/imported-history/${kind}/${documentId?"detail/":""}query`,payload:documentId?{...historyDetailQuery(),documentId}:historyListQuery()});
     assert.equal(response.statusCode,200,response.body); return response.json();
    };
    const observed=async()=>({final:Number((await pool.query("SELECT count(*)::integer n FROM naijue_erp.import_record WHERE target_type='IMPORT_BATCH'")).rows[0]!.n),claims:await count("import_record_accounting_claim"),receipts:await count("operation_receipt"),audit:await count("audit_change"),stock:await count("inventory_ledger"),balance:await count("inventory_balance")});
    const before=await observed();
    assert.deepEqual(before,{final:0,claims:4,receipts:2,audit:2,stock:1,balance:1});
    try {
     // Fresh target setup only: previously passed HISTORY/capability/source rejection goals are not rerun.
     assert.deepEqual(await new PostgresHistoryTypedClosure19Store(pool,{authorizeStage:i=>composite.authorizeStage(i)}).stage(closureInput),{inserted:1,replayed:0});
     await t.test("actual FINAL INSERT failure and actual receipt INSERT failure roll back all new publication writes",async()=>{
      for(const phase of ["FINAL","RECEIPT"]){let inserted=0;
       const fault:PgSalesPool={async connect(){const c=await pool.connect();return {async query(sql,args){const result=await c.query(sql,args);if(phase==="FINAL"&&sql.includes("INSERT INTO naijue_erp.import_record (")&&args?.[6]==="IMPORT_BATCH"||phase==="RECEIPT"&&sql.includes("INSERT INTO naijue_erp.operation_receipt")){inserted++;t.diagnostic(JSON.stringify({phase,actualInsertRowCount:result.rowCount,targetType:phase==="FINAL"?args?.[6]:"IMPORT",injectedAfterActualInsert:true}));throw Error("PUBLICATION19_AFTER_ACTUAL_"+phase);}return result;},release(e){c.release(e);}};}};
       const failed=createCutoffImportService({store:new PostgresCutoffImportStore(fault,{nativeAccountingAuthorization:authorization}),authorization,now:()=>ENGINE_TIME});
       await assert.rejects(failed.execute(publication),new RegExp("PUBLICATION19_AFTER_ACTUAL_"+phase));assert.equal(inserted,1);assert.deepEqual(await observed(),before);
       assert.equal((await pool.query("SELECT status FROM naijue_erp.import_batch")).rows[0]!.status,"VALIDATING");
      }
     });
     await t.test("one nonzero PUBLISH conserves every warehouse and creates exactly one FINAL/claim/CAS/audit/receipt",async()=>{
      let commits=0,rollbacks=0,discarded=false;
      const uncertain:PgSalesPool={async connect(){const c=await pool.connect();return{async query(sql,args){if(sql==="ROLLBACK")rollbacks++;const r=await c.query(sql,args);if(sql==="COMMIT"){commits++;throw Error("PUBLICATION19_ACTUAL_COMMIT_REPLY_LOST");}return r;},release(error){discarded=error instanceof Error;c.release(error);}};}};
      const uncertainService=createCutoffImportService({store:new PostgresCutoffImportStore(uncertain,{nativeAccountingAuthorization:authorization}),authorization,now:()=>ENGINE_TIME});
      await assert.rejects(uncertainService.execute(publication),/PUBLICATION19_ACTUAL_COMMIT_REPLY_LOST/);assert.equal(commits,1);assert.equal(rollbacks,0);assert.equal(discarded,true);t.diagnostic(JSON.stringify({actualCommit:commits,rollbackAfterUnknown:rollbacks,connectionDiscarded:discarded}));
      assert.deepEqual((await pool.query("SELECT status,checkpoint->>'cursor' cursor FROM naijue_erp.import_batch")).rows,[{status:"IMPORTED",cursor:"5"}]);
      assert.deepEqual(await observed(),{...before,final:1,claims:before.claims+1,receipts:before.receipts+1,audit:before.audit+1});
      assert.deepEqual((await pool.query("SELECT warehouse_id,quantity::text FROM naijue_erp.inventory_balance ORDER BY warehouse_id")).rows,[{warehouse_id:id(40),quantity:"-7"}]);
      assert.equal((await pool.query("SELECT history_validation_passed FROM naijue_erp.import_batch")).rows[0]!.history_validation_passed,true);
     });
     await t.test("same key exact replay reauthorizes full sources, changed content409 and revoked authority create no extra effects",async()=>{
      const published=await observed();assert.equal((await service.execute(publication)).status,"IMPORTED");assert.deepEqual(await observed(),published);
      const changed={...publication,expectedCursor:publication.expectedCursor+1};commands.set(changed.requestKey,structuredClone(changed));await assert.rejects(service.execute(changed),{code:"IDEMPOTENCY_CONFLICT"});commands.set(publication.requestKey,structuredClone(publication));
      sourceAllowed=false;await assert.rejects(service.execute(publication),/SYNTHETIC_SOURCE_REVOKED/);sourceAllowed=true;assert.deepEqual(await observed(),published);
     });
    }finally{await api.close();}
   } finally { await composite.close(); }
 } finally { await database.close(); }
});
