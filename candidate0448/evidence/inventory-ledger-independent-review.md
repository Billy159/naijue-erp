# Independent inventory ledger query review

Verdict: ACCEPT for the scoped source/synthetic boundary. No unresolved blocking findings.

## Exact reviewed freeze

- Owner manifest: `evidence/inventory-ledger-query-source.sha256` (14 paths).
- Manifest SHA256: `362a787c8de26d60a70ce06f50865dad47fc57aeeac7afe2ddd86c97a9bc97ee`.
- All 14 manifest hashes verified before and after the final independent checks.
- Scope: application contracts/validation/service; PostgreSQL ledger reader; opt-in HTTP plugin; focused tests and documentation; approved unchanged publication-guard extraction and matrix import/source assertion.

## Findings and resolution

1. Found and reproduced cancellation arriving during COMMIT returning a successful direct-reader result. Initial independent run: 17/18 passed, with only the missing expected cancellation rejection failing. Fixed in the frozen reader by a post-COMMIT signal check. The confirmed-commit flag suppresses the result without claiming failure, attempting rollback or discarding a successfully ended read-only transaction. Uncertain COMMIT failure retains rollback/discard behavior. Final independent regression passes.
2. Publication capability parity was initially absent. The approved narrow extraction now makes the matrix and ledger readers execute the same unchanged original SQL. No generic readiness framework or new predicates were introduced.
3. Documentation now states that only the existing warehouse/SKU key index is available and ordered pagination may still sort. No planner/index-use proof is implied.

## Boundary review

- Request is closed to the exact warehouse/SKU/page-size/nullable cursor DTO. Canonical UUID and actual four-digit-year UTC timestamps with six fractional digits are required; microsecond text is preserved rather than converted through millisecond values.
- Service uses the existing explicit inventory authorization provider and narrows to one warehouse/hall intersection. Cursor reuse grants no scope. Stale warehouse/hall/reference facts, forged scopes and unavailable exact targets fail closed.
- One injected client runs REPEATABLE READ READ ONLY. Publication final-approval/checkpoint, exact published warehouse/SKU membership and guard capability precede ledger disclosure. Baselines must belong to that exact published batch. Ready empty history remains distinguishable from unavailable publication.
- The SQL predicates constrain warehouse, hall and SKU before the descending timestamp/UUID keyset and `LIMIT pageSize+1`. Both visible and look-ahead rows undergo exact target, source, quantity, timestamp and ordering validation. There is no count, aggregate, full-history materialization, source-header detail read or mutable-line-SKU/label projection.
- SALES, TRANSFER (FROM/TO) and CUTOFF_BASELINE are closed variants. Baseline document version is null; document versions are positive PostgreSQL integers. Deltas remain exact nonzero signed-bigint strings. Reversal IDs/event kind and source endpoints are checked.
- SKU identity retains full current-reference product/color/FIT/size facts and exact size-group membership. `CURRENT_REFERENCE` explicitly excludes a historical-label claim.
- HTTP is opt-in and unregistered. Explicit trusted authentication runs before parsing; private errors and extra trusted payload fields cannot become successful wire data. No-store headers and cancellation forwarding are retained. Failure/rollback/release behavior is bounded and no retries are hidden.

## Independent verification

- Scoped TypeScript: PASS (`tsc --noEmit -p tests/inventory-ledger-query-tsconfig.json`).
- Independent focused probes: 19/19 PASS. Includes maximum page plus validated 201st row; six-fraction timestamp/bytewise UUID tie pagination and top insertion; malformed/cross-key/unpublished look-ahead; closed source/version failures; scope forgery/cursor non-authorization; current-reference/private-field checks; no-listener HTTP inject; cancellation at acquisition/query/COMMIT boundaries.
- Existing matrix protocol/source regression: 23/23 PASS.
- Final combined run: 42/42 PASS, with all 14 frozen hashes still matching afterward. Log: `evidence/inventory-ledger-independent-final-check.log`.
- Guard extraction: all 2,428 SQL bytes equal the pre-extraction HEAD source; SQL SHA256 `b4364d9b6926e95e3f2cc8769a766b415c8f5772aa0079a2bdc3d4817a7a02e6`. Matrix reader differs only by removal of that constant and its import. Evidence: `evidence/inventory-ledger-independent-guard-parity.json`.
- Owner separately reports 104/104 scoped tests (81 ledger and the same 23 matrix tests), recorded in `evidence/inventory-ledger-query-scoped-check.log`; these are not added to the independent count.

## Limits

This is source, scripted-driver, scoped-type and Fastify inject evidence only. No real PostgreSQL, schema execution, EXPLAIN/performance, real cancellation of in-flight SQL, production authentication/session deployment, browser, listener, network, install, commit, push or full suite was run by this reviewer. Existing guard capability is not protection against a privileged owner disabling/corrupting/re-enabling guards. Separate HTTP pages use separate snapshots; later backdated entries below the cursor can appear. No schema or ordering index was added.

Reviewer writes are confined to `evidence/inventory-ledger-independent-*`.
