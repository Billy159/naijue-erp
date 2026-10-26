/** T45-only NEW SYN source fixture glue. No connection/PG/role/schema/credential creation.
 * Reuses the original schema19 import/publication machinery before T45's existing
 * reviewed successor upgrade to schema26. Never use an already-upgraded target.
 * Normal HISTORY runner subsequently requires the real runtime26 capability. */
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { pinSyntheticClosureSourceFiles } from "./sealed-history18-source-pin.ts";
import { SyntheticPreparedClosureFacts } from "../support/history-closure-prepared-facts.ts";
import { HISTORY_CLOSURE_SOURCE_ENTITIES } from "../../packages/application/src/history-typed-closure.ts";
import type { HistoryTypedClosureStageInput } from "../../packages/application/src/history-typed-closure.ts";
import { PostgresHistoryTypedClosure19Store } from "../../adapters/postgres/src/history-typed-closure19.ts";
import { openAuthorizedHistoryClosureReader, HISTORY_CLOSURE_SOURCE_GROUPS, HISTORY_CLOSURE_SOURCE_GROUP_ENTITIES, HISTORY_CLOSURE_SOURCE_GROUP_RELATIONS } from "../../scripts/import-v2/authorized-history-closure-reader.mjs";
import type { HistoryClosureSourceFactory, HistoryClosureSourceGroup } from "../../scripts/import-v2/authorized-history-closure-reader.mjs";
import { assertNativeImportAccountingSchema19Guards } from "../../adapters/postgres/src/native-import-accounting-capability.ts";
import { sealedHistory17Fixture, B07_SYN_APPROVED_PROFILE } from "./sealed-history17-fixture.ts";
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

import { requestHash } from "../../packages/application/src/request-hash.ts";
import { stableImportId } from "../../packages/application/src/inventory-cutoff-import.ts";
import { quantity,businessDate } from "../../packages/domain/src/values.ts";

import type { TestContext } from "node:test";
import type { PgSalesResult } from "../../adapters/postgres/src/sales-unit-of-work.ts";
import { PostgresImportedHistoryQueryReader } from "../../adapters/postgres/src/imported-history-query-reader.ts";
import { historyListQuery,historyDetailQuery } from "../support/imported-history-query-fixtures.ts";
import type { ImportedHistoryReadIntent } from "../../packages/application/src/imported-history-query-ports.ts";

type FixturePool = PgSalesPool & { query(text: string, values?: unknown[]): Promise<PgSalesResult> };
export async function prepareB07ApprovedPublication(t: TestContext, pool: FixturePool,
 target: { database: string; oid: string; role: string }) {
 assert.match(target.database,/^naijue_erp_test_b07_syn_approved_[a-z0-9_]+$/);
 const identity=(await pool.query("SELECT current_database() AS database,current_user AS role,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid")).rows;
 assert.deepEqual(identity,[target]);
 const client=await pool.connect();try{await assertNativeImportAccountingSchema19Guards(client);}finally{client.release();}
 assert.equal(Number((await pool.query("SELECT count(*) n FROM naijue_erp.import_batch")).rows[0]!.n),0,"Fresh new target only; never adopt old07");
 const fixture=await sealedHistory17Fixture(t,B07_SYN_APPROVED_PROFILE), {options,f,parties}=fixture, {sourceRoot,...sourceOptions}=options;
 const sourceRoots=[options.base,options.v3Amendment,options.v3Approval,options.sourceRoot];
 const initialFilePins=await pinSyntheticClosureSourceFiles(sourceRoots);
 const facts=new SyntheticPreparedClosureFacts(options.batchId);
 const allocations: Array<Pick<HistoryTypedClosureStageInput["documents"][number],"kind"|"sourceKey"|"headerSourceRowId"|"headerId">>=[];
 let closureInput!: HistoryTypedClosureStageInput;
  const actor = entityId("account", id(802)), scope = { batchId: options.batchId, fixedSourceNamespace: options.fixedSourceNamespace, selectionSha256: fixture.selectionSha256 };
  const count = async (table: string) => Number((await pool.query(`SELECT count(*)::integer n FROM naijue_erp.${table}`)).rows[0]!.n);
  const stage: CutoffImportCommand = { action: "IMPORT_STAGE", actorAccountId: actor, batchId: options.batchId, requestKey: "B07-SYN-APPROVED-V1-STAGE", sourceName: options.fixedSourceNamespace, sourceHash: fixture.selectionSha256, sourceManifestRef: "synthetic:b07-syn-approved-v1-selected-sql-slice", cutoffAt: ENGINE_TIME, mappingVersion: "V2_HISTORY_NULLABLE_1", expected: { WAREHOUSE: 2, SKU: 1, INVENTORY_LEDGER: 1, IMPORT_BATCH: 1 }, historyMetadata: { payloadHash: "f".repeat(64), expectedCounts: { import_source_row: 57, import_sku_alias: 2, import_stock_contributor: 2, barcodes: 0, history_sales_header: 2, history_sales_line: 32, history_sales_settlement: 2, history_transfer_header: 1, history_transfer_line: 1 } } };
  const warehouses = parties.filter(x => x.source.entityType === "WAREHOUSE");
  const chunk: NativeAccountingChunkCommand = { action: "IMPORT_CHUNK", actorAccountId: actor, batchId: options.batchId, requestKey: "B07-SYN-APPROVED-V1-CHUNK", expectedSequence: 0, expectedCursor: 0, accountingVersion: NATIVE_IMPORT_RECORD_ACCOUNTING_VERSION,
   items: [...warehouses.map(w => ({ targetType: "WAREHOUSE" as const, targetId: entityId("warehouse", w.nativeSnapshot.id as string), sourceEntityType: "WAREHOUSE", sourceKey: w.source.sourceKey, sourceFileRef: w.source.fileRef, sourceRecordHash: w.source.rowSha256, nativeRecord: w.warehouseRecord! })), { targetType: "SKU", targetId: entityId("sku", id(50)), sourceEntityType: "SKU", sourceKey: f.sku.canonicalSource.sourceKey, sourceFileRef: f.sku.canonicalSource.fileRef, sourceRecordHash: f.sku.canonicalSource.rowSha256, nativeRecord: f.sku.importRecord }, { targetType: "INVENTORY_LEDGER", sourceEntityType: "INVENTORY_BASELINE", sourceKey: "STOCK:synthetic", sourceFileRef: f.stock.selection.path, sourceRecordHash: requestHash(f.stock.canonicalStock), warehouseId: entityId("warehouse", id(40)), skuId: entityId("sku", id(50)), quantity: quantity("-7"), businessDate: businessDate("2026-10-04") }] };
  const publish: NativeAccountingPublishCommand = { action: "IMPORT_PUBLISH", actorAccountId: actor, batchId: options.batchId, requestKey: "B07-SYN-APPROVED-V1-PREPARE", expectedSequence: 1, expectedCursor: 4, accountingVersion: NATIVE_IMPORT_RECORD_ACCOUNTING_VERSION,
   approval: { completeScope: true, absentMeansZero: true, allFilesVerified: true, finalDeltaVerified: true, noUnresolvedExceptions: true, sourceHash: stage.sourceHash, sourceManifestRef: stage.sourceManifestRef },
   // Exact registered SYN selected native scope, including both warehouse totals.
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
  })();
  await (async () => {
   const resolve = createPostgresHistorySettlementBindingResolver(pool, scope), reader = await openAuthorizedSettlementReader({ ...sourceOptions, resolveNativeBinding: resolve });
   try { const rows = []; let selection, moneyApprovals;
    for await (const record of reader.rows()) { selection = record.selection; moneyApprovals = record.moneyApprovals; rows.push({ source: record.source, ...await resolve({ entity: "SETTLEMENT", sourceKey: record.source.sourceKey, rawFields: record.source.rawFields, normalizedFields: record.source.normalizedFields }) }); }
    assert.equal(rows.length, 2); assert.ok(selection); assert.ok(moneyApprovals); const prepared = prepareHistorySettlementChunk({ batchId: options.batchId, fixedSourceNamespace: options.fixedSourceNamespace, selection, moneyApprovals, rows }); await reader.authorize(prepared); facts.settlements(prepared);
    const store = new PostgresHistorySettlementStagingStore(pool); await reader.authorize(prepared); assert.deepEqual(await store.stage(prepared), { inserted: 2, replayed: 0 });
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
   } finally { await reader.close(); } assert.deepEqual(await readdir(options.spoolParent), []); assert.deepEqual((await pool.query("SELECT quantity::text FROM naijue_erp.history_transfer_line")).rows, [{ quantity: "3" }]);
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
    const publication: NativeAccountingPublishCommand = { ...publish, requestKey: "B07-SYN-APPROVED-V1-PUBLISH", historyClosure: closureInput.plan };
    commands.set(publication.requestKey, structuredClone(publication));
    await new PostgresHistoryTypedClosure19Store(pool,{authorizeStage:i=>composite.authorizeStage(i)}).stage(closureInput);
    // Original schema19 fixture-only ALL scope, as in publication19. This is a
    // reader visibility proof, NOT normal-session/role/HTTP authorization proof.
    const stagedVisibility=[], reader=new PostgresImportedHistoryQueryReader(pool);
    const historicalActor={accountId:actor,hallId:entityId("hall",id(10))};
    for(const kind of ["sales","transfers"] as const){
     const d=allocations.find(d=>d.kind===(kind==="sales"?"SALES":"TRANSFER"))!;
     const read=(intent:ImportedHistoryReadIntent)=>({actor:historicalActor,intent,signal:new AbortController().signal,
      grant:{dataset:"HISTORY" as const,actorAccountId:actor,kind,operation:intent.operation,targetId:intent.operation==="detail"?intent.parameters.documentId:null,scope:{kind:"ALL" as const}}});
     assert.equal((await reader.readList(read({kind,operation:"list",parameters:historyListQuery()}))).documents.total,"0");
     assert.equal((await reader.readDetail(read({kind,operation:"detail",parameters:{...historyDetailQuery(),documentId:d.headerId}}))).document,null);
     stagedVisibility.push({kind,visible:0,proof:"ORIGINAL_SCHEMA19_FIXTURE_READER_ONLY"});}
    const publicationResult=await service.execute(publication);assert.equal(publicationResult.status,"IMPORTED");
    const receipts=(await pool.query("SELECT id,result_data FROM naijue_erp.operation_receipt WHERE actor_account_id=$1 AND request_key=$2 AND status='COMMITTED'",[actor,publication.requestKey])).rows;
    assert.equal(receipts.length,1);
    const cases=[];
    for(const [kind,sourceKey] of [["sales","header-SALE"],["transfers","header-TRANSFER"]] as const){
     const doc=allocations.find(d=>d.sourceKey===sourceKey)!;assert.ok(doc);
     const family=kind==="sales"?"sales":"transfer";
     const heads=(await pool.query(`SELECT source_status,to_char(business_date,'YYYY-MM-DD') AS business_date FROM naijue_erp.history_${family}_header WHERE id=$1`,[doc.headerId])).rows;
     assert.equal(heads.length,1);assert.equal(heads[0]!.source_status,"APPROVED");assert.equal(heads[0]!.business_date,"2024-11-18");
     const lines=(await pool.query(`SELECT id,quantity::text AS quantity FROM naijue_erp.history_${family}_line WHERE header_id=$1 ORDER BY line_no,id`,[doc.headerId])).rows;
     assert.equal(lines.length,kind==="sales"?16:1);assert.equal(lines[0]!.quantity,kind==="sales"?"2":"3");
     cases.push({kind,documentId:doc.headerId,lineId:lines[0]!.id,capturedVersion:1,capturedSourceStatus:"APPROVED",capturedQuantity:lines[0]!.quantity,proposedQuantity:kind==="sales"?"3":"4"});
    }
    return {profile:B07_SYN_APPROVED_PROFILE,sourceKind:"SYNTHETIC_ONLY",target,fixture,
     references:{batchId:options.batchId,publishedOperationId:receipts[0]!.id,cases},stagedVisibility,
     publicationResult,requiredNextStep:"T45_EXISTING_REVIEWED_SCHEMA26_UPGRADE_AND_RUNTIME26_ISSUER_ADMISSION_NORMAL_SESSION",realSourceImportVerified:false};
   } finally {await composite.close();assert.equal(closedSessions,HISTORY_CLOSURE_SOURCE_GROUPS.length);}
}
