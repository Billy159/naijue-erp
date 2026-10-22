import test from "node:test";
import assert from "node:assert/strict";
import { captureHistoryTypedClosureStageInput } from "../packages/application/src/history-typed-closure.ts";
import type { HistoryTypedClosureStageInput } from "../packages/application/src/history-typed-closure.ts";
import { PostgresHistoryTypedClosureStore } from "../adapters/postgres/src/history-typed-closure.ts";
import type { PgSalesPool } from "../adapters/postgres/src/sales-unit-of-work.ts";

import { closureInput, closureId } from "./support/history-closure-fixtures.ts";
const noPool = (onConnect: () => void): PgSalesPool => ({ async connect() { onConnect(); throw Error("NO_CONNECTION_EXPECTED"); } });
test("STAGE captures exact whole plan/documents with complete24 entity and nine expected count maps", () => {
 const input = closureInput(), captured = captureHistoryTypedClosureStageInput(input);
 assert.deepEqual(captured, input); assert.notEqual(captured, input); assert.notEqual(captured.documents, input.documents);
});
test("raw nested getters/symbol/hidden/cycles/sparse data reject before clone, authorization or connection", async () => {
 let reads = 0, auth = 0, connects = 0;
 const store = new PostgresHistoryTypedClosureStore(noPool(() => connects++), { authorizeStage: async () => { auth++; } });
 const getter = closureInput(); Object.defineProperty(getter.plan, "selectionSha256", { enumerable: true, get() { reads++; return "a".repeat(64); } });
 const symbol = Object.assign(closureInput(), { [Symbol("extra")]: 1 });
 const hidden = Object.defineProperty(closureInput().documents[0]!, "extra", { value: 1 });
 const hiddenInput = closureInput(); (hiddenInput.documents as unknown[])[0] = hidden;
 const sparse = closureInput(); (sparse as unknown as { documents: unknown[] }).documents = new Array(1);
 const badCounts = closureInput(); Object.defineProperty(badCounts.plan.sourceEntityCounts, "HALL", { enumerable: true, get() { reads++; return 0; } });
 for (const input of [getter, symbol, hiddenInput, sparse, badCounts]) await assert.rejects(store.stage(input), { code: "INVALID_HISTORY_CLOSURE_STAGE" });
 assert.deepEqual({ reads, auth, connects }, { reads: 0, auth: 0, connects: 0 });
});
test("missing/extra keys, unsafe or incorrect totals, malformed UUID/hash, duplicate and crossed document identities reject", () => {
 const changes: ((x: any) => void)[] = [x => delete x.plan.sourceEntityCounts.HALL, x => x.plan.expectedCounts.extra = 0, x => x.plan.documentCount = 0, x => x.plan.sourceEntityCounts.SALES_LINE = 0, x => x.plan.expectedCounts.history_sales_line = 2, x => x.documents[0].lineCount = 0, x => x.documents[0].settlementCount = -1, x => x.batchId = closureId(1).toUpperCase() + " ", x => x.plan.sourceManifestSha256 = "A".repeat(64), x => x.plan.sourceEntityCounts.HALL = Number.MAX_SAFE_INTEGER, x => x.documents[0].sourceKey = "bad\0", x => x.documents[0].sourceKey = "中".repeat(21846), x => { x.documents.push({ ...x.documents[0] }); x.plan.documentCount = 2; }, x => { x.documents[0].kind = "TRANSFER"; x.documents[0].settlementCount = 1; }];
 for (const change of changes) { const x = closureInput(); change(x); assert.throws(() => captureHistoryTypedClosureStageInput(x), { code: "INVALID_HISTORY_CLOSURE_STAGE" }); }
});
test("authorizer is mandatory captured config; denial prevents connection and is not a generated approval", async () => {
 let connects = 0;
 assert.throws(() => new PostgresHistoryTypedClosureStore(noPool(() => connects++), {} as never));
 let reads = 0; assert.throws(() => new PostgresHistoryTypedClosureStore(noPool(() => connects++), Object.defineProperty({}, "authorizeStage", { enumerable: true, get() { reads++; return async () => {}; } }) as never)); assert.equal(reads, 0);
 const store = new PostgresHistoryTypedClosureStore(noPool(() => connects++), { authorizeStage: async input => { assert.equal(input.documents.length, 1); throw Error("SOURCE_AUTHORITY_MISSING"); } });
 await assert.rejects(store.stage(closureInput()), /SOURCE_AUTHORITY_MISSING/); assert.equal(connects, 0);
});
test("source authorizer receives independent whole input and caller mutation cannot change captured write input", async () => {
 const original = closureInput(); let release!: () => void, entered!: () => void, captured!: HistoryTypedClosureStageInput;
 const ready = new Promise<void>(r => entered = r), wait = new Promise<void>(r => release = r);
 const store = new PostgresHistoryTypedClosureStore(noPool(() => { throw Error("EXPECTED_AFTER_AUTH"); }), { authorizeStage: async x => { captured = x; entered(); await wait; } });
 const pending = store.stage(original); await ready;
 (original.plan as { selectionSha256: string }).selectionSha256 = "9".repeat(64);
 assert.equal(captured.plan.selectionSha256, "a".repeat(64)); assert.notEqual(captured.documents, original.documents);
 release(); await assert.rejects(pending, /EXPECTED_AFTER_AUTH/);
});
test("document count and aggregate64MiB caps reject before source authority or connection", async () => {
 let auth = 0, connects = 0;
 const store = new PostgresHistoryTypedClosureStore(noPool(() => connects++), { authorizeStage: async () => { auth++; } });
 const overCount = closureInput(); (overCount as unknown as { documents: unknown[] }).documents = new Array(100001); (overCount.plan as { documentCount: number }).documentCount = 100001;
 await assert.rejects(store.stage(overCount), { code: "INVALID_HISTORY_CLOSURE_STAGE" });
 const overBytes = closureInput(), n = 1100, base = overBytes.documents[0]!, prefix = "x".repeat(65000);
 (overBytes as unknown as { documents: unknown[] }).documents = Array.from({ length: n }, (_, i) => ({ ...base, sourceKey: prefix + i, headerId: closureId(10000 + i), headerSourceRowId: closureId(20000 + i) }));
 (overBytes.plan as { documentCount: number }).documentCount = n;
 Object.assign(overBytes.plan.expectedCounts, { history_sales_header: n, history_sales_line: n, import_source_row: 2*n });
 Object.assign(overBytes.plan.sourceEntityCounts, { SALES_HEADER: n, SALES_LINE: n });
 await assert.rejects(store.stage(overBytes), { code: "INVALID_HISTORY_CLOSURE_STAGE" });
 assert.deepEqual({ auth, connects }, { auth: 0, connects: 0 });
});
