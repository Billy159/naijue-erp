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

/** Trusted raw pg boundary only. Production bounded-pool errors intentionally do not expose message/where. */
export function assertExactEngineFailure(error: unknown, code: string, message: string, functionName: string,
  evidence: { readonly changed: boolean; readonly commitAttempted: boolean }): true {
  assert.equal(evidence.changed, true, "the intended real SQL change must have completed");
  assert.equal(evidence.commitAttempted, true, "the adapter must have attempted the real COMMIT");
  return assertExactRawSqlFailure(error, code, message, functionName);
}

/** Immediate or forced-deferred constraint probe; this does not claim a COMMIT was attempted. */
export function assertExactRawSqlFailure(error: unknown, code: string, message: string, functionName: string): true {
  assert.ok(error instanceof Error, "expected the raw PostgreSQL driver Error, not a fabricated row");
  assert.equal(Reflect.get(error, "code"), code); assert.equal(error.message, message);
  assert.match(String(Reflect.get(error, "where") ?? ""), new RegExp(`(?:^|[.\\s])${functionName}\\(\\)`), "expected exact PL/pgSQL validator context");
  return true;
}
