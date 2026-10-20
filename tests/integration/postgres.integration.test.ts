/** DORMANT REAL-POSTGRESQL SUITE. Not selected by npm test/check. Never substitute scripted protocol evidence.
 * Invoke only through the explicit opt-in runner on a freshly provisioned disposable loopback database. */
import test from "node:test";
import type { TestContext } from "node:test";
import type { Pool } from "pg";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PostgresAuthenticationStore } from "../../adapters/postgres/src/auth-store.ts";
import { PostgresSalesQueryReader } from "../../adapters/postgres/src/sales-query-reader.ts";
import { PostgresProductQueryReader } from "../../adapters/postgres/src/product-query-reader.ts";
import type { SalesCommand } from "../../packages/application/src/ports.ts";
import type { TransferCommand } from "../../packages/application/src/transfer-ports.ts";
import type { SalesListQuery, SalesReadScope } from "../../packages/application/src/sales-query-ports.ts";
import { version } from "../../packages/domain/src/values.ts";
import { integrationSettings, integrationSuite, requireCurrentIntegrationSuite } from "./safety.ts";
import { expectSqlState, MIGRATIONS, openFreshDatabase } from "./database.ts";
import { runSparseAcceptance, SPARSE_SCENARIOS } from "./sparse-acceptance.ts";
import { BACKEND_SCENARIOS, runBackendAcceptance } from "./backend-acceptance.ts";
import { assertDeferredBalanceFailure } from "./proof.ts";
import { actor, ids, salesDraft, seedSyntheticReferences, syntheticId, SYNTHETIC_PASSWORD_SENTINEL, SYNTHETIC_REPLACED_SENTINEL,
  SYNTHETIC_TIME, transferActor, transferDraft } from "./fixtures.ts";
import { afterStatement, balanceRows, commandSnapshot, contend, ledgerRows, oneVersionWinner, receiptCount, receiptLock,
  salesService, successfulPair, transferService } from "./adapter-helpers.ts";

const parameters = (number: string | null = null): SalesListQuery => ({ filter: { startDate: null, endDate: null, status: null, businessType: null,
  hallId: null, salespersonId: null, customerId: null, warehouseId: null, number }, page: 1, pageSize: 20 });
const granted: SalesReadScope = { kind: "restricted", clauses: [{ hallId: ids.hall, warehouseId: ids.warehouse }] };
const read = <P>(parameters: P, scope: SalesReadScope = granted) => ({ actor, scope, parameters, signal: new AbortController().signal });

test("REAL PostgreSQL: explicit disposable target and selected synthetic acceptance scenario", { timeout: 240000 }, async t => {
  // Fail closed, never skip, before Pool construction. This is an accident-prevention guard, not an authorization system.
  const settings = integrationSettings(process.env, true);
  const suite = integrationSuite(process.env);
  requireCurrentIntegrationSuite(suite); // Preserve old source below, but never run it against incompatible current adapters.
  const database = await openFreshDatabase(settings, { afterVersionFive: pool => seedSyntheticReferences(pool, { sparse: true }) });
  t.after(async () => { await database.close(); });
  const { pool } = database;
  t.diagnostic(`Actual PostgreSQL server_version_num=${database.serverVersion}; synthetic disposable target only`);
  t.diagnostic(`Selected current suite=${suite}; prepared scenarios: ${(suite === "backend-0001-0008" ? BACKEND_SCENARIOS : SPARSE_SCENARIOS).join("; ")}`);
  if (suite === "backend-0001-0008") await runBackendAcceptance(t, pool);
  else await runSparseAcceptance(t, pool);
});

/** Preserved historical 0001–0005 test source only. Intentionally never registered or invoked:
 * current adapters require 0007 key locks and 0008 semantics. Original evidence logs are unchanged. */
async function historicalNativeAcceptanceSource(t: TestContext, pool: Pool): Promise<void> {
  await seedSyntheticReferences(pool);
  const sales = salesService(pool), transfers = transferService(pool), salesReader = new PostgresSalesQueryReader(pool);
  let salesLifecycleId = syntheticId("sales", 100), transferLifecycleId = syntheticId("transfer", 200);

  await t.test("all five exact migration versions applied once; synthetic account cannot log in", async () => {
    assert.deepEqual((await pool.query("SELECT version FROM naijue_erp.schema_migration ORDER BY version")).rows.map(row => row.version), MIGRATIONS.slice(0, 5).map(([value]) => value));
    const { rows: [account] } = await pool.query("SELECT login_enabled,password_hash FROM naijue_erp.user_account WHERE id=$1", [ids.account]);
    assert.equal(account?.login_enabled, false); assert.equal(account?.password_hash, SYNTHETIC_PASSWORD_SENTINEL);
    assert.equal((await pool.query("SELECT COUNT(*)::integer AS count FROM naijue_erp.size WHERE code='SYNTHETIC_REPEAT'")).rows[0]?.count, 2);
  });

  await t.test("sales SAVE/APPROVE/UNAPPROVE, exact idempotent contention and linked reversal facts", async () => {
    const draft = salesDraft(100, { quantities: ["2", "3"] }); salesLifecycleId = draft.header.id;
    const before = await balanceRows(pool);
    const save: SalesCommand = { actor, action: "SAVE", expectedVersion: null, requestKey: "SYNTHETIC_SALES_100_SAVE", draft };
    const [saved] = successfulPair(await contend(pool, receiptLock(save.requestKey), () => [sales.execute(save), sales.execute(save)]));
    assert.equal(saved.version, 1); assert.equal(saved.status, "DRAFT"); assert.deepEqual(saved.ledgerEntryIds, []);
    assert.deepEqual(await balanceRows(pool), before); assert.equal(await receiptCount(pool, draft.header.id), 1);
    await assert.rejects(sales.execute({ ...save, draft: { ...draft, header: { ...draft.header, note: "SYNTHETIC DIFFERENT CONTENT" } } }), { code: "IDEMPOTENCY_CONFLICT" });

    const approve: SalesCommand = { actor, action: "APPROVE", expectedVersion: version(1), requestKey: "SYNTHETIC_SALES_100_APPROVE", salesId: draft.header.id };
    const [approved] = successfulPair(await contend(pool, receiptLock(approve.requestKey), () => [sales.execute(approve), sales.execute(approve)]));
    assert.equal(approved.status, "APPROVED"); assert.equal(approved.version, 2); assert.equal(approved.ledgerEntryIds.length, 2);
    const originals = await ledgerRows(pool, approved.operationId);
    assert.equal(originals.length, 2); assert.equal(originals.reduce((sum, row) => sum + BigInt(String(row.quantity_delta)), 0n), -5n);
    const after = await balanceRows(pool);
    assert.equal(after.find(row => row.warehouse_id === ids.warehouse)?.quantity, "-5");
    assert.equal(after.find(row => row.warehouse_id === ids.warehouse)?.version, Number(before.find(row => row.warehouse_id === ids.warehouse)?.version) + 2);
    assert.equal(await receiptCount(pool, draft.header.id), 2);
    const statistics = await salesReader.readSettlementStatistics(read(parameters(draft.header.number)));
    assert.equal(statistics.exactApprovedDocuments, 1n); assert.equal(statistics.received, 625n); assert.equal(statistics.refunded, 0n);
    await assert.rejects(sales.execute({ actor, action: "UNAPPROVE", salesId: draft.header.id, requestKey: "SYNTHETIC_SALES_STALE", expectedVersion: version(1) }), { code: "VERSION_CONFLICT" });

    const reverse: SalesCommand = { actor, action: "UNAPPROVE", expectedVersion: version(2), requestKey: "SYNTHETIC_SALES_100_UNAPPROVE", salesId: draft.header.id };
    const [unapproved] = successfulPair(await contend(pool, receiptLock(reverse.requestKey), () => [sales.execute(reverse), sales.execute(reverse)]));
    assert.equal(unapproved.status, "DRAFT"); assert.equal(unapproved.version, 3);
    const reversals = await ledgerRows(pool, unapproved.operationId);
    assert.equal(reversals.length, originals.length);
    for (const row of reversals) {
      const original = originals.find(old => old.id === row.reverses_entry_id); assert.ok(original);
      assert.equal(BigInt(String(row.quantity_delta)), -BigInt(String(original.quantity_delta)));
      assert.equal(row.source_sales_line_id, original.source_sales_line_id); assert.equal(row.endpoint, original.endpoint);
    }
    assert.equal((await balanceRows(pool)).find(row => row.warehouse_id === ids.warehouse)?.quantity, "0");
    assert.deepEqual(await sales.execute(save), saved); // Original receipt result remains immutable after later versions.
    assert.equal(await receiptCount(pool, draft.header.id), 3);
    assert.equal((await salesReader.readSettlementStatistics(read(parameters(draft.header.number)))).exactApprovedDocuments, 0n);
  });

  await t.test("sales version CAS has one winner under two distinct real contending request keys", async () => {
    const draft = salesDraft(110); await sales.execute({ actor, action: "SAVE", requestKey: "SYNTHETIC_SALES_110_SAVE", expectedVersion: null, draft });
    const commands: SalesCommand[] = ["A", "B"].map(label => ({ actor, action: "SAVE", requestKey: `SYNTHETIC_SALES_110_CAS_${label}`, expectedVersion: version(1),
      draft: { ...draft, header: { ...draft.header, note: `SYNTHETIC CAS ${label}` } } }));
    const winner = oneVersionWinner(await contend(pool, `naijue:sales:${draft.header.id}`, () => commands.map(command => sales.execute(command))));
    assert.equal(winner.version, 2); assert.equal(await receiptCount(pool, draft.header.id), 2);
    assert.equal((await salesReader.readHistory(read({ salesId: draft.header.id, page: 1, pageSize: 20 }))).exactTotal, 2n);
  });

  await t.test("sales absent-row insertion race has one committed SAVE and one version conflict", async () => {
    const draft = salesDraft(120);
    const commands: SalesCommand[] = ["A", "B"].map(label => ({ actor, action: "SAVE", expectedVersion: null, requestKey: `SYNTHETIC_SALES_120_NEW_${label}`, draft }));
    const winner = oneVersionWinner(await contend(pool, `naijue:sales:${draft.header.id}`, () => commands.map(command => sales.execute(command))));
    assert.equal(winner.version, 1); assert.equal(await receiptCount(pool, draft.header.id), 1);
  });

  await t.test("sales SQL error after native inventory/header/audit writes rolls everything back; same original key can retry", async () => {
    const draft = salesDraft(130, { quantities: ["2", "3"] });
    await sales.execute({ actor, action: "SAVE", requestKey: "SYNTHETIC_SALES_130_SAVE", expectedVersion: null, draft });
    const before = await commandSnapshot(pool, "SALES", draft.header.id);
    const broken = salesService(afterStatement(pool, /^INSERT INTO naijue_erp\.audit_change/, async client => { await client.query("SELECT 1/0"); }));
    const command: SalesCommand = { actor, action: "APPROVE", requestKey: "SYNTHETIC_SALES_130_RETRY_ORIGINAL", expectedVersion: version(1), salesId: draft.header.id };
    await assert.rejects(broken.execute(command), { code: "22012" });
    assert.deepEqual(await commandSnapshot(pool, "SALES", draft.header.id), before);
    const approved = await sales.execute(command); assert.equal(approved.version, 2);
    await sales.execute({ actor, action: "UNAPPROVE", requestKey: "SYNTHETIC_SALES_130_RESTORE", expectedVersion: version(2), salesId: draft.header.id });
  });

  await t.test("sales missing coverage stays missing and leaves no posting/receipt/audit/version changes", async () => {
    const draft = salesDraft(140, { uncovered: true });
    await sales.execute({ actor, action: "SAVE", requestKey: "SYNTHETIC_SALES_140_SAVE", expectedVersion: null, draft });
    const before = await commandSnapshot(pool, "SALES", draft.header.id);
    await assert.rejects(sales.execute({ actor, action: "APPROVE", requestKey: "SYNTHETIC_SALES_140_APPROVE", expectedVersion: version(1), salesId: draft.header.id }), { code: "INVENTORY_NOT_READY" });
    assert.deepEqual(await commandSnapshot(pool, "SALES", draft.header.id), before);
    assert.equal((await pool.query("SELECT COUNT(*)::integer AS count FROM naijue_erp.inventory_balance WHERE sku_id=$1", [ids.uncoveredSku])).rows[0]?.count, 0);
  });

  await t.test("independent synthetic RETURN and EXCHANGE retain signed amounts and exact reversible ledger effects", async () => {
    for (const [number, businessType, quantities, due] of [[145, "RETURN", ["-2"], -250n], [146, "EXCHANGE", ["-2", "3"], 125n]] as const) {
      const draft = salesDraft(number, { businessType, quantities });
      await sales.execute({ actor, action: "SAVE", requestKey: `SYNTHETIC_${businessType}_SAVE`, expectedVersion: null, draft });
      const approved = await sales.execute({ actor, action: "APPROVE", requestKey: `SYNTHETIC_${businessType}_APPROVE`, expectedVersion: version(1), salesId: draft.header.id });
      const effects = await ledgerRows(pool, approved.operationId);
      assert.equal(effects.length, quantities.length);
      assert.equal(effects.reduce((sum, row) => sum + BigInt(String(row.quantity_delta)), 0n), -quantities.reduce((sum, count) => sum + BigInt(count), 0n));
      const detail = await salesReader.readDetail(read({ salesId: draft.header.id })); assert.equal(detail.document.header.netDue, due);
      assert.equal(detail.document.settlements[0]?.direction, businessType === "RETURN" ? "REFUND" : "RECEIVE");
      await sales.execute({ actor, action: "UNAPPROVE", requestKey: `SYNTHETIC_${businessType}_UNAPPROVE`, expectedVersion: version(2), salesId: draft.header.id });
      assert.ok((await balanceRows(pool)).every(row => row.quantity === "0"));
    }
  });

  await t.test("transfer SAVE/APPROVE/UNAPPROVE retains both endpoints and distinct repeated-SKU lines", async () => {
    const draft = transferDraft(200); transferLifecycleId = draft.header.id;
    const before = await balanceRows(pool);
    const save: TransferCommand = { actor: transferActor, action: "SAVE", requestKey: "SYNTHETIC_TRANSFER_200_SAVE", expectedVersion: null, draft };
    const [saved] = successfulPair(await contend(pool, receiptLock(save.requestKey), () => [transfers.execute(save), transfers.execute(save)]));
    assert.equal(saved.version, 1); assert.deepEqual(saved.ledgerEntryIds, []); assert.deepEqual(await balanceRows(pool), before);
    await assert.rejects(transfers.execute({ ...save, draft: { ...draft, header: { ...draft.header, note: "SYNTHETIC CONFLICT" } } }), { code: "IDEMPOTENCY_CONFLICT" });
    const approve: TransferCommand = { actor: transferActor, action: "APPROVE", requestKey: "SYNTHETIC_TRANSFER_200_APPROVE", expectedVersion: version(1), transferId: draft.header.id };
    const [approved] = successfulPair(await contend(pool, receiptLock(approve.requestKey), () => [transfers.execute(approve), transfers.execute(approve)]));
    assert.equal(approved.version, 2); assert.equal(approved.status, "APPROVED"); assert.equal(approved.ledgerEntryIds.length, 4);
    const originals = await ledgerRows(pool, approved.operationId);
    for (const line of draft.lines) {
      const endpoints = originals.filter(row => row.source_transfer_line_id === line.id);
      assert.equal(endpoints.length, 2); assert.equal(endpoints.find(row => row.endpoint === "FROM")?.quantity_delta, (-line.quantity).toString());
      assert.equal(endpoints.find(row => row.endpoint === "TO")?.quantity_delta, line.quantity.toString());
    }
    const posted = await balanceRows(pool);
    assert.equal(posted.find(row => row.warehouse_id === ids.warehouse)?.quantity, "-5"); assert.equal(posted.find(row => row.warehouse_id === ids.toWarehouse)?.quantity, "5");
    for (const row of posted) assert.equal(row.version, Number(before.find(old => old.warehouse_id === row.warehouse_id)?.version) + 2);
    const reverse: TransferCommand = { actor: transferActor, action: "UNAPPROVE", requestKey: "SYNTHETIC_TRANSFER_200_UNAPPROVE", expectedVersion: version(2), transferId: draft.header.id };
    const [unapproved] = successfulPair(await contend(pool, receiptLock(reverse.requestKey), () => [transfers.execute(reverse), transfers.execute(reverse)]));
    assert.equal(unapproved.version, 3); assert.equal(unapproved.status, "DRAFT");
    const reversals = await ledgerRows(pool, unapproved.operationId); assert.equal(reversals.length, 4);
    for (const row of reversals) {
      const original = originals.find(old => old.id === row.reverses_entry_id); assert.ok(original);
      assert.equal(row.source_transfer_line_id, original.source_transfer_line_id); assert.equal(row.endpoint, original.endpoint);
      assert.equal(BigInt(String(row.quantity_delta)), -BigInt(String(original.quantity_delta)));
    }
    assert.ok((await balanceRows(pool)).every(row => row.quantity === "0"));
    assert.deepEqual(await transfers.execute(save), saved); assert.equal(await receiptCount(pool, draft.header.id), 3);
  });

  await t.test("transfer line-position swap commits through real deferred uniqueness and exact sparse audit", async () => {
    const draft = transferDraft(200);
    const swapped = { ...draft, lines: draft.lines.map(line => ({ ...line, lineNo: line.lineNo === 1 ? 2 : 1 })) };
    const result = await transfers.execute({ actor: transferActor, action: "SAVE", requestKey: "SYNTHETIC_TRANSFER_200_SWAP", expectedVersion: version(3), draft: swapped });
    assert.equal(result.version, 4);
    const { rows: [audit] } = await pool.query("SELECT before_values,after_values FROM naijue_erp.audit_change WHERE operation_id=$1", [result.operationId]);
    assert.equal(audit?.before_values.lines.length, 2); assert.equal(audit?.after_values.lines.length, 2);
    const lines = (await pool.query("SELECT id,line_no FROM naijue_erp.transfer_line WHERE transfer_id=$1 ORDER BY line_no", [draft.header.id])).rows;
    assert.equal(lines[0]?.id, draft.lines[1]?.id); assert.equal(lines[1]?.id, draft.lines[0]?.id);
  });

  await t.test("transfer distinct-key version CAS and absent-row insertion races each have one winner", async () => {
    for (const [number, existing] of [[210, true], [220, false]] as const) {
      const draft = transferDraft(number);
      if (existing) await transfers.execute({ actor: transferActor, action: "SAVE", requestKey: `SYNTHETIC_TRANSFER_${number}_SAVE`, expectedVersion: null, draft });
      const commands: TransferCommand[] = ["A", "B"].map(label => ({ actor: transferActor, action: "SAVE", requestKey: `SYNTHETIC_TRANSFER_${number}_CAS_${label}`,
        expectedVersion: existing ? version(1) : null, draft: { ...draft, header: { ...draft.header, note: `SYNTHETIC CAS ${label}` } } }));
      const result = oneVersionWinner(await contend(pool, `naijue:transfer:${draft.header.id}`, () => commands.map(command => transfers.execute(command))));
      assert.equal(result.version, existing ? 2 : 1); assert.equal(await receiptCount(pool, draft.header.id), existing ? 2 : 1);
    }
  });

  await t.test("transfer SQL fault after both endpoints rolls back both warehouses, document, ledger, audit and receipt", async () => {
    const draft = transferDraft(230);
    await transfers.execute({ actor: transferActor, action: "SAVE", requestKey: "SYNTHETIC_TRANSFER_230_SAVE", expectedVersion: null, draft });
    const before = await commandSnapshot(pool, "TRANSFER", draft.header.id); let effects = 0;
    const broken = transferService(afterStatement(pool, /^INSERT INTO naijue_erp\.audit_change/, async client => {
      effects = Number((await client.query("SELECT COUNT(*)::integer AS count FROM naijue_erp.inventory_ledger WHERE source_transfer_line_id=ANY($1::uuid[])", [draft.lines.map(line => line.id)])).rows[0]?.count);
      await client.query("SELECT 1/0");
    }));
    const command: TransferCommand = { actor: transferActor, action: "APPROVE", requestKey: "SYNTHETIC_TRANSFER_230_RETRY_ORIGINAL", expectedVersion: version(1), transferId: draft.header.id };
    await assert.rejects(broken.execute(command), { code: "22012" }); assert.equal(effects, 4);
    assert.deepEqual(await commandSnapshot(pool, "TRANSFER", draft.header.id), before);
    assert.equal((await transfers.execute(command)).version, 2);
    await transfers.execute({ actor: transferActor, action: "UNAPPROVE", requestKey: "SYNTHETIC_TRANSFER_230_RESTORE", expectedVersion: version(2), transferId: draft.header.id });
  });

  await t.test("transfer deferred final-balance mismatch rejects COMMIT and leaves no partial operation", async () => {
    const draft = transferDraft(240);
    await transfers.execute({ actor: transferActor, action: "SAVE", requestKey: "SYNTHETIC_TRANSFER_240_SAVE", expectedVersion: null, draft });
    const before = await commandSnapshot(pool, "TRANSFER", draft.header.id);
    const evidence = { sabotageApplied: false, commitAttempted: false };
    const broken = transferService(afterStatement(pool, /^INSERT INTO naijue_erp\.operation_receipt/, async client => {
      const sabotaged = await client.query("UPDATE naijue_erp.inventory_balance SET quantity=quantity+1 WHERE warehouse_id=$1 AND sku_id=$2", [ids.warehouse, ids.sku]);
      assert.equal(sabotaged.rowCount, 1, "the intended test-owned balance row must actually be changed");
      evidence.sabotageApplied = true;
    }, sql => { if (sql === "COMMIT") evidence.commitAttempted = true; }));
    await assert.rejects(broken.execute({ actor: transferActor, action: "APPROVE", requestKey: "SYNTHETIC_TRANSFER_240_BAD_BALANCE", expectedVersion: version(1), transferId: draft.header.id }),
      error => assertDeferredBalanceFailure(error, evidence));
    assert.deepEqual(await commandSnapshot(pool, "TRANSFER", draft.header.id), before);
  });

  await t.test("transfer missing coverage remains absent and shared SALES/TRANSFER actor-key identity conflicts", async () => {
    const draft = transferDraft(250, ["2"], true);
    await transfers.execute({ actor: transferActor, action: "SAVE", requestKey: "SYNTHETIC_TRANSFER_250_SAVE", expectedVersion: null, draft });
    const before = await commandSnapshot(pool, "TRANSFER", draft.header.id);
    await assert.rejects(transfers.execute({ actor: transferActor, action: "APPROVE", requestKey: "SYNTHETIC_TRANSFER_250_APPROVE", expectedVersion: version(1), transferId: draft.header.id }), { code: "INVENTORY_NOT_READY" });
    assert.deepEqual(await commandSnapshot(pool, "TRANSFER", draft.header.id), before);
    await assert.rejects(transfers.execute({ actor: transferActor, action: "SAVE", requestKey: "SYNTHETIC_SALES_100_SAVE", expectedVersion: null, draft: transferDraft(251) }), { code: "IDEMPOTENCY_CONFLICT" });
    await assert.rejects(sales.execute({ actor, action: "SAVE", requestKey: "SYNTHETIC_TRANSFER_200_SAVE", expectedVersion: null, draft: salesDraft(151) }), { code: "IDEMPOTENCY_CONFLICT" });
  });

  await t.test("real scoped sales list/detail/history/statistics queries and literal substring filters", async () => {
    const draft = salesDraft(100, { quantities: ["2", "3"] });
    const list = await salesReader.readList(read(parameters(draft.header.number)));
    assert.equal(list.exactTotal, 1n); assert.equal(list.items[0]?.id, draft.header.id); assert.equal(list.items[0]?.netDue, 625n);
    assert.equal((await salesReader.readDetail(read({ salesId: draft.header.id }))).document.lines.length, 2);
    const history = await salesReader.readHistory(read({ salesId: draft.header.id, page: 1, pageSize: 20 }));
    assert.equal(history.exactTotal, 3n); assert.deepEqual(history.items.map(row => row.newVersion).sort(), [1, 2, 3]);
    const hidden: SalesReadScope = { kind: "restricted", clauses: [{ hallId: ids.otherHall }] };
    assert.equal((await salesReader.readList(read(parameters(draft.header.number), hidden))).exactTotal, 0n);
    await assert.rejects(salesReader.readDetail(read({ salesId: draft.header.id }, hidden)), { code: "DOCUMENT_NOT_FOUND" });
    assert.equal((await salesReader.readSettlementStatistics(read(parameters(), hidden))).exactApprovedDocuments, 0n);
    for (const literal of ["%", "' OR TRUE --", "\\"]) assert.equal((await salesReader.readList(read(parameters(literal)))).exactTotal, 0n);
    assert.deepEqual((await salesReader.readList(read({ ...parameters(draft.header.number), page: 2 }))).items, []);
  });

  await t.test("sales list count/page stays on one real REPEATABLE READ snapshot across an intervening commit", async () => {
    const first = salesDraft(160), second = salesDraft(161);
    const draftA = { ...first, header: { ...first.header, number: "SYNTHETIC_PG_SNAPSHOT_PAIR_A" } };
    const draftB = { ...second, header: { ...second.header, number: "SYNTHETIC_PG_SNAPSHOT_PAIR_B" } };
    await sales.execute({ actor, action: "SAVE", requestKey: "SYNTHETIC_SNAPSHOT_A", expectedVersion: null, draft: draftA });
    let committedBetween = false;
    const reader = new PostgresSalesQueryReader(afterStatement(pool, /^SELECT COUNT\(\*\)::text AS exact_total FROM naijue_erp\.sales_header/, async () => {
      await sales.execute({ actor, action: "SAVE", requestKey: "SYNTHETIC_SNAPSHOT_B", expectedVersion: null, draft: draftB }); committedBetween = true;
    }));
    const snapshot = await reader.readList(read(parameters("SYNTHETIC_PG_SNAPSHOT_PAIR_")));
    assert.equal(committedBetween, true); assert.equal(snapshot.exactTotal, 1n); assert.equal(snapshot.items.length, 1); assert.equal(snapshot.items[0]?.id, first.header.id);
    assert.equal((await salesReader.readList(read(parameters("SYNTHETIC_PG_SNAPSHOT_PAIR_")))).exactTotal, 2n);
  });

  await t.test("product basics/specifications/image METADATA execute against normalized synthetic references", async () => {
    const reader = new PostgresProductQueryReader(pool);
    const productRead = { actor, grant: { productId: ids.product }, parameters: { productId: ids.product }, signal: new AbortController().signal };
    const basics = await reader.readBasics(productRead); assert.equal(basics?.productId, ids.product); assert.equal(basics?.yearLabel, "2026");
    assert.equal(basics?.seasonLabel, null); assert.equal(basics?.supplierLabel, "SYNTHETIC ONLY SUPPLIER");
    const specifications = await reader.readSpecifications(productRead); assert.equal(specifications?.skus.length, 2); assert.equal(specifications?.sizes.length, 2);
    const images = await reader.readImages(productRead); assert.equal(images?.images.length, 1); assert.equal(images?.images[0]?.byteSize, 1n);
    const image = await reader.readImage({ ...productRead, parameters: { productId: ids.product, imageId: ids.image } }); assert.equal(image?.fileRef, "synthetic:not-a-real-file");
    assert.equal(await reader.readImage({ ...productRead, parameters: { productId: ids.product, imageId: syntheticId("product", 999) } }), null);
  });

  await t.test("authentication STORAGE lifecycle only: disabled synthetic reference, locked session, rollback and version invalidation", async () => {
    const store = new PostgresAuthenticationStore(pool);
    const tokenHash = createHash("sha256").update("SYNTHETIC_STORAGE_SESSION_MARKER_NOT_A_LOGIN_TOKEN").digest("hex");
    const otherHash = createHash("sha256").update("SYNTHETIC_ROLLED_BACK_SESSION_MARKER").digest("hex");
    await store.transaction(async tx => {
      const account = await tx.findAccountByLogin("SYNTHETIC_DISABLED_NONLOGIN_ACCOUNT"); assert.ok(account);
      assert.equal(account.loginEnabled, false); assert.equal(account.role, "SALESPERSON"); assert.equal(account.hallEnabled, true);
      await tx.insertSession({ tokenHash, accountId: ids.account, authVersion: 1, createdAt: SYNTHETIC_TIME, expiresAt: "2026-10-20T13:00:00.000Z", revokedAt: null });
    });
    await assert.rejects(store.transaction(async tx => {
      await tx.getAccount(ids.account); await tx.insertSession({ tokenHash: otherHash, accountId: ids.account, authVersion: 1, createdAt: SYNTHETIC_TIME, expiresAt: "2026-10-20T13:00:00.000Z", revokedAt: null });
      throw new Error("SYNTHETIC callback rollback");
    }), /SYNTHETIC callback rollback/);
    await store.transaction(async tx => { assert.equal(await tx.getSession(otherHash), undefined); });
    await store.transaction(async tx => {
      assert.equal((await tx.getSession(tokenHash))?.revokedAt, null); await tx.getAccount(ids.account);
      assert.equal((await tx.lockSession(tokenHash, ids.account))?.accountId, ids.account);
      assert.equal(await tx.changePassword(ids.account, 1, SYNTHETIC_PASSWORD_SENTINEL, SYNTHETIC_REPLACED_SENTINEL, "2026-10-20T12:15:00.000Z"), true);
    });
    await store.transaction(async tx => {
      const account = await tx.getAccount(ids.account); assert.equal(account?.authVersion, 2); assert.equal(account?.loginEnabled, false);
      assert.equal(account?.passwordHash, SYNTHETIC_REPLACED_SENTINEL); assert.notEqual((await tx.lockSession(tokenHash, ids.account))?.revokedAt, null);
    });
  });

  await t.test("real schema constraints: reference/coordinate uniqueness, pricing intent, image bounds and numeric storage", async () => {
    await expectSqlState(pool, "23514", async client => { await client.query("INSERT INTO naijue_erp.fit(id,code,name,enabled,version) VALUES($1,'ZZ','SYNTHETIC INVALID FIT',true,1)", [syntheticId("fit", 900)]); });
    await expectSqlState(pool, "23505", async client => { await client.query(`INSERT INTO naijue_erp.sku(id,product_id,color_id,fit_id,size_id,sku_code,enabled,version)
      VALUES($1,$2,$3,$4,$5,'SYNTHETIC_DUPLICATE_COORDINATE',true,1)`, [syntheticId("sku", 901), ids.product, ids.color, ids.fit, ids.size]); });
    await expectSqlState(pool, "23514", async client => { await client.query("UPDATE naijue_erp.sales_line SET pricing_rule='UNIT_PRICE',discount_tenths=50 WHERE sales_id=$1", [salesLifecycleId]); }, "sales_line_pricing_facts");
    await expectSqlState(pool, "23514", async client => { await client.query("UPDATE naijue_erp.product_image SET byte_size=8388609 WHERE id=$1", [ids.image]); });
    await expectSqlState(pool, "22003", async client => { await client.query("UPDATE naijue_erp.product SET retail_price=10000000000000000.00 WHERE id=$1", [ids.product]); });
    await expectSqlState(pool, "23514", async client => { await client.query(`INSERT INTO naijue_erp.auth_session(token_hash,account_id,auth_version,created_at,expires_at)
      VALUES('not-a-sha256-hash',$1,2,$2,$3)`, [ids.account, SYNTHETIC_TIME, "2026-10-20T13:00:00Z"]); });
  });

  await t.test("deferred receipt/audit foreign keys, settlement equality and immutable append-only tables reject changes", async () => {
    const before = await commandSnapshot(pool, "SALES", salesLifecycleId);
    await expectSqlState(pool, "23514", async client => { await client.query(`UPDATE naijue_erp.sales_header SET status='APPROVED',approved_by_account_id=$2,
      approved_at=$3,net_due=net_due+1 WHERE id=$1`, [salesLifecycleId, ids.account, SYNTHETIC_TIME]); });
    await expectSqlState(pool, "23503", async client => {
      const operationId = syntheticId("operation", 902);
      await client.query(`INSERT INTO naijue_erp.operation_receipt(id,actor_account_id,request_key,request_hash,action,target_type,target_id,status,result_data,completed_at)
        VALUES($1,$2,'SYNTHETIC_ORPHAN_RECEIPT',$3,'SAVE','SALES',$4,'COMMITTED',$5::jsonb,$6)`,
      [operationId, ids.account, "a".repeat(64), salesLifecycleId, JSON.stringify({ operationId, salesId: salesLifecycleId, version: 3, status: "DRAFT", ledgerEntryIds: [] }), SYNTHETIC_TIME]);
      await client.query("SET CONSTRAINTS naijue_erp.receipt_requires_audit IMMEDIATE");
    });
    await expectSqlState(pool, "23503", async client => {
      await client.query(`INSERT INTO naijue_erp.audit_change(id,operation_id,actor_account_id,object_type,object_id,action,old_version,new_version,before_values,after_values,occurred_at)
        VALUES($1,$2,$3,'SALES',$4,'SAVE',3,4,'{}'::jsonb,'{}'::jsonb,$5)`, [syntheticId("audit", 903), syntheticId("operation", 904), ids.account, salesLifecycleId, SYNTHETIC_TIME]);
      await client.query("SET CONSTRAINTS naijue_erp.audit_receipt_kind_coherence IMMEDIATE");
    });
    for (const [number, key, targetType, targetId, resultKey, sqlState, constraint] of [
      [905, "SYNTHETIC_SALES_100_SAVE", "SALES", salesLifecycleId, "salesId", "23505", undefined],
      [906, "SYNTHETIC_WRONG_KIND", "TRANSFER", salesLifecycleId, "transferId", "23503", undefined],
      [907, "SYNTHETIC_MISSING_IDENTITY", "SALES", salesLifecycleId, "wrongId", "23514", "receipt_result_by_kind"]
    ] as const) {
      await expectSqlState(pool, sqlState, async client => {
        const operationId = syntheticId("operation", number);
        await client.query(`INSERT INTO naijue_erp.operation_receipt(id,actor_account_id,request_key,request_hash,action,target_type,target_id,status,result_data,completed_at)
          VALUES($1,$2,$3,$4,'SAVE',$5,$6,'COMMITTED',$7::jsonb,$8)`, [operationId, ids.account, key, "a".repeat(64), targetType, targetId,
          JSON.stringify({ operationId, [resultKey]: targetId, version: 3, status: "DRAFT", ledgerEntryIds: [] }), SYNTHETIC_TIME]);
      }, constraint);
    }
    const { rows: [receipt] } = await pool.query("SELECT id FROM naijue_erp.operation_receipt WHERE target_type='SALES' AND target_id=$1 AND action='APPROVE'", [salesLifecycleId]); assert.ok(receipt);
    const { rows: [ledger] } = await pool.query("SELECT id FROM naijue_erp.inventory_ledger WHERE operation_id=$1 ORDER BY id LIMIT 1", [receipt.id]); assert.ok(ledger);
    await expectSqlState(pool, "23514", async client => { await client.query("UPDATE naijue_erp.inventory_ledger SET quantity_delta=quantity_delta WHERE id=$1", [ledger.id]); });
    await expectSqlState(pool, "23514", async client => { await client.query("DELETE FROM naijue_erp.operation_receipt WHERE id=$1", [receipt.id]); });
    await expectSqlState(pool, "23514", async client => { await client.query("UPDATE naijue_erp.audit_change SET after_values=after_values WHERE operation_id=$1", [receipt.id]); });
    await expectSqlState(pool, "23514", async client => {
      await client.query(`INSERT INTO naijue_erp.inventory_ledger(id,operation_id,event_kind,warehouse_id,sku_id,quantity_delta,source_sales_line_id,
        endpoint,source_document_version,business_date,posted_at)
        SELECT $1,$2,'APPROVE',$3,sku_id,-quantity,id,'ALIEN_ENDPOINT',4,'2026-10-20',$4 FROM naijue_erp.sales_line
        WHERE sales_id=$5 AND line_no=1 AND is_current`, [syntheticId("ledger", 908), receipt.id, ids.warehouse, SYNTHETIC_TIME, salesLifecycleId]);
    }, "ledger_exactly_one_native_source");
    assert.deepEqual(await commandSnapshot(pool, "SALES", salesLifecycleId), before);
  });

  await t.test("transfer native source/provenance guards reject invalid quantity, warehouse identity and creator rewrites", async () => {
    const before = await commandSnapshot(pool, "TRANSFER", transferLifecycleId);
    await expectSqlState(pool, "23514", async client => { await client.query("UPDATE naijue_erp.transfer_line SET quantity=0 WHERE transfer_id=$1", [transferLifecycleId]); });
    await expectSqlState(pool, "23514", async client => { await client.query("UPDATE naijue_erp.transfer_header SET version=version+1,created_role='WAREHOUSE' WHERE id=$1", [transferLifecycleId]); });
    await expectSqlState(pool, "23514", async client => { await client.query("UPDATE naijue_erp.transfer_header SET version=version+1,to_warehouse_id=from_warehouse_id WHERE id=$1", [transferLifecycleId]); });
    await expectSqlState(pool, "23514", async client => { await client.query("DELETE FROM naijue_erp.transfer_line WHERE transfer_id=$1", [transferLifecycleId]); });
    assert.deepEqual(await commandSnapshot(pool, "TRANSFER", transferLifecycleId), before);
  });
  t.diagnostic("Suite reached its terminal assertions. Database intentionally retained for external disposable-lifecycle cleanup; no production/HTTP/media/end-to-end acceptance is implied.");
}
