/** Original store/service + scripted client only; not PG/bootstrap source/data evidence. */
import test from "node:test";
import assert from "node:assert/strict";
import { PostgresCutoffImportStore } from "../adapters/postgres/src/inventory-cutoff-import-store.ts";
import type { ImportStageBootstrap } from "../adapters/postgres/src/inventory-cutoff-import-store.ts";
import { createCutoffImportService, stableImportId } from "../packages/application/src/inventory-cutoff-import.ts";
import { HISTORY_MAPPING_VERSION } from "../packages/application/src/history-storage-contract.ts";
import { requestHash } from "../packages/application/src/request-hash.ts";
import { cutoffStage, cutoffTime } from "./support/synthetic-cutoff-fixtures.ts";
const stage = { ...cutoffStage, mappingVersion: HISTORY_MAPPING_VERSION, historyMetadata: { payloadHash: "b".repeat(64),
  expectedCounts: { import_source_row: 0, import_sku_alias: 0, history_sales_header: 0, history_transfer_header: 0,
    history_sales_line: 0, history_transfer_line: 0, history_sales_settlement: 0, import_stock_contributor: 0, barcodes: 0 } } };
function protocol(options: { failure?: string; zero?: string } = {}) {
  const calls: { sql: string; values: unknown[] }[] = [], released: unknown[] = []; let connects = 0, allowed = true, authorizations = 0;
  let receipt: Record<string, unknown> | undefined, batchExists = false;
  const failure = Error("SYNTHETIC_" + options.failure);
  const pool = { async connect() { connects++; return { async query(sql: string, values: unknown[] = []) {
    calls.push({ sql, values }); let rows: Record<string, unknown>[] = [], rowCount = 1;
    if (options.failure && (options.failure === "COMMIT" ? sql === "COMMIT" : sql.includes(options.failure))) throw failure;
    if (sql.includes("synthetic:pending")) await new Promise<void>(resolve => setImmediate(resolve));
    if (sql.includes("history-lifecycle:schema")) rows = [{ versions: Array.from({ length: 19 }, (_, i) => i + 1) }];
    else if (sql.includes("inventory:guards")) rows = [{ integrity_guards_present: true }];
    else if (sql.includes("accounting_guards_present")) rows = [{ accounting_guards_present: true }];
    else if (sql.includes("FROM naijue_erp.operation_receipt")) rows = receipt ? [receipt] : [];
    else if (sql.includes("FROM naijue_erp.import_batch WHERE id = $1 FOR UPDATE")) rows = batchExists ? [{ id: stage.batchId }] : [];
    else if (sql.startsWith("INSERT INTO naijue_erp.import_batch")) batchExists = true;
    else if (sql.startsWith("INSERT INTO naijue_erp.operation_receipt")) receipt = { request_hash: values[3], target_type: "IMPORT", target_id: values[5], action: values[4], result_data: JSON.parse(values[6] as string) };
    if (options.zero && sql.startsWith("INSERT INTO naijue_erp." + options.zero)) rowCount = 0;
    return { rows, rowCount };
  }, release(error?: unknown) { released.push(error); } }; } };
  function service(bootstrap: ImportStageBootstrap) { return createCutoffImportService({ now: () => cutoffTime,
    authorization: { async assertAllowed() { authorizations++; if (!allowed) throw Object.assign(Error("SYNTHETIC_REVOKED"), { code: "FORBIDDEN" }); } },
    store: new PostgresCutoffImportStore(pool, { stageBootstrap: bootstrap }) }); }
  return { calls, released, failure, service, connects: () => connects, authCount: () => authorizations, revoke: () => { allowed = false; } };
}
test("first source STAGE bootstrap uses only the original query lease after batch creation and before audit/receipt", async () => {
  const p = protocol(); let called = 0, escaped: Parameters<ImportStageBootstrap["stageNewBatch"]>[0] | undefined;
  const service = p.service({ async stageNewBatch(client, input) {
    called++; escaped = client; assert.deepEqual(Reflect.ownKeys(client), ["query"]); assert.deepEqual(input.command, stage);
    assert.equal(input.now, cutoffTime); assert.equal(input.operationId, stableImportId("operation", stage.actorAccountId, stage.requestKey));
    assert.equal(p.calls.at(-1)!.sql.startsWith("INSERT INTO naijue_erp.import_batch"), true);
    await client.query("/* synthetic:bootstrap-party-and-actor */ INSERT INTO SYNTHETIC_ONLY VALUES($1)", [stage.actorAccountId]);
  } });
  const result = await service.execute(stage); assert.equal(result.status, "STAGED"); assert.equal(called, 1); assert.equal(p.connects(), 1);
  const index = (name: string) => p.calls.findIndex(c => c.sql.includes(name));
  assert.ok(index("synthetic:bootstrap-party-and-actor") < index("INSERT INTO naijue_erp.audit_change"));
  assert.ok(index("INSERT INTO naijue_erp.audit_change") < index("INSERT INTO naijue_erp.operation_receipt"));
  assert.equal(p.calls.filter(c => c.sql === "COMMIT").length, 1); assert.deepEqual(p.released, [undefined]);
  assert.throws(() => escaped!.query("SELECT 1"), { code: "TRANSACTION_CLOSED" });
});
test("original-key STAGE replay reauthorizes before return and never reruns bootstrap; changed payload and revoked actor fail", async () => {
  const p = protocol(); let called = 0;
  const service = p.service({ async stageNewBatch() { called++; } });
  const first = await service.execute(stage), count = p.calls.length;
  assert.deepEqual(await service.execute(stage), first); assert.equal(called, 1); assert.equal(p.authCount(), 2);
  assert.ok(p.calls.slice(count).every(c => !/^(?:INSERT|UPDATE)/.test(c.sql)));
  await assert.rejects(service.execute({ ...stage, sourceManifestRef: "changed-exact-source" }), { code: "IDEMPOTENCY_CONFLICT" });
  p.revoke(); const before = p.connects(); await assert.rejects(service.execute(stage), { code: "FORBIDDEN" }); assert.equal(p.connects(), before); assert.equal(called, 1);
});
test("bootstrap failure rolls back original stage and performs no audit/receipt insert", async () => {
  const p = protocol(), failure = Error("SYNTHETIC_BOOTSTRAP_FAILURE");
  await assert.rejects(p.service({ async stageNewBatch(client) { await client.query("SELECT 1"); throw failure; } }).execute(stage), error => error === failure);
  assert.equal(p.calls.at(-1)!.sql, "ROLLBACK"); assert.ok(p.calls.every(c => !c.sql.startsWith("INSERT INTO naijue_erp.audit_change") && !c.sql.startsWith("INSERT INTO naijue_erp.operation_receipt")));
});
test("bootstrap cannot commit, release, run multiple statements, mutate original command or ignore query failure", async () => {
  for (const sql of ["COMMIT", "ROLLBACK", "BEGIN", "/* comment */ COMMIT", "SELECT 1; COMMIT", "SET ROLE owner"]) {
    const p = protocol(); await assert.rejects(p.service({ async stageNewBatch(client) { await client.query(sql); } }).execute(stage), { code: "TRANSACTION_SCOPE" });
    if (sql === "ROLLBACK") assert.equal(p.calls.filter(c => c.sql === sql).length, 1); // Enclosing owner's legitimate cleanup only.
    else assert.ok(p.calls.every(c => c.sql !== sql));
    assert.equal(p.calls.at(-1)!.sql, "ROLLBACK");
  }
  const changed = protocol(); await assert.rejects(changed.service({ async stageNewBatch(_client, input) {
    (input.command.expected as { SKU: number }).SKU++;
  } }).execute(stage), { code: "IMPORT_BOOTSTRAP_COMMAND_MUTATION" });
  const ignored = protocol({ failure: "synthetic:query-failure" }); await assert.rejects(ignored.service({ async stageNewBatch(client) {
    await client.query("/* synthetic:query-failure */ SELECT 1").catch(() => undefined);
  } }).execute(stage), error => error === ignored.failure);
});
test("bootstrap stage requires actual audit and receipt insert counts; unknown COMMIT only discards", async () => {
  for (const zero of ["audit_change", "operation_receipt"]) {
    const p = protocol({ zero }); await assert.rejects(p.service({ async stageNewBatch() {} }).execute(stage), { code: "NATIVE_IMPORT_EVIDENCE_INSERT" });
    assert.equal(p.calls.at(-1)!.sql, "ROLLBACK");
  }
  const p = protocol({ failure: "COMMIT" }); await assert.rejects(p.service({ async stageNewBatch() {} }).execute(stage), error => error === p.failure);
  assert.deepEqual(p.released, [p.failure]); assert.equal(p.calls.filter(c => c.sql === "ROLLBACK").length, 0); assert.equal(p.connects(), 1);
  assert.ok(p.calls.some(c => c.sql.startsWith("INSERT INTO naijue_erp.operation_receipt"))); // Failure is truly after evidence, not READ COMMITTED's BEGIN.
  assert.equal(requestHash(stage), requestHash(structuredClone(stage)));
});
test("unawaited in-flight bootstrap work is drained then rejected before the owner rolls back", async () => {
  const p = protocol(); await assert.rejects(p.service({ async stageNewBatch(client) {
    void client.query("/* synthetic:pending */ SELECT 1");
  } }).execute(stage), { code: "TRANSACTION_SCOPE" });
  assert.equal(p.calls.at(-1)!.sql, "ROLLBACK"); assert.ok(p.calls.every(c => !c.sql.startsWith("INSERT INTO naijue_erp.audit_change")));
});
