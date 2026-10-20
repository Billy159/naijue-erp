/** DORMANT current-schema backend acceptance source. No execution without the existing explicit fresh-target gates.
 * Additional engine coverage only: disabled-account authentication STORAGE, not login/HTTP/production policy. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { TestContext } from "node:test";
import type { Pool } from "pg";
import { PostgresAuthenticationStore } from "../../adapters/postgres/src/auth-store.ts";
import { PostgresProductQueryReader } from "../../adapters/postgres/src/product-query-reader.ts";
import { PostgresSalesQueryReader } from "../../adapters/postgres/src/sales-query-reader.ts";
import { PostgresCutoffImportStore } from "../../adapters/postgres/src/inventory-cutoff-import-store.ts";
import { createCutoffImportService } from "../../packages/application/src/inventory-cutoff-import.ts";
import type { CutoffImportCommand, CutoffImportItem } from "../../packages/application/src/inventory-cutoff-import.ts";
import type { SalesCommand } from "../../packages/application/src/ports.ts";
import type { TransferCommand } from "../../packages/application/src/transfer-ports.ts";
import type { SalesListQuery, SalesReadScope } from "../../packages/application/src/sales-query-ports.ts";
import { quantity, version } from "../../packages/domain/src/values.ts";
import { afterStatement, balanceRows, commandSnapshot, contend, ledgerRows, oneVersionWinner, receiptCount, salesService, transferService } from "./adapter-helpers.ts";
import { expectSqlState, MIGRATIONS } from "./database.ts";
import { actor, ids, salesDraft, syntheticId, SYNTHETIC_DATE, SYNTHETIC_PASSWORD_SENTINEL, SYNTHETIC_REPLACED_SENTINEL,
  SYNTHETIC_TIME, transferActor, transferDraft } from "./fixtures.ts";
import { BACKEND_SCENARIOS } from "./migration-manifest.ts";
export { BACKEND_SCENARIOS } from "./migration-manifest.ts";

const parameters = (number: string | null = null): SalesListQuery => ({ filter: { startDate: null, endDate: null, status: null, businessType: null,
  hallId: null, salespersonId: null, customerId: null, warehouseId: null, number }, page: 1, pageSize: 20 });
const granted: SalesReadScope = { kind: "restricted", clauses: [{ hallId: ids.hall, warehouseId: ids.warehouse }] };
const read = <P>(input: P, scope: SalesReadScope = granted) => ({ actor, scope, parameters: input, signal: new AbortController().signal });

/** Deliberately the same reviewed synthetic current-scope facts as the sparse suite, with distinct receipt keys.
 * This is setup through the real import service, never direct initial-zero balance seeding or a production manifest. */
async function publishSyntheticBackendScope(pool: Pool): Promise<void> {
  const batchId = syntheticId("operation", 4000), sourceHash = "b".repeat(64);
  const sourceManifestRef = "synthetic:reviewed-backend-fixture-manifest-not-a-source-file";
  const envelope = { actorAccountId: ids.account, batchId };
  const source = (sourceEntityType: string, sourceKey: string) => ({ sourceEntityType, sourceKey, sourceRecordHash: sourceHash, sourceFileRef: "synthetic:no-file-opened" });
  const members: readonly CutoffImportItem[] = [
    ...[ids.warehouse, ids.toWarehouse].map(targetId => ({ ...source("WAREHOUSE", targetId), targetType: "WAREHOUSE" as const, targetId })),
    ...[ids.sku, ids.uncoveredSku, ids.raceSku].map(targetId => ({ ...source("SKU", targetId), targetType: "SKU" as const, targetId }))
  ];
  const baseline: CutoffImportItem = { ...source("INVENTORY_BASELINE", "only-nonzero-key"), targetType: "INVENTORY_LEDGER",
    warehouseId: ids.toWarehouse, skuId: ids.sku, quantity: quantity("7"), businessDate: SYNTHETIC_DATE };
  const commands: readonly CutoffImportCommand[] = [
    { ...envelope, action: "IMPORT_STAGE", requestKey: "SYNTHETIC_BACKEND_IMPORT_STAGE", sourceName: "synthetic-only", sourceHash, sourceManifestRef,
      cutoffAt: SYNTHETIC_TIME, mappingVersion: "synthetic-v1", expected: { WAREHOUSE: 2, SKU: 3, INVENTORY_LEDGER: 1, IMPORT_BATCH: 1 } },
    { ...envelope, action: "IMPORT_CHUNK", requestKey: "SYNTHETIC_BACKEND_IMPORT_MEMBERS", expectedSequence: 0, expectedCursor: 0, items: members },
    { ...envelope, action: "IMPORT_CHUNK", requestKey: "SYNTHETIC_BACKEND_IMPORT_BASELINE", expectedSequence: 1, expectedCursor: 5, items: [baseline] },
    { ...envelope, action: "IMPORT_PUBLISH", requestKey: "SYNTHETIC_BACKEND_IMPORT_PUBLISH", expectedSequence: 2, expectedCursor: 6,
      approval: { completeScope: true, absentMeansZero: true, allFilesVerified: true, finalDeltaVerified: true, noUnresolvedExceptions: true, sourceHash, sourceManifestRef } }
  ];
  const importer = createCutoffImportService({ store: new PostgresCutoffImportStore(pool), now: () => SYNTHETIC_TIME,
    authorization: { async assertAllowed(account, command) {
      assert.equal(account, ids.account); assert.equal(command.batchId, batchId);
      if (command.action === "IMPORT_STAGE") { assert.equal(command.sourceName, "synthetic-only"); assert.equal(command.sourceHash, sourceHash); }
    } } });
  for (const command of commands) await importer.execute(command);
  const batch = (await pool.query("SELECT status,checkpoint FROM naijue_erp.import_batch WHERE id=$1", [batchId])).rows[0]!;
  assert.equal(batch.status, "IMPORTED"); assert.equal(batch.checkpoint.sequence, 3); assert.equal(batch.checkpoint.cursor, 7);
  const balances = await balanceRows(pool);
  assert.equal(balances.length, 1); assert.equal(balances[0]?.warehouse_id, ids.toWarehouse); assert.equal(balances[0]?.sku_id, ids.sku);
  assert.equal(balances[0]?.quantity, "7"); assert.equal(balances[0]?.version, 1);
}

export async function runBackendAcceptance(t: TestContext, pool: Pool): Promise<void> {
  const sales = salesService(pool), transfers = transferService(pool), reader = new PostgresSalesQueryReader(pool);

  await t.test("current eight-migration backend setup publishes synthetic scope without initial-zero seeding", async () => {
    assert.deepEqual((await pool.query("SELECT version FROM naijue_erp.schema_migration ORDER BY version")).rows.map(row => row.version), MIGRATIONS.map(([value]) => value));
    assert.deepEqual(await balanceRows(pool), []);
    assert.equal((await pool.query("SELECT count(*)::integer AS count FROM naijue_erp.inventory_ledger")).rows[0]?.count, 0);
    const account = (await pool.query("SELECT login_enabled,password_hash FROM naijue_erp.user_account WHERE id=$1", [ids.account])).rows[0]!;
    assert.equal(account.login_enabled, false); assert.equal(account.password_hash, SYNTHETIC_PASSWORD_SENTINEL);
    await publishSyntheticBackendScope(pool);
  });

  await t.test(BACKEND_SCENARIOS[0], async () => {
    const store = new PostgresAuthenticationStore(pool);
    const tokenHash = createHash("sha256").update("SYNTHETIC_BACKEND_STORAGE_MARKER_NOT_A_LOGIN_TOKEN").digest("hex");
    const rolledBackHash = createHash("sha256").update("SYNTHETIC_BACKEND_ROLLED_BACK_MARKER").digest("hex");
    await store.transaction(async tx => {
      const account = await tx.findAccountByLogin("SYNTHETIC_DISABLED_NONLOGIN_ACCOUNT"); assert.ok(account);
      assert.equal(account.loginEnabled, false); assert.equal(account.role, "SALESPERSON"); assert.equal(account.hallEnabled, true);
      await tx.insertSession({ tokenHash, accountId: ids.account, authVersion: 1, createdAt: SYNTHETIC_TIME, expiresAt: "2026-10-20T13:00:00.000Z", revokedAt: null });
    });
    await assert.rejects(store.transaction(async tx => {
      await tx.getAccount(ids.account);
      await tx.insertSession({ tokenHash: rolledBackHash, accountId: ids.account, authVersion: 1, createdAt: SYNTHETIC_TIME, expiresAt: "2026-10-20T13:00:00.000Z", revokedAt: null });
      throw new Error("SYNTHETIC backend storage rollback");
    }), /SYNTHETIC backend storage rollback/);
    await store.transaction(async tx => { assert.equal(await tx.getSession(rolledBackHash), undefined); });
    await store.transaction(async tx => {
      assert.equal((await tx.getSession(tokenHash))?.revokedAt, null); await tx.getAccount(ids.account);
      assert.equal((await tx.lockSession(tokenHash, ids.account))?.accountId, ids.account);
      assert.equal(await tx.changePassword(ids.account, 1, SYNTHETIC_PASSWORD_SENTINEL, SYNTHETIC_REPLACED_SENTINEL, "2026-10-20T12:15:00.000Z"), true);
    });
    await store.transaction(async tx => {
      const account = await tx.getAccount(ids.account); assert.equal(account?.authVersion, 2); assert.equal(account?.loginEnabled, false);
      assert.equal(account?.passwordHash, SYNTHETIC_REPLACED_SENTINEL);
      assert.equal((await tx.lockSession(tokenHash, ids.account))?.revokedAt, "2026-10-20T12:15:00.000Z");
      assert.equal(await tx.getSession(rolledBackHash), undefined);
    });
  });

  await t.test(BACKEND_SCENARIOS[1], async () => {
    const draft = salesDraft(4100);
    await sales.execute({ actor, action: "SAVE", expectedVersion: null, requestKey: "SYNTHETIC_BACKEND_PRICING_SAVE", draft });
    assert.equal((await pool.query("SELECT count(*)::integer AS count FROM naijue_erp.sales_line WHERE sales_id=$1 AND is_current", [draft.header.id])).rows[0]?.count, 1);
    const before = await commandSnapshot(pool, "SALES", draft.header.id);
    await expectSqlState(pool, "23514", async client => { await client.query("INSERT INTO naijue_erp.fit(id,code,name,enabled,version) VALUES($1,'ZZ','SYNTHETIC INVALID FIT',true,1)", [syntheticId("fit", 4900)]); });
    await expectSqlState(pool, "23505", async client => { await client.query(`INSERT INTO naijue_erp.sku(id,product_id,color_id,fit_id,size_id,sku_code,enabled,version)
      VALUES($1,$2,$3,$4,$5,'SYNTHETIC_BACKEND_DUPLICATE_COORDINATE',true,1)`, [syntheticId("sku", 4901), ids.product, ids.color, ids.fit, ids.size]); });
    await expectSqlState(pool, "23514", async client => { await client.query("UPDATE naijue_erp.sales_line SET pricing_rule='UNIT_PRICE',discount_tenths=50 WHERE sales_id=$1", [draft.header.id]); }, "sales_line_pricing_facts");
    await expectSqlState(pool, "23514", async client => { await client.query("UPDATE naijue_erp.product_image SET byte_size=8388609 WHERE id=$1", [ids.image]); });
    await expectSqlState(pool, "22003", async client => { await client.query("UPDATE naijue_erp.product SET retail_price=10000000000000000.00 WHERE id=$1", [ids.product]); });
    await expectSqlState(pool, "23514", async client => { await client.query(`INSERT INTO naijue_erp.auth_session(token_hash,account_id,auth_version,created_at,expires_at)
      VALUES('not-a-sha256-hash',$1,2,$2,$3)`, [ids.account, SYNTHETIC_TIME, "2026-10-20T13:00:00Z"]); });
    assert.deepEqual(await commandSnapshot(pool, "SALES", draft.header.id), before);
  });

  await t.test(BACKEND_SCENARIOS[2], async () => {
    for (const [number, existing] of [[4110, true], [4120, false]] as const) {
      const draft = salesDraft(number);
      if (existing) await sales.execute({ actor, action: "SAVE", requestKey: `SYNTHETIC_BACKEND_SALES_${number}_SAVE`, expectedVersion: null, draft });
      const commands: SalesCommand[] = ["A", "B"].map(label => ({ actor, action: "SAVE", requestKey: `SYNTHETIC_BACKEND_SALES_${number}_CAS_${label}`,
        expectedVersion: existing ? version(1) : null, draft: { ...draft, header: { ...draft.header, note: `SYNTHETIC BACKEND CAS ${label}` } } }));
      const winner = oneVersionWinner(await contend(pool, `naijue:sales:${draft.header.id}`, () => commands.map(command => sales.execute(command))));
      assert.equal(winner.version, existing ? 2 : 1); assert.equal(await receiptCount(pool, draft.header.id), existing ? 2 : 1);
      assert.equal((await reader.readHistory(read({ salesId: draft.header.id, page: 1, pageSize: 20 }))).exactTotal, BigInt(existing ? 2 : 1));
    }
  });

  await t.test(BACKEND_SCENARIOS[3], async () => {
    for (const [number, existing] of [[4210, true], [4220, false]] as const) {
      const draft = transferDraft(number);
      if (existing) await transfers.execute({ actor: transferActor, action: "SAVE", requestKey: `SYNTHETIC_BACKEND_TRANSFER_${number}_SAVE`, expectedVersion: null, draft });
      const commands: TransferCommand[] = ["A", "B"].map(label => ({ actor: transferActor, action: "SAVE", requestKey: `SYNTHETIC_BACKEND_TRANSFER_${number}_CAS_${label}`,
        expectedVersion: existing ? version(1) : null, draft: { ...draft, header: { ...draft.header, note: `SYNTHETIC BACKEND CAS ${label}` } } }));
      const winner = oneVersionWinner(await contend(pool, `naijue:transfer:${draft.header.id}`, () => commands.map(command => transfers.execute(command))));
      assert.equal(winner.version, existing ? 2 : 1); assert.equal(await receiptCount(pool, draft.header.id), existing ? 2 : 1);
      assert.equal((await pool.query("SELECT count(*)::integer AS count FROM naijue_erp.audit_change WHERE object_type='TRANSFER' AND object_id=$1", [draft.header.id])).rows[0]?.count, existing ? 2 : 1);
    }
  });

  await t.test(BACKEND_SCENARIOS[4], async () => {
    for (const [number, businessType, quantities, due] of [[4300, "RETURN", ["-2"], -250n], [4301, "EXCHANGE", ["-2", "3"], 125n]] as const) {
      const draft = salesDraft(number, { businessType, quantities });
      await sales.execute({ actor, action: "SAVE", requestKey: `SYNTHETIC_BACKEND_${businessType}_SAVE`, expectedVersion: null, draft });
      const approved = await sales.execute({ actor, action: "APPROVE", requestKey: `SYNTHETIC_BACKEND_${businessType}_APPROVE`, expectedVersion: version(1), salesId: draft.header.id });
      const effects = await ledgerRows(pool, approved.operationId); assert.equal(effects.length, quantities.length);
      assert.equal(effects.reduce((sum, row) => sum + BigInt(String(row.quantity_delta)), 0n), -quantities.reduce((sum, count) => sum + BigInt(count), 0n));
      assert.deepEqual(effects.map(row => row.source_sales_line_id).sort(), draft.lines.map(line => line.id).sort());
      for (const line of draft.lines) {
        const effect = effects.find(row => row.source_sales_line_id === line.id); assert.ok(effect);
        assert.equal(BigInt(String(effect.quantity_delta)), -line.quantity);
        assert.equal(effect.event_kind, "APPROVE"); assert.equal(effect.endpoint, "SALES_WAREHOUSE");
        assert.equal(effect.warehouse_id, ids.warehouse); assert.equal(effect.sku_id, line.skuId);
        assert.equal(effect.source_document_version, 2); assert.equal(effect.reverses_entry_id, null); assert.equal(effect.source_transfer_line_id, null);
      }
      const detail = await reader.readDetail(read({ salesId: draft.header.id })); assert.equal(detail.document.header.netDue, due);
      assert.equal(detail.document.settlements[0]?.direction, businessType === "RETURN" ? "REFUND" : "RECEIVE");
      const reversed = await sales.execute({ actor, action: "UNAPPROVE", requestKey: `SYNTHETIC_BACKEND_${businessType}_UNAPPROVE`, expectedVersion: version(2), salesId: draft.header.id });
      const inverses = await ledgerRows(pool, reversed.operationId); assert.equal(inverses.length, effects.length);
      assert.deepEqual(inverses.map(row => row.reverses_entry_id).sort(), effects.map(row => row.id).sort());
      for (const inverse of inverses) {
        const original = effects.find(effect => effect.id === inverse.reverses_entry_id); assert.ok(original);
        assert.equal(BigInt(String(inverse.quantity_delta)), -BigInt(String(original.quantity_delta)));
        assert.equal(inverse.source_sales_line_id, original.source_sales_line_id); assert.equal(inverse.endpoint, original.endpoint);
        assert.equal(inverse.warehouse_id, original.warehouse_id); assert.equal(inverse.sku_id, original.sku_id);
        assert.equal(inverse.event_kind, "UNAPPROVE"); assert.equal(inverse.source_document_version, 3); assert.equal(inverse.source_transfer_line_id, null);
      }
      assert.equal((await balanceRows(pool)).find(row => row.warehouse_id === ids.warehouse && row.sku_id === ids.sku)?.quantity, "0");
      assert.equal((await balanceRows(pool)).find(row => row.warehouse_id === ids.toWarehouse && row.sku_id === ids.sku)?.quantity, "7");
    }
  });

  await t.test(BACKEND_SCENARIOS[5], async () => {
    const draft = salesDraft(4400, { quantities: ["2", "3"] });
    await sales.execute({ actor, action: "SAVE", requestKey: "SYNTHETIC_BACKEND_READ_SAVE", expectedVersion: null, draft });
    await sales.execute({ actor, action: "APPROVE", requestKey: "SYNTHETIC_BACKEND_READ_APPROVE", expectedVersion: version(1), salesId: draft.header.id });
    const list = await reader.readList(read(parameters(draft.header.number)));
    assert.equal(list.exactTotal, 1n); assert.equal(list.items[0]?.id, draft.header.id); assert.equal(list.items[0]?.netDue, 625n);
    assert.equal((await reader.readDetail(read({ salesId: draft.header.id }))).document.lines.length, 2);
    const statistics = await reader.readSettlementStatistics(read(parameters(draft.header.number)));
    assert.equal(statistics.exactApprovedDocuments, 1n); assert.equal(statistics.received, 625n); assert.equal(statistics.refunded, 0n);
    const hidden: SalesReadScope = { kind: "restricted", clauses: [{ hallId: ids.otherHall }] };
    assert.equal((await reader.readList(read(parameters(draft.header.number), hidden))).exactTotal, 0n);
    await assert.rejects(reader.readDetail(read({ salesId: draft.header.id }, hidden)), { code: "DOCUMENT_NOT_FOUND" });
    await assert.rejects(reader.readHistory(read({ salesId: draft.header.id, page: 1, pageSize: 20 }, hidden)), { code: "DOCUMENT_NOT_FOUND" });
    assert.equal((await reader.readSettlementStatistics(read(parameters(), hidden))).exactApprovedDocuments, 0n);
    for (const literal of ["%", "' OR TRUE --", "\\"]) assert.equal((await reader.readList(read(parameters(literal)))).exactTotal, 0n);
    assert.deepEqual((await reader.readList(read({ ...parameters(draft.header.number), page: 2 }))).items, []);
    await sales.execute({ actor, action: "UNAPPROVE", requestKey: "SYNTHETIC_BACKEND_READ_REVERSE", expectedVersion: version(2), salesId: draft.header.id });
    const history = await reader.readHistory(read({ salesId: draft.header.id, page: 1, pageSize: 20 }));
    assert.equal(history.exactTotal, 3n); assert.deepEqual(history.items.map(row => row.newVersion).sort(), [1, 2, 3]);
    assert.equal((await reader.readSettlementStatistics(read(parameters(draft.header.number)))).exactApprovedDocuments, 0n);
  });

  await t.test(BACKEND_SCENARIOS[6], async () => {
    const first = salesDraft(4500), second = salesDraft(4501);
    const draftA = { ...first, header: { ...first.header, number: "SYNTHETIC_BACKEND_SNAPSHOT_PAIR_A" } };
    const draftB = { ...second, header: { ...second.header, number: "SYNTHETIC_BACKEND_SNAPSHOT_PAIR_B" } };
    await sales.execute({ actor, action: "SAVE", requestKey: "SYNTHETIC_BACKEND_SNAPSHOT_A", expectedVersion: null, draft: draftA });
    let committedBetween = false;
    const snapshotReader = new PostgresSalesQueryReader(afterStatement(pool, /^SELECT COUNT\(\*\)::text AS exact_total FROM naijue_erp\.sales_header/, async () => {
      await sales.execute({ actor, action: "SAVE", requestKey: "SYNTHETIC_BACKEND_SNAPSHOT_B", expectedVersion: null, draft: draftB }); committedBetween = true;
    }));
    const snapshot = await snapshotReader.readList(read(parameters("SYNTHETIC_BACKEND_SNAPSHOT_PAIR_")));
    assert.equal(committedBetween, true); assert.equal(snapshot.exactTotal, 1n); assert.equal(snapshot.items.length, 1); assert.equal(snapshot.items[0]?.id, first.header.id);
    assert.equal((await reader.readList(read(parameters("SYNTHETIC_BACKEND_SNAPSHOT_PAIR_")))).exactTotal, 2n);
  });

  await t.test(BACKEND_SCENARIOS[7], async () => {
    const products = new PostgresProductQueryReader(pool);
    const productRead = { actor, grant: { productId: ids.product }, parameters: { productId: ids.product }, signal: new AbortController().signal };
    const basics = await products.readBasics(productRead); assert.equal(basics?.productId, ids.product); assert.equal(basics?.yearLabel, "2026");
    assert.equal(basics?.seasonLabel, null); assert.equal(basics?.supplierLabel, "SYNTHETIC ONLY SUPPLIER");
    const specifications = await products.readSpecifications(productRead); assert.ok(specifications);
    assert.deepEqual(specifications.skus.map(row => row.id).sort(), [ids.sku, ids.uncoveredSku, ids.raceSku].sort());
    assert.deepEqual(specifications.sizes.map(row => row.id), [ids.size, ids.otherSize]);
    assert.deepEqual(specifications.colors.map(row => row.id).sort(), [ids.color, ids.raceColor].sort());
    const images = await products.readImages(productRead); assert.equal(images?.images.length, 1); assert.equal(images?.images[0]?.byteSize, 1n);
    assert.equal(images?.images[0]?.id, ids.image);
    assert.equal((await products.readImage({ ...productRead, parameters: { productId: ids.product, imageId: ids.image } }))?.fileRef, "synthetic:not-a-real-file");
    assert.equal(await products.readImage({ ...productRead, parameters: { productId: ids.product, imageId: syntheticId("product", 4999) } }), null);
  });

  await t.test(BACKEND_SCENARIOS[8], async () => {
    const draft = transferDraft(4600);
    await transfers.execute({ actor: transferActor, action: "SAVE", requestKey: "SYNTHETIC_BACKEND_SWAP_SAVE", expectedVersion: null, draft });
    const beforeBalances = await balanceRows(pool);
    const swapped = { ...draft, lines: draft.lines.map(line => ({ ...line, lineNo: line.lineNo === 1 ? 2 : 1 })) };
    const result = await transfers.execute({ actor: transferActor, action: "SAVE", requestKey: "SYNTHETIC_BACKEND_SWAP", expectedVersion: version(1), draft: swapped });
    assert.equal(result.version, 2); assert.deepEqual(result.ledgerEntryIds, []);
    const audit = (await pool.query("SELECT before_values,after_values FROM naijue_erp.audit_change WHERE operation_id=$1", [result.operationId])).rows[0]!;
    assert.equal(audit.before_values.lines.length, 2); assert.equal(audit.after_values.lines.length, 2);
    const lines = (await pool.query("SELECT id,line_no FROM naijue_erp.transfer_line WHERE transfer_id=$1 ORDER BY line_no", [draft.header.id])).rows;
    assert.deepEqual(lines, [{ id: draft.lines[1]!.id, line_no: 1 }, { id: draft.lines[0]!.id, line_no: 2 }]);
    assert.deepEqual(await balanceRows(pool), beforeBalances); assert.equal(await receiptCount(pool, draft.header.id), 2);
  });

  t.diagnostic("Current 0001–0008 backend terminal assertions are engine evidence only if this explicit suite actually ran. Authentication STORAGE only; no login, password verification, HTTP/UI, real-data, production-policy, performance or deployment acceptance is implied.");
}
