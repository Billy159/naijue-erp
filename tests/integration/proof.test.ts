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

test("exact raw-engine assertion rejects an early unrelated error, missing SQL change and missing COMMIT", async () => {
  const { assertExactEngineFailure } = await import("./proof.ts");
  const error = Object.assign(new Error("exact expected failure"), { code: "23514", where: "PL/pgSQL function naijue_erp.validate_sparse_balance_commit() line 1 at RAISE" });
  const evidence = { changed: true, commitAttempted: true };
  assert.equal(assertExactEngineFailure(error, "23514", error.message, "validate_sparse_balance_commit", evidence), true);
  assert.throws(() => assertExactEngineFailure(error, "23514", "unrelated error", "validate_sparse_balance_commit", evidence));
  assert.throws(() => assertExactEngineFailure(error, "23514", error.message, "another_function", evidence));
  assert.throws(() => assertExactEngineFailure(error, "23514", error.message, "validate_sparse_balance_commit", { ...evidence, changed: false }));
  assert.throws(() => assertExactEngineFailure(error, "23514", error.message, "validate_sparse_balance_commit", { ...evidence, commitAttempted: false }));
});


test("raw constraint assertion requires exact message, SQLSTATE and whole function identity", async () => {
  const { assertExactRawSqlFailure } = await import("./proof.ts");
  const error = Object.assign(new Error("expected source guard"), { code: "23514", where: "PL/pgSQL function naijue_erp.validate_sales_effect() line 1 at RAISE" });
  assert.equal(assertExactRawSqlFailure(error, "23514", error.message, "validate_sales_effect"), true);
  assert.throws(() => assertExactRawSqlFailure(error, "23503", error.message, "validate_sales_effect"));
  assert.throws(() => assertExactRawSqlFailure(error, "23514", "unrelated early guard", "validate_sales_effect"));
  assert.throws(() => assertExactRawSqlFailure(Object.assign(new Error(error.message), { code: "23514", where: "wrong_validate_sales_effect()" }), "23514", error.message, "validate_sales_effect"));
});
