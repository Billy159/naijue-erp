/** Pure expected-manifest construction only; rows are synthetic prepared facts, never observed SQL values. */
import test from "node:test";
import assert from "node:assert/strict";
import { buildHistoryTypedClosureExpected, historyClosureProjectionSpec, historyClosureProjectionRow, hashHistoryClosureRows, HISTORY_CLOSURE_SOURCE_ENTITIES } from "../packages/application/src/history-typed-closure.ts";
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
