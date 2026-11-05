# Direct COMMIT deferred-closure acceptance runner

Real engine cases implemented, PostgreSQL execution NOT RUN.

The existing acceptance runner calls explicit finish/constraint forcing before successful COMMIT. The separate runner `tests/integration/whole-package-direct-commit.mjs` closes the coverage gap for callers that omit finish. It registers three real-client cases:

1. Prepare only, then direct COMMIT must reject with SQLSTATE 23514 / WHOLE_PACKAGE_INCOMPLETE.
2. Prepare through baseline publication, then direct COMMIT must reject identically.
3. Complete original package, then direct COMMIT must succeed using mandatory deferred triggers; exact read-only inspection must find the committed receipt and published state.

The runner normalizes the server address with PostgreSQL `host(inet_server_addr())`, retaining strict bare loopback address matching. It rejects duplicate system_identifier/database_oid pairs at registration even when endpoint aliases or ports differ. If the fixture cleanup callback fails, it independently attempts both physical client closes and still reports failure.

The runner checks observer invisibility before COMMIT, complete snapshot equality after rejection, and exact-key ABSENT/COMMITTED readback. It closes clients even if rollback fails. It does not use simulated database responses, open a connection, install SQL, obtain credentials, read environment configuration or automatically register/run itself.

## Fail-closed target requirements

Registration requires the explicit synthetic setup callback plus separately verified expected physical identities for all three cases. Each identity must include a synthetic_whole_* database name, database OID, system identifier, loopback server address and explicit nonprivileged server port. Both writer and observer must match the expected identity before mutation. Identities are snapshotted at registration; observed identities are never adopted as approval. The normal synthetic setup validates ordinary writer privileges and new-empty schema. The runner additionally checks distinct clients/targets, original session role, migration lineage and empty business/audit tables.

Use the existing createSyntheticPgSetup(config, WHOLE_DIRECT_COMMIT_MODES) only after appropriate explicit authorization for the specific isolated targets. A future authorized invocation must supply registerWholePackageDirectCommit(register, setup, expectedTargets). No default targets or environment-based fallback exist. Current source review does not authorize running these cases.

## Source/registration validation

The two initial source/registration tests failed when the runner was absent. After implementation and an additional fail-closed target-input test, combined source/registration checks pass 34/34. No test invokes a registered database case, and this count is not PostgreSQL acceptance.

```sh
node --test tests/whole-package-direct-commit-runner.test.mjs tests/whole-package-closure-integration-candidate.test.mjs tests/whole-package-closure-successor-source.test.mjs tests/whole-package-kernel-source.test.mjs
```

Additional reviewer regressions first failed for host normalization and physical-target alias deduplication, then passed after correction. Their RED logs are evidence/direct-commit-host-red-20261104.log and evidence/direct-commit-physical-dedupe-red-20261104.log.

Logs: evidence/direct-commit-runner-red-20261104.log and evidence/direct-commit-runner-green-20261104.log. The new .mjs suite requires the explicit command; it is not in the root .test.ts glob.

No database, Mac, user data, typecheck, production, installation or deployment execution occurred.

## Required installed-catalog admission added

Physical identity and successful behavior alone do not attest which SQL candidate is installed. The synthetic setup's observed routine hash is only fixture input, not an independently reviewed authority. The runner now calls `admitWholePackageAcceptanceTarget(writer)` before initialization. That helper loads the existing genuine source specification and OS-trusted installation record, then uses the unchanged full installed-catalog verifier in a separate repeatable-read read-only transaction ending with acknowledged ROLLBACK. No caller-provided catalog hash, boolean or newly observed packet can stand in for the trusted record. Missing reference or catalog mismatch blocks the case before package mutation.

One trusted installation record describes one target. Run each case in its separately authorized isolated executor with its independently installed record; the optional fourth argument `selectedMode` registers exactly one named case. It does not change the target identity or installation trust requirements. The helper does not write/rotate records or approve installation. All three target bindings are still explicitly supplied and distinct.

The unchanged source/catalog gate does NOT admit the new closure successor candidate. Consequently this runner cannot currently validate that successor until a separately reviewed versioned catalog/installation successor exists. It can test the existing admitted kernel, subject to proper target setup and authorization. No acceptance is inferred here.

Admission helper: `tests/integration/whole-package-acceptance-admission.mjs`. Source/registration plus existing catalog/installation-record tests pass 20/20. No actual admission query or database case ran. Evidence: `evidence/acceptance-admission-red-20261104.log` and `evidence/acceptance-admission-green-20261104.log`.

```sh
node --test tests/whole-package-acceptance-admission-source.test.mjs tests/whole-package-direct-commit-runner.test.mjs tests/unified-whole-catalog-gate.test.mjs tests/unified-whole-installation-record.test.mjs
```

## Whole-window exclusivity prerequisite

The catalog-check transaction ends before the write transaction begins. Its snapshot and locks are not a persisted admission lease. The operator must retain exclusive ownership of both physical clients and prevent concurrent DDL, ACL, role-membership or other administrative changes from initial catalog admission through completion and client cleanup. These conditions must be established outside this runner under the appropriate authorization; a successful catalog check alone does not prevent a later administrative race.

The fifth registration argument must explicitly acknowledge `{ exclusiveClients: true, noConcurrentDdlAclAdminChanges: true }`. This is an operational prerequisite, not permission, a database lock, or proof that an administrator cannot act. The runner also rejects reuse of an already-active physical client object across its own cases. It cannot prevent other code holding that object from issuing queries, or administrators from changing the target. If the external exclusive window cannot be guaranteed, do not run the case.

Latest source/registration/catalog-record checks: 21/21. No engine execution. The unchanged runtime gate still rejects the unadmitted successor candidate.

## Overlap rejection cleanup

A malformed setup that returns one active shared client and one fresh client now closes only the distinct unclaimed client directly. It does not call that setup's shared close callback and cannot close the active case's client. The active owner retains its guard until its own cleanup. The same overlap error is still raised; no target/admission gate is relaxed.

A cleanup-only callback regression held the first target read and later rejected it; it supplied no successful SQL response or import result. The fresh-client leak failed before the change and passed after it. Latest combined checks: 27/27. Logs: evidence/overlap-cleanup-red-20261104.log and evidence/overlap-cleanup-green-20261104.log. This is resource-lifecycle evidence, not PostgreSQL execution.
