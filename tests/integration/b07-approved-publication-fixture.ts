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
import { COMPLETE_SCOPE_DECISION } from "../../packages/application/src/inventory-cutoff-import.ts";
import { quantity,businessDate } from "../../packages/domain/src/values.ts";

import type { TestContext } from "node:test";
import type { PgSalesResult } from "../../adapters/postgres/src/sales-unit-of-work.ts";
import { PostgresImportedHistoryQueryReader } from "../../adapters/postgres/src/imported-history-query-reader.ts";
import { historyListQuery,historyDetailQuery } from "../support/imported-history-query-fixtures.ts";
import type { ImportedHistoryReadIntent } from "../../packages/application/src/imported-history-query-ports.ts";

/** Counts sessions, not reader invocations: each source authorization reopens all11. */
export function b07FixtureSourceLifecycle() {
 const sessions: Array<{ group: HistoryClosureSourceGroup; closed: boolean }> = [];
 return {
  open(group: HistoryClosureSourceGroup) { const session={group,closed:false};sessions.push(session);
   return async () => { assert.equal(session.closed,false,"A fixture source session must close exactly once");session.closed=true; }; },
  assertClosed() { assert.ok(sessions.every(s=>s.closed),"Every opened fixture source session must close"); },
  counts() { return {opened:sessions.length,closed:sessions.filter(s=>s.closed).length}; }
 };
}
export async function closeB07FixtureSources(composite: {close(): Promise<void>}, lifecycle: ReturnType<typeof b07FixtureSourceLifecycle>, primaryError?: unknown) {
 try { await composite.close(); lifecycle.assertClosed(); }
 catch(cleanup) { if(primaryError!==undefined)throw new AggregateError([primaryError,cleanup],"Fixture source cleanup failed after primary error");throw cleanup; }
}
type FixturePool = PgSalesPool & { query(text: string, values?: unknown[]): Promise<PgSalesResult> };
export async function prepareB07ApprovedPublication(t: TestContext, pool: FixturePool,
 target: { database: string; oid: string; role: string },
 hv2?: { readonly qaBootstrap: { readonly staffId:string; readonly accountId:string; readonly loginName:string; readonly passwordHash:string } }) {
 assert.match(target.database,/^naijue_erp_test_b07_syn_approved_[a-z0-9_]+$/);
 if(hv2!==undefined){
  assert.match(target.database,/^naijue_erp_test_b07_syn_approved_hv2p04_[a-z0-9_]+$/);
  assert.deepEqual(Object.keys(hv2),['qaBootstrap']);
  const q=hv2.qaBootstrap;assert.deepEqual(Object.keys(q).sort(),['accountId','loginName','passwordHash','staffId']);
  assert.match(q.staffId,/^f0400000-0000-4000-8000-[0-9]{12}$/);assert.match(q.accountId,/^f0400000-0000-4000-8000-[0-9]{12}$/);assert.notEqual(q.staffId,q.accountId);
  assert.match(q.loginName,/^SYNTHETIC_HV2_P04_[A-Z0-9_]+$/);
  assert.match(q.passwordHash,/^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$/);
 }

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
   // New HV2 synthetic bootstrap only, before ANY import batch or cutoff exists.
   // T45 supplies an ephemeral hash from the original Node scrypt codec; never export it.
   // This is separate QA identity, never the historical creator/importer802.
   if(hv2){
    const q=hv2.qaBootstrap;
    assert.equal(Number((await pool.query("SELECT count(*) n FROM naijue_erp.user_account")).rows[0]!.n),0,"QA identity requires a truly fresh empty account target");
    await pool.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    try{
     await pool.query("INSERT INTO naijue_erp.staff(id,name,role,employment_status,version) VALUES($1,'SYNTHETIC HV2 P04 NORMAL QA','ADMIN','在职',1)",[q.staffId]);
     await pool.query("INSERT INTO naijue_erp.user_account(id,staff_id,login_name,password_hash,login_enabled,auth_version,version,created_at,updated_at) VALUES($1,$2,$3,$4,true,1,1,$5,$5)",[q.accountId,q.staffId,q.loginName,q.passwordHash,ENGINE_TIME]);
     await pool.query("COMMIT");
    }catch(error){await pool.query("ROLLBACK");throw error;}
   }
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
   const snapshot = { ...collected, typedRows: collected.typedRows.map(row => row.relation === "import_stock_contributor" ? { ...row, projection: { ...(row.projection as Record<string,unknown>), baseline_ledger_id: baselineId } } : row) }, documentAllocations = structuredClone(allocations); const lifecycle = b07FixtureSourceLifecycle();
   const factory = (group: HistoryClosureSourceGroup): HistoryClosureSourceFactory => async (scope, context) => {
    assert.deepEqual(scope, expectedScope); assert.equal(context.group, group);const close=lifecycle.open(group);
    const source = snapshot.sourceRows.filter(r => HISTORY_CLOSURE_SOURCE_GROUP_ENTITIES[group].includes((r.projection as { entity_type: typeof HISTORY_CLOSURE_SOURCE_ENTITIES[number] }).entity_type));
    const typed = snapshot.typedRows.filter(r => HISTORY_CLOSURE_SOURCE_GROUP_RELATIONS[group].includes(r.relation));
    return { verify: async () => { assert.deepEqual(await pinSyntheticClosureSourceFiles(sourceRoots), initialFilePins, "Every phase/replay rechecks full initial SYNTHETIC source bytes"); },
     sourceRows: function* () { yield* structuredClone(source); }, typedRows: function* () { yield* structuredClone(typed); },
     documents: function* () { if (group === "HEADERS") yield* structuredClone(documentAllocations); }, close };
   };
   const openSources = Object.fromEntries(HISTORY_CLOSURE_SOURCE_GROUPS.map(g => [g, factory(g)])) as Record<HistoryClosureSourceGroup, HistoryClosureSourceFactory>;
   const composite = await openAuthorizedHistoryClosureReader({ scope: expectedScope, openSources, trustedSelectionSha256: fixture.selectionSha256, trustedAuthorizedPayloadHash: "f".repeat(64) });
   let primaryError: unknown;
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
   } catch(error) { primaryError=error;throw error; } finally {await closeB07FixtureSources(composite,lifecycle,primaryError);}
}

/** Recovery is closed to the already COMMITTED SYN-02 target and ORIGINAL key.
 * No fixture construction, command execution, publication or schema upgrade.
 * T45 supplies a fresh current postmaster identity after starting its same DATA;
 * no stopped-window postmaster timestamp is reused as a current fact. */
export interface B07Committed19RecoveryTarget {
 database: 'naijue_erp_test_b07_syn_approved_20261027_01'; oid: '16385'; role: 'naijue_erp_test';
 postmasterStart: string; port: number; serverAddress: null; serverPort: null;
}
export const B07_COMMITTED19_PUBLISH = Object.freeze({
 batchId:'00000000-0000-0000-0000-000000000001', operationId:'89d8e3cb-5b42-4637-ed8c-0adf2091344a',
 requestKey:'B07-SYN-APPROVED-V1-PUBLISH', actorAccountId:'00000000-0000-0000-0000-000000000802'
});
export async function readB07CommittedApprovedPublication(pool: PgSalesPool,target: B07Committed19RecoveryTarget) {
 assert.equal(target.database,'naijue_erp_test_b07_syn_approved_20261027_01');assert.equal(target.oid,'16385');assert.equal(target.role,'naijue_erp_test');
 assert.ok(typeof target.postmasterStart==='string'&&target.postmasterStart.length>0);assert.ok(Number.isInteger(target.port)&&target.port>0&&target.port<=65535);
 assert.equal(target.serverAddress,null);assert.equal(target.serverPort,null);
 const c=await pool.connect();let began=false;let discard: Error|boolean|undefined;
 const original=B07_COMMITTED19_PUBLISH;
 const bounded=async(sql:string,values:unknown[]=[])=>{const rows=(await c.query(sql,values)).rows;assert.ok(rows.length<=100,'Bounded original SYN recovery only');return rows;};
 try {
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');began=true;
  const identities=await bounded(`/* b07-recover:target */ SELECT current_database() AS database,
   (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,current_user AS role,
   pg_postmaster_start_time()::text AS "postmasterStart",current_setting('port')::int AS port,
   inet_server_addr()::text AS "serverAddress",inet_server_port() AS "serverPort",
   current_setting('transaction_read_only') AS readonly,current_setting('transaction_isolation') AS isolation,
   (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser,(SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS bypass`);
  assert.equal(identities.length,1);const {readonly,isolation,superuser,bypass,...actual}=identities[0]!;
  assert.deepEqual(actual,target);assert.equal(readonly,'on');assert.equal(isolation,'repeatable read');assert.equal(superuser,false);assert.equal(bypass,false);
  await assertNativeImportAccountingSchema19Guards(c);
  const versions=await bounded('/* b07-recover:versions */ SELECT version FROM naijue_erp.schema_migration ORDER BY version');
  assert.deepEqual(versions.map(r=>r.version),Array.from({length:19},(_,i)=>i+1));
  const keys=await bounded(`/* b07-recover:original-keys */ SELECT id,request_key,action,status FROM naijue_erp.operation_receipt
   WHERE actor_account_id=$1::uuid AND request_key=ANY($2::text[]) ORDER BY request_key`,[original.actorAccountId,
   ['B07-SYN-APPROVED-V1-STAGE','B07-SYN-APPROVED-V1-CHUNK',original.requestKey,'B07-SYN-APPROVED-V1-PREPARE']]);
  assert.deepEqual(keys.map(r=>({key:r.request_key,action:r.action,status:r.status})),[
   {key:'B07-SYN-APPROVED-V1-CHUNK',action:'IMPORT_CHUNK',status:'COMMITTED'},
   {key:original.requestKey,action:'IMPORT_PUBLISH',status:'COMMITTED'},
   {key:'B07-SYN-APPROVED-V1-STAGE',action:'IMPORT_STAGE',status:'COMMITTED'}]);
  assert.equal(keys.find(r=>r.request_key===original.requestKey)!.id,original.operationId);
  const publication=await bounded(`/* b07-recover:publication */ SELECT r.id,r.result_data,b.source_hash,b.source_manifest_ref,
   (b.source_name='synthetic.b07.approved.v1' AND b.mapping_version='V2_HISTORY_NULLABLE_1'
    AND b.inventory_mode='CUTOFF_STOCK_BASELINE' AND b.status='IMPORTED' AND b.completed_at IS NOT NULL
    AND b.history_validation_passed IS TRUE AND b.history_actual_counts=b.history_expected_counts
    AND b.checkpoint->'counts'=b.checkpoint->'expected' AND b.checkpoint->'counts'->>'IMPORT_BATCH'='1'
    AND m.validator_version='HISTORY_TYPED_CLOSURE_V1' AND m.selection_sha256=b.source_hash
    AND m.authorized_payload_hash=b.history_payload_hash AND m.expected_counts=b.history_expected_counts
    AND m.document_count=3 AND m.document_count=(SELECT count(*) FROM naijue_erp.import_history_document_manifest md WHERE md.batch_id=b.id)
    AND f.status='IMPORTED' AND f.source_record_hash=b.source_hash AND f.source_file_ref=b.source_manifest_ref
    AND f.decision_reason=$4::text AND cl.checkpoint_sequence=(b.checkpoint->>'sequence')::integer
    AND r.result_data->>'status'='IMPORTED' AND r.result_data->>'batchId'=b.id::text
    AND r.result_data->>'sequence'=b.checkpoint->>'sequence' AND r.result_data->>'cursor'=b.checkpoint->>'cursor'
    AND a.actor_account_id=r.actor_account_id AND a.occurred_at=r.completed_at) AS published
   FROM naijue_erp.import_batch b JOIN naijue_erp.import_history_closure_manifest m ON m.batch_id=b.id
   JOIN naijue_erp.import_record f ON f.import_batch_id=b.id AND f.target_type='IMPORT_BATCH' AND f.target_id=b.id
    AND f.source_entity_type='INVENTORY_SCOPE_APPROVAL' AND f.source_key='FINAL_COMPLETE_SCOPE'
   JOIN naijue_erp.import_record_accounting_claim cl ON cl.import_batch_id=b.id AND cl.import_record_id=f.id AND cl.target_type=f.target_type AND cl.target_id=f.target_id
   JOIN naijue_erp.operation_receipt r ON r.id=cl.operation_id AND r.target_type='IMPORT' AND r.target_id=b.id AND r.action='IMPORT_PUBLISH' AND r.status='COMMITTED'
   JOIN naijue_erp.audit_change a ON a.operation_id=r.id AND a.object_type='IMPORT' AND a.object_id=b.id AND a.action='IMPORT_PUBLISH'
   WHERE b.id=$1::uuid AND r.id=$2::uuid AND r.request_key=$3 AND r.actor_account_id=$5::uuid`,
   [original.batchId,original.operationId,original.requestKey,COMPLETE_SCOPE_DECISION,original.actorAccountId]);
  assert.equal(publication.length,1);assert.equal(publication[0]!.published,true);
  const expectedCounts={import_source_row:57,import_sku_alias:2,import_stock_contributor:2,import_record:5,import_record_accounting_claim:5,import_history_closure_manifest:1,import_history_document_manifest:3,
   product:1,sku:1,warehouse:2,inventory_ledger:1,inventory_balance:1,history_sales_header:2,history_sales_line:32,history_sales_settlement:2,history_transfer_header:1,history_transfer_line:1,user_account:1,staff:1,auth_session:0};
  const counts: Record<string,number>={};
  for(const [table,expected] of Object.entries(expectedCounts)){
   const got=await bounded(`/* b07-recover:count:${table} */ SELECT count(*)::integer AS n FROM naijue_erp.${table}`);
   assert.equal(got.length,1);assert.equal(got[0]!.n,expected,table);counts[table]=expected;
  }
  const claims=await bounded(`/* b07-recover:all-claims */ SELECT r.id FROM naijue_erp.import_record r
   JOIN naijue_erp.import_record_accounting_claim cl ON cl.import_batch_id=r.import_batch_id AND cl.import_record_id=r.id AND cl.target_type=r.target_type AND cl.target_id=r.target_id
   JOIN naijue_erp.operation_receipt op ON op.id=cl.operation_id AND op.status='COMMITTED'
   WHERE r.import_batch_id=$1::uuid AND r.status='IMPORTED'`,[original.batchId]);assert.equal(claims.length,5);
  const cases=[];let saleWarehouse='',transferFrom='',transferTo='',skuId='',saleQuantity=0n,transferQuantity=0n;
  for(const [kind,sourceKey] of [['sales','header-SALE'],['transfers','header-TRANSFER']] as const){
   const family=kind==='sales'?'sales':'transfer';
   const heads=await bounded(`/* b07-recover:head:${family} */ SELECT h.id,h.version,h.source_status,to_char(h.business_date,'YYYY-MM-DD') AS business_date,
    ${kind==='sales'?"h.warehouse_id,h.gross_amount::text AS gross_amount,h.order_discount::text AS order_discount,h.net_due::text AS net_due":"h.from_warehouse_id,h.to_warehouse_id"},
    h.created_local_at,h.updated_local_at,h.approved_local_at,s.raw_fields,m.line_count,m.settlement_count,
    (m.header_source_row_id=h.source_row_id AND m.document_kind=$3) AS manifest_identity
    FROM naijue_erp.history_${family}_header h JOIN naijue_erp.import_source_row s ON s.batch_id=h.batch_id AND s.id=h.source_row_id
    JOIN naijue_erp.import_history_document_manifest m ON m.batch_id=h.batch_id AND m.${family}_header_id=h.id
    WHERE h.batch_id=$1::uuid AND s.source_key=$2 AND s.entity_type=$4`,[original.batchId,sourceKey,kind==='sales'?'SALES':'TRANSFER',kind==='sales'?'SALES_HEADER':'TRANSFER_HEADER']);
   assert.equal(heads.length,1);const h=heads[0]!;assert.equal(h.version,1);assert.equal(h.source_status,'APPROVED');assert.equal(h.business_date,'2024-11-18');assert.equal(h.manifest_identity,true);
   for(const k of ['created_local_at','updated_local_at','approved_local_at'])assert.equal(h[k],null);
   const raw=h.raw_fields as Record<string,unknown>;assert.equal(raw.原审核状态,'已审核');assert.equal(raw.业务日期,'45614');
   if(kind==='sales'){saleWarehouse=h.warehouse_id as string;assert.equal(h.gross_amount,'32.00');assert.equal(h.order_discount,'0.00');assert.equal(h.net_due,'32.00');}
   else {transferFrom=h.from_warehouse_id as string;transferTo=h.to_warehouse_id as string;assert.notEqual(transferFrom,transferTo);}
   for(const [field,id] of kind==='sales'?[['仓库来源编号',saleWarehouse]]:[['调出仓来源编号',transferFrom],['调入仓来源编号',transferTo]]){
    const warehouse=await bounded(`/* b07-recover:warehouse-binding */ SELECT r.target_id FROM naijue_erp.import_record r
     WHERE r.import_batch_id=$1::uuid AND r.source_entity_type='WAREHOUSE' AND r.source_key=$2 AND r.target_type='WAREHOUSE' AND r.status='IMPORTED'`,[original.batchId,raw[field!]]);
    assert.equal(warehouse.length,1);assert.equal(warehouse[0]!.target_id,id);
   }
   const lines=await bounded(`/* b07-recover:lines:${family} */ SELECT l.id,l.sku_id,l.quantity::text AS quantity,l.line_no,
    ${kind==='sales'?"l.deal_price::text AS deal_price,l.line_amount::text AS line_amount,":""}
    s.raw_fields,s.normalized_fields,(s.normalized_fields->>'单据来源编号'=$3 AND EXISTS(SELECT 1 FROM naijue_erp.import_sku_alias a
     WHERE a.batch_id=l.batch_id AND a.canonical_sku_id=l.sku_id AND a.canonical_source_key=s.normalized_fields->>'SKU来源编号')) AS exact_identity
    FROM naijue_erp.history_${family}_line l JOIN naijue_erp.import_source_row s ON s.batch_id=l.batch_id AND s.id=l.source_row_id
    WHERE l.batch_id=$1::uuid AND l.header_id=$2::uuid ORDER BY l.line_no,l.id`,[original.batchId,h.id,sourceKey]);
   assert.equal(lines.length,kind==='sales'?16:1);assert.equal(h.line_count,lines.length);assert.equal(h.settlement_count,kind==='sales'?1:0);
   for(const l of lines){assert.equal(l.exact_identity,true);assert.equal(l.quantity,kind==='sales'?'2':'3');if(skuId)assert.equal(l.sku_id,skuId);else skuId=l.sku_id as string;
    if(kind==='sales')saleQuantity+=BigInt(l.quantity as string);else transferQuantity+=BigInt(l.quantity as string);
    assert.equal((l.normalized_fields as Record<string,unknown>).原数量,l.quantity);if(kind==='sales'){assert.equal(l.deal_price,'1.00');assert.equal(l.line_amount,'2.00');}}
   if(kind==='sales'){
    const payments=await bounded(`/* b07-recover:settlements */ SELECT p.id,p.direction,p.amount::text AS amount,
     (s.normalized_fields->>'单据来源编号'=$3 AND EXISTS(SELECT 1 FROM naijue_erp.import_native_payment_binding pb
      WHERE pb.batch_id=p.batch_id AND pb.entity_type='PAYMENT_ACCOUNT' AND pb.source_key=s.normalized_fields->>'账户来源编号' AND pb.native_payment_account_id=p.payment_account_id)) AS exact_identity
     FROM naijue_erp.history_sales_settlement p JOIN naijue_erp.import_source_row s ON s.batch_id=p.batch_id AND s.id=p.source_row_id WHERE p.batch_id=$1::uuid AND p.header_id=$2::uuid`,[original.batchId,h.id,sourceKey]);
    assert.equal(payments.length,1);assert.equal(payments[0]!.direction,'RECEIVE');assert.equal(payments[0]!.amount,'32.00');assert.equal(payments[0]!.exact_identity,true);
   }
   cases.push({kind,documentId:h.id,lineId:lines[0]!.id,capturedVersion:1,capturedSourceStatus:'APPROVED',capturedQuantity:lines[0]!.quantity,proposedQuantity:kind==='sales'?'3':'4'});
  }
  assert.equal(saleWarehouse,transferFrom);
  const units=await bounded(`/* b07-recover:stock-unit */ SELECT c.warehouse_id,c.canonical_sku_id,c.source_unit,c.signed_quantity::text AS signed_quantity,c.baseline_ledger_id,
   l.event_kind,l.endpoint,l.quantity_delta::text AS quantity_delta,l.source_import_batch_id,l.warehouse_id AS ledger_warehouse,l.sku_id AS ledger_sku
   FROM naijue_erp.import_stock_contributor c JOIN naijue_erp.inventory_ledger l ON l.id=c.baseline_ledger_id
   WHERE c.batch_id=$1::uuid ORDER BY c.source_row_id`,[original.batchId]);assert.equal(units.length,2);
  for(const u of units){assert.equal(u.canonical_sku_id,skuId);assert.equal(u.warehouse_id,saleWarehouse);assert.equal(u.source_unit,'件');assert.equal(u.event_kind,'CUTOFF_BASELINE');assert.equal(u.endpoint,'IMPORT_BASELINE');assert.equal(u.quantity_delta,'-7');assert.equal(u.source_import_batch_id,original.batchId);assert.equal(u.ledger_warehouse,saleWarehouse);assert.equal(u.ledger_sku,skuId);}
  assert.equal(units.reduce((n,u)=>n+BigInt(u.signed_quantity as string),0n),-7n);
  const balances=await bounded('/* b07-recover:balances */ SELECT warehouse_id,sku_id,quantity::text AS quantity FROM naijue_erp.inventory_balance ORDER BY warehouse_id,sku_id');
  assert.equal(balances.length,1);assert.deepEqual(balances[0],{warehouse_id:saleWarehouse,sku_id:skuId,quantity:'-7'});
  const derivedFrom=BigInt(balances[0]!.quantity as string)+saleQuantity+transferQuantity,derivedTo=-transferQuantity;
  assert.equal(derivedFrom,28n);assert.equal(derivedTo,-3n);
  const publicationResult=publication[0]!.result_data as Record<string,unknown>;
  assert.equal(publicationResult.operationId,original.operationId);assert.equal(publicationResult.batchId,original.batchId);assert.equal(publicationResult.status,'IMPORTED');
  await c.query('ROLLBACK');began=false;
  return {profile:B07_SYN_APPROVED_PROFILE,sourceKind:'SYNTHETIC_ONLY',target:{database:target.database,oid:target.oid,role:target.role},
   references:{batchId:original.batchId,publishedOperationId:original.operationId,cases},publicationResult,
   recovery:{readOnly:true,rollbackReturned:true,originalKey:original.requestKey,currentTarget:target,counts,
    stockIdentity:{saleWarehouse,transferFrom,transferTo,skuId,unit:'件'},openingBasis:'DERIVED_FROM_TARGET_INVENTORY',derivedOpening:{from:derivedFrom.toString(),to:derivedTo.toString()},
    absentToTargetBasis:'PUBLISHED_COMPLETE_SCOPE_ABSENT_IS_ZERO_NOT_RUNTIME_ADMISSION',
    stagedVisibilityReexecuted:false,sourceFixtureRegenerated:false,publishReexecuted:false},realSourceImportVerified:false,
   requiredNextStep:'C_REGISTER_T45_EXISTING_REVIEWED_SCHEMA26_UPGRADE_AND_RUNTIME26_ISSUER_ADMISSION_NORMAL_SESSION'};
 }catch(error){if(began)try{await c.query('ROLLBACK');}catch(rollback){discard=rollback instanceof Error?rollback:true;throw new AggregateError([error,rollback],'Read-only publication recovery rollback failed');}throw error;}
 finally{c.release(discard);}
}
