/** Auth cleanup protocol only, not PostgreSQL or real-login evidence. */
import test from "node:test";
import assert from "node:assert/strict";
import { PostgresAuthenticationStore } from "../adapters/postgres/src/auth-store.ts";
function setup(failAt?: string) {
  const statements: string[] = [], releases: unknown[] = []; let connects = 0; const failure = Error("SYNTHETIC_AUTH_" + failAt);
  const store = new PostgresAuthenticationStore({ async connect() { connects++; return { async query(sql: string) {
    statements.push(sql); if (sql === failAt) throw failure; return { rows: [], rowCount: 0 };
  }, release(error) { releases.push(error); } }; } }); return { store, statements, releases, failure, connects: () => connects };
}
test("auth unknown COMMIT preserves original error and discards once without rollback/retry", async () => {
  const p = setup("COMMIT"); let work = 0;
  await assert.rejects(p.store.transaction(async () => { work++; return "done"; }), error => error === p.failure);
  assert.equal(work, 1); assert.equal(p.connects(), 1); assert.deepEqual(p.releases, [p.failure]);
  assert.equal(p.statements.filter(sql => sql === "COMMIT").length, 1); assert.equal(p.statements.includes("ROLLBACK"), false);
});
test("auth ordinary failure rolls back; acknowledged commit retains original result", async () => {
  const p = setup(), failure = Error("SYNTHETIC_WORK"); await assert.rejects(p.store.transaction(async () => { throw failure; }), error => error === failure);
  assert.equal(p.statements.filter(sql => sql === "ROLLBACK").length, 1); assert.deepEqual(p.releases, [undefined]);
  const success = setup(); assert.equal(await success.store.transaction(async () => "same-result"), "same-result"); assert.equal(success.statements.includes("ROLLBACK"), false); assert.deepEqual(success.releases, [undefined]);
});
test("auth BEGIN and rollback failure discard with exact failure semantics", async () => {
  const begin = setup("BEGIN ISOLATION LEVEL READ COMMITTED"); await assert.rejects(begin.store.transaction(async () => "never"), error => error === begin.failure);
  assert.deepEqual(begin.releases, [begin.failure]); assert.equal(begin.statements.includes("ROLLBACK"), false);
  const p = setup("ROLLBACK"), first = Error("SYNTHETIC_WORK"); await assert.rejects(p.store.transaction(async () => { throw first; }), error => error instanceof AggregateError && error.errors[0] === first && error.errors[1] === p.failure);
  assert.deepEqual(p.releases, [p.failure]);
});
