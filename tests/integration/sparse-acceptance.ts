/** DORMANT engine acceptance source. Called only after the same fresh-target/runner gates as the legacy suite. */
import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import type { Pool } from "pg";
import { PostgresCutoffImportStore } from "../../adapters/postgres/src/inventory-cutoff-import-store.ts";
import { PostgresInventoryQueryReader } from "../../adapters/postgres/src/inventory-query-reader.ts";
import { PostgresPartyUnitOfWork } from "../../adapters/postgres/src/party-maintenance-store.ts";
import { createPartyMaintenanceService } from "../../packages/application/src/party-maintenance-service.ts";
import { createSourcePartyAuthorization } from "../../packages/application/src/party-maintenance-policy.ts";
import { createApprovedPartyCodeAllocator } from "../../packages/application/src/party-numbering.ts";
import { createCutoffImportService } from "../../packages/application/src/inventory-cutoff-import.ts";
import type { CutoffImportCommand, CutoffImportItem, CutoffImportResult } from "../../packages/application/src/inventory-cutoff-import.ts";
import type { InventoryQuery, InventoryReadScope } from "../../packages/application/src/inventory-query-contracts.ts";
import type { SalesResult } from "../../packages/application/src/ports.ts";
import type { PartyCommand } from "../../packages/application/src/party-maintenance-ports.ts";
import type { SalesDraft } from "../../packages/domain/src/documents.ts";
import { quantity, version } from "../../packages/domain/src/values.ts";
import { afterStatement, balanceRows, commandSnapshot, contend, ledgerRows, receiptCount, receiptLock, salesService, successfulPair, transferService } from "./adapter-helpers.ts";
import { expectExactSqlFailure, MIGRATIONS } from "./database.ts";
import { actor, ids, newSyntheticId, salesDraft, syntheticId, SYNTHETIC_DATE, SYNTHETIC_TIME, transferActor, transferDraft } from "./fixtures.ts";
import { assertDeferredBalanceFailure, assertExactEngineFailure } from "./proof.ts";

import { SPARSE_SCENARIOS } from "./migration-manifest.ts";
export { SPARSE_SCENARIOS } from "./migration-manifest.ts";
const batchId = syntheticId("operation", 3000);
const sourceHash = "b".repeat(64), sourceManifestRef = "synthetic:reviewed-fixture-manifest-not-a-source-file";
const expected = { WAREHOUSE: 2, SKU: 3, INVENTORY_LEDGER: 1, IMPORT_BATCH: 1 };
const envelope = { actorAccountId: ids.account, batchId };
const stage: Extract<CutoffImportCommand, { readonly action: "IMPORT_STAGE" }> = { ...envelope, action: "IMPORT_STAGE", requestKey: "SYNTHETIC_IMPORT_STAGE", sourceName: "synthetic-only",
  sourceHash, sourceManifestRef, cutoffAt: SYNTHETIC_TIME, mappingVersion: "synthetic-v1", expected };
const itemSource = (sourceEntityType: string, sourceKey: string) => ({ sourceEntityType, sourceKey, sourceRecordHash: sourceHash, sourceFileRef: "synthetic:no-file-opened" });
const members: readonly CutoffImportItem[] = [
  ...[ids.warehouse, ids.toWarehouse].map(targetId => ({ ...itemSource("WAREHOUSE", targetId), targetType: "WAREHOUSE" as const, targetId })),
  ...[ids.sku, ids.uncoveredSku, ids.raceSku].map(targetId => ({ ...itemSource("SKU", targetId), targetType: "SKU" as const, targetId }))
];
const baseline: CutoffImportItem = { ...itemSource("INVENTORY_BASELINE", "only-nonzero-key"), targetType: "INVENTORY_LEDGER",
  warehouseId: ids.toWarehouse, skuId: ids.sku, quantity: quantity("7"), businessDate: SYNTHETIC_DATE };
const memberChunk: Extract<CutoffImportCommand, { readonly action: "IMPORT_CHUNK" }> = { ...envelope, action: "IMPORT_CHUNK", requestKey: "SYNTHETIC_IMPORT_MEMBERS", expectedSequence: 0, expectedCursor: 0, items: members };
const baselineChunk: Extract<CutoffImportCommand, { readonly action: "IMPORT_CHUNK" }> = { ...envelope, action: "IMPORT_CHUNK", requestKey: "SYNTHETIC_IMPORT_BASELINE", expectedSequence: 1, expectedCursor: 5, items: [baseline] };
const publish: Extract<CutoffImportCommand, { readonly action: "IMPORT_PUBLISH" }> = { ...envelope, action: "IMPORT_PUBLISH", requestKey: "SYNTHETIC_IMPORT_PUBLISH", expectedSequence: 2, expectedCursor: 6,
  approval: { completeScope: true, absentMeansZero: true, allFilesVerified: true, finalDeltaVerified: true, noUnresolvedExceptions: true, sourceHash, sourceManifestRef } };
const scope: InventoryReadScope = { hallIds: [ids.hall, ids.otherHall], warehouses: [
  { id: ids.warehouse, hallId: ids.hall, label: "SYNTHETIC ONLY FROM" }, { id: ids.toWarehouse, hallId: ids.otherHall, label: "SYNTHETIC ONLY TO" }
] };
const parameters: InventoryQuery = { filter: { productIds: [], categoryIds: [], warehouseIds: [], supplierIds: [], fitIds: [], seasonIds: [] }, page: 1, pageSize: 100 };
const read = (input = parameters, granted = scope) => ({ actor, scope: granted, parameters: input, signal: new AbortController().signal });
const raceDraft = (number: number, count = "2"): SalesDraft => { const draft = salesDraft(number, { quantities: [count] }); return { ...draft, lines: draft.lines.map(line => ({ ...line, skuId: ids.raceSku })) }; };
async function importSnapshot(pool: Pool): Promise<unknown> {
  const result: Record<string, unknown> = { balances: await balanceRows(pool) };
  for (const table of ["import_batch", "import_record", "inventory_ledger", "operation_receipt", "audit_change"] as const)
    result[table] = (await pool.query(`SELECT * FROM naijue_erp.${table} ORDER BY id`)).rows;
  return result;
}
async function partySnapshot(pool: Pool): Promise<unknown> {
  const result: Record<string, unknown> = {};
  for (const table of ["customer", "supplier", "operation_receipt", "audit_change"] as const)
    result[table] = (await pool.query(`SELECT * FROM naijue_erp.${table} ORDER BY id`)).rows;
  // Sequence reservations are intentionally excluded: PostgreSQL sequence gaps survive ROLLBACK.
  return result;
}
async function assertOperation(pool: Pool, result: { readonly operationId: string }, kind: string, target: string, action: string, ledgerCount: number): Promise<void> {
  const receipts = (await pool.query("SELECT * FROM naijue_erp.operation_receipt WHERE id=$1", [result.operationId])).rows;
  const audits = (await pool.query("SELECT * FROM naijue_erp.audit_change WHERE operation_id=$1", [result.operationId])).rows;
  assert.equal(receipts.length, 1); assert.equal(audits.length, 1);
  assert.equal(receipts[0]?.target_type, kind); assert.equal(receipts[0]?.target_id, target); assert.equal(receipts[0]?.action, action);
  assert.equal(receipts[0]?.status, "COMMITTED"); assert.equal(audits[0]?.object_type, kind); assert.equal(audits[0]?.object_id, target);
  assert.equal(receipts[0]?.actor_account_id, ids.account); assert.equal(audits[0]?.actor_account_id, ids.account); assert.equal(audits[0]?.action, action);
  assert.deepEqual(receipts[0]?.result_data, JSON.parse(JSON.stringify(result)), "persisted immutable receipt must equal the actual service result");
  assert.deepEqual(audits[0]?.occurred_at, receipts[0]?.completed_at); assert.equal(receipts[0]?.completed_at.toISOString(), SYNTHETIC_TIME);
  const newVersion = kind === "IMPORT" ? Number(Reflect.get(result, "sequence")) + 1 : Reflect.get(result, "version");
  assert.equal(audits[0]?.new_version, newVersion); assert.equal(audits[0]?.old_version, newVersion === 1 ? null : Number(newVersion) - 1);
  if (kind === "IMPORT") {
    assert.equal(audits[0]?.after_values.sequence, Reflect.get(result, "sequence")); assert.equal(audits[0]?.after_values.cursor, Reflect.get(result, "cursor"));
  } else if (kind === "CUSTOMER" || kind === "SUPPLIER") assert.equal(audits[0]?.after_values.version, newVersion);
  else { assert.equal(audits[0]?.after_values.header.version, newVersion); assert.equal(audits[0]?.after_values.header.status, Reflect.get(result, "status")); }
  const effects = await ledgerRows(pool, result.operationId); assert.equal(effects.length, ledgerCount);
  assert.deepEqual(effects.map(row => row.id).sort(), [...(Reflect.get(result, "ledgerEntryIds") ?? [])].sort());
  const wrongTimes = (await pool.query("SELECT count(*)::integer AS count FROM naijue_erp.inventory_ledger WHERE operation_id=$1 AND posted_at<>$2::timestamptz", [result.operationId, SYNTHETIC_TIME])).rows[0]?.count;
  assert.equal(wrongTimes, 0);
}
function planUsesIndex(value: unknown, index: string): boolean {
  if (!value || typeof value !== "object") return false;
  if (Reflect.get(value, "Index Name") === index) return true;
  return Object.values(value).some(item => Array.isArray(item) ? item.some(child => planUsesIndex(child, index)) : planUsesIndex(item, index));
}

export async function runSparseAcceptance(t: TestContext, pool: Pool): Promise<void> {
  const sales = salesService(pool), transfers = transferService(pool), reader = new PostgresInventoryQueryReader(pool);
  const importer = createCutoffImportService({ store: new PostgresCutoffImportStore(pool), now: () => SYNTHETIC_TIME,
    authorization: { async assertAllowed(account, command) {
      // Exact synthetic fixture authorization only. No production importer policy is invented.
      assert.equal(account, ids.account); assert.equal(command.batchId, batchId);
      if (command.action === "IMPORT_STAGE") { assert.equal(command.sourceName, "synthetic-only"); assert.equal(command.sourceHash, sourceHash); }
    } } });
  const partyActor = { ...actor, role: "WAREHOUSE" as const };
  const partyService = (input: Parameters<typeof afterStatement>[0] | ReturnType<typeof afterStatement>) => createPartyMaintenanceService({
    unitOfWork: new PostgresPartyUnitOfWork(input), authorization: createSourcePartyAuthorization(), codes: createApprovedPartyCodeAllocator(), now: () => SYNTHETIC_TIME, newId: newSyntheticId
  });
  const parties = partyService(pool);
  let importedBaseline: CutoffImportResult;

  await t.test("exact reviewed eight migration registry; historical reference fixture has no stock rows", async () => {
    assert.deepEqual((await pool.query("SELECT version FROM naijue_erp.schema_migration ORDER BY version")).rows.map(row => row.version), MIGRATIONS.map(([value]) => value));
    assert.deepEqual(await balanceRows(pool), []);
    assert.equal((await pool.query("SELECT count(*)::integer AS count FROM naijue_erp.inventory_ledger")).rows[0]?.count, 0);
    await assert.rejects(reader.readInventory(read()), { code: "INVENTORY_NOT_READY" });
  });

  await t.test(SPARSE_SCENARIOS[0], async () => {
    for (const kind of ["CUSTOMER", "SUPPLIER"] as const) {
      const create: PartyCommand = { kind, actor: partyActor, action: "CREATE", name: `SYNTHETIC CURRENT ${kind}`, requestKey: `SYNTHETIC_PARTY_${kind}_CREATE` };
      const [created] = successfulPair(await contend(pool, receiptLock(create.requestKey), () => [parties.execute(create), parties.execute(create)]));
      assert.equal(created.code, kind === "CUSTOMER" ? "KH000001" : "GYS000001"); assert.equal(created.version, 1);
      await assertOperation(pool, created, kind, created.partyId, "CREATE", 0);
      for (const [action, expectedVersion] of [["EDIT", 1], ["DISABLE", 2], ["RESTORE", 3]] as const) {
        const body = { actor: partyActor, kind, id: created.partyId, expectedVersion: version(expectedVersion), requestKey: `SYNTHETIC_${kind}_${action}` };
        const result = await parties.execute(action === "EDIT" ? { ...body, action, name: `SYNTHETIC EDITED ${kind}`, enabled: true } : { ...body, action });
        assert.equal(result.version, expectedVersion + 1); assert.equal(result.code, created.code);
        await assertOperation(pool, result, kind, created.partyId, action, 0);
        const audit = (await pool.query("SELECT before_values,after_values FROM naijue_erp.audit_change WHERE operation_id=$1", [result.operationId])).rows[0]!;
        assert.deepEqual(Object.keys(audit.after_values).sort(), action === "EDIT" ? ["name", "version"] : ["enabled", "version"]);
      }
      assert.deepEqual(await parties.execute(create), created); assert.equal(await receiptCount(pool, created.partyId), 4);
      await assert.rejects(parties.execute({ ...create, name: "SYNTHETIC DIFFERENT CONTENT" }), { code: "IDEMPOTENCY_CONFLICT" });
      const before = await partySnapshot(pool);
      const faulty = partyService(afterStatement(pool, /^INSERT INTO naijue_erp\.audit_change/, async client => { await client.query("SELECT 1/0"); }));
      await assert.rejects(faulty.execute({ ...create, requestKey: `SYNTHETIC_${kind}_ROLLBACK`, name: "SYNTHETIC ROLLED BACK" }), { code: "22012" });
      assert.deepEqual(await partySnapshot(pool), before);
      if (kind === "CUSTOMER") {
        await pool.query("UPDATE naijue_erp.hall SET default_customer_id=$1 WHERE id=$2", [created.partyId, ids.hall]);
        const protectedBefore = await partySnapshot(pool);
        await assert.rejects(parties.execute({ actor: partyActor, kind, action: "DISABLE", id: created.partyId, expectedVersion: version(4), requestKey: "SYNTHETIC_DEFAULT_DISABLE" }), { code: "CUSTOMER_DEFAULT_IN_USE" });
        assert.deepEqual(await partySnapshot(pool), protectedBefore);
        await pool.query("UPDATE naijue_erp.hall SET default_customer_id=NULL WHERE id=$1", [ids.hall]);
      }
    }
  });

  await t.test("IMPORT_STAGE/membership chunks commit atomically; early publication and pre-publication runtime use fail closed", async () => {
    const staged = await importer.execute(stage); assert.equal(staged.sequence, 0); assert.equal(staged.cursor, 0);
    await assertOperation(pool, staged, "IMPORT", batchId, "IMPORT_STAGE", 0);
    const membership = await importer.execute(memberChunk); assert.equal(membership.sequence, 1); assert.equal(membership.cursor, 5);
    await assertOperation(pool, membership, "IMPORT", batchId, "IMPORT_CHUNK", 0);
    const before = await importSnapshot(pool);
    await assert.rejects(importer.execute({ ...publish, expectedSequence: 1, expectedCursor: 5 }), { code: "INCOMPLETE_IMPORT_SCOPE" });
    assert.deepEqual(await importSnapshot(pool), before);
    const draft = salesDraft(3100);
    await sales.execute({ actor, action: "SAVE", draft, expectedVersion: null, requestKey: "SYNTHETIC_UNPUBLISHED_SAVE" });
    const beforeCommand = await commandSnapshot(pool, "SALES", draft.header.id);
    await assert.rejects(sales.execute({ actor, action: "APPROVE", salesId: draft.header.id, expectedVersion: version(1), requestKey: "SYNTHETIC_UNPUBLISHED_APPROVE" }), { code: "INVENTORY_NOT_READY" });
    assert.deepEqual(await commandSnapshot(pool, "SALES", draft.header.id), beforeCommand);
  });

  await t.test(SPARSE_SCENARIOS[1], async () => {
    const before = await importSnapshot(pool); const evidence = { changed: false, commitAttempted: false };
    const faulty = new PostgresCutoffImportStore(afterStatement(pool, /^INSERT INTO naijue_erp\.operation_receipt/, async client => {
      assert.equal((await client.query("UPDATE naijue_erp.inventory_balance SET quantity=quantity+1 WHERE warehouse_id=$1 AND sku_id=$2", [ids.toWarehouse, ids.sku])).rowCount, 1);
      evidence.changed = true;
    }, sql => { if (sql === "COMMIT") evidence.commitAttempted = true; }));
    await assert.rejects(faulty.execute(baselineChunk, SYNTHETIC_TIME), error => assertExactEngineFailure(error, "23514",
      "fresh baseline balance requires its exact nonzero real import effect", "validate_sparse_balance_commit", evidence));
    assert.deepEqual(await importSnapshot(pool), before);
    // Retry only after known server SQLSTATE/deferred COMMIT rejection plus completed rollback, not uncertain acknowledgement.
    importedBaseline = await importer.execute(baselineChunk);
    assert.equal(importedBaseline.sequence, 2); assert.equal(importedBaseline.cursor, 6); assert.equal(importedBaseline.ledgerEntryIds.length, 1);
    await assertOperation(pool, importedBaseline, "IMPORT", batchId, "IMPORT_CHUNK", 1);
    const ledger = (await pool.query("SELECT * FROM naijue_erp.inventory_ledger WHERE operation_id=$1", [importedBaseline.operationId])).rows[0]!;
    assert.equal(ledger.event_kind, "CUTOFF_BASELINE"); assert.equal(ledger.endpoint, "IMPORT_BASELINE"); assert.equal(ledger.source_import_batch_id, batchId);
    assert.equal(ledger.source_sales_line_id, null); assert.equal(ledger.source_transfer_line_id, null); assert.equal(ledger.source_document_version, null);
    const balance = (await balanceRows(pool))[0]!; assert.equal(balance.quantity, "7"); assert.equal(balance.version, 1); assert.equal(balance.last_operation_id, importedBaseline.operationId);
    assert.equal((await pool.query("SELECT count(*)::integer AS count FROM naijue_erp.import_record WHERE target_type='INVENTORY_LEDGER' AND target_id=$1 AND import_batch_id=$2 AND status='IMPORTED'", [ledger.id, batchId])).rows[0]?.count, 1);
    const trigger = (await pool.query("SELECT pg_get_triggerdef(oid) AS definition FROM pg_catalog.pg_trigger WHERE tgrelid='naijue_erp.inventory_ledger'::regclass AND tgname='ledger_receipt_source_coherence'")).rows[0]?.definition;
    assert.match(String(trigger), /WHEN .*event_kind.*APPROVE.*UNAPPROVE/s); assert.doesNotMatch(String(trigger), /CUTOFF_BASELINE/);
    assert.deepEqual(await importer.execute(baselineChunk), importedBaseline); assert.equal(await receiptCount(pool, batchId), 3);
  });

  await t.test(SPARSE_SCENARIOS[2], async () => {
    const { rows: [index] } = await pool.query(`SELECT i.indisunique,i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid) AS definition
      FROM pg_catalog.pg_index i WHERE i.indexrelid='naijue_erp.audit_import_checkpoint_version'::regclass`);
    assert.equal(index?.indisunique, true); assert.equal(index?.indisvalid, true); assert.equal(index?.indisready, true);
    assert.match(String(index?.definition), /\(object_id, new_version\).*WHERE.*object_type.*IMPORT/s);
    const body = String((await pool.query("SELECT pg_get_functiondef('naijue_erp.validate_import_batch_commit()'::regprocedure) AS definition")).rows[0]?.definition);
    assert.match(body, /object_type = 'IMPORT' AND object_id = NEW.id\s+AND new_version =/);
    assert.doesNotMatch(body, /(?:FROM|JOIN)\s+naijue_erp\.import_record|ORDER BY|\bSUM\s*\(/i);
    const client = await pool.connect();
    try {
      await client.query("BEGIN READ ONLY"); await client.query("SET LOCAL enable_seqscan=off");
      const result = await client.query(`EXPLAIN (FORMAT JSON, COSTS OFF) SELECT * FROM naijue_erp.audit_change
        WHERE object_type='IMPORT' AND object_id=$1::uuid AND new_version=$2::integer`, [batchId, 3]);
      assert.ok(planUsesIndex(result.rows[0]?.["QUERY PLAN"], "audit_import_checkpoint_version"), "exact checkpoint lookup must have a usable reviewed index");
      t.diagnostic(`Forced-index checkpoint EXPLAIN (not ANALYZE, not natural planner/load evidence): ${JSON.stringify(result.rows[0]?.["QUERY PLAN"])}`);
    } finally { await client.query("ROLLBACK"); client.release(); }
  });

  await t.test(SPARSE_SCENARIOS[3], async () => {
    const publication = await importer.execute(publish); assert.equal(publication.status, "IMPORTED"); assert.equal(publication.sequence, 3); assert.equal(publication.cursor, 7);
    await assertOperation(pool, publication, "IMPORT", batchId, "IMPORT_PUBLISH", 0);
    const checkpoint = (await pool.query("SELECT checkpoint FROM naijue_erp.import_batch WHERE id=$1", [batchId])).rows[0]?.checkpoint;
    assert.deepEqual(checkpoint.counts, expected); assert.deepEqual(checkpoint.expected, expected);
    assert.equal((await balanceRows(pool)).length, 1, "publication must not generate Cartesian-product zeros");
    const before = await importSnapshot(pool); const result = await reader.readInventory(read());
    assert.equal(result.readiness, "ready"); assert.equal(result.data.exactTotalProducts, 1); assert.equal(result.data.allMatchesTotal.knownQuantity, "7");
    const product = result.data.products[0]!; assert.equal(product.id, ids.product); assert.deepEqual(product.sizes.map(size => size.id), [ids.size, ids.otherSize]);
    const native = product.colorFits.find(group => group.color.id === ids.color)!;
    assert.deepEqual(native.rows.find(row => row.warehouse.id === ids.warehouse)?.cells[ids.size], { state: "known", skuId: ids.sku, quantity: "0" });
    assert.deepEqual(native.rows.find(row => row.warehouse.id === ids.toWarehouse)?.cells[ids.size], { state: "known", skuId: ids.sku, quantity: "7" });
    const missing = product.colorFits.find(group => group.color.id === ids.raceColor)!;
    assert.deepEqual(missing.rows[0]?.cells[ids.otherSize], { state: "not-applicable" });
    const pageTwo = await reader.readInventory(read({ ...parameters, page: 2 })); assert.deepEqual(pageTwo.data.products, []); assert.equal(pageTwo.data.allMatchesTotal.knownQuantity, "7");
    const onlyFrom = { hallIds: [ids.hall], warehouses: [scope.warehouses[0]!] };
    assert.equal((await reader.readInventory(read(parameters, onlyFrom))).data.allMatchesTotal.knownQuantity, "0");
    await assert.rejects(reader.readInventory(read({ ...parameters, filter: { ...parameters.filter, warehouseIds: [ids.toWarehouse] } }, onlyFrom)), { code: "FORBIDDEN" });
    for (const search of ["%", "' OR TRUE --", "\\"]) {
      const candidates = await reader.readCandidates({ actor, scope, signal: new AbortController().signal,
        parameters: { kind: "product", search, page: 1, pageSize: 20, selectedIds: [], categoryIds: [] } });
      assert.equal(candidates.data.exactTotal, 0); assert.deepEqual(candidates.data.items, []);
    }
    assert.deepEqual(await importSnapshot(pool), before, "all native inventory reads must be non-mutating");
    await assert.rejects(importer.execute({ ...memberChunk, requestKey: "SYNTHETIC_AFTER_PUBLICATION" }), { code: "IMPORT_BATCH_FROZEN" });
  });

  await t.test("first sale SQL failure rolls back absent balance, ledger, header, audit and receipt before retry", async () => {
    const draft = salesDraft(3200, { quantities: ["2", "3"] });
    await sales.execute({ actor, action: "SAVE", draft, expectedVersion: null, requestKey: "SYNTHETIC_FIRST_SALE_SAVE" });
    const before = await commandSnapshot(pool, "SALES", draft.header.id);
    const command = { actor, action: "APPROVE" as const, salesId: draft.header.id, expectedVersion: version(1), requestKey: "SYNTHETIC_FIRST_SALE_APPROVE" };
    const broken = salesService(afterStatement(pool, /^INSERT INTO naijue_erp\.audit_change/, async client => {
      assert.equal((await client.query("SELECT quantity::text,version FROM naijue_erp.inventory_balance WHERE warehouse_id=$1 AND sku_id=$2", [ids.warehouse, ids.sku])).rows[0]?.quantity, "-5");
      await client.query("SELECT 1/0");
    }));
    await assert.rejects(broken.execute(command), { code: "22012" }); assert.deepEqual(await commandSnapshot(pool, "SALES", draft.header.id), before);
    const [approved] = successfulPair(await contend(pool, receiptLock(command.requestKey), () => [sales.execute(command), sales.execute(command)]));
    await assertOperation(pool, approved, "SALES", draft.header.id, "APPROVE", 2);
    const balance = (await balanceRows(pool)).find(row => row.warehouse_id === ids.warehouse && row.sku_id === ids.sku)!;
    assert.equal(balance.quantity, "-5"); assert.equal(balance.version, 2); assert.equal(balance.last_operation_id, approved.operationId);
    assert.equal((await reader.readInventory(read())).data.allMatchesTotal.knownQuantity, "2", "negative native stock participates exactly in the full summary");
    const originals = await ledgerRows(pool, approved.operationId);
    const reverse = await sales.execute({ actor, action: "UNAPPROVE", salesId: draft.header.id, expectedVersion: version(2), requestKey: "SYNTHETIC_FIRST_SALE_REVERSE" });
    await assertOperation(pool, reverse, "SALES", draft.header.id, "UNAPPROVE", 2);
    const reversals = await ledgerRows(pool, reverse.operationId); assert.equal(reversals.length, originals.length); assert.equal(new Set(reversals.map(row => row.reverses_entry_id)).size, 2);
    for (const row of reversals) assert.ok(originals.some(original => original.id === row.reverses_entry_id && original.source_sales_line_id === row.source_sales_line_id && original.endpoint === row.endpoint && BigInt(String(original.quantity_delta)) === -BigInt(String(row.quantity_delta))));
    assert.equal((await balanceRows(pool)).find(row => row.warehouse_id === ids.warehouse && row.sku_id === ids.sku)?.quantity, "0");
    assert.equal((await balanceRows(pool)).find(row => row.warehouse_id === ids.warehouse && row.sku_id === ids.sku)?.version, 4);
    assert.equal(await receiptCount(pool, draft.header.id), 3);
  });

  await t.test("first transfer creates only actual endpoint effects, retains zeros and rejects old deferred balance corruption", async () => {
    const draft = transferDraft(3300, ["2", "3"], true);
    await transfers.execute({ actor: transferActor, action: "SAVE", draft, expectedVersion: null, requestKey: "SYNTHETIC_FIRST_TRANSFER_SAVE" });
    const approve = { actor: transferActor, action: "APPROVE" as const, transferId: draft.header.id, expectedVersion: version(1), requestKey: "SYNTHETIC_FIRST_TRANSFER_APPROVE" };
    const [approved] = successfulPair(await contend(pool, receiptLock(approve.requestKey), () => [transfers.execute(approve), transfers.execute(approve)]));
    await assertOperation(pool, approved, "TRANSFER", draft.header.id, "APPROVE", 4);
    const originals = await ledgerRows(pool, approved.operationId);
    for (const warehouse of [ids.warehouse, ids.toWarehouse]) {
      const balance = (await balanceRows(pool)).find(row => row.warehouse_id === warehouse && row.sku_id === ids.uncoveredSku)!;
      assert.equal(balance.quantity, warehouse === ids.warehouse ? "-5" : "5"); assert.equal(balance.version, 2);
    }
    const reverse = await transfers.execute({ actor: transferActor, action: "UNAPPROVE", transferId: draft.header.id, expectedVersion: version(2), requestKey: "SYNTHETIC_FIRST_TRANSFER_REVERSE" });
    await assertOperation(pool, reverse, "TRANSFER", draft.header.id, "UNAPPROVE", 4);
    const reversals = await ledgerRows(pool, reverse.operationId); assert.equal(reversals.length, originals.length); assert.equal(new Set(reversals.map(row => row.reverses_entry_id)).size, 4);
    for (const row of reversals) assert.ok(originals.some(original => original.id === row.reverses_entry_id && original.endpoint === row.endpoint && original.source_transfer_line_id === row.source_transfer_line_id && BigInt(String(original.quantity_delta)) === -BigInt(String(row.quantity_delta))));
    assert.ok((await balanceRows(pool)).filter(row => row.sku_id === ids.uncoveredSku).every(row => row.quantity === "0" && row.version === 4));
    const before = await commandSnapshot(pool, "TRANSFER", draft.header.id); const evidence = { sabotageApplied: false, commitAttempted: false };
    const broken = transferService(afterStatement(pool, /^INSERT INTO naijue_erp\.operation_receipt/, async client => {
      assert.equal((await client.query("UPDATE naijue_erp.inventory_balance SET quantity=quantity+1 WHERE warehouse_id=$1 AND sku_id=$2", [ids.warehouse, ids.uncoveredSku])).rowCount, 1);
      evidence.sabotageApplied = true;
    }, sql => { if (sql === "COMMIT") evidence.commitAttempted = true; }));
    await assert.rejects(broken.execute({ ...approve, expectedVersion: version(3), requestKey: "SYNTHETIC_RETAINED_OLD_GUARD" }), error => assertDeferredBalanceFailure(error, evidence));
    assert.deepEqual(await commandSnapshot(pool, "TRANSFER", draft.header.id), before);
  });

  await t.test("new first-use sparse deferred invariant rejects corruption at COMMIT without consuming fresh key", async () => {
    const draft = raceDraft(3400);
    await sales.execute({ actor, action: "SAVE", draft, expectedVersion: null, requestKey: "SYNTHETIC_SPARSE_CORRUPTION_SAVE" });
    const before = await commandSnapshot(pool, "SALES", draft.header.id); const evidence = { changed: false, commitAttempted: false };
    const broken = salesService(afterStatement(pool, /^INSERT INTO naijue_erp\.operation_receipt/, async client => {
      assert.equal((await client.query("UPDATE naijue_erp.inventory_balance SET version=version+1 WHERE warehouse_id=$1 AND sku_id=$2", [ids.warehouse, ids.raceSku])).rowCount, 1); evidence.changed = true;
    }, sql => { if (sql === "COMMIT") evidence.commitAttempted = true; }));
    await assert.rejects(broken.execute({ actor, action: "APPROVE", salesId: draft.header.id, expectedVersion: version(1), requestKey: "SYNTHETIC_SPARSE_CORRUPTION_APPROVE" }),
      error => assertExactEngineFailure(error, "23514", "first native balance must equal exact cumulative operation delta and effect count", "validate_sparse_balance_commit", evidence));
    assert.deepEqual(await commandSnapshot(pool, "SALES", draft.header.id), before);
  });

  await t.test(SPARSE_SCENARIOS[5], async () => {
    const first = raceDraft(3500), second = raceDraft(3501, "3");
    for (const draft of [first, second]) await sales.execute({ actor, action: "SAVE", draft, expectedVersion: null, requestKey: `SYNTHETIC_RACE_SAVE_${draft.header.id}` });
    assert.ok(!(await balanceRows(pool)).some(row => row.warehouse_id === ids.warehouse && row.sku_id === ids.raceSku));
    const lock = `naijue:inventory:${ids.warehouse}:${ids.raceSku}`;
    const settled = await contend(pool, lock, () => [first, second].map(draft => sales.execute({ actor, action: "APPROVE", salesId: draft.header.id, expectedVersion: version(1), requestKey: `SYNTHETIC_RACE_APPROVE_${draft.header.id}` })));
    assert.ok(settled.every(result => result.status === "fulfilled"), "both distinct native documents must commit, serialized on their shared first-use key");
    const balance = (await balanceRows(pool)).find(row => row.warehouse_id === ids.warehouse && row.sku_id === ids.raceSku)!;
    assert.equal(balance.quantity, "-5"); assert.equal(balance.version, 2);
    for (const [index, draft] of [first, second].entries()) {
      const result: SalesResult = (settled[index] as PromiseFulfilledResult<SalesResult>).value;
      await assertOperation(pool, result, "SALES", draft.header.id, "APPROVE", 1);
      assert.equal(await receiptCount(pool, draft.header.id), 2);
      const reverse = await sales.execute({ actor, action: "UNAPPROVE", salesId: draft.header.id, expectedVersion: version(2), requestKey: `SYNTHETIC_RACE_REVERSE_${draft.header.id}` });
      await assertOperation(pool, reverse, "SALES", draft.header.id, "UNAPPROVE", 1);
      const inverse = await ledgerRows(pool, reverse.operationId); assert.equal(inverse.length, 1); assert.equal(inverse[0]?.reverses_entry_id, result.ledgerEntryIds[0]);
    }
    const retained = (await balanceRows(pool)).find(row => row.warehouse_id === ids.warehouse && row.sku_id === ids.raceSku)!;
    assert.equal(retained.quantity, "0"); assert.equal(retained.version, 4);
  });

  await t.test("retained zero/history and old native source guards reject; native reader remains read-only", async () => {
    const before = await importSnapshot(pool);
    const retained = (await balanceRows(pool)).filter(row => row.warehouse_id === ids.warehouse && row.sku_id === ids.raceSku);
    assert.equal(retained.length, 1); assert.equal(retained[0]?.quantity, "0");
    await expectExactSqlFailure(pool, "23514", "inventory balances are retained, including zero", "guard_balance_identity",
      async client => { await client.query("DELETE FROM naijue_erp.inventory_balance WHERE warehouse_id=$1 AND sku_id=$2", [ids.warehouse, ids.raceSku]); });
    await expectExactSqlFailure(pool, "23514", "append-only relation inventory_ledger cannot be updated or deleted", "reject_immutable_change",
      async client => { await client.query("UPDATE naijue_erp.inventory_ledger SET quantity_delta=quantity_delta WHERE id=$1", [importedBaseline.ledgerEntryIds[0]]); });
    assert.equal((await pool.query("SELECT count(*)::integer AS count FROM naijue_erp.import_record WHERE import_batch_id=$1", [batchId])).rows[0]?.count, 7);
    await expectExactSqlFailure(pool, "23514", "append-only relation import_record cannot be updated or deleted", "reject_immutable_change",
      async client => { await client.query("UPDATE naijue_erp.import_record SET source_key=source_key WHERE import_batch_id=$1", [batchId]); });
    await expectExactSqlFailure(pool, "23514", "historical command integration not implemented", "reject_unimplemented_cutoff_write",
      async client => { await client.query("UPDATE naijue_erp.sales_header SET stock_basis='CUTOFF_HISTORY' WHERE id=$1", [salesDraft(3200).header.id]); });
    // Assert the exact old native guard, so a missing receipt FK or unrelated early 23514 cannot satisfy the probe.
    await expectExactSqlFailure(pool, "23514", "inconsistent runtime sales source", "validate_sales_effect", async client => {
      await client.query(`INSERT INTO naijue_erp.inventory_ledger(id,operation_id,event_kind,warehouse_id,sku_id,quantity_delta,source_sales_line_id,endpoint,source_document_version,business_date,posted_at)
        SELECT $1,$2,'APPROVE',$3,sku_id,-quantity,id,'SALES_WAREHOUSE',4,'2026-10-20',$4 FROM naijue_erp.sales_line WHERE sales_id=$5 AND line_no=1 AND is_current`,
      [syntheticId("ledger", 3600), syntheticId("operation", 3601), ids.toWarehouse, SYNTHETIC_TIME, salesDraft(3200).header.id]);
    });
    await expectExactSqlFailure(pool, "23514", "inconsistent runtime transfer source or endpoint effect", "validate_transfer_effect", async client => {
      await client.query(`INSERT INTO naijue_erp.inventory_ledger(id,operation_id,event_kind,warehouse_id,sku_id,quantity_delta,source_transfer_line_id,endpoint,source_document_version,business_date,posted_at)
        SELECT $1,$2,'APPROVE',$3,sku_id,100,id,'TO',4,'2026-10-20',$4 FROM naijue_erp.transfer_line WHERE transfer_id=$5 AND line_no=1 AND is_current`,
      [syntheticId("ledger", 3602), syntheticId("operation", 3603), ids.toWarehouse, SYNTHETIC_TIME, transferDraft(3300).header.id]);
    });
    await expectExactSqlFailure(pool, "23514", "reversal must match exact original native source and endpoint", "validate_exact_native_reversal", async client => {
      await client.query(`INSERT INTO naijue_erp.inventory_ledger(id,operation_id,event_kind,warehouse_id,sku_id,quantity_delta,source_sales_line_id,endpoint,reverses_entry_id,source_document_version,business_date,posted_at)
        SELECT $1,$2,'UNAPPROVE',original.warehouse_id,original.sku_id,-original.quantity_delta,other.id,'SALES_WAREHOUSE',original.id,4,original.business_date,$3
        FROM naijue_erp.inventory_ledger original JOIN naijue_erp.sales_line first_line ON first_line.id=original.source_sales_line_id
        JOIN naijue_erp.sales_line other ON other.sales_id=first_line.sales_id AND other.line_no=2 AND other.is_current
        WHERE first_line.sales_id=$4 AND first_line.line_no=1 AND original.event_kind='APPROVE'`,
      [syntheticId("ledger", 3604), syntheticId("operation", 3605), SYNTHETIC_TIME, salesDraft(3200).header.id]);
    });
    let changed = false;
    const corruptedReader = new PostgresInventoryQueryReader(afterStatement(pool, /\/\* inventory:products \*\//, async client => {
      assert.equal((await client.query("UPDATE naijue_erp.inventory_balance SET last_operation_id=NULL WHERE warehouse_id=$1 AND sku_id=$2", [ids.warehouse, ids.raceSku])).rowCount, 1); changed = true;
    }));
    // REPEATABLE READ READ ONLY itself must reject the injected write; never weaken the reader transaction.
    await assert.rejects(corruptedReader.readInventory(read()), { code: "25006" }); assert.equal(changed, false);
    assert.deepEqual(await importSnapshot(pool), before);
    assert.equal((await reader.readInventory(read())).data.allMatchesTotal.knownQuantity, "7");
  });
  t.diagnostic("0001–0008 terminal assertions reached only if the engine actually executed this opted-in scenario. No production/import-file/HTTP/auth/load/upgrade acceptance is implied.");
}
