# V6 release wiring proposal — source-only handoff v3

## Corrected historical boundary

The old formal full deployment pin is **EXACT26_RUNTIME_CATALOG_EXPORT_V1**, not V3. At delivered ae7a8f4697fb90b829e9e7f194d1e5694ed44943, `scripts/release/deploy-candidate.py:601` requires V1 and `config/release-contract.json` selects `26_hv2_history_set_guards_from_v22`. A second V1 check at line 1675 belongs to the separate minimal R1 capacity-QA path and must remain V1. V3 refers to a backend exact13 xmin observation, not that deployment pin. Prior delivered ZIPs remain untouched; this new note supersedes the incorrect description only.

## Candidate scope

No production, external developer, real-data, Mac, database or native test actions were performed by this preparation agent. All proposal files live outside the repository. Backend source and SQL135 function source are untouched. No trusted review or boot helper hash is advanced. `complete-write-v6` is an explicit release-plan selector in runtime26Full, not an inferred version or fallback; omitted selection retains legacy V1 semantics. Unknown values reject. The V6 review requires the exact V6 format/patch pair and a metadata record containing only original fields plus `complete_write_xmin_acl_match: true`. Source/migrations/catalog/target identity and all independent-review/purpose guards remain.

## Test-first run for sole native executor

1. On untouched baseline run `RELEASE_SOURCE_ROOT=<baseline> python3 <this-directory>/tests/test_v6_release_alignment.py`; capture output and exit code. V6 positive must be RED at old V1 gate, old V1 must pass, negative gates must remain closed. This is protocol validation, not actual PostgreSQL ACL proof.
2. Run `RELEASE_SOURCE_ROOT=<baseline> node --test <this-directory>/tests/v6-release-contract.test.mjs`; expected RED proves absent finite V6 contract and unsafe generator pin coupling.
3. Apply proposal only to new phase branch, never mutate prior delivered artifact. Run same tests GREEN and existing release-file-contract, capacity, health, stop-lifecycle, build/pack tests. Generated-contract check may remain BLOCKED at deliberately unchanged trusted boot helper hash. Record this honestly; do not rewrite hash to satisfy test.
4. Run existing backend V6 issuer tests: missing/extra xmin, wrong format, old-profile nonfallback and source135. Do not substitute Python true-valued mocks for genuine ACL observations.

## Fresh isolated validation gate (not yet executed)

A new disposable cluster/database/roles separate from both preserved 19147 and 16466 is required. No target creation or DB access is authorized by this source proposal alone. Preserve current running/stopped requirements controlled by root. Before execution, freeze exact source commit, exact migration/patch bytes, baseline leastpriv user-column/sequence/routine rights and intended V6 delta. Existing `provision-database.py` is a historical fixed production schema19 provisioner, NOT a reusable cleanroom installer; do not run it.

Provision through reviewed source and ordinary owner role, using explicit target binding and independently reviewed pre/post catalog digests. All grants must be finite column grants and exact23 xmin, no table SELECT, PUBLIC grant, grant option, membership elevation, MAINTAIN, bypass, or SQL modification. The V5→V6 dependency also includes exact history_revision user-column reads, not xmin alone. Verify source135 before and after, exact migrations and all role/ACL/sequence guards. Then connect as the ordinary runtime login (current_user=session_user), obtain fresh original issuer metadata, and independently review it; provisioning SET ROLE metadata is not a runtime review.

Run ready/startup plus original authorized normal14/transfer4 service scenarios on new synthetic data and the real frozen app bytes; validate missing one of 23 xmin grants, extra 24th xmin, broad table SELECT, user-column omission/extra, grant option/PUBLIC/member role and sequence overgrant each fail before readiness. Restore only in this disposable target through explicit prepared steps. Do not alter old V1/V3/V4/V5 generated SQL or their acceptance behavior. Verify malformed format/pair and absent/unknown explicit release selector fail. Compare schema/function hashes to frozen135, then preserve evidence and clean up only temporary access under original task policy.

## Still blocking a release claim

This preparation is not a from-zero installation proof, runtime approval, deployment approval, production release, unified-browser pass, or new independent catalog review. Base leastpriv rights and new isolated execution remain required. A finite delta renderer does not replace a complete reviewed baseline installer. Do not collapse those open gates into the existing actual normal14/transfer4 service PASS.
