/** Offline synthetic expected-side fixture checks. No PG or private-file reads. */
import test from "node:test";
import assert from "node:assert/strict";
import { SyntheticPreparedClosureFacts, syntheticClosureTimestamp } from "./support/history-closure-prepared-facts.ts";
import { engineFixtures, id } from "./integration/native-import-accounting-fixture.ts";
import { prepareNativePartyImportChunk } from "../packages/application/src/native-party-import.ts";
import { prepareNativeCatalogueImportChunk } from "../packages/application/src/native-catalogue-import.ts";
import { prepareNativeProductImportChunk } from "../packages/application/src/native-product-import.ts";
import { prepareNativeSkuImport } from "../packages/application/src/native-sku-import.ts";
import { prepareNativeStockGroup } from "../packages/application/src/native-stock-contributor-import.ts";
import { prepareNativePaymentImportChunk } from "../packages/application/src/native-payment-import.ts";
import { paymentChunk } from "./support/native-payment-fixtures.ts";
import { prepareHistorySettlementChunk } from "../packages/application/src/import-v3-history-settlement.ts";
import { settlementChunk } from "./support/history-settlement-fixtures.ts";
import { prepareHistorySalesDetailChunk } from "../packages/application/src/import-v3-history-sales-detail.ts";
import { syntheticSalesDetailChunk } from "./support/synthetic-sales-detail-fixtures.ts";
import { hashHistoryClosureRows } from "../packages/application/src/history-typed-closure.ts";
import type { HistoryClosureRow } from "../packages/application/src/history-typed-closure.ts";
import { buildHistoryTypedClosureExpected, HISTORY_CLOSURE_SOURCE_ENTITIES } from "../packages/application/src/history-typed-closure.ts";
import { IMPORT_V2_TABLES } from "../packages/application/src/import-v2-contract.ts";
import { prepareV3HistoryHeaderChunk } from "../packages/application/src/import-v3-history-header-staging.ts";
import type { HistoryHeaderInput } from "../packages/application/src/import-v3-history-header.ts";
import { prepareV3HistoryChunk } from "../packages/application/src/import-v3-history-staging.ts";

const projection = (rows: HistoryClosureRow[], relation: string) => rows.filter(r => r.relation === relation).map(r => r.projection as Record<string, any>);
test("prepared native prerequisites capture every original/carrier/native projection, signed zero contributors and deterministic IDs", () => {
 const f = engineFixtures(), facts = new SyntheticPreparedClosureFacts(id(1));
 facts.parties(prepareNativePartyImportChunk(f.parties)); facts.catalogue(prepareNativeCatalogueImportChunk(f.catalogue)); facts.products(prepareNativeProductImportChunk(f.product)); facts.sku(prepareNativeSkuImport(f.sku)); facts.stock(prepareNativeStockGroup(f.stock));
 const { sourceRows, typedRows } = facts.snapshot();
 assert.equal(sourceRows.length, 13); assert.equal(projection(typedRows, "import_sku_alias").length, 2);
 assert.deepEqual(projection(typedRows, "import_stock_contributor").map(p => p.signed_quantity).sort(), ["-7", "0"]);
 assert.ok(projection(typedRows, "import_stock_contributor").every(p => p.baseline_ledger_id === null));
 const intents = projection(typedRows, "native_party_import_evidence"); assert.equal(intents.length, 2);
 assert.ok(intents.every(p => !Object.hasOwn(p, "creation_xid") && !Object.hasOwn(p, "imported_at")));
 for (const p of intents) { assert.equal(p["native_" + p.entity_type.toLowerCase() + "_id"], p.native_id); assert.equal(p.source_snapshot.id, p.source_row_id); }
 assert.equal(projection(typedRows, "import_header_native_reference").length, 1);
});
test("prepared source replay is exact; later caller mutations, returned snapshots and wrong batches cannot change captured expected facts", async () => {
 const prepared = prepareNativePartyImportChunk(engineFixtures().parties), facts = new SyntheticPreparedClosureFacts(id(1)); facts.parties(prepared);
 const before = facts.snapshot(), root = await hashHistoryClosureRows("typed:" + id(1), before.typedRows);
 facts.parties(structuredClone(prepared)); assert.deepEqual(facts.snapshot(), before);
 prepared.rows[0]!.nativeSnapshot.name = "SYNTHETIC CHANGED CALLER";
 assert.throws(() => facts.parties(prepared), /SYNTHETIC_PREPARED_CLOSURE_FACT_CONFLICT/);
 (before.typedRows[0]!.projection as Record<string, any>).name = "SYNTHETIC RETURNED SNAPSHOT MUTATION";
 assert.deepEqual(await hashHistoryClosureRows("typed:" + id(1), facts.snapshot().typedRows), root);
 assert.throws(() => new SyntheticPreparedClosureFacts(id(2)).parties(prepareNativePartyImportChunk(engineFixtures().parties)), /SYNTHETIC_PREPARED_CLOSURE_FACT_CONFLICT/);
});
test("current payment identities do not replace original account/method snapshots; historical settlement keeps independent method and NULL values", async () => {
 const facts = new SyntheticPreparedClosureFacts(id(1));
 for (const [entity, n] of [["PAYMENT_METHOD", 10], ["PAYMENT_ACCOUNT", 20], ["PAYMENT_ACCOUNT_HALL", 30]] as const) facts.payments(prepareNativePaymentImportChunk(paymentChunk(entity, n)));
 facts.settlements(prepareHistorySettlementChunk(settlementChunk())); facts.sales(prepareHistorySalesDetailChunk(syntheticSalesDetailChunk()));
 const { sourceRows, typedRows } = facts.snapshot();
 assert.equal(sourceRows.length, 5);
 for (const relation of ["payment_method_identity", "payment_account_identity"]) assert.ok(projection(typedRows, relation).every(p => Object.keys(p).join() === "id"));
 const settlement = projection(typedRows, "history_sales_settlement")[0]!;
 assert.equal(settlement.payment_method_id_snapshot, id(11)); assert.equal(settlement.payment_account_id, id(20));
 assert.equal(settlement.account_name_snapshot, "历史账户旧名"); assert.equal(settlement.method_name_snapshot, "历史方式旧名");
 const line = projection(typedRows, "history_sales_line")[0]!; assert.equal(line.quantity, "-2");
 const absent = new SyntheticPreparedClosureFacts(id(1)); absent.settlements(prepareHistorySettlementChunk(settlementChunk(false)));
 assert.equal(projection(absent.snapshot().typedRows, "history_sales_settlement")[0]!.payment_method_id_snapshot, null);
});
test("expected timestamp rendering retains six original microseconds and explicit offset day changes; unknown remains NULL", () => {
 assert.equal(syntheticClosureTimestamp(null, true), null);
 assert.equal(syntheticClosureTimestamp("2024-02-29T00:00:00.123456", false), "2024-02-29T00:00:00.123456");
 assert.equal(syntheticClosureTimestamp("2024-02-29T00:00:00.000001+08:00", true), "2024-02-28T16:00:00.000001Z");
 assert.equal(syntheticClosureTimestamp("2024-02-29T23:59:59.999999-01:00", true), "2024-03-01T00:59:59.999999Z");
 assert.equal(syntheticClosureTimestamp("2024-02-29T00:00:00Z", true), "2024-02-29T00:00:00.000000Z");
 assert.throws(() => syntheticClosureTimestamp("2024-02-29T00:00:00", true));
 assert.throws(() => syntheticClosureTimestamp("2024-02-29T00:00:00Z", false));
 assert.throws(() => syntheticClosureTimestamp("2024-02-29T00:00:00.1234567Z", true));
});

function originalHeader(entity: "SALES_HEADER" | "TRANSFER_HEADER"): HistoryHeaderInput {
 const table = IMPORT_V2_TABLES.find(t => t.entity === entity)!, hash = "a".repeat(64), transfer = entity === "TRANSFER_HEADER", key = transfer ? "TRANSFER-DOC" : "SALES-DOC";
 const n: Record<string, string> = Object.fromEntries(table.columns.map(c => [c.name, ""]));
 Object.assign(n, { 来源编号: key, 原单号: key, 业务日期: "2024-02-29", 原审核状态: "已审核", 创建厅归属来源: "UNKNOWN", 创建厅归属原因: "UNKNOWN_ORIGINAL_CREATOR_UNMATCHED" });
 if (transfer) Object.assign(n, { 调出仓来源编号: "old-from", 调入仓来源编号: "old-to", 原制单角色: "旧角色" });
 else Object.assign(n, { 单据类型: "销售", 所属厅来源编号: "old-hall", 客户来源编号: "old-customer", 仓库来源编号: "old-wh", 优惠前金额: "10.00", 整单优惠: "1", 应结金额: "8.50" });
 const raw = { ...n, 原创建厅编号: "uploaded-warehouse-derived-hall" } as Record<string, string>;
 delete raw.创建厅归属来源; delete raw.创建厅归属原因;
 const fields = transfer ? ["调出仓来源编号", "调入仓来源编号"] : ["所属厅来源编号", "客户来源编号", "仓库来源编号"];
 return { batchId: id(1), fixedSourceNamespace: "synthetic.prepared.closure18", selection: { baseManifestSha256: hash, selectionSha256: hash, approvalSha256: hash, csvSha256: hash, source: "BASE_V2", entity, path: table.file as HistoryHeaderInput["selection"]["path"] },
  source: { id: id(transfer ? 500 : 400), batchId: id(1), entityType: entity, sourceKey: key, fileRef: "synthetic-header.xlsx", sheet: entity, rowNo: "2", sourceFileSha256: hash, rowSha256: hash, rawFields: raw, normalizedFields: n, fieldProvenance: { schema_version: 1, fields: {} } },
  bindings: Object.fromEntries(fields.map((field, i) => [field, { sourceKey: n[field]!, nativeId: id(100 + i) }])),
  creatorHallOverlay: { evidenceRef: "approved-overlay.csv#row2", file: "synthetic-header.xlsx", sheet: entity, row: "2", sourceId: key, documentNumber: key, personField: transfer ? "原制单账号编号" : "营业员来源编号", personId: "", uploadedWarehouseDerivedHall: "uploaded-warehouse-derived-hall", candidateCreatorHall: "", provenance: "UNKNOWN", reason: "UNKNOWN_ORIGINAL_CREATOR_UNMATCHED" } };
}
test("original prepared headers/line/settlement/transfer build complete document roots without any SQL observation", async () => {
 const facts = new SyntheticPreparedClosureFacts(id(1)), sales = prepareV3HistoryHeaderChunk([originalHeader("SALES_HEADER")]), transfer = prepareV3HistoryHeaderChunk([originalHeader("TRANSFER_HEADER")]);
 facts.headers(sales); facts.headers(transfer);
 const h = sales.rows[0]!.prepared, tr = transfer.rows[0]!.prepared;
 const detail = syntheticSalesDetailChunk(); detail.rows[0]!.source.rawFields.单据来源编号 = h.source.sourceKey; detail.rows[0]!.source.normalizedFields.单据来源编号 = h.source.sourceKey;
 (detail.rows[0]!.source.fieldProvenance.fields as Record<string, any>).单据来源编号.raw = h.source.sourceKey;
 const header = { sourceKey: h.source.sourceKey, nativeId: h.header.id, sourceRowId: h.source.id, sourceFileSha256: h.source.sourceFileSha256, rowSha256: h.source.rowSha256, version: 1 as const };
 facts.sales(prepareHistorySalesDetailChunk({ ...detail, rows: [{ ...detail.rows[0]!, header }] }));
 const settlement = settlementChunk(); settlement.rows[0]!.source.rawFields.单据来源编号 = h.source.sourceKey; settlement.rows[0]!.source.normalizedFields.单据来源编号 = h.source.sourceKey;
 (settlement.rows[0]!.source.fieldProvenance.fields as Record<string, any>).单据来源编号.raw = h.source.sourceKey;
 facts.settlements(prepareHistorySettlementChunk({ ...settlement, rows: [{ ...settlement.rows[0]!, header }] }));
 const n = Object.fromEntries(IMPORT_V2_TABLES.find(t => t.entity === "TRANSFER_LINE")!.columns.map(c => [c.name, ""]));
 Object.assign(n, { 来源编号: "TRANSFER-LINE", 单据来源编号: tr.source.sourceKey, 原行号: "1", SKU来源编号: "old-sku", 原数量: "-3", 原款号: "0007" });
 facts.transfers(prepareV3HistoryChunk({ batchId: id(1), fixedSourceNamespace: "synthetic.prepared.closure18", selection: { baseManifestSha256: "a".repeat(64), selectionSha256: "a".repeat(64), approvalSha256: "a".repeat(64), csvSha256: "a".repeat(64), entity: "TRANSFER_LINE", source: "BASE_V2", path: "business/17历史调拨明细.csv" }, rows: [{ source: { id: id(1700), batchId: id(1), entityType: "TRANSFER_LINE", sourceKey: n.来源编号!, fileRef: "synthetic-transfer.xlsx", sheet: "TRANSFER_LINE", rowNo: "2", sourceFileSha256: "a".repeat(64), rowSha256: "a".repeat(64), rawFields: { ...n }, normalizedFields: n, fieldProvenance: { schema_version: 1, fields: {} } }, header: { sourceKey: tr.source.sourceKey, nativeId: tr.header.id }, sku: { sourceKey: "old-sku", nativeId: id(50) } }] }));
 const snapshot = facts.snapshot();
 const expected = { batchId: id(1), fixedSourceNamespace: "synthetic.prepared.closure18", selectionSha256: "a".repeat(64), authorizedPayloadHash: "f".repeat(64),
  expectedCounts: { history_sales_header: 1, history_sales_line: 1, history_sales_settlement: 1, history_transfer_header: 1, history_transfer_line: 1, import_source_row: 5, import_sku_alias: 0, import_stock_contributor: 0, barcodes: 0 },
  expectedSourceEntityCounts: { ...Object.fromEntries(HISTORY_CLOSURE_SOURCE_ENTITIES.map(e => [e, 0])), SALES_HEADER: 1, SALES_LINE: 1, SETTLEMENT: 1, TRANSFER_HEADER: 1, TRANSFER_LINE: 1 },
  documents: [{ kind: "SALES", sourceKey: h.source.sourceKey, headerSourceRowId: h.source.id, headerId: h.header.id }, { kind: "TRANSFER", sourceKey: tr.source.sourceKey, headerSourceRowId: tr.source.id, headerId: tr.header.id }] };
 const result = await buildHistoryTypedClosureExpected({ ...expected, ...snapshot });
 assert.deepEqual(result.documents.map(d => [d.kind, d.lineCount, d.settlementCount]).sort(), [["SALES", 1, 1], ["TRANSFER", 1, 0]]);
 for (const relation of ["history_sales_header", "history_transfer_header"]) { const p = projection(snapshot.typedRows, relation)[0]!; assert.equal(p.created_hall_id, null); assert.equal(p.created_local_at, null); assert.equal(p.created_instant, null); }
 const swapped = structuredClone(snapshot); (projection(swapped.typedRows, "history_sales_line")[0]!).header_id = tr.header.id;
 await assert.rejects(buildHistoryTypedClosureExpected({ ...expected, ...swapped }), { code: "INVALID_HISTORY_CLOSURE_EXPECTED" });
 assert.notEqual(result.plan.sourceManifestSha256, result.plan.typedManifestSha256);
});
