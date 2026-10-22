/** Explicit protocol fakes prove isolation/transaction behavior; never evidence of SQL/PG closure correctness. */
import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { PostgresHistoryTypedClosureStore } from "../adapters/postgres/src/history-typed-closure.ts";
import { assertReviewedNativeImportSchema } from "../packages/application/src/native-import-schema-contract.ts";
import { assertHistoryTypedClosureSchema } from "../packages/application/src/history-typed-closure.ts";
import { closureInput } from "./support/history-closure-fixtures.ts";
import type { HistoryTypedClosureStageInput } from "../packages/application/src/history-typed-closure.ts";
import type { PgSalesPool, PgSalesClient } from "../adapters/postgres/src/sales-unit-of-work.ts";

function protocol(input = closureInput(), failure?: string) {
 const events: string[] = [], readbacks: unknown[][] = [], manifests: object[] = [], released: (Error | boolean | undefined)[] = [];
 let connects = 0, active = 0, stored = false, phase = false;
 const client: PgSalesClient = { async query(sql, values = []) {
  assert.equal(++active, 1, "Same bounded client must never have two in-flight queries");
  try {
   await setImmediate(); const tag = sql.startsWith("/*") ? sql.match(/^\/\* ([^*]+) \*\//)![1]! : sql;
   events.push(tag);
   if (tag === failure) throw Object.assign(Error("PROTOCOL_" + failure), { code: "SYNTHETIC_PROTOCOL_FAILURE" });
   let rows: Record<string, unknown>[] = [];
   if (tag === "history-closure:schema") rows = [{ versions: Array.from({ length: 18 }, (_, i) => i + 1) }];
   else if (tag === "inventory:guards") rows = [{ integrity_guards_present: true }];
   else if (tag === "native-accounting:guards") rows = [{ accounting_guards_present: true }];
   else if (tag === "history-closure:batch") rows = [{ id: input.batchId, source_name: input.fixedSourceNamespace, source_hash: input.plan.selectionSha256, mapping_version: "V2_HISTORY_NULLABLE_1", status: "VALIDATING", history_payload_hash: input.plan.authorizedPayloadHash, exact_counts: true, published: false }];
   else if (tag === "history-closure:readback") readbacks.push(structuredClone(values));
   else if (tag === "history-closure:manifest") rows = stored || phase ? [{ exact: true }] : [];
   else if (tag === "history-closure:insert") { manifests.push(JSON.parse(values[0] as string)); phase = true; rows = [{ batch_id: input.batchId }]; }
   else if (tag === "history-closure:document-insert") rows = [{ header_source_row_id: input.documents[0]!.headerSourceRowId }];
   else if (tag === "history-closure:documents-exact") rows = [{ exact: true }];
   if (tag === "COMMIT") stored = phase || stored;
   if (tag === "ROLLBACK") phase = false;
   return { rows, rowCount: rows.length };
  } finally { active--; }
 }, release(error) { released.push(error); } };
 const pool: PgSalesPool = { async connect() { connects++; return client; } };
 return { pool, events, readbacks, manifests, released, connects: () => connects };
}
test("protocol: authorizer-owned clone mutation cannot change captured actual SQL parameters before or after await", async () => {
 const original = closureInput(), expected = structuredClone(original), p = protocol(expected); let held!: HistoryTypedClosureStageInput;
 const provider = { authorizeStage: async function(this: unknown, x: HistoryTypedClosureStageInput) {
  assert.equal(this, undefined, "The provider must never receive the store as this");
  held = x; (x as { batchId: string }).batchId = "ffffffff-ffff-ffff-ffff-ffffffffffff";
  (x.plan as { selectionSha256: string }).selectionSha256 = "9".repeat(64);
  (x.documents[0] as { sourceKey: string }).sourceKey = "PROVIDER_CHANGED";
  await setImmediate(); (x.plan.expectedCounts as { history_sales_line: number }).history_sales_line = 999;
  void setImmediate().then(() => { (x as { fixedSourceNamespace: string }).fixedSourceNamespace = "PROVIDER_LATE_MUTATION"; });
 } };
 const store = new PostgresHistoryTypedClosureStore(p.pool, provider);
 assert.deepEqual(await store.stage(original), { inserted: 1, replayed: 0 });
 assert.notDeepEqual(held, original); assert.deepEqual(original, expected);
 assert.deepEqual(p.readbacks, [[expected.batchId, JSON.stringify(expected.plan), JSON.stringify(expected.documents)]]);
 assert.equal(p.manifests[0] && (p.manifests[0] as { selection_sha256: string }).selection_sha256, expected.plan.selectionSha256);
 assert.equal(p.released[0], undefined); assert.equal(p.events.at(-1), "COMMIT");
});
test("protocol: every exact replay reauthorizes whole input; later denial has zero new connections and captured provider remains stable", async () => {
 const input = closureInput(), p = protocol(input); let auth = 0;
 const config = { async authorizeStage(x: HistoryTypedClosureStageInput) { auth++; assert.deepEqual(x, input); if (auth === 3) throw Error("SOURCE_REVOKED"); } };
 const store = new PostgresHistoryTypedClosureStore(p.pool, config);
 config.authorizeStage = async () => { throw Error("CONFIG_MUTATION_MUST_NOT_REPLACE_CAPTURED_PROVIDER"); };
 assert.deepEqual(await store.stage(input), { inserted: 1, replayed: 0 });
 assert.deepEqual(await store.stage(input), { inserted: 0, replayed: 1 });
 const before = p.connects(); await assert.rejects(store.stage(input), /SOURCE_REVOKED/);
 assert.equal(auth, 3); assert.equal(p.connects(), before); assert.equal(p.manifests.length, 1); assert.equal(p.readbacks.length, 2);
});
test("protocol: COMMIT unknown discards once without rollback/retry; earlier query failure rolls back once", async () => {
 for (const failure of ["COMMIT", "history-closure:document-insert"]) {
  const p = protocol(closureInput(), failure), store = new PostgresHistoryTypedClosureStore(p.pool, { authorizeStage: async () => {} });
  await assert.rejects(store.stage(closureInput()), /PROTOCOL_/);
  assert.equal(p.connects(), 1); assert.equal(p.events.filter(e => e === "COMMIT").length, failure === "COMMIT" ? 1 : 0);
  assert.equal(p.events.filter(e => e === "ROLLBACK").length, failure === "COMMIT" ? 0 : 1);
  assert.equal(p.released.length, 1); assert.equal(p.released[0] instanceof Error, failure === "COMMIT");
 }
});
test("finite18 schema recognition rejects17,19,missing,duplicate and unordered arrays; it grants no runtime capability", () => {
 const prefix = Array.from({ length: 18 }, (_, i) => i + 1);
 assert.doesNotThrow(() => assertHistoryTypedClosureSchema(prefix));
 // The separately reviewed native-writer18 phase added finite recognition. Its
 // mandatory runtime capability remains covered by the native18 writer protocol.
 assert.equal(assertReviewedNativeImportSchema(prefix, { minimumVersion: 11, errorCode: "TEST_SCHEMA" }).id, "NATIVE_IMPORT_SCHEMA_18_V1");
 assert.throws(() => assertReviewedNativeImportSchema([...prefix, 19], { minimumVersion: 11, errorCode: "TEST_SCHEMA" }), { code: "TEST_SCHEMA" });
 let reads = 0; const getter = [...prefix]; Object.defineProperty(getter, "0", { enumerable: true, get() { reads++; return 1; } });
 for (const v of [prefix.slice(0, 17), [...prefix, 19], prefix.filter(n => n !== 12), [...prefix, 18], [...prefix].reverse(), new Array(18), Object.assign([...prefix], { extra: 1 }), getter]) assert.throws(() => assertHistoryTypedClosureSchema(v), { code: "HISTORY_CLOSURE_SCHEMA_NOT_READY" });
 assert.equal(reads, 0);
});
