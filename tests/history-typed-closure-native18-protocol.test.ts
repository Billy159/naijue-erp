/** Protocol refusals only. No PostgreSQL, native adoption or source authorization is simulated as PASS. */
import test from "node:test";
import assert from "node:assert/strict";
import { engineFixtures } from "./integration/native-import-accounting-fixture.ts";
import { PostgresNativePartyImportStore } from "../adapters/postgres/src/native-party-import.ts";
import { PostgresNativeCatalogueImportStore } from "../adapters/postgres/src/native-catalogue-import.ts";
import { PostgresNativeProductImportStore } from "../adapters/postgres/src/native-product-import.ts";
import { PostgresNativeSkuImportStore } from "../adapters/postgres/src/native-sku-import.ts";
import { PostgresNativeStockContributorStore } from "../adapters/postgres/src/native-stock-contributor-import.ts";
import { PostgresNativeBarcodeImportStore } from "../adapters/postgres/src/native-barcode-import.ts";
import { PostgresNativePaymentImportStore } from "../adapters/postgres/src/native-payment-import.ts";
import { PostgresHistorySalesDetailStagingStore } from "../adapters/postgres/src/import-v3-history-sales-detail-staging-store.ts";
import { PostgresHistorySettlementStagingStore } from "../adapters/postgres/src/import-v3-history-settlement-staging-store.ts";
import { prepareNativePartyImportChunk } from "../packages/application/src/native-party-import.ts";
import { prepareNativeCatalogueImportChunk } from "../packages/application/src/native-catalogue-import.ts";
import { prepareNativeProductImportChunk } from "../packages/application/src/native-product-import.ts";
import { prepareNativeSkuImport } from "../packages/application/src/native-sku-import.ts";
import { prepareNativeStockGroup } from "../packages/application/src/native-stock-contributor-import.ts";
import { prepareNativeBarcode } from "../packages/application/src/native-barcode-import.ts";
import { prepareNativePaymentImportChunk } from "../packages/application/src/native-payment-import.ts";
import { prepareHistorySalesDetailChunk } from "../packages/application/src/import-v3-history-sales-detail.ts";
import { prepareHistorySettlementChunk } from "../packages/application/src/import-v3-history-settlement.ts";
import { syntheticSalesDetailChunk } from "./support/synthetic-sales-detail-fixtures.ts";
import { settlementChunk } from "./support/history-settlement-fixtures.ts";
import { paymentChunk } from "./support/native-payment-fixtures.ts";
import type { PgSalesPool, PgSalesResult } from "../adapters/postgres/src/sales-unit-of-work.ts";

class RefusalPool implements PgSalesPool {
 readonly calls: string[] = []; private inFlight = false;
 readonly versions: number[]; readonly legacyStop = Error("SYNTHETIC_STOP_AFTER_LEGACY_SCHEMA");
 constructor(version = 18) { this.versions = Array.from({ length: version }, (_, i) => i + 1); }
 async connect() { return { query: async (sql: string) => this.query(sql), release: () => {} }; }
 async query(sql: string): Promise<PgSalesResult> {
  assert.equal(this.inFlight, false, "Single transaction queries must stay sequential"); this.inFlight = true;
  try {
   this.calls.push(sql); await Promise.resolve();
   const answer = (rows: Record<string, unknown>[] = []) => ({ rows, rowCount: rows.length });
   if (/^BEGIN|^ROLLBACK|cutoff_import_lock\(\)/.test(sql)) return answer();
   if (sql.includes("array_agg(version ORDER BY version)")) return answer([{ versions: this.versions, installed_versions: this.versions }]);
   if (sql.includes("AS integrity_guards_present")) return answer([{ integrity_guards_present: true }]);
   if (sql.includes("AS accounting_guards_present")) return answer([{ accounting_guards_present: false }]);
   throw this.legacyStop;
  } finally { this.inFlight = false; }
 }
}
function cases() {
 const f = engineFixtures();
 return [
  ["party", (p: PgSalesPool) => new PostgresNativePartyImportStore(p).stage(prepareNativePartyImportChunk(f.parties))],
  ["catalogue", (p: PgSalesPool) => new PostgresNativeCatalogueImportStore(p).stage(prepareNativeCatalogueImportChunk(f.catalogue))],
  ["product", (p: PgSalesPool) => new PostgresNativeProductImportStore(p).stage(prepareNativeProductImportChunk(f.product))],
  ["sku", (p: PgSalesPool) => new PostgresNativeSkuImportStore(p).stage(prepareNativeSkuImport(f.sku))],
  ["stock", (p: PgSalesPool) => new PostgresNativeStockContributorStore(p).stage(prepareNativeStockGroup(f.stock))],
  ["barcode", (p: PgSalesPool) => new PostgresNativeBarcodeImportStore(p).stage(prepareNativeBarcode(f.barcode))],
  ["sales", (p: PgSalesPool) => new PostgresHistorySalesDetailStagingStore(p).stage(prepareHistorySalesDetailChunk(syntheticSalesDetailChunk()))],
  ["payment", (p: PgSalesPool) => new PostgresNativePaymentImportStore(p).stage(prepareNativePaymentImportChunk(paymentChunk()))],
  ["settlement", (p: PgSalesPool) => new PostgresHistorySettlementStagingStore(p).stage(prepareHistorySettlementChunk(settlementChunk()))]
 ] as const;
}
test("each native/history writer18 requires full runtime capabilities before source/native/batch writes", async () => {
 for (const [name, execute] of cases()) {
  const pool = new RefusalPool(); await assert.rejects(execute(pool), { code: "NATIVE_IMPORT_GUARDS_NOT_READY" }, name);
  assert.equal(pool.calls.filter(s => s.includes("AS accounting_guards_present")).length, 1, name);
  assert.equal(pool.calls.some(s => /INSERT|UPDATE|DELETE|:batch/.test(s)), false, name);
  assert.equal(pool.calls.at(-1), "ROLLBACK", name);
 }
});
test("unknown19 and missing earlier migration never reach capability or write paths", async () => {
 for (const [, execute] of cases()) for (const missing of [false, true]) {
  const pool = new RefusalPool(missing ? 18 : 19); if (missing) pool.versions.splice(12, 1);
  await assert.rejects(execute(pool)); assert.equal(pool.calls.some(s => /AS accounting_guards_present|INSERT|UPDATE|DELETE|:batch/.test(s)), false);
 }
});
test("original finite17 creator/detail behavior is retained without newly requiring18 capabilities", async () => {
 for (const [name, execute] of cases().slice(0, 7)) {
  const pool = new RefusalPool(17); await assert.rejects(execute(pool), e => e === pool.legacyStop, name);
  assert.equal(pool.calls.some(s => s.includes("AS accounting_guards_present")), false, name);
 }
});
