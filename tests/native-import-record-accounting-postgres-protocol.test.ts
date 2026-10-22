/** SQL protocol fakes ONLY. Not SQL parsing, PostgreSQL guards, transactions, concurrency or durability evidence. */
import test from "node:test";
import assert from "node:assert/strict";
import { createNativeImportRecordAccountant } from "../adapters/postgres/src/native-import-record-accounting.ts";
import type { NativeRecordAccountingTransaction } from "../adapters/postgres/src/native-import-record-accounting.ts";
import type { PgSalesClient, PgSalesResult } from "../adapters/postgres/src/sales-unit-of-work.ts";
import { nativeImportAccountingRequestHash } from "../packages/application/src/native-import-record-accounting.ts";
import type { NativeAccountingMembershipItem, NativeImportAccountingCommand } from "../packages/application/src/native-import-record-accounting.ts";
import { stableImportId } from "../packages/application/src/inventory-cutoff-import.ts";
import { accountingBaseline, accountingBatch, accountingChunk, accountingIds, accountingMemberships, accountingPublish, accountingTime } from "./support/native-record-accounting-fixtures.ts";

interface Step { match: RegExp; result?: PgSalesResult; error?: Error; inspect?: (values: unknown[], sql: string) => void;
  reply?: (values: unknown[]) => PgSalesResult }
class Client implements PgSalesClient {
  readonly calls: { sql: string; values: unknown[] }[] = [];
  private readonly steps: Step[];
  constructor(steps: Step[]) { this.steps = steps; }
  async query(sql: string, values: unknown[] = []): Promise<PgSalesResult> {
    assert.deepEqual([...new Set([...sql.matchAll(/\$(\d+)/g)].map(match => Number(match[1])))].sort((a, b) => a - b),
      Array.from({ length: values.length }, (_, index) => index + 1), "Bind parameters have no gaps or unused arguments; this is not SQL parsing");
    this.calls.push({ sql, values }); const step = this.steps.shift(); assert.ok(step, `Unexpected query: ${sql}`); assert.match(sql, step.match);
    step.inspect?.(values, sql); if (step.error) throw step.error;
    return step.reply?.(values) ?? step.result ?? { rows: [], rowCount: 1 };
  }
  release(): void { assert.fail("The transaction-scoped accountant must not release the original store's client"); }
  done(): void { assert.equal(this.steps.length, 0); assert.ok(this.calls.every(call => !/^(?:BEGIN|COMMIT|ROLLBACK|UPDATE|DELETE)\b/.test(call.sql))); }
}
const row = (value: Record<string, unknown>): PgSalesResult => ({ rows: [value], rowCount: 1 });
function context(command: NativeImportAccountingCommand = accountingChunk()): NativeRecordAccountingTransaction {
  const batch = accountingBatch();
  if (command.action === "IMPORT_PUBLISH") {
    (batch as unknown as { status: string }).status = "VALIDATING";
    (batch as unknown as { checkpoint: unknown }).checkpoint = { ...batch.checkpoint, sequence: 1, cursor: 3,
      counts: { WAREHOUSE: 1, SKU: 1, INVENTORY_LEDGER: 1, IMPORT_BATCH: 0 } };
  }
  return { command, batch, operationId: stableImportId("operation", command.actorAccountId, command.requestKey),
    commandHash: nativeImportAccountingRequestHash(command), now: accountingTime };
}
function setup(input: NativeRecordAccountingTransaction): Step[] {
  const batch = input.batch; const command = input.command;
  const targets = new Map<string, string>();
  if (command.action === "IMPORT_CHUNK") for (const item of command.items) {
    if (item.targetType === "INVENTORY_LEDGER") { targets.set(`WAREHOUSE:${item.warehouseId}`, item.warehouseId); targets.set(`SKU:${item.skuId}`, item.skuId); }
    else targets.set(`${item.targetType}:${item.targetId}`, item.targetId);
  }
  const targetSteps: Step[] = [...targets.entries()].sort(([a], [b]) => a.startsWith("WAREHOUSE") !== b.startsWith("WAREHOUSE")
    ? a.startsWith("WAREHOUSE") ? -1 : 1 : a.localeCompare(b)).map(([key, id]) => ({ match: new RegExp(`native-accounting:native:${key.split(":")[0]}`),
    result: row({ id, native_snapshot: { id, version: 1, synthetic_only: true } }) }));
  return [{ match: /native-accounting:schema/, result: row({ versions: Array.from({ length: 15 }, (_, i) => i + 1) }) },
    { match: /native-accounting:cutoff/ }, { match: /native-accounting:batch/, result: row({ id: batch.id, mapping_version: batch.mappingVersion,
      status: batch.status, source_name: batch.sourceName, source_hash: batch.sourceHash, source_manifest_ref: batch.sourceManifestRef,
      checkpoint: batch.checkpoint, already_published: false }) }, ...targetSteps,
    ...Array.from({ length: command.action === "IMPORT_CHUNK" ? command.items.length : 1 }, (): Step => ({ match: /native-accounting:source-lock/ })),
    ...Array.from({ length: command.action === "IMPORT_CHUNK" ? command.items.filter(item => item.targetType === "INVENTORY_LEDGER").length : 0 },
      (): Step => ({ match: /native-accounting:inventory-lock/ }))];
}
function claimStep(change?: Partial<Step>): Step {
  return { match: /native-accounting:claim/, reply(values) {
    return row({ import_batch_id: values[0], import_record_id: values[1], target_type: values[2], target_id: values[3], operation_id: values[4], checkpoint_sequence: values[5] });
  }, ...change };
}
const proof = (item: NativeAccountingMembershipItem): Step => ({ match: new RegExp(`native-accounting:membership:${item.targetType}`),
  result: row({ id: item.nativeRecord.id }), inspect(values, sql) {
    assert.equal(values[0], item.nativeRecord.id); assert.equal(values[8], item.nativeRecord.reviewedAt);
    assert.deepEqual(JSON.parse(String(values[11])), item.nativeRecord); assert.match(sql, /FOR SHARE OF r,s/);
    assert.ok(!/INSERT INTO naijue_erp.import_record\b/.test(sql));
  } });

test("new native memberships consume exact existing creator records; only returned new claims advance progress", async () => {
  const input = context(); const client = new Client([...setup(input), ...accountingMemberships.flatMap(item => [proof(item), claimStep()])]);
  const accountant = await createNativeImportRecordAccountant(client, input);
  assert.throws(() => accountant.checkpoint(), { code: "INCOMPLETE_NATIVE_RECORD_ACCOUNTING" });
  for (const item of accountingMemberships) await accountant.claimMembership(item);
  assert.deepEqual(accountant.checkpoint().counts, { WAREHOUSE: 1, SKU: 1, INVENTORY_LEDGER: 0, IMPORT_BATCH: 0 });
  assert.equal(accountant.checkpoint().cursor, 2);
  assert.equal(client.calls.filter(call => /INSERT INTO/.test(call.sql)).length, 2); client.done();
});
test("all native/source/inventory locks precede any accounting insert, in deterministic global order", async () => {
  const input = context(accountingChunk([...accountingMemberships, accountingBaseline])); const client = new Client(setup(input));
  await createNativeImportRecordAccountant(client, input); client.done();
  assert.ok(client.calls.findIndex(call => /native:WAREHOUSE/.test(call.sql)) < client.calls.findIndex(call => /native:SKU/.test(call.sql)));
  assert.ok(client.calls.findIndex(call => /native:SKU/.test(call.sql)) < client.calls.findIndex(call => /source-lock/.test(call.sql)));
  assert.ok(client.calls.findLastIndex(call => /source-lock/.test(call.sql)) < client.calls.findIndex(call => /inventory-lock/.test(call.sql)));
});
test("reviewed schema16 accountant follows the same original lock/progress protocol without changing original schema15 constant", async () => {
  const input = context(), steps = setup(input);
  steps[0]!.result = row({ versions: Array.from({ length: 16 }, (_, i) => i + 1) });
  const client = new Client(steps); await createNativeImportRecordAccountant(client, input); client.done();
});
test("hash/operation mismatch fails before SQL; unknown schema fails before locks or writes", async () => {
  for (const change of [{ commandHash: "f".repeat(64) }, { operationId: accountingIds.sku }]) {
    const client = new Client([]); await assert.rejects(createNativeImportRecordAccountant(client, { ...context(), ...change })); client.done();
  }
  for (const versions of [Array.from({ length: 14 }, (_, i) => i + 1), Array.from({ length: 20 }, (_, i) => i + 1)]) {
    const client = new Client([{ match: /native-accounting:schema/, result: row({ versions }) }]);
    await assert.rejects(createNativeImportRecordAccountant(client, context()), { code: "NATIVE_RECORD_ACCOUNTING_SCHEMA_NOT_READY" }); client.done();
  }
});
test("locked checkpoint drift or a published scope cannot be counted or silently adopted", async () => {
  for (const change of [{ already_published: true }, { checkpoint: { ...accountingBatch().checkpoint, cursor: 1 } }, { source_hash: "f".repeat(64) }]) {
    const input = context(); const steps = setup(input).slice(0, 3); const batch = steps[2]!.result!.rows[0]!;
    steps[2]!.result = row({ ...batch, ...change }); const client = new Client(steps);
    await assert.rejects(createNativeImportRecordAccountant(client, input), { code: "NATIVE_RECORD_ACCOUNTING_CONFLICT" }); client.done();
  }
});
test("missing creator evidence/current snapshot drift fails before claim and poisons further accounting", async () => {
  const input = context(accountingChunk([accountingMemberships[0]!])); const client = new Client([...setup(input),
    { match: /native-accounting:membership:WAREHOUSE/, result: { rows: [], rowCount: 0 } }]);
  const accountant = await createNativeImportRecordAccountant(client, input);
  await assert.rejects(accountant.claimMembership(accountingMemberships[0]!), { code: "NATIVE_RECORD_ACCOUNTING_CONFLICT" });
  assert.throws(() => accountant.checkpoint(), { code: "NATIVE_RECORD_ACCOUNTING_CONFLICT" }); client.done();
});
test("a conflicting other-key claim preserves its original unique error; no skip/upsert or client retry occurs", async () => {
  const input = context(accountingChunk([accountingMemberships[0]!])); const duplicate = Object.assign(Error("synthetic already-owned claim"), { code: "23505" });
  const client = new Client([...setup(input), proof(accountingMemberships[0]!), claimStep({ error: duplicate })]);
  const accountant = await createNativeImportRecordAccountant(client, input);
  await assert.rejects(accountant.claimMembership(accountingMemberships[0]!), error => error === duplicate);
  assert.throws(() => accountant.checkpoint()); assert.ok(client.calls.every(call => !/ON CONFLICT/.test(call.sql))); client.done();
});
for (const mismatch of ["empty", "target", "sequence"] as const) test(`new claim RETURNING ${mismatch} cannot create checkpoint progress`, async () => {
  const input = context(accountingChunk([accountingMemberships[0]!]));
  const client = new Client([...setup(input), proof(accountingMemberships[0]!), claimStep({ reply(values) {
    if (mismatch === "empty") return { rows: [], rowCount: 0 };
    return row({ import_batch_id: values[0], import_record_id: values[1], target_type: values[2], target_id: mismatch === "target" ? accountingIds.sku : values[3],
      operation_id: values[4], checkpoint_sequence: mismatch === "sequence" ? 2 : values[5] });
  } })]);
  const accountant = await createNativeImportRecordAccountant(client, input);
  await assert.rejects(accountant.claimMembership(accountingMemberships[0]!)); assert.throws(() => accountant.checkpoint()); client.done();
});
test("an already consumed or foreign item is refused without a second insert", async () => {
  const input = context(accountingChunk([accountingMemberships[0]!])); const client = new Client([...setup(input), proof(accountingMemberships[0]!), claimStep()]);
  const accountant = await createNativeImportRecordAccountant(client, input); await accountant.claimMembership(accountingMemberships[0]!);
  await assert.rejects(accountant.claimMembership(accountingMemberships[0]!)); client.done();
  const otherClient = new Client(setup(input)); const other = await createNativeImportRecordAccountant(otherClient, input);
  await assert.rejects(other.claimMembership(accountingMemberships[1]!)); otherClient.done();
});
test("negative baseline claims require actual exact INSERT RETURNING triplet and attached ALL signed contributors", async () => {
  const command = accountingChunk([accountingBaseline]); const input = context(command); const source = input.batch.sourceName;
  const recordId = stableImportId("source", source, accountingBaseline.sourceEntityType, accountingBaseline.sourceKey);
  const ledgerId = stableImportId("baseline", source, accountingBaseline.sourceEntityType, accountingBaseline.sourceKey);
  const client = new Client([...setup(input), { match: /native-accounting:baseline/, result: row({ id: recordId }), inspect(values, sql) {
    assert.equal(values[10], "-7"); assert.match(sql, /sum\(c.signed_quantity::numeric\)/); assert.match(sql, /baseline_ledger_id IS DISTINCT FROM l.id/);
    assert.match(sql, /合并输入库存行数/); assert.doesNotMatch(sql, /COALESCE|UPDATE naijue_erp.inventory_balance|INSERT INTO naijue_erp.inventory_ledger/);
  } }, claimStep()]);
  const accountant = await createNativeImportRecordAccountant(client, input);
  const claim = await accountant.claimBaseline(accountingBaseline, { record: row({ id: recordId }), ledger: row({ id: ledgerId }),
    balance: row({ warehouse_id: accountingBaseline.warehouseId, sku_id: accountingBaseline.skuId }) });
  assert.equal(claim.targetId, ledgerId); assert.equal(accountant.checkpoint().counts.INVENTORY_LEDGER, 1); client.done();
});
for (const part of ["record", "ledger", "balance"] as const) test(`baseline ${part} without successful new RETURNING cannot be adopted/count`, async () => {
  const input = context(accountingChunk([accountingBaseline])); const source = input.batch.sourceName;
  const created = { record: row({ id: stableImportId("source", source, accountingBaseline.sourceEntityType, accountingBaseline.sourceKey) }),
    ledger: row({ id: stableImportId("baseline", source, accountingBaseline.sourceEntityType, accountingBaseline.sourceKey) }),
    balance: row({ warehouse_id: accountingBaseline.warehouseId, sku_id: accountingBaseline.skuId }) };
  created[part] = { rows: [], rowCount: 0 }; const client = new Client(setup(input)); const accountant = await createNativeImportRecordAccountant(client, input);
  await assert.rejects(accountant.claimBaseline(accountingBaseline, created)); assert.throws(() => accountant.checkpoint()); client.done();
});
test("unknown/missing stock group readback cannot be coalesced to zero or counted", async () => {
  const input = context(accountingChunk([accountingBaseline])); const source = input.batch.sourceName;
  const client = new Client([...setup(input), { match: /native-accounting:baseline/, result: { rows: [], rowCount: 0 } }]);
  const accountant = await createNativeImportRecordAccountant(client, input);
  await assert.rejects(accountant.claimBaseline(accountingBaseline, {
    record: row({ id: stableImportId("source", source, accountingBaseline.sourceEntityType, accountingBaseline.sourceKey) }),
    ledger: row({ id: stableImportId("baseline", source, accountingBaseline.sourceEntityType, accountingBaseline.sourceKey) }),
    balance: row({ warehouse_id: accountingBaseline.warehouseId, sku_id: accountingBaseline.skuId }) })); client.done();
});
test("FINAL claims one newly inserted exact approval after reconciliation; accountant never publishes or fabricates receipt", async () => {
  const input = context(accountingPublish()); const id = stableImportId("source", input.batch.sourceName, "INVENTORY_SCOPE_APPROVAL", "FINAL_COMPLETE_SCOPE");
  const client = new Client([...setup(input), { match: /native-accounting:final/, result: row({ id }) }, claimStep()]);
  const accountant = await createNativeImportRecordAccountant(client, input); await accountant.claimFinalApproval(row({ id }));
  assert.equal(accountant.checkpoint().counts.IMPORT_BATCH, 1); assert.equal(accountant.checkpoint().cursor, 4); client.done();
});
test("caller mutations after factory creation cannot change the original bound command", async () => {
  const input = context(accountingChunk([accountingMemberships[0]!])); const original = structuredClone(accountingMemberships[0]!);
  const client = new Client([...setup(input), proof(original), claimStep()]); const accountant = await createNativeImportRecordAccountant(client, input);
  (input.command as unknown as { requestKey: string }).requestKey = "changed-after-binding";
  await accountant.claimMembership(original); assert.equal(accountant.checkpoint().counts.WAREHOUSE, 1); client.done();
});

test("accounting26 explicit same-client runtime retains exact creator membership accounting without legacy schema widening", async () => {
  const input=context(),client=new Client([...setup(input).slice(1),...accountingMemberships.flatMap(item=>[proof(item),claimStep()])]);let checks=0;
  const runtime={profile:"EXACT26" as const,contract:"NATIVE_RUNTIME26_V1" as const,async assertReady(c:object,purpose:string){assert.equal(c,client);assert.equal(purpose,"IMPORT_STAGE");checks++;}};
  const accountant=await createNativeImportRecordAccountant(client,input,runtime);
  for(const item of accountingMemberships)await accountant.claimMembership(item);
  assert.equal(checks,1);assert.deepEqual(accountant.checkpoint().counts,{WAREHOUSE:1,SKU:1,INVENTORY_LEDGER:0,IMPORT_BATCH:0});
  assert.ok(!client.calls.some(c=>c.sql.includes("native-accounting:schema")));client.done();
});
test("accounting26 rejected runtime stops before SQL; legacy no-capability still rejects26",async()=>{
  for(const boolean of [false,true]){
    const client=new Client([]);await assert.rejects(createNativeImportRecordAccountant(client,context(),{profile:"EXACT26",contract:"NATIVE_RUNTIME26_V1",async assertReady(){if(boolean)return true as unknown as undefined;throw Error("SYNTHETIC runtime revoked");}}));assert.equal(client.calls.length,0);client.done();
  }
  const old=new Client([{match:/native-accounting:schema/,result:row({versions:Array.from({length:26},(_,i)=>i+1)})}]);
  await assert.rejects(createNativeImportRecordAccountant(old,context()));assert.equal(old.calls.length,1);old.done();
});
