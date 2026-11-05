# Recorded LIVE ledger: inactive validation checkpoint

This source checkpoint is not a deployment release or final source delivery.

- New LIVE events have explicit recorded before/after quantities. Historical revisions, imports and pre-capability events remain UNKNOWN with null balances. No reverse calculation from current stock or zero substitution is allowed.
- The new 19-column adapters require an independently verified V7 runtime observation. Non-CORE V1–V6 and unreviewed legacy API factories deliberately refuse startup. General-purpose legacy/import issuers and genuine CORE-only paths remain supported. Old custom-provider positive composition contracts are not claimed compatible; explicit refusals and supported V7 native counterparts are tested separately.
- Additive SQL is adapters/postgres/patches/0026-live-ledger-balance-pairs.sql. Only an isolated synthetic owner-only clone has installed it so far: original135 routines and source records retained, two routines/two columns added, old13 rows stayed null. This is not trigger-DML, runtime-role or API-business acceptance.
- Runtime catalog approval, actual least-privilege application access, real PG-to-browser LIVE pair chains and V7 release/provisioning integration are not complete. Do not apply this checkpoint to production or pass old V6 deployment material as V7 approval.
- Source-test snapshot results: standard3393 total,3378 passed,0 failed,1 safety-gated integration skip,14 historical PLAN TODO markers. Types/dependencies passed. Focused operative React/JSDOM and HTTP timeout/abort tests passed. Those results do not establish full browser, database, network deployment or all-system BUG-free acceptance.
- Current release scripts still require separate versioned V7 preparation/review. Publishing a source archive or pushing GitHub is not deployment.

Next: same-checkpoint frontend/build checks, bounded source/DB acceptance with separately valid access, remaining product-entry/global checks, then a separately labeled reviewed source package. Performance optimizations remain deferred.
