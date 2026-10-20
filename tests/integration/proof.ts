/** Pure assertion logic only. No driver, environment read, pool, SQL execution or connection. */
import assert from "node:assert/strict";

export interface DeferredBalanceEvidence {
  readonly sabotageApplied: boolean;
  readonly commitAttempted: boolean;
}

/** An earlier unrelated 23514 must never satisfy the deferred-COMMIT test. */
export function assertDeferredBalanceFailure(error: unknown, evidence: DeferredBalanceEvidence): true {
  assert.equal(evidence.sabotageApplied, true, "the intended same-transaction balance sabotage must have completed");
  assert.equal(evidence.commitAttempted, true, "the real adapter must have attempted COMMIT after sabotage");
  assert.ok(error instanceof Error, "expected a real driver Error");
  assert.equal(Reflect.get(error, "code"), "23514");
  assert.equal(error.message, "transfer balance quantity or version is not the exact cumulative operation delta");
  assert.match(String(Reflect.get(error, "where") ?? ""), /\bvalidate_transfer_balance_commit\(\)/u,
    "expected PostgreSQL error context to identify the deferred transfer balance validator");
  return true;
}
