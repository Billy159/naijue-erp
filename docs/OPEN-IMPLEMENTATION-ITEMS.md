# Open implementation items (not a release checklist pass)

Current confirmed remote commit is 231e53b on codex/clean-erp-foundation. Later cloud commits are not automatically on GitHub. Full feature gaps remain in the approved project completion Page and scope reports.

## Targeted follow-ups from cross-slice review

- CLOSED in a3f1502: sales now records sparse key/changed-line/settlement before/after evidence and skips unchanged native detail writes. Independent6 targeted probes plus85 focused/130 combined tests passed; limited synthetic PostgreSQL engine acceptance now passed at 318440a (evidence commit 23f1085), not every command path or production acceptance. Transfer equivalent is in f8ebc86.
- CLOSED in a3f1502: sales fingerprint binds stable account and actual business command, not transient hall context; receipt replay still rechecks current permission. Transfer equivalent is in f8ebc86. Do not re-open these resolved source defects without new evidence.
- Inventory HTTP/application boundary, native PostgreSQL snapshot reader, approved cutoff coverage/publication and sparse first-use persistence are implemented. The strict 0001–0008 synthetic engine suite passed against exact 318440a on PostgreSQL17.11; production root composition and real business-data acceptance are still missing. Latest approved rule: absent stock in a verified complete published scope is zero; incomplete/corrupt/failed reads reject as a whole. No per-cell unknown business UI and no additional baseline_entry_id.
- Product drawer and backend read source are reviewed and committed (92f0349 / 121eecc). A separate complete product-only synthetic preview is delivered in the project Space; the full combined portable preview still exceeds the Page 256KiB cap and has not replaced the smaller inventory preview. Real browser and exact Demo appearance remain unverified.
- Authentication UI and bounded query transports are committed (f08c036 / 2f33776). Root test discovery includes both. The empty inventory size-column boundary mismatch is fixed; production root/session/provider composition still remains.
- Real PostgreSQL17.11 now runs in the explicitly authorized isolated dot-cloud development/test environment, loopback only and synthetic data only. Strict sparse-0001–0008 acceptance against 318440a passed12/12 (11 substantive subtests plus parent); full evidence is evidence/postgres-real-acceptance-318440a/. First b508ce8 migration syntax failure is preserved. The historical native-0001–0005 selection remains refused, not a current acceptance path. Additional backend/auth-storage/read-snapshot cases are being prepared separately; no actual HTTP/login/browser/load/production acceptance is implied.
- Customer/supplier maintenance with approved KH/GYS numbering and sales list/detail UI passed scoped independent review and are committed (97f6138 / c79e9aa), not yet integrated into a production root. Named single-endpoint detail and bounded filter references are now committed in b2b4574 / 0b87b1f; native transfer reads are in 07683bb. Atomic party name/state EDIT is source-reviewed in b865920. Do not treat synthetic test passes as operational availability.

No line in this document authorizes a database write, migration execution, deployment, credentials, local task, or permission change. The code implementation follows the user's approved rewrite scope; production validation is a separate stage.

## Visual acceptance correction

The prior synthetic inventory appearance was rejected by Billy. Exact frozen Demo UI source is now available and verified; restoration is active, but no real-Demo screenshot comparison or real-browser acceptance has occurred. See FRONTEND-ACCEPTANCE-STATUS.md. No functional test count overrides this missing acceptance.

## Latest catalog price decision

User message Sentinel_3d67bb2097188191afc75e5acf73ba9f: “你按照demo的价格保留啊”. Preserve all price fields, labels, ordering and semantics from frozen Demo b8bcfe3, at product rather than SKU level. This is no longer a pending user scope decision. The exported UI evidence references C.priceFields but excludes the private-containing module defining it. A bounded request for static configuration-only extraction has no confirmed new task outcome; do not substitute candidate617 configuration as verified frozen Demo evidence or guess field labels. Existing frozen product UI explicitly distinguishes blank/unset from numeric zero and validates nonnegative amounts with at most two decimals; these observed rules remain source evidence, not complete configuration extraction.

## Current integration checkpoint

38a1a9d composes the read-only native transfer route, separate customer/supplier navigation and action-only product stylesheet loading with the canonical DemoFrame workspace. Independent mocked-DOM and emitted-asset checks passed, not real browser/pixel acceptance. The latest complete aggregate checkpoint is still a4ee11e (800 synthetic tests and49 conventional DOM groups); later focused passes are not a whole-repository pass. A pre-existing party receipt403 unresolved-write recovery bug is separately being repaired.

The current three-page synthetic preview is being packaged from exact38a1a9d. Production server composition, actual authentication and reference-provider wiring, complete write forms, historical first-unapprove and post-publication native product creation remain incomplete. These are implementation/testing gaps, not requests to reapprove already-decided business rules.
