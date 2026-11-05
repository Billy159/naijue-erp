# Fresh35 V2 guard and schema review: final offline result

2026-11-05 UTC. Scope: new offline source/model comparison code only. No PostgreSQL parsing, connection or statement execution occurred; no target, credential, port or service operation occurred.

## Completed code

- `scripts/release/unified-install/fresh35-catalog-v2-guard-review.mjs`: one genuine-analysis API, complete semantic model and a single DO whose first statement unconditionally refuses. All model assignment, local GUC settings and comparisons follow that refusal in the same block. No bypass parameter, independent unblocked comparison SQL, installer, record, profile registration or host is returned.
- `scripts/release/unified-install/fresh35-catalog-v2-schema-review.mjs`: genuine source-bound context plus offline supplied-dump comparison. The complete same-version schema text is compared conservatively; a source copy can match and is explicitly not a physical observation or admission.
- `docs/legacy-retirement-source/RETIREMENT-V2-GUARD-PROFILE-GAPS.md`: precise remaining registry, trust, physical-target, installer, observation, protected-record and same-client-host implementation gaps.

The guard's complete expected categories include152 routines,35 tables,351 columns,326 constraints,111 indexes,570 triggers,150 relations/351 column ACLs,4 sequences,32 policies, default ACL and70 declared rowtype relationships. Raw pg_type properties were not captured, so those70 relationships are explicitly derived from declarations. Missing type and genuine target-dependency evidence remains recorded; catalogMetadataComplete stays false.

## Tests and independent code review

Final combined run: **27/27 passed, zero skipped** (guard10 + schema8 + shared canonicalizer9). Exact command, from the repository root:

`FRESH35_V2_EVIDENCE_DIR=/workspace/scratch/f6bee04e937b/cloud-pg-schema178v2-20261105-r2/evidence node --test tests/fresh35-catalog-schema-diff.test.mjs tests/fresh35-catalog-v2-schema-review.test.mjs tests/fresh35-catalog-v2-guard-review.test.mjs`

Separately, the final guard plus original V2 projection run passed14/14. These are Node source/model tests, not PostgreSQL validation.

Review found and closed three input/source issues before final freezing:

1. Cached schema comparison had omitted projection from its later freshness checks. A copied-source regression failed first; all180 comparison sources now get checked before and after every comparison. Independent in-memory load/read observation verified52 loaded modules covered, no unread pins, and each pin read at least twice.
2. Mapping top/pair accessors could be invoked by repeated property reads. Own enumerable data-property snapshots now precede the first await.
3. An invalid source/target leaf object could be traversed or frozen before rejection. All four mapping leaves now must be strings before recursive freezing. Independent cases verified zero nested getter calls and no freezing of caller-owned objects.

Independent guard review checked50 loaded modules within180 pins, the fixed refusal/delimiters, full model/query agreement and explicit rowtype evidence limits. Its initial8-test run included isolated temporary-copy mutation/cleanup; it did not change the original repository. Final scalar changes were checked separately, including eight invalid-leaf cases. Independent schema review used read-only subsets and incremental checks; the local final27 run covers every final test, including both temporary-directory regressions.

The review only establishes this code/data consistency scope. It does not complete independent safety review, verify effective role permissions, authenticate capture execution, approve a profile or authorize installation.

## Frozen artifacts and hashes

Package: `/workspace/shared/fresh35-v2-guard-schema-review-20261105-r2`.

- Guard module: `427689974b892bb529ed59fe5874cbbdc55a7832821aad4eb1030f6d1d277036`.
- Schema comparison module: `4cd6293e641ee0dff0635e926738095ae487b4c7cb3cea2561011b6b95f59fea`.
- Guard source cohort180: `f673e2e8e7e57603c03700453e7cff7caaeb0a150b4a3d5bd133661e31d7844f`.
- Schema comparison cohort180: `6ab11ec7fb639832cee9748c8ea40d90892125c49eb1886be0e761b5338716ba`.
- Their analysis union181: `981d2f8cf1ffd5a8ce7d91e6990f9adfcea33c3353b9e47939a75312d5258ae5`.
- Original177 capture binding remains `3cd0da8932bb59eb58e585e8f6aad9d894f334351b4ce97c8b370a36c48e0fb6`.
- Blocked guard review SQL: `ae46c3c8ccee4bd87a2abc74e6ca2a96754da7eea44a1754eac5b0b8a40d0202`.
- Expected model: `bec7241e632585a06472374279dc49d5532b599a7b21422aaa74bf951652cb97`.
- Existing separate schema projection for proposed20261105_r1 labels: `5fc8508ea96062898a42dc4c03c3a6ebe166158037cc6c7c3130a13d3ee14931`.

The two180 cohorts are different. Their union181 is not the installation candidate's180 cohort and is not a whole-repository snapshot. The new modules never ran during the original178 capture. Ordinary valid-string mapping SQL/model bytes did not change when the invalid-input bugs were fixed. The earlier r1 package and red regressions are retained as superseded evidence, not erased or relabeled as final.

## Remaining boundary

No trusted V2 profile, executable authorized installation guard, physical35 target, installed record or import host exists yet. Existing V1/V2 reviewed loaders, installed-record functions and host refuse. The separate installation-candidate package still has only a fixed refusal entry and unknown physical IDs. There is no permission to remove a refusal, retry a denied operation by another path, create access or execute SQL.

Actual35 metadata/dependencies, whole-package import/replay/rollback, historical SALE/discount/source evidence, settlement occurrence UUIDs and ordinary-business behavior are untested in PostgreSQL. Real-data migration/deletion is not covered. The remaining implementation and authority requirements are itemized in the gap document rather than represented by caller-set approval flags.
