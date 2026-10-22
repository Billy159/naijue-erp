/** Existing store + real accountant with a scripted PG boundary; no engine acceptance. */
import test from "node:test";
import assert from "node:assert/strict";
import { PostgresCutoffImportStore } from "../adapters/postgres/src/inventory-cutoff-import-store.ts";
import type { PgSalesPool, PgSalesClient, PgSalesResult } from "../adapters/postgres/src/sales-unit-of-work.ts";
import { requestHash } from "../packages/application/src/request-hash.ts";
import { createCutoffImportService, stableImportId } from "../packages/application/src/inventory-cutoff-import.ts";
import { NATIVE_IMPORT_STOCK_CONSERVATION_VERSION, nativeStockContributorsManifestHash, nativeStockEffectiveGroupsManifestHash } from "../packages/application/src/native-import-record-accounting.ts";
import type { NativeAccountingPublishCommand } from "../packages/application/src/native-import-record-accounting.ts";
import { accountingBaseline, accountingBatch, accountingChunk, accountingIds, accountingMemberships, accountingPublish, accountingTime } from "./support/native-record-accounting-fixtures.ts";

type Row = Record<string, unknown>;
const historyCounts = { import_source_row: 2, import_sku_alias: 1, history_sales_header: 0,
  history_sales_line: 0, history_sales_settlement: 0, history_transfer_header: 0,
  history_transfer_line: 0, import_stock_contributor: 0, barcodes: 0 };
class ImportPool implements PgSalesPool {
  connects = 0; releases: (Error | boolean | undefined)[] = [];
  calls: { sql: string; values: unknown[] }[] = [];
  schema = Array.from({ length: 15 }, (_, i) => i + 1);
  claims: Row[] = []; audit: Row | undefined; receipt: Row | undefined;
  recordInserts = 0;
  ledgers: Row[] = []; balances: Row[] = []; linkedContributors: unknown[][] = [];
  explicitlyEmptySelectedScope = false;
  baseGuardsPresent = true; accountingGuardsPresent = true;
  failAt: string | undefined; zeroAt: string | undefined;
  failure = Error("Synthetic original store failure");
  batch: Row;
  constructor() {
    const b = accountingBatch();
    this.batch = { id: b.id, source_name: b.sourceName, source_manifest_ref: b.sourceManifestRef,
      source_hash: b.sourceHash, cutoff_at: b.cutoffAt, mapping_version: b.mappingVersion,
      inventory_mode: b.inventoryMode, status: b.status, checkpoint: b.checkpoint,
      created_at: b.createdAt, completed_at: b.completedAt,
      history_expected_counts: historyCounts, history_payload_hash: "b".repeat(64) };
  }
  async connect(): Promise<PgSalesClient> {
    this.connects++;
    if (this.failAt === "connect") throw this.failure;
    return { query: (sql, values = []) => this.query(sql, values), release: e => { this.releases.push(e); } };
  }
  async query(sql: string, values: unknown[]): Promise<PgSalesResult> {
    this.calls.push({ sql, values });
    const reply = (rows: Row[] = [], rowCount = rows.length): PgSalesResult => ({ rows, rowCount });
    const tag = /\/\* ([^*]+?) \*\//.exec(sql)?.[1];
    const phase = tag === "native-accounting:claim" ? "claim" : tag === "native-accounting:attach-contributors" ? "link"
      : tag ?? (/^(BEGIN|COMMIT|ROLLBACK)\b/.exec(sql)?.[1]
        ?? (/^INSERT INTO naijue_erp\.(import_record|inventory_ledger|inventory_balance|audit_change|operation_receipt)\b/.exec(sql)?.[1]
          ?? (/^UPDATE naijue_erp.import_batch/.test(sql) ? "checkpoint" : "read")));
    if (this.failAt === phase) throw this.failure;
    if (this.zeroAt === phase) return reply([], 0);
    if (/^(BEGIN|COMMIT|ROLLBACK)\b/.test(sql)) return reply();
    if (tag === "inventory:guards") return reply([{ integrity_guards_present: this.baseGuardsPresent }]);
    if (tag === "native-accounting:guards") return reply([{ accounting_guards_present: this.accountingGuardsPresent }]);
    if (tag === "history-lifecycle:schema" || tag === "native-accounting:schema") return reply([{ versions: this.schema }]);
    if (this.explicitlyEmptySelectedScope && tag?.startsWith("history-lifecycle:count:")) return reply([{ n: "0" }]);
    if (this.explicitlyEmptySelectedScope && (tag?.startsWith("history-lifecycle:") || tag?.startsWith("native-accounting:conservation-"))) return reply();
    if (tag === "native-accounting:cutoff" || tag === "native-accounting:source-lock" || tag === "native-accounting:inventory-lock") return reply();
    if (tag === "native-accounting:batch") return reply([{ ...structuredClone(this.batch), already_published: false }]);
    if (tag?.startsWith("native-accounting:native:")) return reply([{ id: values[0], native_snapshot: { id: values[0], synthetic_only: true } }]);
    if (tag?.startsWith("native-accounting:membership:")) return reply([{ id: values[0] }]);
    if (tag === "native-accounting:baseline") return reply([{ id: values[0] }]);
    if (tag === "native-accounting:final") return reply([{ id: values[0] }]);
    if (tag === "native-accounting:attach-contributors") {
      this.linkedContributors.push(values); return reply([{ source_row_id: "SYNTHETIC-STOCK-NEGATIVE" }, { source_row_id: "SYNTHETIC-STOCK-ZERO" }]);
    }
    if (tag === "native-accounting:claim") {
      const row = { import_batch_id: values[0], import_record_id: values[1], target_type: values[2],
        target_id: values[3], operation_id: values[4], checkpoint_sequence: values[5] };
      this.claims.push(row); return reply([row]);
    }
    if (/^SELECT pg_advisory_xact_lock|^SELECT naijue_erp\.(cutoff_import_lock|import_source_key_lock|inventory_key_lock)/.test(sql)) return reply();
    if (sql.includes("FROM naijue_erp.operation_receipt")) return reply(this.receipt ? [structuredClone(this.receipt)] : []);
    if (sql.includes("FROM naijue_erp.import_batch WHERE id = $1 FOR UPDATE")) return reply([structuredClone(this.batch)]);
    if (/^INSERT INTO naijue_erp.import_record\b/.test(sql)) {
      this.recordInserts++;
      if (values[6] === "INVENTORY_LEDGER" || values[6] === "IMPORT_BATCH") return reply([{ id: values[0] }]);
      throw Object.assign(Error("Synthetic original creator record already exists"), { code: "23505" });
    }
    if (/^INSERT INTO naijue_erp.inventory_ledger\b/.test(sql)) {
      this.ledgers.push({ id: values[0], operation_id: values[1], quantity: values[4] }); return reply([{ id: values[0] }]);
    }
    if (/^INSERT INTO naijue_erp.inventory_balance\b/.test(sql)) {
      this.balances.push({ warehouse_id: values[0], sku_id: values[1], quantity: values[2] });
      return reply([{ warehouse_id: values[0], sku_id: values[1] }]);
    }
    if (/^UPDATE naijue_erp.import_batch/.test(sql)) {
      this.batch.checkpoint = JSON.parse(String(values[2])); this.batch.status = values[1]; return reply([], 1);
    }
    if (/^INSERT INTO naijue_erp.audit_change/.test(sql)) {
      this.audit = { operation_id: values[1], actor_account_id: values[2], object_id: values[3], action: values[4],
        before_values: JSON.parse(String(values[7])), after_values: JSON.parse(String(values[8])) }; return reply([], 1);
    }
    if (/^INSERT INTO naijue_erp.operation_receipt/.test(sql)) {
      this.receipt = { id: values[0], actor_account_id: values[1], request_key: values[2], request_hash: values[3],
        action: values[4], target_type: "IMPORT", target_id: values[5], result_data: JSON.parse(String(values[6])) }; return reply([], 1);
    }
    assert.fail(`Unrecognized scripted PG request: ${sql}`);
  }
}

function selectedEmptyPublication(pool: ImportPool): NativeAccountingPublishCommand {
  const zero = { WAREHOUSE: 0, SKU: 0, INVENTORY_LEDGER: 0, IMPORT_BATCH: 0 };
  pool.explicitlyEmptySelectedScope = true;
  pool.batch.checkpoint = { sequence: 0, cursor: 0, counts: zero, expected: { ...zero, IMPORT_BATCH: 1 } };
  pool.batch.history_expected_counts = { import_source_row: 0, import_sku_alias: 0, history_sales_header: 0,
    history_sales_line: 0, history_sales_settlement: 0, history_transfer_header: 0,
    history_transfer_line: 0, import_stock_contributor: 0, barcodes: 0 };
  return { ...accountingPublish(), expectedSequence: 0, expectedCursor: 0,
    stockConservation: { version: NATIVE_IMPORT_STOCK_CONSERVATION_VERSION, selectionSha256: accountingBatch().sourceHash,
      effectiveStockCsvSha256: "c".repeat(64), contributorLineageCsvSha256: "d".repeat(64), contributorCount: 0,
      effectiveGroupCount: 0, contributorsManifestHash: nativeStockContributorsManifestHash([]),
      effectiveGroupsManifestHash: nativeStockEffectiveGroupsManifestHash([]), warehouses: [], warehouseUnits: [] } };
}

test("native accounting on the original store has no implicit source authorizer and refuses before connecting", async () => {
  let connects = 0;
  const store = new PostgresCutoffImportStore({ async connect() { connects++; throw Error("Unexpected unauthenticated native accounting connection"); } });
  await assert.rejects(store.execute(accountingChunk(), accountingTime), { code: "NATIVE_IMPORT_AUTHORIZATION_REQUIRED" });
  assert.equal(connects, 0);
});

test("native creator memberships advance the original store through owned claims, original CAS/audit/receipt and no duplicate import_record INSERT", async () => {
  const pool = new ImportPool(), command = accountingChunk(); let authorized = 0;
  const store = new PostgresCutoffImportStore(pool, { nativeAccountingAuthorization: {
    async assertAllowed(actor, wholeCommand) { authorized++; assert.equal(actor, accountingIds.actor); assert.deepEqual(wholeCommand, command); },
  } });
  const result = await store.execute(command, accountingTime);
  assert.deepEqual(result, { operationId: stableImportId("operation", command.actorAccountId, command.requestKey),
    batchId: accountingIds.batch, sequence: 1, cursor: 2, status: "VALIDATING", ledgerEntryIds: [] });
  assert.equal(authorized, 1); assert.equal(pool.recordInserts, 0); assert.equal(pool.claims.length, 2);
  assert.equal(pool.receipt!.request_hash, requestHash(command));
  assert.deepEqual(pool.audit!.after_values, { sequence: 1, cursor: 2,
    counts: { WAREHOUSE: 1, SKU: 1, INVENTORY_LEDGER: 0, IMPORT_BATCH: 0 }, expected: accountingBatch().checkpoint.expected });
  assert.equal(pool.calls.at(-1)!.sql, "COMMIT"); assert.deepEqual(pool.releases, [undefined]);
});

test("a legacy V2 chunk cannot bypass schema15 once-only accounting by omitting version/native metadata", async () => {
  const pool = new ImportPool(), { accountingVersion: _version, ...base } = accountingChunk();
  const legacy = { ...base, items: base.items.map(item => {
    if (item.targetType === "INVENTORY_LEDGER") return item;
    const { nativeRecord: _record, ...original } = item; return original;
  }) };
  await assert.rejects(new PostgresCutoffImportStore(pool).execute(legacy, accountingTime), { code: "NATIVE_RECORD_ACCOUNTING_REQUIRED" });
  assert.equal(pool.recordInserts, 0); assert.equal(pool.claims.length, 0);
  assert.equal(pool.calls.at(-1)!.sql, "ROLLBACK");
});

test("original native CHUNK creates one signed baseline and fresh balance, attaches all original contributions and claims only its actual RETURNING identities", async () => {
  const pool = new ImportPool(), command = accountingChunk([...accountingMemberships, accountingBaseline]);
  const result = await new PostgresCutoffImportStore(pool, { nativeAccountingAuthorization: {
    async assertAllowed(_actor, actual) { assert.deepEqual(actual, command); },
  } }).execute(command, accountingTime);
  assert.equal(result.cursor, 3); assert.equal(result.sequence, 1);
  assert.equal(pool.recordInserts, 1); assert.equal(pool.claims.length, 3);
  assert.equal(pool.ledgers.length, 1); assert.equal(pool.balances.length, 1);
  assert.equal(pool.ledgers[0]!.quantity, "-7"); assert.equal(pool.balances[0]!.quantity, "-7");
  assert.deepEqual(result.ledgerEntryIds, [stableImportId("baseline", accountingBatch().sourceName, "INVENTORY_BASELINE", "synthetic-stock-group")]);
  assert.equal(pool.linkedContributors.length, 1);
  assert.deepEqual(pool.audit!.after_values, { sequence: 1, cursor: 3,
    counts: { WAREHOUSE: 1, SKU: 1, INVENTORY_LEDGER: 1, IMPORT_BATCH: 0 }, expected: accountingBatch().checkpoint.expected });
  for (const call of pool.calls.filter(call => /^INSERT INTO naijue_erp\.(import_record|inventory_ledger|inventory_balance)\b/.test(call.sql))) {
    assert.match(call.sql, /RETURNING/); assert.doesNotMatch(call.sql, /ON CONFLICT/);
  }
  assert.equal(pool.calls.at(-1)!.sql, "COMMIT");
});

test("original native PUBLISH claims FINAL only after complete history and conservation of an explicitly authorized empty selected scope", async () => {
  const pool = new ImportPool(), command = selectedEmptyPublication(pool);
  let authorizations = 0;
  const store = new PostgresCutoffImportStore(pool, { nativeAccountingAuthorization: {
    async assertAllowed(_actor, actual) { authorizations++; assert.deepEqual(actual, command); },
  } });
  const first = await store.execute(command, accountingTime);
  assert.deepEqual(first, { operationId: stableImportId("operation", command.actorAccountId, command.requestKey),
    batchId: accountingIds.batch, sequence: 1, cursor: 1, status: "IMPORTED", ledgerEntryIds: [] });
  assert.equal(pool.recordInserts, 1); assert.equal(pool.claims.length, 1); assert.equal(pool.claims[0]!.target_type, "IMPORT_BATCH");
  assert.equal(pool.ledgers.length, 0); assert.equal(pool.balances.length, 0);
  const finalInsert = pool.calls.findIndex(x => /^INSERT INTO naijue_erp.import_record\b/.test(x.sql));
  assert.ok(pool.calls.findIndex(x => x.sql.includes("history-lifecycle:stock-sums")) < finalInsert);
  assert.ok(pool.calls.findIndex(x => x.sql.includes("native-accounting:conservation-balances")) < finalInsert);
  const callsBeforeReplay = pool.calls.length;
  assert.deepEqual(await store.execute(command, accountingTime), first);
  assert.equal(authorizations, 2); assert.equal(pool.claims.length, 1);
  assert.ok(!pool.calls.slice(callsBeforeReplay).some(x => /^(INSERT|UPDATE|DELETE)\b/.test(x.sql) || x.sql.includes("conservation-")));
});

test("the original import service refuses raw native symbols/getters before cloning, authorization or borrowing a client", async () => {
  let authorized = 0, connects = 0, getterReads = 0;
  const store = new PostgresCutoffImportStore({ async connect() { connects++; throw Error("Unexpected raw native connection"); } },
    { nativeAccountingAuthorization: { async assertAllowed() { authorized++; } } });
  const service = createCutoffImportService({ store, now: () => accountingTime,
    authorization: { async assertAllowed() { authorized++; } } });
  const getter = accountingChunk(); Object.defineProperty(getter, "requestKey", { enumerable: true,
    get() { getterReads++; return "SYNTHETIC-HIDDEN-GETTER"; } });
  const nested = structuredClone(accountingChunk()); Object.defineProperty(nested.items[0]!, "nativeRecord", { enumerable: true,
    get() { getterReads++; return accountingMemberships[0]!.nativeRecord; } });
  const { accountingVersion: _version, ...nestedWithoutVersion } = nested;
  const conservationGetter = accountingPublish(); Object.defineProperty(conservationGetter, "stockConservation", { enumerable: true,
    get() { getterReads++; throw Error("Native metadata detection must never invoke a getter"); } });
  for (const [command, code] of [[{ ...accountingChunk(), [Symbol("unhashed")]: true }, "INVALID_NATIVE_RECORD_ACCOUNTING_COMMAND"],
    [getter, "INVALID_NATIVE_RECORD_ACCOUNTING_COMMAND"], [nested, "INVALID_NATIVE_RECORD_ACCOUNTING_ITEM"],
    [nestedWithoutVersion, "INVALID_NATIVE_RECORD_ACCOUNTING_ITEM"], [conservationGetter, "INVALID_NATIVE_RECORD_ACCOUNTING_COMMAND"]] as const)
    await assert.rejects(service.execute(command), { code });
  assert.equal(getterReads, 0); assert.equal(authorized, 0); assert.equal(connects, 0);
});

test("registry version15 alone cannot authorize claims when base or native history/accounting guards are missing", async () => {
  for (const missing of ["base", "accounting"]) {
    const pool = new ImportPool();
    if (missing === "base") pool.baseGuardsPresent = false; else pool.accountingGuardsPresent = false;
    await assert.rejects(new PostgresCutoffImportStore(pool, { nativeAccountingAuthorization: {
      async assertAllowed() { /* Explicit synthetic-only authorization, never a production default. */ },
    } }).execute(accountingChunk(), accountingTime), { code: "NATIVE_IMPORT_GUARDS_NOT_READY" });
    assert.equal(pool.claims.length, 0); assert.equal(pool.recordInserts, 0);
    assert.equal(pool.calls.at(-1)!.sql, "ROLLBACK");
  }
});

test("native receipt replay rechecks the current independent source authorizer without rerunning claims or publication", async () => {
  const pool = new ImportPool(), command = accountingChunk(), denied = Error("Synthetic source approval revoked");
  let allowed = true;
  const store = new PostgresCutoffImportStore(pool, { nativeAccountingAuthorization: {
    async assertAllowed() { if (!allowed) throw denied; },
  } });
  const first = await store.execute(command, accountingTime), after = pool.calls.length;
  assert.deepEqual(await store.execute(command, accountingTime), first);
  assert.ok(!pool.calls.slice(after).some(x => /^(INSERT|UPDATE|DELETE)\b/.test(x.sql) || x.sql.includes("native-accounting:")));
  allowed = false;
  await assert.rejects(store.execute(command, accountingTime), error => error === denied);
  assert.equal(pool.claims.length, 2); assert.equal(pool.calls.at(-1)!.sql, "ROLLBACK");
});

test("native creator metadata and conservation metadata cannot change behind the same original receipt key", async () => {
  const pool = new ImportPool(), command = accountingChunk();
  const store = new PostgresCutoffImportStore(pool, { nativeAccountingAuthorization: { async assertAllowed() {} } });
  await store.execute(command, accountingTime);
  const changed = structuredClone(command);
  if (changed.items[0]!.targetType !== "INVENTORY_LEDGER")
    (changed.items[0]!.nativeRecord as { decisionReason: string }).decisionReason = "SYNTHETIC-CHANGED-APPROVAL";
  await assert.rejects(store.execute(changed, accountingTime), { code: "IDEMPOTENCY_CONFLICT" });
  assert.equal(pool.claims.length, 2); assert.equal(pool.recordInserts, 0);
  const publicationPool = new ImportPool(), publish = selectedEmptyPublication(publicationPool);
  const publisher = new PostgresCutoffImportStore(publicationPool, { nativeAccountingAuthorization: { async assertAllowed() {} } });
  await publisher.execute(publish, accountingTime);
  const changedPlan = { ...publish, stockConservation: { ...publish.stockConservation!, contributorsManifestHash: "f".repeat(64) } };
  await assert.rejects(publisher.execute(changedPlan, accountingTime), { code: "IDEMPOTENCY_CONFLICT" });
  assert.equal(publicationPool.claims.length, 1); assert.equal(publicationPool.recordInserts, 1);
});

test("independent authorization cannot mutate this original transaction's MAIN command or hashed nativeRecord", async () => {
  const pool = new ImportPool(), command = accountingChunk(), captured = structuredClone(command);
  const store = new PostgresCutoffImportStore(pool, { nativeAccountingAuthorization: {
    async assertAllowed(_actor, value) { (value as { requestKey: string }).requestKey = "SYNTHETIC-MUTATED-AUTH-CLONE"; },
  } });
  await store.execute(command, accountingTime);
  assert.deepEqual(command, captured); assert.equal(pool.receipt!.request_key, captured.requestKey);
  assert.equal(pool.receipt!.request_hash, requestHash(captured));
});

test("native source denial requests rollback before any native/claim/CAS/audit/receipt write", async () => {
  const pool = new ImportPool(), denied = Error("Synthetic creator plan not authenticated");
  await assert.rejects(new PostgresCutoffImportStore(pool, { nativeAccountingAuthorization: {
    async assertAllowed() { throw denied; },
  } }).execute(accountingChunk(), accountingTime), error => error === denied);
  assert.equal(pool.claims.length, 0); assert.equal(pool.recordInserts, 0);
  assert.ok(!pool.calls.some(x => /^(INSERT|UPDATE|DELETE)\b/.test(x.sql)));
  assert.equal(pool.calls.at(-1)!.sql, "ROLLBACK");
});

test("every native baseline/claim/CAS/audit/receipt error preserves the original error and requests whole-transaction rollback", async () => {
  for (const phase of ["import_record", "inventory_ledger", "inventory_balance", "link", "claim", "checkpoint", "audit_change", "operation_receipt"]) {
    const pool = new ImportPool(); pool.failAt = phase;
    await assert.rejects(new PostgresCutoffImportStore(pool, { nativeAccountingAuthorization: { async assertAllowed() {} } })
      .execute(accountingChunk([...accountingMemberships, accountingBaseline]), accountingTime), error => error === pool.failure);
    assert.equal(pool.calls.at(-1)!.sql, "ROLLBACK"); assert.deepEqual(pool.releases, [undefined]);
    assert.ok(!pool.calls.some(x => x.sql === "COMMIT"));
  }
});

test("zero-row native INSERT/attachment/claim/CAS results never generate a successful import receipt", async () => {
  for (const phase of ["import_record", "inventory_ledger", "inventory_balance", "link", "claim", "checkpoint", "audit_change", "operation_receipt"]) {
    const pool = new ImportPool(); pool.zeroAt = phase;
    await assert.rejects(new PostgresCutoffImportStore(pool, { nativeAccountingAuthorization: { async assertAllowed() {} } })
      .execute(accountingChunk([...accountingMemberships, accountingBaseline]), accountingTime));
    assert.equal(pool.calls.at(-1)!.sql, "ROLLBACK"); assert.equal(pool.receipt, undefined);
    if (phase !== "operation_receipt") assert.equal(pool.audit, undefined);
    assert.ok(!pool.calls.some(x => x.sql === "COMMIT"));
  }
});

test("native unknown COMMIT outcome discards the original client and never retries or rolls back after COMMIT", async () => {
  const pool = new ImportPool(); pool.failAt = "COMMIT";
  await assert.rejects(new PostgresCutoffImportStore(pool, { nativeAccountingAuthorization: { async assertAllowed() {} } })
    .execute(accountingChunk(), accountingTime), error => error === pool.failure);
  assert.equal(pool.connects, 1); assert.deepEqual(pool.releases, [pool.failure]);
  assert.equal(pool.calls.at(-1)!.sql, "COMMIT"); assert.ok(!pool.calls.some(x => x.sql === "ROLLBACK"));
});

test("native PUBLISH cannot omit or fake whole-scope conservation before its first FINAL write", async () => {
  for (const mode of ["missing", "changed-identity-manifest", "unknown-source-count"]) {
    const pool = new ImportPool(); let command = selectedEmptyPublication(pool);
    if (mode === "missing") { const { stockConservation: _plan, ...withoutPlan } = command; command = withoutPlan; }
    else if (mode === "changed-identity-manifest") command = { ...command, stockConservation: { ...command.stockConservation!, contributorsManifestHash: "f".repeat(64) } };
    else command = { ...command, stockConservation: { ...command.stockConservation!, contributorCount: 1 } };
    await assert.rejects(new PostgresCutoffImportStore(pool, { nativeAccountingAuthorization: { async assertAllowed() {} } })
      .execute(command, accountingTime), { code: "NATIVE_STOCK_CONSERVATION_CONFLICT" });
    assert.equal(pool.recordInserts, 0); assert.equal(pool.claims.length, 0); assert.equal(pool.receipt, undefined);
    assert.equal(pool.calls.at(-1)!.sql, "ROLLBACK");
  }
});

test("nonzero historical sales publication remains explicitly closed through the integrated native PUBLISH path", async () => {
  for (const [key, code] of [["history_sales_header", "HISTORY_IMPORT_SALES_DOCUMENT_NOT_IMPLEMENTED"],
    ["history_sales_line", "HISTORY_IMPORT_SALES_LINE_NOT_IMPLEMENTED"],
    ["history_sales_settlement", "HISTORY_IMPORT_SETTLEMENT_NOT_IMPLEMENTED"]] as const) {
    const pool = new ImportPool(), command = selectedEmptyPublication(pool);
    (pool.batch.history_expected_counts as Record<string, number>)[key] = 1;
    await assert.rejects(new PostgresCutoffImportStore(pool, { nativeAccountingAuthorization: { async assertAllowed() {} } })
      .execute(command, accountingTime), { code });
    assert.equal(pool.recordInserts, 0); assert.equal(pool.claims.length, 0);
    assert.equal(pool.calls.at(-1)!.sql, "ROLLBACK");
  }
});
