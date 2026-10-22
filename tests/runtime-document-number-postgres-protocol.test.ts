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
