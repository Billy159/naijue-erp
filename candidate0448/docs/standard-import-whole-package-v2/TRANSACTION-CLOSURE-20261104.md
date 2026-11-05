# Whole-package transaction closure hardening

2026-11-04, isolated cloud source and synthetic clients only.

## Implemented

Original-key inspection now snapshots the package identity and nested initialization request before BEGIN. Post-commit verification snapshots its initialization request before BEGIN. Source reconciliation independently snapshots initialization, source counts and exact-string totals before BEGIN.

Previously, these helpers retained caller-owned objects across awaited database work. A caller mutation could make a later comparison use different identity or source facts from those originally provided. The write coordinator already owned snapshots; this change brings its inspection/readback helpers into line without changing SQL, source pins, catalog admission, roles or transaction-control policy.

Three synthetic mutation tests were observed failing before the change and passing afterward. Additional coverage proves a receipt matching only a caller-mutated identity is rejected, and an uncloneable request cannot begin a transaction.

Ten transaction-closure cases cover rejected/malformed BEGIN, iterator and apply failure, summary failure, rejected/uncertain deferred-constraint acknowledgement, uncertain COMMIT, failed discard, rejected ROLLBACK and permanent quarantine of an uncertain client. The iterator closes on interrupted execution, and uncertain outcomes are never replayed on the quarantined client.

## Validation

70/70 targeted tests passed. Evidence: `evidence/transaction-closure-20261104.log`.

The two new `.mjs` regression suites are not selected by the root `npm test` `.test.ts` glob. Run the explicit targeted command below when integrating or validating this change; a root test run alone does not cover these regressions. Root package scripts and their existing scope were not changed.

Command:

```sh
node --test tests/unified-whole-package-snapshot.test.mjs tests/unified-whole-package-transaction-closure.test.mjs tests/unified-whole-package-inspect.test.ts tests/unified-whole-package-verify.test.ts tests/unified-stream-reconcile.test.mjs tests/unified-whole-package-client.test.ts tests/unified-stream-import-outcome.test.mjs tests/unified-whole-package-host.test.mjs tests/unified-whole-package-sql-kernel.test.ts
```

These are protocol/source tests using synthetic clients, not PostgreSQL atomicity proof. No PostgreSQL installation/execution, real imports, user data, Mac, production access, full typecheck or release/deployment occurred. Existing real-engine and independent-review gates remain unchanged.

## Source SHA-256

- whole-package-inspect.ts: 4ca8e95f46de50f2adb06258f331cbdbcf00e0ece2aa816f22a1b59d5bc05af2
- whole-package-verify.ts: f6bfbd939cff928c884a7c96dd124fb4e52a3db41013995703d57247a8bd82ef
- whole-package-reconcile.mjs: a3c2f94c3d63e7484c2a2644b0ff15790642dbcba0a2a056d4d608a5dfe8e7ca
