/** Protocol only: no PostgreSQL execution, sequence/concurrency/durability claim. */
import test from "node:test";
import assert from "node:assert/strict";
import { reserveRuntimeDocumentNumber, assertRuntimeDocumentNumber } from "../adapters/postgres/src/runtime-document-number.ts";
import { entityId } from "../packages/domain/src/values.ts";
import type { RuntimeDocumentNumberInput } from "../packages/application/src/runtime-document-number.ts";
import { PostgresSalesUnitOfWork } from "../adapters/postgres/src/sales-unit-of-work.ts";
import { PostgresTransferUnitOfWork } from "../adapters/postgres/src/transfer-unit-of-work.ts";
import type { SalesTransaction } from "../packages/application/src/ports.ts";
import type { TransferTransaction } from "../packages/application/src/transfer-ports.ts";
import { createNativeTransferPreparation } from "../packages/application/src/native-transfer-preparation.ts";
import { createSourceConfirmedTransferAuthorization, createSourceConfirmedTransferReferences } from "../packages/application/src/transfer-policy.ts";
import { createTransferService } from "../packages/application/src/transfer-service.ts";
import type { TransferDependencies } from "../packages/application/src/transfer-ports.ts";
const input: RuntimeDocumentNumberInput = { kind: "SALES", actorAccountId: entityId("account", "00000000-0000-4000-8000-000000000001"), documentId: entityId("sales", "00000000-0000-4000-8000-000000000002") };
const number = "V2-XS-000000000001";

test("new reservation locks then inserts only trusted identities; database supplies the number", async () => {
  const calls: { sql: string; values: unknown[] }[] = [];
  const result = await reserveRuntimeDocumentNumber(async (sql, values = []) => {
    calls.push({ sql, values });
    return { rows: sql.includes(":reserve") ? [{ number, actor_account_id: input.actorAccountId }] : [], rowCount: 1 };
  }, input);
  assert.equal(result, number); assert.equal(calls.length, 3);
  assert.ok(calls[0]!.sql.includes("pg_advisory_xact_lock")); assert.ok(calls[1]!.sql.includes("FOR SHARE"));
  assert.deepEqual(calls[2]!.values, [input.kind, input.documentId, input.actorAccountId]);
  assert.ok(!calls.some(c => /COMMIT|ROLLBACK|BEGIN/.test(c.sql)));
});
test("original actor/document recovery returns original allocation and performs no insert or new sequence request", async () => {
  const calls: string[] = [];
  const result = await reserveRuntimeDocumentNumber(async sql => { calls.push(sql); return { rows: sql.includes(":existing") ? [{ number, actor_account_id: input.actorAccountId }] : [], rowCount: 1 }; }, input);
  assert.equal(result, number); assert.equal(calls.length, 2); assert.ok(calls.every(sql => !sql.includes("INSERT")));
});
test("foreign actor, missing rows and wrong returned allocation fail closed without reallocation", async () => {
  let inserts = 0;
  await assert.rejects(reserveRuntimeDocumentNumber(async sql => {
    if (sql.includes("INSERT")) inserts++;
    return { rows: sql.includes(":existing") ? [{ number, actor_account_id: "OTHER_ACCOUNT" }] : [], rowCount: 1 };
  }, input), { code: "FORBIDDEN" }); assert.equal(inserts, 0);
  for (const rows of [[], [{ number, actor_account_id: "OTHER_ACCOUNT" }], [{ number: "V2-XS-000000000002", actor_account_id: input.actorAccountId }]])
    await assert.rejects(assertRuntimeDocumentNumber(async () => ({ rows, rowCount: rows.length }), { ...input, number }), { code: "DOCUMENT_NUMBER_MISMATCH" });
  await assert.rejects(reserveRuntimeDocumentNumber(async sql => ({ rows: sql.includes(":reserve") ? [{ number: "V2-XS-00000000", actor_account_id: input.actorAccountId }] : [], rowCount: 1 }), input), { code: "INVALID_DOCUMENT_NUMBER" });
});
test("SAVE mapping read binds exact family, UUID, actor and full number on caller's transaction", async () => {
  let reads = 0;
  await assertRuntimeDocumentNumber(async (sql, values) => {
    reads++; assert.ok(sql.includes("FOR SHARE")); assert.deepEqual(values, [input.kind, input.documentId]);
    return { rows: [{ number, actor_account_id: input.actorAccountId }], rowCount: 1 };
  }, { ...input, number }); assert.equal(reads, 1);
});
for (const family of ["SALES", "TRANSFER"] as const) test(`adapter: ${family} numbering uses original bound lease and rejects another actor/closed handle`, async () => {
  let connects = 0, releases = 0; const calls: string[] = [];
  const n = family === "SALES" ? number : "V2-DB-000000000001";
  const pool = { async connect() { connects++; return { async query(sql: string) { calls.push(sql); return { rows: sql.includes("sales:current-schema")
    ? [{ current_sales_schema_ready: true }] : sql.includes("document-number:reserve") || sql.includes("document-number:validate")
      ? [{ number: n, actor_account_id: input.actorAccountId }] : [], rowCount: 1 }; }, release() { releases++; } }; } };
  const uow = family === "SALES" ? new PostgresSalesUnitOfWork(pool) : new PostgresTransferUnitOfWork(pool);
  const value = { ...input, kind: family }; let escaped: SalesTransaction | TransferTransaction | undefined;
  const work = async (tx: SalesTransaction | TransferTransaction) => {
    escaped = tx; await tx.getReceipt(input.actorAccountId, "number-original-key");
    if ("getSales" in tx) await tx.getSales(entityId("sales", input.documentId)); else await tx.getTransfer(entityId("transfer", input.documentId));
    const before = calls.length;
    await assert.rejects(tx.reserveRuntimeDocumentNumber!({ ...value, actorAccountId: entityId("account", "00000000-0000-4000-8000-000000000099") }), { code: "TRANSACTION_SCOPE" });
    assert.equal(calls.length, before);
    const reserved = await tx.reserveRuntimeDocumentNumber!(value); await tx.assertRuntimeDocumentNumber!({ ...value, number: reserved }); return reserved;
  };
  assert.equal(await uow.transaction(work), n); assert.equal(connects, 1); assert.equal(releases, 1);
  assert.equal(calls.filter(sql => sql === "COMMIT").length, 1); assert.equal(calls.filter(sql => sql === "ROLLBACK").length, 0);
  const finished = calls.length; await assert.rejects(escaped!.reserveRuntimeDocumentNumber!(value), { code: "TRANSACTION_SCOPE" }); assert.equal(calls.length, finished);
});

function actualTransferPreparationProtocol() {
  let serial = 100, allocations = 0, failSave = false, destinationEnabled = true;
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const actor = { accountId: entityId("account", id(900)), hallId: entityId("hall", id(901)), role: "ADMIN" as const };
  const proposal = { businessDate: "2026-10-22", note: null, fromWarehouseId: id(902), toWarehouseId: id(903), lines: [{ skuId: id(904), quantity: "2" }] };
  const calls: { sql: string; values: unknown[] }[] = [], numbers = new Map<string, string>();
  const failure = Error("SYNTHETIC_SAVE_HEADER_FAILURE");
  const pool = { async connect() { return { async query(sql: string, values: unknown[] = []) {
    calls.push({ sql, values }); let rows: Record<string, unknown>[] = [];
    if (sql.includes("native-transfer-snapshots:schema")) rows = [{ installed: true }];
    else if (sql.includes("native-transfer-snapshots:targets")) rows = [{ id: id(904), product_code: "SYNTHETIC_P", product_name: "SYNTHETIC", color_name: "C", fit_name: "F", size_name: "S", barcode: "000123" }];
    else if (sql.includes("FROM naijue_erp.warehouse w JOIN naijue_erp.hall")) rows = [{ id: values[0], hall_id: actor.hallId, enabled: values[0] === id(903) ? destinationEnabled : true, hall_enabled: true, has_nonzero_inventory: false }];
    else if (sql.includes("FROM naijue_erp.sku s JOIN naijue_erp.product")) rows = [{ id: id(904), enabled: true }];
    else if (sql.includes("document-number:existing") || sql.includes("document-number:validate")) {
      const assigned = numbers.get(values[1] as string); rows = assigned ? [{ number: assigned, actor_account_id: actor.accountId }] : [];
    } else if (sql.includes("document-number:reserve")) { allocations++; numbers.set(values[1] as string, "V2-DB-000000000001"); rows = [{ number: "V2-DB-000000000001", actor_account_id: actor.accountId }]; }
    else if (sql.startsWith("INSERT INTO naijue_erp.transfer_header") && failSave) { failSave = false; throw failure; }
    return { rows, rowCount: 1 };
  }, release() {} }; } };
  const dependencies: TransferDependencies = { unitOfWork: new PostgresTransferUnitOfWork(pool), authorization: createSourceConfirmedTransferAuthorization(), references: createSourceConfirmedTransferReferences(),
    now: () => "2026-10-22T00:00:00Z", newId: kind => entityId(kind, id(serial++)) };
  return { actor, proposal, dependencies, calls, prepare: createNativeTransferPreparation(dependencies), failure, allocations: () => allocations,
    failNextSave: () => { failSave = true; }, disableDestination: () => { destinationEnabled = false; } };
}
test("repair QB-NUMBER-TRANSFER-01: actual prepare binds private actor/key, returns assigned number and retains it after SAVE failure/retry", async () => {
  const p = actualTransferPreparationProtocol(), draft = await p.prepare.prepareCreate(p.actor, p.proposal);
  assert.equal(draft.header.number, "V2-DB-000000000001"); assert.equal(p.allocations(), 1);
  const prepCalls = [...p.calls], receiptRead = prepCalls.find(c => c.sql.includes("FROM naijue_erp.operation_receipt"))!;
  assert.equal(receiptRead.values[0], p.actor.accountId); assert.match(receiptRead.values[1] as string, /^prepare-transfer:[0-9a-f-]{36}$/);
  assert.ok(!prepCalls.some(c => /INSERT INTO naijue_erp\.(operation_receipt|audit_change|transfer_header|inventory_)/.test(c.sql)));
  assert.ok(prepCalls.findIndex(c => c.sql.includes("FROM naijue_erp.operation_receipt")) < prepCalls.findIndex(c => c.sql.includes("document-number:reserve")));
  const command = { actor: p.actor, action: "SAVE" as const, expectedVersion: null, requestKey: "same-original-save-key", draft };
  p.failNextSave(); const service = createTransferService(p.dependencies);
  await assert.rejects(service.execute(command), error => error === p.failure);
  const result = await service.execute(command); assert.equal(result.status, "DRAFT"); assert.equal(p.allocations(), 1);
  const validations = p.calls.filter(c => c.sql.includes("document-number:validate")); assert.equal(validations.length, 2); assert.ok(validations.every(c => c.values[1] === draft.header.id));
  assert.equal(p.calls.filter(c => c.sql === "ROLLBACK").length, 1);
});
test("repair QB-NUMBER-TRANSFER-01: actual prepare denied role/reference never reserves or fabricates receipt", async () => {
  const denied = actualTransferPreparationProtocol();
  await assert.rejects(denied.prepare.prepareCreate({ ...denied.actor, role: "SALESPERSON", hallId: null }, denied.proposal), { code: "FORBIDDEN" });
  const disabled = actualTransferPreparationProtocol(); disabled.disableDestination();
  await assert.rejects(disabled.prepare.prepareCreate(disabled.actor, disabled.proposal), { code: "WAREHOUSE_UNAVAILABLE" });
  for (const p of [denied, disabled]) { assert.equal(p.allocations(), 0); assert.ok(!p.calls.some(c => /INSERT INTO naijue_erp\.(operation_receipt|runtime_document_number_allocation)/.test(c.sql))); }
});
