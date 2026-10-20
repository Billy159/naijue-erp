# Real PostgreSQL synthetic acceptance evidence

## Result

On 2026-10-20 UTC, the strict `sparse-0001-0008` harness executed against a newly created, physically isolated PostgreSQL 17.11 database and passed: **12 tests, 12 passes, 0 failures, 0 skipped; exit 0**. This count includes the parent test and its 11 substantive subtests. It is real PostgreSQL engine evidence, not a mock, SQL-text check or plan-only result.

- Exact tested source commit: `318440a1c5a396329a4bc8256d34008b4774faab`.
- Frozen source plan SHA-256: `0966ecee1ef03e3357593e71c2e2c449f2c6f2b647dee5319f665b67a6332e8b`.
- PostgreSQL `server_version_num`: `170011`; full version and physical cluster system identifier are in `target-fingerprint.json`.
- Direct target: `127.0.0.1:55432/naijue_erp_test_0eae9933770258d4`; dedicated owner/login `naijue_erp_test`, with no SUPERUSER, CREATEDB, CREATEROLE, REPLICATION or BYPASSRLS.
- All eight reviewed migration hashes were checked before Pool construction and again against the frozen archive. `reviewed-migrations.json` records them.
- Post-execution comparison found all 751 committed source files identical to commit `318440a1c5a396329a4bc8256d34008b4774faab`. The first failed archive's 733 committed files also remain unchanged.
- Only synthetic fixtures were used. No user Mac, existing ERP database, production/staging server, Tailscale, SSH, real business data, public listener or public Site was used.

## What actually passed

The unchanged strict harness reached all terminal assertions for:

1. Exact 0001–0008 migration registry and stock-free historical reference fixture.
2. Party CREATE/EDIT/DISABLE/RESTORE, independent numbering, duplicate replay/content conflict, rollback, sparse audits and dependency protection.
3. Atomic import staging/native membership; failed early publication and pre-publication runtime use.
4. Positive nonzero baseline COMMIT; exact old native-trigger dispatch, source/receipt/audit/balance facts; real deferred COMMIT rejection and rollback.
5. Actual checkpoint index and installed function inspection, plus forced-index EXPLAIN without ANALYZE.
6. Sparse complete-scope publication, native scoped inventory reads/candidates, absent-is-zero versus missing coordinate and exact summaries.
7. First-sale actual SQL fault rollback, healthy replay, inverse effects and retained zeros.
8. First-transfer actual endpoint effects/reversals and old deferred cumulative corruption rejection.
9. New first-use sparse invariant rejection at real COMMIT without consuming the fresh key.
10. Two distinct sales documents observed actually waiting on the same absent inventory key, then exact serialized cumulative outcome/reversals.
11. Retained zero/history/native-source guards and actual read-only reader transaction enforcement.

The checkpoint EXPLAIN used `audit_import_checkpoint_version` only after local `enable_seqscan=off`. This proves **index eligibility only**, not natural planner choice, trigger-internal plan, timing, realistic cardinality or performance.

## First failure remains preserved

The preceding real run on a different fresh database, `naijue_erp_test_34bee6790108f6e9`, tested commit `b508ce88127ce3e4562ff731982ac8b50a980146` and failed (1 test, 0 passes, exit 1) with SQLSTATE `42601`, “syntax error at end of input.” The isolated server reported character 11489. Static source-position mapping points to 0004 line 161, column 71, at the unparenthesized CASE branch delimiter. This attribution is **source-position inference, not a readback of committed migration versions**.

The reviewed source correction in the tested commit parenthesizes three CASE expressions in 0004/0008 and explicitly updates the two changed migration hashes; no guards/assertions were weakened. The failed database was never cleared, repaired or reused. Its original evidence/hash is retained, with a path-sanitized full TAP here. The successful run used a separately fresh database and the new reviewed manifest.

## Evidence files and sanitization

- `acceptance.tap`: complete successful TAP, byte-identical to original; SHA-256 `f76a7e272a7a2605c1f6b64c63de2abb9dc5bde206faa97d541b2739b798952c`.
- `acceptance-run.json`: original result fields, with only local source/log paths replaced.
- `first-failure.tap` / `first-failure-run.json`: full first failure, with machine-local archive/dependency stack prefixes and local JSON paths replaced; no TAP lines omitted.
- `original-evidence-hashes.json`: hashes of retained unsanitized originals, with no private path disclosure.
- `target-fingerprint.json`, `official-package-provenance.json`, `reviewed-migrations.json`, `frozen-source-post-run-verification.json`, `first-error-character-mapping.json`: bounded nonsecret provenance/identity/source evidence.
- `SHA256SUMS`: hashes of every other file in this bundle.

No credentials, connection URL/password, database files, authentication configuration or real business data are included. Generated disposable passwords remained only in the credential-holder process/child environment and normal PostgreSQL password-hash storage. PostgreSQL packages were authenticated from official Debian repositories and only extracted in user mode, without host installation or service/security changes.

## Scope limits and retained state

This evidence proves only these synthetic repository scenarios. It does **not** establish actual application composition, authentication/authorization-provider wiring, HTTP/UI/browser flows, real source-file/manifest truth, real business-data compatibility, historical cutoff edits/first-unapprove, post-publication native catalogue creation, media, production grants/RLS, privileged-owner tampering recovery, upgrades from an existing ERP, all race/deadlock schedules, unknown-COMMIT recovery, restart/failover, sustained load, normal-planner performance or production/deployment readiness.

At bundle creation the same owned loopback instance is controlled and idle, with both attempted targets retained and not reusable for acceptance. No additional database/run was created after the successful run. Instance shutdown/disposal is a separate lifecycle step; this report does not claim it has happened.
