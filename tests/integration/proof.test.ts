/** Pure assertion-regression tests with fabricated error objects. Never PostgreSQL evidence. */
import test from "node:test";
import assert from "node:assert/strict";
import { assertDeferredBalanceFailure } from "./proof.ts";

const intendedError = () => Object.assign(new Error("transfer balance quantity or version is not the exact cumulative operation delta"), {
  code: "23514", where: "PL/pgSQL function naijue_erp.validate_transfer_balance_commit() line 12 at RAISE"
});
const observed = { sabotageApplied: true, commitAttempted: true };

test("deferred-COMMIT evidence assertion: missing sabotage or COMMIT cannot be mistaken for the intended failure", () => {
  assert.throws(() => assertDeferredBalanceFailure(intendedError(), { ...observed, sabotageApplied: false }), /sabotage must have completed/);
  assert.throws(() => assertDeferredBalanceFailure(intendedError(), { ...observed, commitAttempted: false }), /attempted COMMIT/);
});
test("deferred-COMMIT evidence assertion: unrelated 23514, wrong state or missing validator context is rejected", () => {
  assert.throws(() => assertDeferredBalanceFailure(Object.assign(new Error("an unrelated schema guard failed"), { code: "23514" }), observed));
  assert.throws(() => assertDeferredBalanceFailure(Object.assign(intendedError(), { code: "23503" }), observed));
  assert.throws(() => assertDeferredBalanceFailure(Object.assign(intendedError(), { where: "another_function()" }), observed));
  assert.throws(() => assertDeferredBalanceFailure(Object.assign(intendedError(), { where: undefined }), observed));
});
test("deferred-COMMIT evidence assertion: accepts only complete synthetic assertion evidence, not database execution proof", () => {
  assert.equal(assertDeferredBalanceFailure(intendedError(), observed), true);
});
