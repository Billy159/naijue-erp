/** Pure expected-manifest construction only; rows are synthetic prepared facts, never observed SQL values. */
import test from "node:test";
import { requestHash } from "../packages/application/src/request-hash.ts";
import assert from "node:assert/strict";
import { buildHistoryTypedClosureExpected, historyClosureProjectionSpec, historyClosureProjectionRow, hashHistoryClosureRows, historyClosureRowHash, encodeHistoryClosureValue, HISTORY_CLOSURE_SOURCE_ENTITIES } from "../packages/application/src/history-typed-closure.ts";
import { closureId as id } from "./support/history-closure-fixtures.ts";
import type { HistoryClosureRow } from "../packages/application/src/history-typed-closure.ts";

function fixture() {
 const empty = (relation: string): Record<string, any> => Object.fromEntries(historyClosureProjectionSpec().find(s => s.relation === relation)!.columns.map(c => [c, c === "quantity" ? "2" : c === "row_no" ? "1" : null]));
 const evidence = (n: number, entity: string, key: string, parent?: string) => ({ ...empty("import_source_row"), id: id(n), batch_id: id(1), entity_type: entity, source_key: key, file_ref: "synthetic.xlsx", sheet: "literal", row_no: String(n), source_file_sha256: "a".repeat(64), row_sha256: "b".repeat(64), raw_fields: { 来源编号: key, ...(parent ? { 单据来源编号: parent } : {}) }, normalized_fields: { 来源编号: key, ...(parent ? { 单据来源编号: parent } : {}) }, field_provenance: { schema_version: 1, literal: "source-only" } });
 const sourceRows = [evidence(10, "SALES_HEADER", "old-A"), evidence(11, "SALES_HEADER", "old-B"), evidence(12, "SALES_LINE", "line-A", "old-A"), evidence(13, "SALES_LINE", "line-B", "old-B")].map(s => historyClosureProjectionRow("import_source_row", s));
 const typedRows = [
  historyClosureProjectionRow("history_sales_header", { ...empty("history_sales_header"), id: id(20), batch_id: id(1), source_row_id: id(10) }),
  historyClosureProjectionRow("history_sales_header", { ...empty("history_sales_header"), id: id(21), batch_id: id(1), source_row_id: id(11) }),
  historyClosureProjectionRow("history_sales_line", { ...empty("history_sales_line"), id: id(30), batch_id: id(1), source_row_id: id(12), header_id: id(20) }),
  historyClosureProjectionRow("history_sales_line", { ...empty("history_sales_line"), id: id(31), batch_id: id(1), source_row_id: id(13), header_id: id(21) })
 ];
 const options = { batchId: id(1), fixedSourceNamespace: "synthetic.closure18", selectionSha256: "c".repeat(64), authorizedPayloadHash: "d".repeat(64), expectedCounts: { history_sales_header: 2, history_sales_line: 2, history_sales_settlement: 0, history_transfer_header: 0, history_transfer_line: 0, import_source_row: 4, import_sku_alias: 0, import_stock_contributor: 0, barcodes: 0 }, expectedSourceEntityCounts: { ...Object.fromEntries(HISTORY_CLOSURE_SOURCE_ENTITIES.map(e => [e, 0])), SALES_HEADER: 2, SALES_LINE: 2 }, documents: [{ kind: "SALES", sourceKey: "old-A", headerSourceRowId: id(10), headerId: id(20) }, { kind: "SALES", sourceKey: "old-B", headerSourceRowId: id(11), headerId: id(21) }] };
 return { sourceRows, typedRows, options };
}
test("source-only expected builder derives complete global and per-document digests from independent source/prepared rows", async () => {
 const f = fixture(); const result = await buildHistoryTypedClosureExpected({ ...f.options, sourceRows: f.sourceRows, typedRows: f.typedRows });
 assert.equal(result.documents.length, 2); assert.equal(result.documents[0]!.lineCount, 1); assert.equal(result.documents[1]!.settlementCount, 0);
 assert.equal(result.plan.sourceManifestSha256, (await hashHistoryClosureRows("source:" + id(1), f.sourceRows)).sha256);
 assert.equal(result.plan.typedManifestSha256, (await hashHistoryClosureRows("typed:" + id(1), f.typedRows)).sha256);
 assert.equal(result.documents[0]!.sourceDocumentSha256, (await hashHistoryClosureRows(`document-source:${id(1)}:SALES:${id(20)}`, [f.sourceRows[0]!, f.sourceRows[2]!])).sha256);
 assert.equal(result.documents[0]!.typedDocumentSha256, (await hashHistoryClosureRows(`document-typed:${id(1)}:SALES:${id(20)}`, [f.typedRows[0]!, f.typedRows[2]!])).sha256);
});
test("same total count cannot authorize swapped or repeated original lines; missing document and source table reject", async () => {
 for (const change of ["swap", "repeat", "missing-document", "truncated", "wrong-entity-count"]) {
  const f = fixture(), rows = structuredClone(f.typedRows);
  if (change === "swap") { (rows[2]!.projection as Record<string, unknown>).header_id = id(21); (rows[3]!.projection as Record<string, unknown>).header_id = id(20); }
  if (change === "repeat") (rows[3]!.projection as Record<string, unknown>).source_row_id = id(12);
  if (change === "missing-document") f.options.documents.pop();
  if (change === "wrong-entity-count") { f.options.expectedSourceEntityCounts.SALES_HEADER = 1; f.options.expectedSourceEntityCounts.SALES_LINE = 3; }
  await assert.rejects(buildHistoryTypedClosureExpected({ ...f.options, sourceRows: change === "truncated" ? f.sourceRows.slice(0, 3) : f.sourceRows, typedRows: rows }));
 }
});
test("incomplete source iterator and forged row key never return a partial plan or source authorization", async () => {
 const f = fixture(); async function* broken() { yield f.sourceRows[0]!; throw Error("SEALED_SOURCE_INCOMPLETE"); }
 await assert.rejects(buildHistoryTypedClosureExpected({ ...f.options, sourceRows: broken(), typedRows: f.typedRows }), /SEALED_SOURCE_INCOMPLETE/);
 const wrong: HistoryClosureRow[] = [{ ...f.sourceRows[0]!, key: id(999) }, ...f.sourceRows.slice(1)];
 await assert.rejects(buildHistoryTypedClosureExpected({ ...f.options, sourceRows: wrong, typedRows: f.typedRows }));
});


function mixedDigestFixture() {
 const f = fixture();
 const empty = (relation: string): Record<string, unknown> => Object.fromEntries(historyClosureProjectionSpec().find(s => s.relation === relation)!.columns.map(k => [k, k === 'quantity' ? '-2' : k === 'row_no' ? '1' : null]));
 const source = (n: number, entity: string, key: string, parent?: string) => historyClosureProjectionRow('import_source_row', {
  ...empty('import_source_row'), id: id(n), batch_id: id(1), entity_type: entity, source_key: key, file_ref: '合成😀.xlsx', sheet: '来源', row_no: String(n), source_file_sha256: 'a'.repeat(64), row_sha256: 'b'.repeat(64),
  raw_fields: { 来源编号: key, ...(parent ? { 单据来源编号: parent } : {}), nullable: null, empty: '', nested: { 文本: '𠮷😀', negative: -2 } }, normalized_fields: { 来源编号: key, ...(parent ? { 单据来源编号: parent } : {}) }, field_provenance: { schema_version: 1, literal: '合成' }
 });
 f.sourceRows.push(source(14, 'SETTLEMENT', '收款-😀', 'old-A'), source(15, 'TRANSFER_HEADER', '调拨-𠮷'), source(16, 'TRANSFER_LINE', '调拨明细', '调拨-𠮷'));
 f.typedRows.push(historyClosureProjectionRow('history_sales_settlement', { ...empty('history_sales_settlement'), id: id(40), batch_id: id(1), source_row_id: id(14), header_id: id(20), amount: '12.34' }),
  historyClosureProjectionRow('history_transfer_header', { ...empty('history_transfer_header'), id: id(22), batch_id: id(1), source_row_id: id(15) }),
  historyClosureProjectionRow('history_transfer_line', { ...empty('history_transfer_line'), id: id(32), batch_id: id(1), source_row_id: id(16), header_id: id(22), quantity: '-2' }));
 Object.assign(f.options.expectedCounts, { import_source_row: 7, history_sales_settlement: 1, history_transfer_header: 1, history_transfer_line: 1 });
 Object.assign(f.options.expectedSourceEntityCounts, { SETTLEMENT: 1, TRANSFER_HEADER: 1, TRANSFER_LINE: 1 });
 f.options.documents.push({ kind: 'TRANSFER', sourceKey: '调拨-𠮷', headerSourceRowId: id(15), headerId: id(22) });
 return f;
}
test('source702 mixed global and per-document roots preserve the pre-change golden and independently hashed original rows', async () => {
 const f = mixedDigestFixture(), before = structuredClone(f), result = await buildHistoryTypedClosureExpected({ ...f.options, sourceRows: f.sourceRows, typedRows: f.typedRows });
 assert.equal(requestHash(result), '9439c2ee58d987fd287959cec834a01e205c54a82e05d9849a768dd4ad4f4360'); // Captured with the original double-hash fold before this source change.
 assert.deepEqual(f, before);
 assert.equal(result.plan.sourceManifestSha256, (await hashHistoryClosureRows('source:' + id(1), f.sourceRows)).sha256);
 assert.equal(result.plan.typedManifestSha256, (await hashHistoryClosureRows('typed:' + id(1), f.typedRows)).sha256);
 for (const document of result.documents) {
  const sources = f.sourceRows.filter(r => { const p = r.projection as Record<string, unknown>; return p.id === document.headerSourceRowId || p.normalized_fields && (p.normalized_fields as Record<string, unknown>).单据来源编号 === document.sourceKey; });
  const typed = f.typedRows.filter(r => { const p = r.projection as Record<string, unknown>; return p.id === document.headerId || p.header_id === document.headerId; });
  assert.equal(document.sourceDocumentSha256, (await hashHistoryClosureRows(`document-source:${id(1)}:${document.kind}:${document.headerId}`, sources)).sha256);
  assert.equal(document.typedDocumentSha256, (await hashHistoryClosureRows(`document-typed:${id(1)}:${document.kind}:${document.headerId}`, typed)).sha256);
  assert.equal(document.headerSourceSha256, historyClosureRowHash(sources.find(r => (r.projection as Record<string, unknown>).id === document.headerSourceRowId)!));
 }
 const documents = result.documents.map(d => ({ relation: 'document_manifest', key: encodeHistoryClosureValue([d.kind, d.headerId]).toString('hex'), projection: d })).sort((a,b) => Buffer.compare(Buffer.from(a.key), Buffer.from(b.key)));
 assert.equal(result.plan.documentManifestSha256, (await hashHistoryClosureRows('documents:' + id(1), documents)).sha256);
});
test('source702 digest reuse preserves strict order, document membership, own-data and Unicode rejection', async () => {
 for (const mutate of [
  (f: ReturnType<typeof mixedDigestFixture>) => { f.sourceRows = [f.sourceRows[1]!, f.sourceRows[0]!, ...f.sourceRows.slice(2)]; },
  (f: ReturnType<typeof mixedDigestFixture>) => { (f.typedRows[6]!.projection as Record<string, unknown>).header_id = id(20); },
  (f: ReturnType<typeof mixedDigestFixture>) => { (f.sourceRows[0]!.projection as Record<string, unknown>).field_provenance = { invalid: '\ud800' }; },
  (f: ReturnType<typeof mixedDigestFixture>) => { (f.sourceRows[0]!.projection as Record<string, unknown>).raw_fields = new Date(); }
 ]) { const f = mixedDigestFixture(); mutate(f); await assert.rejects(buildHistoryTypedClosureExpected({ ...f.options, sourceRows: f.sourceRows, typedRows: f.typedRows })); }
 const f = mixedDigestFixture(); let calls = 0; Object.defineProperty(f.sourceRows[0]!.projection, 'raw_fields', { enumerable: true, get() { calls++; return {}; } });
 await assert.rejects(buildHistoryTypedClosureExpected({ ...f.options, sourceRows: f.sourceRows, typedRows: f.typedRows })); assert.equal(calls, 0);
});
