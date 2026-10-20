# Independent review: current disposable PostgreSQL acceptance source

Reviewed 2026-10-20 UTC against base commit `f188f48f8873d23fe27c2411cf7d8ba38054eda9`.

## Disposition

The final reviewed extension is suitable to retain as a **dormant, source-only acceptance harness** for an explicitly approved fresh disposable target. No open source-level blocker remains from this review. This is **not PostgreSQL acceptance, migration acceptance, performance evidence, or permission to execute**.

The reviewer changed only `evidence/postgres-current-harness-independent-*`. No implementation, migration, root configuration, existing evidence, or runner source was edited by the reviewer. Other agents' sales-command and inventory-ledger-query work is outside this review.

No PostgreSQL connection, SQL/DDL/EXPLAIN execution, SQL parser/server, service startup, network request, package installation, real credential or `.env` read, real integration-runner invocation, user-computer operation, push, or deployment occurred during this review. Source-only tests use literal fake settings and explicitly fabricated error objects; those are not engine observations.

## Final source freeze

The owner confirmed source freeze after correcting the findings below. The final 36-file manifest covers all integration source/configuration files, all eight migrations, the runner and operator document, selected supporting production stores/services, and the two reviewer probe scripts:

- `evidence/postgres-current-harness-independent-source.sha256`
- Manifest SHA-256: `5c182f7804524ecd6424a5558db0a27b99fa79ef782e67b849046db41e283563`

All 36 entries were checked against disk successfully after final checks. The exact eight migration hashes also match the explicit manifest and the base source bytes. The conclusion applies to this freeze, not arbitrary subsequent changes.

## Independent checks actually executed

- Scoped TypeScript: `tsc --noEmit -p tests/integration/tsconfig.json`, final exit 0 on Node v24.19.0. See `postgres-current-harness-independent-typecheck-final.log`.
- Runner and every integration TypeScript file syntax-checked successfully. See `postgres-current-harness-independent-final-checks.log`.
- Pure safety/assertion regressions: **12 passed, 0 failed, 0 skipped**, final exit 0. They ran with an explicitly empty inherited environment apart from `NODE_NO_WARNINGS`, under hooks that refuse PostgreSQL-driver/network/process-spawn module imports and target/credential environment reads. See `postgres-current-harness-independent-pure-final.log`.
- Independent migration-byte, plan, selector and source-shape probes passed. The current plan ran under the same restrictive hooks. Missing, unknown, whitespace-suffixed and historical plan selections refused; no compatibility fallback appeared. See `postgres-current-harness-independent-final-checks.log` and the reproducible `*-probes.mjs`/`*-guard.mjs` files.
- `git diff --check` passed for the checkout at the review point.

These checks do not parse PostgreSQL SQL, execute triggers, observe locks, verify an actual COMMIT failure, prove rollback durability, or establish that any real-engine assertion will pass.

The initial scoped compiler found TS7022 in the race result's recursive `ReturnType` inference. The owner replaced it with explicit `SalesResult` typing; the final check passed. The initial failed compiler evidence is retained separately. An initial pure-test command used an unavailable `/usr/bin/node` and failed before test execution; it was corrected using the verified executable. The final clean test log is authoritative.

## Findings raised and closed in the final source

1. **Generic SQLSTATE false positives.** Initial retained-zero, immutable-source, history and wrong-native-source probes accepted any 23514. They now require exact SQLSTATE, migration-defined message and whole validator-function context. A missing receipt FK or different early guard cannot satisfy the intended native-source probe. A pure negative regression rejects lookalike function names.
2. **Reversal coverage could be vacuous.** Initial reversal loops did not require nonempty exact counts. Final tests require exact receipt-result ledger IDs, expected effect counts, unique original links and inverse source/endpoint quantities. A deliberately mismatched native reversal line must fail the exact old reversal validator. Deliberately wrong sales warehouse and transfer quantity probes are also exact.
3. **Contention cleanup on rollback failure.** The initial blocker cleanup could skip draining command promises if its ROLLBACK failed. The final nested cleanup discards that connection and still drains both bounded command promises. No reset, cancellation of unrelated sessions, or destructive cleanup was introduced.
4. **Receipt/audit coherence too weak.** The operation helper now compares persisted immutable result JSON with the actual service result, actors, target/action, audit versions, audit/receipt timestamps, native status/checkpoint evidence and exact operation ledger IDs. Positive assertions are not just receipt/audit row counts.
5. **Historical-prefix documentation/execution mismatch.** The current entry point requires the current suite before opening the database; the old test body is only an uncalled historical function. The plan also refuses the historical prefix. Documentation describes that refusal and the current adapter's dependency on 0007/0008. There is no claim today's UOW runs on 0001–0005.
6. **Final scoped compiler failure.** The explicit `SalesResult` annotation described above removed the independently reproduced TS7022. No source compilation blocker remains at the final freeze.

## Safety contract checked in source

- The runner remains explicit `--run` and absent from default test/check commands. Missing gates fail, not skip. The exact current suite is separately selected.
- Dedicated target validation uses only supplied values. It accepts literal loopback/normalized localhost, an explicit unprivileged TCP port, dedicated non-admin role, explicit nonempty disposable password, and exact repeated `naijue_erp_test_` plus 8–32 lowercase hex database name. No ambient `DATABASE_URL`, `PG*`, DNS, query-option, socket or `.env` target/credential fallback is introduced.
- All eight explicitly enumerated migration hashes are verified before `new Pool`. No migration glob, automatic checksum repair, upgrade mode or 0009+ discovery exists.
- Server checks remain before DDL: current/session role, database, owner/non-elevated capabilities, direct loopback address/port, primary status, PG15+, empty catalogs and no other connections. A guard connection retains the database-local session advisory lock. Matching backend loopback is expressly not proof that no tunnel exists; the operator must independently approve and verify the physical target.
- Reference insertion after 0005 and before 0006 is explicitly historical fixture setup, not a forged current-party CREATE. It has no initial balances in current mode. Separate real current-party service/store commands provide intended 0006 acceptance source.
- Teardown releases/discards only harness clients and ends its pool. It does not drop, truncate, reset, clean, reuse or repair a target, and cannot destroy unrelated target data by cleanup. Specific negative mutation probes are bounded to synthetic rows inside transactions that roll back. Used/partly migrated targets must be externally disposed and never automatically reused.
- The owner role requirement is narrowly for this migration/constraint exercise, not a runtime grant or RLS/security proof. Authorization of the exact physical host/port/database remains a separate operator decision; generic opt-in strings and the runner marker do not confer authority.

## Intended engine coverage reviewed, still NOT RUN

- Exact 0001–0008 migration registry and explicit prior-state fixture order.
- Current party CREATE/EDIT/DISABLE/RESTORE, independent KH/GYS allocation, immutable duplicate results, changed-content conflicts, rollback and default-customer dependency rejection; sequence gaps are not misrepresented as rollbackable.
- Exact nonzero import baseline with coherent native source, import receipt/audit/checkpoint, version-one balance and positive COMMIT; a healthy actual execution would expose the former unconditional native-trigger dispatch failure. Injected mismatch must reach COMMIT, identify the sparse validator precisely, and leave the full import snapshot unchanged before a known-rejection retry.
- Actual IMPORT checkpoint unique valid/ready index shape and exact function lookup. Forced `enable_seqscan=off` EXPLAIN is accurately described as index eligibility only, not natural-planner choice, trigger-internal plan, timing or sustained performance.
- Complete immutable publication, no Cartesian-product zero materialization, absent covered SKU as known zero, missing coordinate as not-applicable, scope and forbidden filter behavior, full-filter summary beyond the last page, negative-stock totals, literal candidate search and non-mutating reader behavior.
- First-use SALES/TRANSFER approval/reversal, repeated actual effects, exact versions and receipt/audit/ledger coherence, retained zero balances, known SQL/deferred failures with rollback snapshots, old transfer cumulative guard, new sparse cumulative guard, and old source/reversal guards.
- Two distinct documents/receipt keys on a previously absent shared stock key: the blocker uses the actual production lock namespace; both real waiters must be observed on the exclusive target before release, both must commit, the cumulative quantity/version must be exact, and final inverses retain zero. Database-wide waiter counting depends on required exclusivity and does not establish all concurrency schedules.

## Remaining boundary

The first real run still requires separately approved external provisioning of a fresh isolated direct-loopback PostgreSQL target and the exact operator-selected host/port/database. Record actual engine version, source hashes and unedited TAP/exit status only then. SQL parsing, trigger composition/order, real constraints, actual concurrency, rollback durability and all engine assumptions remain unverified.

Even a later green synthetic run would not establish truthful external manifests, real source imports, production authorization/authentication, native catalogue creation after publication, historical cutoff edits/first unapproval, upgrades of existing ERP databases, runtime grants/RLS, privileged-owner tampering recovery, all deadlock schedules, unknown-COMMIT recovery, normal-planner performance, sustained load, restart/failover, HTTP/UI/media flows or deployment readiness.
