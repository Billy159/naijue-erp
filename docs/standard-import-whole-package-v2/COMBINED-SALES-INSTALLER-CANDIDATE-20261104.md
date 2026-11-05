# Combined historical-sales successor review candidate

2026-11-04. Source-only composition, not an installed or admitted initializer. No PostgreSQL process, connection, parser, Mac action, production action or typecheck was used.

## Exact composition

New explicit entry: `renderWholeSalesIntegrationCandidate(sourceRoot)` in `scripts/release/unified-install/whole-sales-integration-candidate.mjs`. Existing singleton/batch renderers, active installer input lists, runtime source specs and installation records are unchanged. This is a follow-on to the exact original whole-package installation, not a fresh database installer.

The renderer composes, under a single outer BEGIN/COMMIT:

1. Original closure to singleton/marker closure.
2. Singleton closure to immutable INIT-to-batch closure.
3. Exact historical-sales-source-v1 profile-command successor.
4. Exact missing-historical-settlement successor.
5. Exact original historical approval restoration successor (current positive sealed migration-version and hardened trigger admission candidate).
6. Existing access verifier and permissions, with only closure and profile-command expected body digests substituted.

All five successor bodies are retained byte-for-byte after removal of their outer transaction delimiters, in that order, once each. Existing SET LOCAL statements remain in sequence. Settlement final-body and pg_proc metadata verification remains in the restoration successor itself. Its dependencies, hardened configuration, immutable guards and exact trigger checks remain unchanged. The access verifier does not independently list the settlement routine; this composition does not pretend it does.

All eight SQL input files are SHA-256 pinned. The compiler independently reconstructs the profile and both settlement replacements from the pinned predecessor sources, verifies unique replacement anchors and each resulting body digest, and checks the restoration dependency on the profile successor. Any byte drift or missing/extra historical input rejects rendering. SQL source construction is not PostgreSQL parsing or transaction proof.

## Permissions and admission remain gated

The output includes exactly the existing **2 GRANT and 8 REVOKE statements**, with unchanged recipients and privileges. They are permission-changing operations; identical source statements do not prove zero actual ACL delta. They have not executed. No additional helper, role, grant, exception flag or bypass was added.

The generated pin proposal describes three final routine-body changes and a five-edge predecessor chain. It is explicitly not independently reviewed, has null installed-catalog and source-spec digests, and cannot issue a runtime capability or trusted installation record. `runtimeCatalogAdmitted`, `engineExecuted`, `installationReady`, `reviewed`, and `activeProfilesChanged` are all false. The original batch-only SQL digest is still `57746137a1fd2ffc11350f1d9f22c09b53e8361c4046cbe66766eefe3d886667`.

Before any execution: independently review this exact composition, confirm the full predecessor catalog/ACL and hardened source cohort, authorize the exact isolated target and permission changes, and maintain exclusive client/schema-writer ownership throughout installation and verification. Independently attest installed catalog/ACL and version the runtime source cohort before admission. This document and candidate do not supply those approvals or barriers.

Required isolated engine tests remain those in `docs/signed-sales-20261104/historical-original-restoration.md`, including positive version-4 approved migration, first unapproval, sparse note/responsibility SAVE and reapproval, zero-net and signed lines, absent settlements, forged origin/chain/economic changes, restricted runtime role/RLS and trigger tampering. Add forced failure in each integration stage and verify full rollback of previous function bodies/metadata/ACL, plus import/ordinary-business rollback of rows, receipts, audit, ledger and balances. Do not reuse a previously retired target.

## Evidence

- `evidence/sales-integration-candidate-20261104.sql`
- `evidence/sales-integration-candidate-20261104.json`
- `evidence/sales-integration-candidate-20261104.catalog-proposal.json`
- SQL SHA-256: `e3c36f7f8487c6ecb00e35cf1d761016653b9d522df551ae9a550469954682b5`
- Source tests: **51/51 pass, zero skips** on pinned Node v24.21.0. No engine tests.
- Log: `evidence/sales-integration-source-green-20261104.log`.

Command from repository root:

```sh
../erp-runtime-restored-20261102/tools/node-v24.21.0-linux-x64/bin/node --test \
 tests/whole-package-sales-integration-candidate.test.mjs \
 tests/whole-package-batch-integration-candidate.test.mjs \
 tests/whole-package-batch-closure-candidate.test.mjs \
 tests/whole-package-closure-integration-candidate.test.mjs \
 tests/whole-package-closure-successor-source.test.mjs \
 tests/whole-package-kernel-source.test.mjs \
 tests/historical-sales-source-profile-successor.test.mjs \
 tests/historical-missing-settlement-sql-source.test.mjs \
 tests/historical-original-restoration-sql-source.test.mjs
```

## 2026-11-04 13:28 UTC continuation after v3/v4 (append-only checkpoint)

Current formal wiring is the fixed original/sales Python launcher and sales issuer, NOT the disabled batch-only finalizer. The issuer uses renderWholeHistoricalReceptionCandidate, performs the confirmed SQL transaction, observes the full sales catalog under the ordinary controller, rechecks source/config/original record, and publishes the fixed sales record without overwrite. Host admission loads the same loadWholeSalesSpecV1 and protected sales record. Existing historical sections above describe earlier candidates and must not be read as current acceptance.

This continuation added a public machine-readable success receipt after the existing durable publication sequence. It binds the exact published record bytes, source spec, combined SQL, actual catalog and physical target; businessImportVerified remains false. It does not change SQL, permissions, disabled-finalizer gates or grant an execution capability. Launcher contracts now explicitly reject the old finalizer mode, caller-selected entry and arbitrary checkout path before Node under mocked privilege. The two current installation/handoff documents explain dependencies, exact fixed modes, output and unknown outcomes.

Tests first: node --test tests/whole-sales-record-issuer.test.mjs exited 1 (12 pass / 2 new failures), then 0 (14/14). Expanded command exited 0, 56/56:

    node --test tests/whole-sales-record-issuer.test.mjs tests/whole-sales-module-boundary.test.mjs tests/whole-sales-mac-acl.test.mjs tests/whole-sales-platform-layout.test.mjs tests/whole-original-stage-target-binding.test.mjs tests/whole-batch-closure-finalizer-source.test.mjs tests/historical-sales-installation-admission.test.mjs tests/historical-sales-execution-admission-path.test.mjs

node --check scripts/release/unified-install/install-whole-sales-record-v1.mjs exited 0. A direct offline renderer/spec comparison exited 0: 178 routine pins, combined SQL ee14b4bcb024c7b4e99dece6d76de37f4e60dda7861d9ca5448719dac75a5f2e, source spec 6ebe33237713f97e7b38a416940c7859286d951427c14f436b79a56b28b22c75 at this checkpoint. These hashes must be regenerated after any subsequent source/SQL edit.

Evidence logs for this continuation: /workspace/shared/sales-issuer-receipt-20261104/{red.log,green.log,expanded-green.log,syntax.log,cohort.json}. They contain synthetic/offline test outputs, not credentials. No root install, Mac hardware, genuine protected record publication, PG execution, production data, typecheck/build, or full public host/CLI import occurred. Existing frozen SQL-only acceptance remains separately version-bound. Next: integrate other workers' changes, rerun exact-cohort source tests, then freeze a reviewed stage handoff; real formal installation remains conditional on the authorized trusted deployment.

## 2026-11-04 13:41 UTC large-package and explicit-zero intake checkpoint

Current work adds an explicit oversized whole-import refusal (64MiB/artifact or 256MiB materialization total), retaining the small-package behavior. It directs the operator to stream-import without switching commands or connecting. Both routes now pass the verified explicit-zero token to the shared host and SQL kernel; their matching enforcement is owned by the zero-evidence implementation. The installer was switched to renderWholeExplicitZeroCandidate; the sales spec owner is pinning the exact new cohort.

A new shared explicit-zero-cli-input reader checks bounded stable bytes, outside-package location and the same independent SHA/namespace/inventory/cutoff verifier. It is used by formal import and standalone stream-preflight. The latter needs no database/password/installation record and does not print approval facts. Other standalone stream-prepare/validate/plan commands remain unsupported for this approval; the current local handoff states the boundary and full commands.

Tests-first: tests/unified-whole-large-package-route.test.mjs failed before implementation; route + existing CLI/outcome/historical admission suite then passed 17/17, exit0. Standalone approval preflight CLI failed before implementation, then offline-preflight/token-forward/route suite passed 5/5, exit0. Real small-package preflight/plan/request iteration and actual missing-protected-record refusal passed 2/2. Token-forward testing replaces host/kernel with assertions only; it is not live database evidence.

A first full 105,433-approved-key synthetic package run produced 105,435 inventory rows (including two original rows), 301MiB input and a 713,551,872-byte preflight index. Complete preflight passed with zero issues in 38.2 seconds, measured peak RSS 620,318,720 bytes. The later plan/program subprocess failed after 279.8 seconds, exit1, with only test-failed output and no identified signal/JS cause. The entire 105k path is NOT yet passed. Input/index/graph were preserved for diagnosis; do not repeat generation or report this as successful import. No PG/root/Mac/real data was touched.

Logs: /workspace/shared/large-whole-route-20261104/{red.log,green.log,stream-smoke.log,stream-cli-host-gate.log,token-forward.log,offline-cli-red.log,offline-cli-green.log,stream-105433.log}. Next: complete host token boundary, diagnose the existing indexed large plan with phase/resource evidence, then rerun the final stable source cohort. No final archive is frozen at this checkpoint.

## 2026-11-04 13:45 UTC token boundary and stable-source regression

The CLI now passes the exact verified approval object both to openHost(...,{explicitZeroApproval}) and createWholePackageSqlKernel(...,{explicitZeroApproval}); the shared host and kernel enforce matching descriptor/row evidence before forwarding SQL. Public-source tests also reject forged tokens and accessor-swapped parameters. The standalone preflight and formal import paths share explicit-zero-cli-input.mjs; no approval facts are printed.

The planner first verifies the private token, derives its bounded descriptor, and compares it strictly with the preflight summary. It now excludes the private token from structuredClone(options), avoiding an unnecessary duplicate of up to 250,000 approval facts. A dedicated test was RED on the old clone call, then passed; a cloned/forged approval still rejects. This correction does not establish the cause of the earlier abrupt scale-test failure.

Post-integration regression: 17 suites / 80 tests all passed, exit0, plus 6/6 host-boundary tests exit0. Logs: /workspace/shared/large-whole-route-20261104/cohort-regression.log and host-boundary-green.log. The renderer/spec check exited0, sourceSpec=59cd34f0857c8437ec505d213cabebb13ec697d520133ab3d08937f78ab966a0, combinedSQL=c866062c12366dbcb85c526fc593e011c46d5635bd10a511094cab58988d01e3, 178 routine pins. Exact pins are in final-cohort.json in that evidence directory. Any later code change invalidates this checkpoint's source hash.

The scale diagnostic is reusing the prior complete validated index/approval, not regenerating input or repeating preflight. Direct-process phase logging starts 13:44 UTC with approval verified (105,433 facts, heap about123MB, RSS about542MB), then PLAN_START. At this checkpoint its plan/request result remains pending; no successful105k formal/PG/host import is claimed.

## 2026-11-04 13:46 UTC scale diagnostic terminal result

The same direct diagnostic session completed with EXIT=0; no additional scale generator or preflight was started. It revalidated the saved complete preflight index by its SHA/size and the independent synthetic approval, prepared the plan, built the coalesced stream program and exhausted every request. Result: 105,433 approved-zero rows (plus two existing baseline rows), 1,270 requests, largest request 296,732 bytes, all zero-evidence ledger_entry_id values null. Elapsed108.46 seconds for the resumed approval/plan/program/request stages; peakRSS986,157,056 bytes (about940.5MiB). The earlier complete preflight stage passed separately in38.2 seconds. Neither result is a128MiB-memory guarantee or PG/host execution.

Exact terminal log: /workspace/shared/large-whole-route-20261104/stream-105433-resume.log, ending PASSED, DISPOSED and PROCESS_EXIT code0. Machine result: stream-105433-result.json. The earlier stream-105433.log exit1 remains retained; its abrupt subprocess failure cause is still unproven. The unnecessary private-token clone was concretely demonstrated and removed with a RED/GREEN regression, but the successful resumed run alone does not prove the original termination was OOM.

Current supported scale claim: the105,433-key synthetic complete package passed actual offline full preflight plus hash-bound stream plan and exhaustive bounded request generation. Formal stream-import is the intended execution route, with the same approved token passed to protected host/kernel; actual installed-record/root/Mac/PG/host execution is still untested. Final handoff must preserve this distinction and measured memory needs. Code writes for this worker are now stopped; archive preparation awaits all-owner freeze confirmation.

## 2026-11-04 13:50 UTC final stage-freeze checkpoint (not acceptance)

Standalone stream-preflight now accepts BOTH independent paired approvals: explicit-zero and staff-hall. It shares the formal readers and validates the manifest SHA first. A combined departed-null-hall plus zero synthetic package test was RED before wiring and GREEN afterward; stdout redacts the staff wire to SHA/count. The current Mac/operator handoff gives exact offline and formal commands for both approvals. Other standalone stream-prepare/validate/plan tools remain outside this supported approval surface.

Final affected cohort after that change: 58/58 tests exit0; combined-approval targeted suite10/10 exit0. Source spec now1b1f5f07bc019132a6a205afd41f1078fcf5db0c70a05f29e60ec6571de88565; combined SQL remains c866062c12366dbcb85c526fc593e011c46d5635bd10a511094cab58988d01e3. Current renderer/spec comparison exited0. Earlier source hash checkpoints are superseded, not silently reused.

Mandatory limitations: frontend npm run typecheck:web actually exited2 in mixed-sale-quantity.test.ts. The fixture was corrected, but typecheck was NOT rerun, and therefore is not green. Original diagnostics and worker results are retained in mixed-sales-ui-evidence-20261104/first-typecheck-tool-output.txt and results.json. At13:41 UTC an independent security-review tool call was blocked with “possible cybersecurity risk”; it did not complete and has no shell exit code or original shell log. This is a reported tool denial, not a completed/approved review. No retry or alternate route was used. Details of older typecheck/build tool denials are incomplete and not represented as complete records.

No formal root issuer, genuine protected installation-record publication, Mac hardware, new SQL PG acceptance, or successful real public host/CLI import was performed. Existing SQL-only engine evidence is version-specific and does not validate the new explicit-zero successor/launcher. The scale source-preflight/request proof does not upgrade these claims. Final stage packaging must include original failures as well as successes and remain labeled incomplete stage handoff.
