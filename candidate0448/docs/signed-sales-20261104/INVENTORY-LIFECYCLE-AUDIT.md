# Signed inventory lifecycle audit

Scope: source and synthetic tests only, 2026-11-04. No PostgreSQL execution,
production changes, Mac access, typecheck or deployment.

## Current required distinction

New mixed selling/returning uses the existing RETURN/EXCHANGE mapping; a new SALE
remains positive-only. Imported historical SALE can retain signed lines only
under the stored CUTOFF_HISTORY basis. Both use the same per-line inventory
algorithm. A caller's draft cannot grant itself historical status.

The domain quantity guard was inspected and retained unchanged. A first test
attempt incorrectly expected newly created signed SALE and omitted the trusted
historical basis on reapproval. Its three failures were test-scope errors, not
proof that these restrictions should be removed. The temporary relaxation was
fully reverted. The corrected test suite uses the authorized business types.

## Verified source behavior

- sales-service passes stored.stockBasis into planDocumentInventoryTransition,
  never a draft field. Save/void create no inventory intents.
- Imported effective documents produce an anchor and zero new ledger/balance
  changes. The first unapproval requires the exact approved snapshot, confirmed
  baseline coverage, no previous runtime postings, and original migration proof.
- Later unapproval uses immutable original runtime ledger IDs and exact opposite
  signed quantity. It rejects missing/incomplete or already reversed originals.
- Each original line retains its own source identity and intent even when the
  same SKU has positive and negative quantities with a zero net total. The key
  still remains in touchedKeys for locking and readiness checks.
- Existing SQL validate_unified_ordinary_operation checks each actual nonzero
  sales line has its exact signed effect, rather than merging by SKU. Ledger
  uniqueness uses operation + source line + endpoint; reversal uniqueness and
  receipt/audit consistency remain in force.
- No new inventory constraint is justified by this sign-rule change alone.
  Existing guards must not be dropped or loosened. SQL installation and actual
  enforcement still require final combined isolated PostgreSQL acceptance.

## Tests

New tests/signed-sale-inventory-lifecycle.test.ts covers new zero-net RETURN,
exact per-line runtime reversals, historical SALE import with no replay,
first baseline reversal, edited signed reapproval, draft without postings,
missing provenance rejection and invalid-line pure-plan immutability. It binds
historical coverage to 2026-11-02T04:00:00Z (12:00 Beijing).

The corrected new4 and existing domain32 tests pass36/36. A wider concurrent
source run passed98/100: two existing service fixtures (zero-net EXCHANGE
unknown-stock and intermediate-overflow checks) were stopped earlier by newly
added missing historical settlement validation. They are reported for fixture
and rule-owner reconciliation, not marked passing. Synthetic transaction tests
are not real database rollback or durability proof.

## Service transaction extension and final scoped result

With the rules owner agreeing test ownership, two service tests were appended:

- Historical mixed SALE keeps number/type and original line IDs; first unapprove
  moves synthetic balance100→105, SAVE changing lines8/−3 to2/−7 leaves105,
  reapprove moves105→110, later exact reversal returns105. Same-key retries
  return identical receipts without changing any ledger, audit or balance.
  The production candidate economic rules are exercised with explicit synthetic
  trusted catalogue/reference facts, not the old positive-only test convention.
- Injected failure at ledger row2 leaves the whole synthetic store identical to
  before the operation. Retrying commits two rows once, then receipt replay
  leaves state unchanged. This establishes in-memory UOW behavior, not PG proof.

The two existing inventory-isolation fixtures now explicitly supply a known
synthetic zero RECEIVE settlement using their existing account/method. This
fixture provenance change allows testing unknown stock and quantity overflow
without falsely treating absent historical settlement evidence as known zero.
The original98/100 failure log remains at the parent-reported location.

Final targeted domain + service + scripted UOW + commit-outcome run with pinned
Node24.21.0: **102/102 passed**. No domain guard or PostgreSQL schema was relaxed.
The temporary incorrectly broad inventory change was reverted, preserving
pre-existing WIP exactly. Final combined real PostgreSQL/browser validation is
still outstanding.
