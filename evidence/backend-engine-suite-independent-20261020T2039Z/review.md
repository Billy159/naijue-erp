# Independent backend-engine suite source review

Status: final frozen-source review complete. No blocking source findings remain. This review did not execute PostgreSQL, connect to a cluster, access credentials, install packages, change production code, or run a compiler.

Frozen worktree source, not a claim that the additions are committed:

- backend-acceptance.ts: ae67fd823d5c4ebc77fccc4cd21497577ee91146cdb14079d0717f06e00597e5
- backend-source.test.ts: 91a1e2a191063b1a537bc6ba97124abbdad6c4ef2e8cd9287717f3daafa59e24
- unchanged sparse-acceptance.ts: b9b53a9fe3f546fdccf6412cdc3f4d6cdc151542d55e67e38ccfe022fdda3dd3

All reviewed integration sources, migration bytes, the runner, package.json and proposed operator delta are recorded in `final-source.sha256`. The worktree HEAD observed during final static checks was bbee8e378dae2175c0c2d72b8c2e6e8f2f855745; file hashes, not that unrelated advancing HEAD alone, identify this reviewed new suite.

## Scope and observed coverage

- Reviewed the added backend acceptance source, connection-free regression source, manifest scenario additions, safety selection, plan selection, and post-guard dispatch.
- Authentication uses the actual storage adapter with a login-disabled account, unusable password sentinels, committed and rolled-back sessions, locked account/session calls, version advancement, and session revocation. It is not login, password-verification, auth-service-policy, or HTTP acceptance.
- Pricing rejects the exact named `sales_line_pricing_facts` constraint with SQLSTATE 23514. Other intentional probes match current text fit-code, coordinate uniqueness, image size, decimal precision and session-hash constraints. The existing constraint helper forces deferred checks and rolls back probes.
- Sales and transfer each cover existing-document and absent-document distinct-key saves. Both command promises must appear as real PostgreSQL advisory waiters before release, and one winner plus a VERSION_CONFLICT loser is required. This reuses unchanged, previously reviewed helpers.
- Native sales list/detail/history/statistics, literal search, out-of-scope reads, pagination, and a count/page transaction with a genuinely intervening committed save are exercised. The snapshot hook runs after the real count and before subsequent page queries on the same reader transaction.
- Product expectations match current sparse references: exactly three SKU identities, two ordered size identities, two color identities, a nullable season and metadata-only image references.
- The transfer swap changes two line positions and requires a successful native save, exact final rows, two changed audit lines, no result ledger IDs, unchanged balance rows and the expected receipt count.

## Safety and non-regression

The current entry point still requires settings, explicit suite and current-schema refusal before `openFreshDatabase`. Database migration byte checks still precede Pool construction. Existing direct loopback identity, fresh/exclusive target, non-admin owner and runner-marker checks are unchanged. Historical native-0001-0005 remains refused and its preserved body is neither registered nor called. Current reference setup explicitly uses sparse mode before migrations 0006-0008, with no initial balance rows. The backend suite publishes a reviewed synthetic scope through the actual import service and one nonzero baseline, not direct zero-balance seeding.

At review time, `git diff 318440a -- tests/integration/{sparse-acceptance.ts,fixtures.ts,database.ts,adapter-helpers.ts,proof.ts} adapters/postgres/migrations scripts/run-postgres-integration.mjs` was empty. Sparse acceptance, its helpers and migration bytes were not changed by the new suite.

## Resolved pre-freeze review requests

1. RETURN/EXCHANGE now asserts the exact set of source line IDs, each signed native delta, event, endpoint, warehouse, SKU, source version, null unrelated source, and one-to-one linked inverse provenance. This closes the aggregate-cancellation hole.
2. Both source-order checks now require both needles to exist before comparing offsets. The missing-first-needle negative case can no longer succeed merely because its offset is -1.
3. The owner explicitly documented the separate backend source-regression command in preparation README. It is intentionally not selected by package.json's npm test command; no default-test coverage claim is made here.
4. A hidden-scope readHistory call now must reject with DOCUMENT_NOT_FOUND, alongside the existing hidden list/detail/statistics checks.

## Validation

Independent command: `node --test tests/integration/backend-source.test.ts tests/integration/safety.test.ts tests/integration/proof.test.ts tests/integration/migration-source.test.ts`.

Initial result: exit 0, 21 passed, 0 failed, cancelled, skipped or todo. Full output is in `connection-free-tests.log`.

Final frozen-source independent rerun: exit 0, 21 passed, 0 failed, cancelled, skipped or todo. Full output and explicit exit are in `final-connection-free-tests.log`. All 14 integration TypeScript sources passed `node --check`; tracked source diff whitespace passed, and the sparse kernel comparison with 318440a remained empty. Output and explicit exit are in `final-static-checks.log`.

These are source/plan/fabricated-diagnostic regressions only, not backend engine evidence. No independent tsc was started because the compiler lane was reserved for root/owner checks. Actual SQL behavior and races in this new suite remain unexecuted by this reviewer and require their own separately authorized fresh-target run. The readiness conclusion is limited to reviewed source suitability for such a run.

## Proposed supervisor delta only

Read the preparation patch and README without touching the supervisor or any service. The delta preserves `run` as sparse-only, adds `run-backend` mapped to one fixed literal, validates a closed two-suite enum and records the suite in result metadata. No arbitrary environment, SQL, credential extraction or role capability is added by the proposed delta. `run-backend ` has length 12, matching its source-path slice.

This does not approve or validate a live-holder replacement, shutdown, new physical instance, credentials, target, or engine run. Any lifecycle requires root's separate review and authorization. Neither sparse engine evidence nor these static checks may be relabeled as backend engine acceptance.
