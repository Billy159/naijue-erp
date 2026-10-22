/** Actual PostgreSQL tests; explicit dedicated target required, never an implicit skip/pass. */
import test from "node:test";
import assert from "node:assert/strict";
import { accountingIntegrationSettings, openFreshNativeAccountingDatabase } from "./native-import-accounting-database.ts";
import { assertNativeImportAccountingGuards } from "../../adapters/postgres/src/native-import-accounting-capability.ts";
import { PostgresCutoffImportStore } from "../../adapters/postgres/src/inventory-cutoff-import-store.ts";
import { PostgresNativePartyImportStore } from "../../adapters/postgres/src/native-party-import.ts";
import { PostgresNativeCatalogueImportStore } from "../../adapters/postgres/src/native-catalogue-import.ts";
import { PostgresNativeProductImportStore } from "../../adapters/postgres/src/native-product-import.ts";
import { PostgresNativeSkuImportStore } from "../../adapters/postgres/src/native-sku-import.ts";
import { PostgresNativeStockContributorStore } from "../../adapters/postgres/src/native-stock-contributor-import.ts";
import { PostgresNativeBarcodeImportStore } from "../../adapters/postgres/src/native-barcode-import.ts";
import { prepareNativePartyImportChunk } from "../../packages/application/src/native-party-import.ts";
import { prepareNativeCatalogueImportChunk } from "../../packages/application/src/native-catalogue-import.ts";
import { prepareNativeProductImportChunk } from "../../packages/application/src/native-product-import.ts";
import { prepareNativeSkuImport } from "../../packages/application/src/native-sku-import.ts";
import { prepareNativeStockGroup } from "../../packages/application/src/native-stock-contributor-import.ts";
import { prepareNativeBarcode } from "../../packages/application/src/native-barcode-import.ts";
import { createCutoffImportService, stableImportId } from "../../packages/application/src/inventory-cutoff-import.ts";
import type { CutoffImportCommand } from "../../packages/application/src/inventory-cutoff-import.ts";
import { NATIVE_IMPORT_RECORD_ACCOUNTING_VERSION, NATIVE_IMPORT_STOCK_CONSERVATION_VERSION,
  nativeStockContributorsManifestHash, nativeStockEffectiveGroupsManifestHash } from "../../packages/application/src/native-import-record-accounting.ts";
import type { NativeAccountingChunkCommand, NativeAccountingPublishCommand } from "../../packages/application/src/native-import-record-accounting.ts";
import { requestHash } from "../../packages/application/src/request-hash.ts";
import { entityId, quantity, businessDate } from "../../packages/domain/src/values.ts";
import { engineFixtures, ENGINE_NAMESPACE, ENGINE_TIME, id } from "./native-import-accounting-fixture.ts";
import { expectSqlState } from "./database.ts";
import type { PgSalesPool } from "../../adapters/postgres/src/sales-unit-of-work.ts";

test("fresh synthetic PostgreSQL: exact reviewed 1–15, native creators, signed accounting and nonempty publication", async t => {
  const database = await openFreshNativeAccountingDatabase(accountingIntegrationSettings(process.env));
  try {
    assert.ok(database.serverVersion >= 170000);
    const client = await database.pool.connect();
    try { await assertNativeImportAccountingGuards(client); } finally { client.release(); }
    assert.equal((await database.pool.query("SELECT count(*)::integer n FROM naijue_erp.import_record_accounting_claim")).rows[0]!.n, 0);
    const pool = database.pool, f = engineFixtures(), actor = entityId("account", id(802));
    const expectedHistory = { import_source_row: 14, import_sku_alias: 2, import_stock_contributor: 2, barcodes: 1,
      history_sales_header: 0, history_sales_line: 0, history_sales_settlement: 0, history_transfer_header: 0, history_transfer_line: 0 };
    const stage: CutoffImportCommand = { action: "IMPORT_STAGE", actorAccountId: actor, batchId: id(1), requestKey: "ENGINE-STAGE",
      sourceName: ENGINE_NAMESPACE, sourceManifestRef: "synthetic:immutable-selected-fixture-v1", sourceHash: "b".repeat(64),
      cutoffAt: "2026-10-20T00:00:00.000000Z", mappingVersion: "V2_HISTORY_NULLABLE_1",
      expected: { WAREHOUSE: 1, SKU: 1, INVENTORY_LEDGER: 1, IMPORT_BATCH: 1 },
      historyMetadata: { expectedCounts: expectedHistory, payloadHash: "f".repeat(64) } };
    const warehouse = f.parties[1]!, canonical = f.sku.canonicalSource;
    const chunk: NativeAccountingChunkCommand = { action: "IMPORT_CHUNK", actorAccountId: actor, batchId: id(1),
      requestKey: "ENGINE-CHUNK", expectedSequence: 0, expectedCursor: 0, accountingVersion: NATIVE_IMPORT_RECORD_ACCOUNTING_VERSION,
      items: [
        { targetType: "WAREHOUSE", targetId: entityId("warehouse", id(40)), sourceEntityType: "WAREHOUSE",
          sourceKey: warehouse.source.sourceKey, sourceFileRef: warehouse.source.fileRef, sourceRecordHash: warehouse.source.rowSha256,
          nativeRecord: warehouse.warehouseRecord! },
        { targetType: "SKU", targetId: entityId("sku", id(50)), sourceEntityType: "SKU", sourceKey: canonical.sourceKey,
          sourceFileRef: canonical.fileRef, sourceRecordHash: canonical.rowSha256, nativeRecord: f.sku.importRecord },
        { targetType: "INVENTORY_LEDGER", sourceEntityType: "INVENTORY_BASELINE", sourceKey: "STOCK:synthetic",
          sourceFileRef: "synthetic-original.xlsx", sourceRecordHash: "b".repeat(64), warehouseId: entityId("warehouse", id(40)),
          skuId: entityId("sku", id(50)), quantity: quantity("-7"), businessDate: businessDate("2026-10-20") },
      ] };
    const publish: NativeAccountingPublishCommand = { action: "IMPORT_PUBLISH", actorAccountId: actor, batchId: id(1),
      requestKey: "ENGINE-PUBLISH", expectedSequence: 1, expectedCursor: 3, accountingVersion: NATIVE_IMPORT_RECORD_ACCOUNTING_VERSION,
      approval: { completeScope: true, absentMeansZero: true, allFilesVerified: true, finalDeltaVerified: true, noUnresolvedExceptions: true,
        sourceHash: stage.sourceHash, sourceManifestRef: stage.sourceManifestRef },
      stockConservation: { version: NATIVE_IMPORT_STOCK_CONSERVATION_VERSION, selectionSha256: stage.sourceHash,
        effectiveStockCsvSha256: f.stock.selection.csvSha256, contributorLineageCsvSha256: f.stock.selection.lineageCsvSha256,
        contributorCount: 2, effectiveGroupCount: 1,
        contributorsManifestHash: nativeStockContributorsManifestHash(f.stock.contributors.map(c => ({ sourceRowId: c.source.id,
          sourceKey: c.source.sourceKey, sourceFileSha256: c.source.sourceFileSha256, rowSha256: c.source.rowSha256,
          fileRef: c.source.fileRef, sheet: c.source.sheet, rowNo: c.source.rowNo, warehouseSourceKey: "WH-1",
          canonicalSkuSourceKey: canonical.sourceKey, oldSkuSourceId: c.lineage.oldSkuSourceId, canonicalStockSourceKey: "STOCK:synthetic",
          warehouseId: id(40), skuId: id(50), signedQuantity: c.lineage.signedQuantity, sourceUnit: "件" }))),
        effectiveGroupsManifestHash: nativeStockEffectiveGroupsManifestHash([{ canonicalStockSourceKey: "STOCK:synthetic",
          warehouseSourceKey: "WH-1", canonicalSkuSourceKey: canonical.sourceKey, warehouseId: id(40), skuId: id(50),
          signedQuantity: "-7", sourceUnit: "件", contributorCount: 2, effectiveRowHash: requestHash(f.stock.canonicalStock) }]),
        warehouses: [{ sourceKey: "WH-1", nativeId: id(40), signedQuantity: "-7" }],
        warehouseUnits: [{ warehouseSourceKey: "WH-1", sourceUnit: "件", signedQuantity: "-7" }] } };
    const failedChunk = { ...chunk, requestKey: "ENGINE-ROLLBACK-CHUNK" };
    const allowed = new Map([stage, chunk, failedChunk, publish].map(command => [command.requestKey, structuredClone(command)]));
    let revoked = false;
    // Fixed independent synthetic plan, constructed before DB observation. No caller flags or row sums confer approval.
    const authorization = { async assertAllowed(account: string, command: CutoffImportCommand) {
      assert.equal(revoked, false, "SYNTHETIC_SOURCE_REVOKED"); assert.equal(account, actor);
      assert.deepEqual(command, allowed.get(command.requestKey), "Exact complete synthetic source command required");
    } };
    const store = new PostgresCutoffImportStore(pool, { nativeAccountingAuthorization: authorization });
    const service = createCutoffImportService({ store, authorization, now: () => ENGINE_TIME });
    const count = async (table: string) => (await pool.query(`SELECT count(*)::integer n FROM naijue_erp.${table}`)).rows[0]!.n;
    await t.test("stage through original service, no stock created", async () => {
      await pool.query("INSERT INTO naijue_erp.staff(id,name,role,employment_status,version) VALUES($1,'SYNTHETIC NONLOGIN IMPORT ACTOR','WAREHOUSE','在职',1)", [id(801)]);
      await pool.query(`INSERT INTO naijue_erp.user_account(id,staff_id,login_name,password_hash,login_enabled,auth_version,version,created_at,updated_at)
        VALUES($1,$2,'SYNTHETIC_ACCOUNTING_NONLOGIN','SYNTHETIC_DISABLED_NONLOGIN_NOT_A_PASSWORD_HASH',false,1,1,$3,$3)`, [actor, id(801), ENGINE_TIME]);
      await pool.query(`INSERT INTO naijue_erp.barcode_scheme(id,name,barcode_type,rule_description,code_length,rule_version,status)
        VALUES($1,'Synthetic scheme','RAW','Synthetic only',10,'1','HISTORICAL')`, [f.barcode.scheme.id]);
      assert.equal((await service.execute(stage)).status, "STAGED");
      assert.equal(await count("inventory_ledger"), 0); assert.equal(await count("inventory_balance"), 0);
    });
    await t.test("real native HALL/WAREHOUSE creator and immutable exact replay", async () => {
      const creator = new PostgresNativePartyImportStore(pool), prepared = prepareNativePartyImportChunk(f.parties);
      assert.deepEqual(await creator.stage(prepared), { inserted: 2, replayed: 0 });
      assert.deepEqual(await creator.stage(prepared), { inserted: 0, replayed: 2 });
    });
    await t.test("real native catalogue and PRODUCT creators", async () => {
      assert.deepEqual(await new PostgresNativeCatalogueImportStore(pool).stage(prepareNativeCatalogueImportChunk(f.catalogue)), { inserted: 6, replayed: 0, nativeCurrentMatchesCreation: true });
      assert.deepEqual(await new PostgresNativeProductImportStore(pool).stage(prepareNativeProductImportChunk(f.product)), { inserted: 1, replayed: 0 });
    });
    await t.test("real canonical SKU, two retained aliases and effective SKU barcode", async () => {
      assert.deepEqual(await new PostgresNativeSkuImportStore(pool).stage(prepareNativeSkuImport(f.sku)), { inserted: 2, replayed: 0 });
      assert.deepEqual(await new PostgresNativeBarcodeImportStore(pool).stage(prepareNativeBarcode(f.barcode)), { inserted: 1, replayed: 0 });
    });
    await t.test("real signed and zero original contributors, rollback after real native/claim writes", async () => {
      assert.deepEqual(await new PostgresNativeStockContributorStore(pool).stage(prepareNativeStockGroup(f.stock)), { inserted: 2, replayed: 0 });
      const injected = Error("SYNTHETIC_THROW_AFTER_REAL_AUDIT_INSERT");
      const faultPool: PgSalesPool = { async connect() { const client = await pool.connect(); return {
        async query(sql, parameters = []) { const result = await client.query(sql, parameters);
          if (/^INSERT INTO naijue_erp.audit_change/.test(sql)) throw injected; return result; },
        release(error) { client.release(error); },
      }; } };
      await assert.rejects(new PostgresCutoffImportStore(faultPool, { nativeAccountingAuthorization: authorization }).execute(failedChunk, ENGINE_TIME), e => e === injected);
      for (const table of ["inventory_ledger", "inventory_balance", "import_record_accounting_claim"]) assert.equal(await count(table), 0);
      assert.equal((await pool.query("SELECT checkpoint->>'cursor' cursor FROM naijue_erp.import_batch")).rows[0]!.cursor, "0");
      assert.equal((await pool.query("SELECT count(*)::integer n FROM naijue_erp.import_stock_contributor WHERE baseline_ledger_id IS NOT NULL")).rows[0]!.n, 0);
      assert.equal((await pool.query("SELECT count(*)::integer n FROM naijue_erp.operation_receipt WHERE request_key=$1", [failedChunk.requestKey])).rows[0]!.n, 0);
    });
    await t.test("real original CHUNK commits once, simultaneous exact-key replay creates no duplicate stock", async () => {
      const [first, replay] = await Promise.all([service.execute(chunk), service.execute(chunk)]);
      assert.deepEqual(first, replay); assert.equal(first.cursor, 3); assert.equal(first.sequence, 1);
      assert.equal(await count("inventory_ledger"), 1); assert.equal(await count("inventory_balance"), 1);
      assert.equal(await count("import_record_accounting_claim"), 3);
      assert.deepEqual((await pool.query("SELECT quantity::text quantity FROM naijue_erp.inventory_balance")).rows, [{ quantity: "-7" }]);
      assert.deepEqual((await pool.query("SELECT signed_quantity::text quantity FROM naijue_erp.import_stock_contributor ORDER BY signed_quantity")).rows,
        [{ quantity: "-7" }, { quantity: "0" }]);
      revoked = true; await assert.rejects(service.execute(chunk), /SYNTHETIC_SOURCE_REVOKED/); revoked = false;
    });
    await t.test("real catalogue check refuses a missing new guard; rollback restores it", async () => {
      const client = await pool.connect();
      try { await client.query("BEGIN"); await client.query("ALTER TABLE naijue_erp.import_record_accounting_claim DISABLE TRIGGER import_accounting_claim_identity");
        await assert.rejects(assertNativeImportAccountingGuards(client), { code: "NATIVE_IMPORT_GUARDS_NOT_READY" });
        await client.query("ROLLBACK"); await assertNativeImportAccountingGuards(client);
      } finally { client.release(); }
      await expectSqlState(pool, "23514", c => c.query("UPDATE naijue_erp.import_record_accounting_claim SET claimed_at=claimed_at+interval '1 second'").then(() => {}));
    });
    await t.test("real nonempty per-warehouse/unit conservation then FINAL, exact receipt replay and immutable facts", async () => {
      assert.equal((await service.execute(publish)).status, "IMPORTED");
      const before = { claims: await count("import_record_accounting_claim"), ledger: await count("inventory_ledger"), receipts: await count("operation_receipt") };
      assert.deepEqual(await service.execute(publish), await service.execute(publish));
      assert.deepEqual({ claims: await count("import_record_accounting_claim"), ledger: await count("inventory_ledger"), receipts: await count("operation_receipt") }, before);
      assert.deepEqual(before, { claims: 4, ledger: 1, receipts: 3 });
      assert.equal((await pool.query("SELECT history_validation_passed FROM naijue_erp.import_batch")).rows[0]!.history_validation_passed, true);
      await expectSqlState(pool, "23514", c => c.query("UPDATE naijue_erp.import_stock_contributor SET signed_quantity=0").then(() => {}));
      assert.equal((await pool.query("SELECT count(*)::integer n FROM naijue_erp.import_stock_contributor WHERE baseline_ledger_id=$1", [stableImportId("baseline", ENGINE_NAMESPACE, "INVENTORY_BASELINE", "STOCK:synthetic")])).rows[0]!.n, 2);
    });
  } finally { await database.close(); }
});
