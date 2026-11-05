# Signed sales settlement diagnostics (synthetic only)

2026-11-04 UTC. Base HEAD 051bbe14a4cba4e1849b8547665f13df85dd8fe0 plus existing shared WIP. No commit, push, database, browser, production, or typecheck performed.

## Scope and sequence

1. Added targeted API/client/controller tests before implementation. `red-complete.log`: four tests fail on the old implementation. Exact mismatch test invokes the actual sales service via Fastify injection; it verifies the failed approval leaves DRAFT and stock unchanged.
2. Added a typed immutable domain error carrying exact bigint net due, settled amount, and difference. The existing service mismatch predicate is unchanged. The HTTP boundary returns only those explicitly typed facts, never provider message text. Generic DomainError messages cannot impersonate financial details.
3. Added definitive409 mappings for missing historical settlement facts, historical type change and historical discount change. `red-unknown-settlement.log` separately proves the previously unmapped UNKNOWN_SETTLEMENT_FACTS failure, then adds its409 mapping.
4. Client accepts the optional settlement object only for the recognized mismatch code. Retains only three canonical signed integer strings of bounded length, nonzero consistent difference; malformed details discarded while recognized rejection remains definitive. Unknown/wrong-status/malformed errors remain uncertain as before.
5. Controller renders exact decimal net due, actual receipts-minus-refunds and signed difference. No Number conversion, invented settlement, receipt recovery or replay on definitive rejection. Missing history is not converted to zero.
6. Expanded regression uncovered an old parser assertion that expected original-pointer/null-method proposals to be rejected. Backend owner confirmed the user's latest untouched-unknown-fact requirement moved that check to persisted preparation. Replaced only that obsolete assertion with exact pointer/NULL preservation plus rejection of absent/new/malformed pointers. Existing CAS and sixteen-row assertions retained. Native preparation tests verify changed amounts with unknown methods still reject UNKNOWN_SETTLEMENT_FACTS. The original failure is retained in green-final.log (112/113); it is not hidden.

## Actual commands

All commands ran from repository root with:
`/workspace/scratch/f6bee04e937b/erp-runtime-restored-20261102/tools/node-v24.21.0-linux-x64/bin/node --experimental-strip-types --test`

- RED: `--test-name-pattern='SIGNED settlement' apps/api/src/sales-http.test.ts apps/web/src/sales/commands/http-client.test.ts apps/web/src/sales/commands/controller.test.ts` → red-complete.log,0/4 pass.
- Additional RED: `--test-name-pattern='SIGNED settlement diagnostics' apps/api/src/sales-http.test.ts apps/web/src/sales/commands/http-client.test.ts` → red-unknown-settlement.log,0/2 pass.
- Final affected regression: `apps/api/src/sales-http.test.ts apps/api/src/sales-preparation-http.test.ts apps/api/src/sales-preparation-retained-settlements.test.ts apps/web/src/sales/commands/http-client.test.ts apps/web/src/sales/commands/controller.test.ts tests/native-sales-preparation.test.ts` → green-expanded-final.log,146/146 pass, no skips/todos.

## Local Codex checks still required

Run affected tests against the exact delivered source; verify browser approve renders the700.00/650.00/50.00 example and negative/large exact differences. Use isolated synthetic PostgreSQL for API → real transaction approval rejection, unchanged DRAFT/stock/receipts, missing-history rejection, and successful correction/reapproval. Verify user authority and real payment facts; do not seed missing payments as zero. No database/ACL/schema changes are required for this diagnostic-only change. Browser and PostgreSQL remain unverified by this evidence.

## Local persisted-approval guard follow-up (05:04 UTC)

Independent review found the existing local APPROVE balance check still used a generic message before HTTP. Added persisted-document tests with economically valid line/header fixtures covering positive, negative, and >Number-safe-integer differences. The initial RED fixture header was inconsistent with its original line total; retained initial logs disclose this. Corrected fixture then reran the original local guard without the fix and restored the current file immediately: `red-local-valid-fixtures.log`,2/2 fail. Only this owned guard was temporarily restored to its original implementation for the genuine before/after comparison.

The corrected local guard keeps known mismatches local, before request-key allocation or dispatch, and uses the same bounded exact diagnostic rendering. Historical cutoff empty settlements are not summed as a known zero: ordinary mode sends only the existing status command to let the server prove original restoration or reject missing evidence. It sends no additional authority or proof hints. Legacy history remains gated. Existing tests preserve dirty/current/stale/status/identity/version/replay fences.

Final command (same Node24.21.0 prefix): `apps/web/src/sales/commands/controller.test.ts apps/web/src/sales/commands/ordinary-compatibility.test.ts apps/web/src/sales/commands/http-client.test.ts apps/api/src/sales-http.test.ts` → `green-local-guard-final.log`,114/114 pass, no skips. PostgreSQL/browser/typecheck remain unexecuted.
