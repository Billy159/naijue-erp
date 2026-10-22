/** Finite-schema/guard closure at the original store boundary; not engine acceptance. */
import test from "node:test";
import assert from "node:assert/strict";
import { PostgresCutoffImportStore } from "../adapters/postgres/src/inventory-cutoff-import-store.ts";
import { entityId } from "../packages/domain/src/values.ts";
import type { CutoffImportCommand } from "../packages/application/src/inventory-cutoff-import.ts";
test("all explicitly reviewed15/16/17 STAGE require actual native capability before any batch/audit/receipt write", async () => {
  const id = "00000000-0000-0000-0000-000000000001";
  const command: CutoffImportCommand = { action: "IMPORT_STAGE", actorAccountId: entityId("account", id), batchId: id,
    requestKey: "SYNTHETIC-STAGE-GUARD", sourceName: "synthetic.stage-guard", sourceManifestRef: "synthetic:closed-guard-scope",
    sourceHash: "a".repeat(64), cutoffAt: "2026-10-20T00:00:00Z", mappingVersion: "V2_HISTORY_NULLABLE_1",
    expected: { WAREHOUSE: 0, SKU: 0, INVENTORY_LEDGER: 0, IMPORT_BATCH: 1 },
    historyMetadata: { payloadHash: "b".repeat(64), expectedCounts: { import_source_row: 0, import_sku_alias: 0,
      history_sales_header: 0, history_sales_line: 0, history_sales_settlement: 0, history_transfer_header: 0,
      history_transfer_line: 0, import_stock_contributor: 0, barcodes: 0 } } };
  for (const length of [15, 16, 17]) {
    const calls: string[] = [];
    const store = new PostgresCutoffImportStore({ async connect() { return { async query(sql) {
      calls.push(sql);
      if (sql.includes("history-lifecycle:schema")) return { rows: [{ versions: Array.from({ length }, (_, i) => i + 1) }], rowCount: 1 };
      if (sql.includes("inventory:guards")) return { rows: [{ integrity_guards_present: true }], rowCount: 1 };
      if (sql.includes("native-accounting:guards")) return { rows: [{ accounting_guards_present: false }], rowCount: 1 };
      assert.doesNotMatch(sql, /^(INSERT|UPDATE|DELETE)/, "Missing guards must refuse before writes");
      return { rows: [], rowCount: 0 };
    }, release() {} }; } });
    await assert.rejects(store.execute(command, "2026-10-21T00:00:00Z"), { code: "NATIVE_IMPORT_GUARDS_NOT_READY" });
    assert.ok(calls.some(sql => sql.includes("native-accounting:guards"))); assert.equal(calls.at(-1), "ROLLBACK");
  }
});
