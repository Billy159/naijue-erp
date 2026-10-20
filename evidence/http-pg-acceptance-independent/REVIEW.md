# Independent source/safety review: HTTP/auth/native PostgreSQL acceptance preparation

Date: 2026-10-20 UTC. Read-only reviewer: `review_http_pg_acceptance`.

## Result and exact candidate

No blocking source/safety finding remains in the frozen candidate. The five owner source files match `evidence/native-http-postgres-source-sha256.txt`; the root's additional package-discovery change is included as the sixth file in this directory's `source-sha256.txt`. All six hashes were rechecked unchanged after final tests. `review-metadata.json` records the checkout base revision and measured results. The reviewer made no production/test-suite edits or commits, and did not access PostgreSQL, runtime credentials, environment secrets, DB commands, or network.

This is source/static/fabricated-helper sign-off only. The real HTTP/PG suite was NOT RUN by this reviewer. Existing scripted-driver tests, pure plans, and the helper probes below are not engine acceptance. Prior engine status supplied by the parent is not re-certified here.

## Checks actually executed against final bytes

- Pure migration-source, safety, proof and backend-source regressions: 22 passed, 0 failed; exit 0. Full TAP: `pure-regressions.tap`.
- Independent source checks and fabricated fault probes of small exact-source helpers: 14 passed, 0 failed; exit 0. Full TAP: `source-and-helper-probes.tap`; reproducible source: `source-and-helper-probes.test.mjs`.
- Independent integration-scope TypeScript check: exit 0. `integration-typecheck.log`.
- Node syntax checks for the five source files and independent probe script: all six exit 0. `syntax-and-diff-checks.log`.
- `git diff --check`: exit 0.

Node tests/checks ran with a cleared process environment retaining only PATH and finite command deadlines. No engine entry point or opt-in runner was executed. Small private JSON/cleanup/disconnect helpers were type-erased in memory and supplied fabricated objects; these are explicitly marked FABRICATED HELPER ONLY in TAP. The bounded disconnect-deadline rejection is an expected negative probe, not an actual connection failure or a waived engine result.

## Safety and evidence boundaries verified

1. The closed suite enum, historical-suite refusal, dedicated explicit loopback target, repeated database-name approval, non-admin owner/exclusivity/fresh-target checks, runner marker, all eight migration bytes/hashes, sparse fixture behavior and prior backend/sparse helpers are unchanged from c48eba1. The independent probe compares exact bytes for those files; source checks also confirm gates precede Pool construction. `reviewed-controls-sha256.txt` captures the reviewed controls and production wiring.
2. Only the explicit backend branch calls the new helper, after the existing backend acceptance, passing the already validated settings. Sparse dispatch remains separate. Package default discovery adds only the named connection-free backend-source test, not a wildcard, engine file or runtime runner.
3. Both new API instances call actual `createPostgresReadApi` with one argument and no driver seam. Reviewed composition uses real authentication service, Node scrypt, authentication store, bounded default pg driver and native readers. Construction remains lazy and non-listening. Source calls are not substitutes for observing a future real run.
4. One separate bounded synthetic staff/account pair is inserted transactionally with a random in-memory password and real native scrypt hash. No fixed usable password is added, existing disabled fixture is not enabled/updated, and no business reset/seed bypass is added. Setup failures omit raw driver/failing-row details.
5. Policies are unmistakably synthetic fixture providers, not production permission providers. They check the exact new account/hall, explicitly allow the synthetic employment and SALESPERSON role, preserve/check transfer role, use fixed scopes and do not derive grants from request labels/actors/scopes/headers. Unknown accounts do not receive grants.
6. Prepared cases cover wrong-password rejection, disabled account, current stored session, secure host-only cookie including explicit Domain absence, every native read route, scoped candidates/ledger pages, sales/transfer list/detail/history/statistics/reference reads, product reads and honest unavailable media. Hidden native scopes, malformed/duplicate cookies, bearer/header/origin spoofing, client actor/scope rejection and rejected cross-origin logout are explicit. Logout checks actual stored revocation and prevents all read families reaching policy afterward.
7. Non-mutation evidence now compares content digests for fourteen fixed non-auth business tables, not row counts alone. Comparisons are booleans and do not print table rows/digests on failure. This is bounded synthetic state coverage, not an adversarial tamper guarantee or proof about every production table. Reviewed native readers separately begin REPEATABLE READ READ ONLY transactions; command/admin routes are absent from the factory.
8. Failed assertion arguments are safe scalar counts/statuses/booleans, not password/hash/token/cookie/config/body objects. JSON parsing replaces parser excerpts with a fixed error; its fabricated failure probe confirms no marker/cause retention. No log/snapshot/filesystem output is introduced in the real helper. Credential strings are cleared after use/hooks without claiming cryptographic memory erasure.
9. Cleanup attempts every API even on synchronous/asynchronous rejection and emits only a fixed error after draining. Fabricated probes confirm both failure shapes. Repeated close remains tested. Installed pg-pool source shows pool.end can resolve before backend disconnect visibility fully drains, so the final helper observes pg_stat_activity with a fixed 3-second/25ms poll, propagates failed queries and fails nonzero at deadline. It never retries a close, write, or failed query. Delayed-zero, deadline-failure and no-retry fabricated probes passed.

## Findings corrected before final freeze

- Explicit loginVerified completion gate prevents late login-prerequisite failures from falling through to read acceptance.
- Safe JSON parsing suppresses credential-bearing body excerpts on unexpected parse failures.
- Drain-all cleanup contains both synchronous and asynchronous close failures and sanitizes diagnostics.
- Cookie assertion explicitly rejects Domain attributes before claiming host-only behavior.
- Weak five-table count-only non-mutation evidence was replaced with bounded fixed fourteen-table content digests.
- Terminal connection cleanup uses a bounded read-only disconnect-visibility observation rather than a potentially racy immediate assertion.

The owner also encountered an intermediate TypeScript unknown-return-type failure while introducing the safe parser. The raw source-only failure is preserved at `evidence/native-http-postgres-json-wrapper-typecheck-failure.log`; it was corrected before freeze. The independent final typecheck and all final checks above passed. Earlier pre-disconnect reviewer TAP is retained with `.pre-disconnect.tap` suffixes and is not the final result.

## Not established

No real listener, browser, TLS behavior, production authorization/grants/RLS, real ERP data/media, deployment readiness, load/performance, or actual HTTP/PostgreSQL result is established by this review. A separately authorized sole runtime owner must execute the exact frozen guarded suite on a fresh disposable target and preserve the actual exit/TAP, including failures, before any engine PASS claim.
