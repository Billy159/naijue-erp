# Fresh35 V2 guard and profile implementation gaps

2026-11-05 UTC. This is an offline implementation plan, not safety approval or execution authorization. No existing refusal is removed. The captured177 source cohort and its real178 evidence remain immutable. New analysis modules have separate source hashes; they were not part of the original PostgreSQL capture.

## Current interfaces and their boundaries

- `fresh35-catalog-evidence-v2-adapter.mjs`: reads the selected actual V2 capture, checks its source/evidence bytes and produces genuine **unreviewed analysis**. Its private brand proves local preparation, not trusted execution, independent safety review or target authorization.
- `fresh35-retirement-v2-projection.mjs`: derives the 35-table/152-routine source projection, mapping and expected metadata. It neither observes a35 target nor migrates existing data.
- `fresh35-retirement-v2-install-candidate.mjs`: produces a closed target proposal, separate source/lineage material and a constant refusal entry. Actual IDs remain null. No complete installer is returned.
- `fresh35-catalog-postconditions.mjs`: the existing V1 renderer accepts only its fixed original evidence. It must not be modified to accept the V2 analysis brand or an arbitrary caller approval.
- `fresh35-catalog-evidence-v2.mjs`: `loadReviewedFresh35EvidenceV2()` always throws `FRESH35_V2_REVIEWED_PROFILE_NOT_REGISTERED`.
- `fresh35-catalog-record-draft.mjs`: both installed-record loading and publishing always throw `FRESH35_DISTINCT_FIXED_RECORD_NOT_IMPLEMENTED`.
- `tools/unified-import/fresh35-host-session.mjs`: `openReviewedFresh35Host()` always throws `FRESH35_FIXED_RECORD_INSTALLER_AND_HOST_NOT_WIRED`; no old177/178 fallback exists.

## Offline code added separately

1. `fresh35-catalog-v2-guard-review.mjs`: genuine V2 analysis is reprojected into complete comparison expectations and review SQL. Its sole SQL begins with an unconditional refusal in the same DO block as all comparisons. There is no removal switch or separately exposed unblocked SQL, no profile registration and no installation path. GUC changes needed for deparsing occur only after the refusal and are unreachable. This prepares reviewable comparison logic; it is not an executable approved guard.
2. `fresh35-catalog-v2-schema-review.mjs`: a genuine V2 source-bound comparison context checks supplied dump text against the exact projection using the existing conservative canonicalizer. Equality means only schema-text agreement. A copy of the projection can compare equal, so all provenance/engine/admission fields stay false. It is not a substitute for controlled target capture or validation that SQL is valid.

These are distinct source cohorts from the earlier180-pin installation candidate. Their digests must never overwrite that candidate's frozen digest. Tests and independent code/data reviews are separate evidence, not upgrades to the safety state.

## Missing trusted V2 evidence/profile layer

A future explicitly versioned registry and loader need all of the following before they can return trusted evidence:

- The exact predecessor capture manifest, all required artifact hashes, before/after source binding and complete new implementation dependency closure.
- The actual capture identity, process/tool/snapshot/deparser context and trustworthy provenance for the captured outputs. A well-formed JSON claim, local checksum, private analysis brand or same-file reread cannot establish external execution authenticity.
- The applicable independent safety review of the precise evidence, source changes, role/ACL boundaries and intended installation actions. Code/data consistency review is not that review.
- Explicit treatment of incomplete evidence. The178 inventory has no standalone raw `pg_type` rows:70 expected composite/array relations can be derived from table declarations and graph edges, but uncaptured physical fields cannot be described as observed. New35 capture must collect the missing portable semantic and relevant raw fields.
- An authority mechanism that cannot be supplied by arbitrary caller JSON, an environment flag or a file that the same caller can edit. The current workspace's ability to write code is not a protected publisher authority. Do not chmod/ACL a directory or invent an issuer to simulate it.

Until those conditions are resolved, the reviewed loader remains the existing unconditional refusal. No amount of offline testing grants permission to bypass a platform denial or retry it through another tool.

## Missing physical-target guard and atomic installer

A future new versioned installer must bind the authorized new target's observed system identifier, database OID/name, owner, PostgreSQL version, endpoint and actor. Proposed IDs, copied predecessor IDs and plausible defaults are not observations. The ordinary owner must already have authorized access to every identity/catalog function used; a missing privilege must fail closed, not trigger automatic role grants or a switch to superuser installation.

It must independently pin the exact35 projection, restricted owner/controller mapping,27 lineage rows, metadata comparison code, target guard, runner and every loaded dependency. Recompute the actual source closure rather than assume the size of any earlier cohort.

The installation must directly create35 tables in a verified empty target. It must not create56 and then DROP21. Within one application transaction, before COMMIT, it must enforce:

- Exact35 tables and70 declared composite/array relationships, with all21 omitted table/type families absent.
- All152 complete function definitions, owner, ACL, security-definer/invoker semantics, return types and search-path settings.
- Exact relations/column order and attributes, declared types/defaults/generated expressions/collations, constraints, indexes, internal and external triggers, sequences and policies.
- Exact schema/column/relation/function ACL and default ACL, plus separately reviewed role/database permissions. A metadata equality check is not a test of effective role permissions.
- Exact lineage and empty business state, unsupported-object exclusion, and independently assessed static/dynamic dependencies. The predecessor's graph had no catalog edges for17 retained routines' old-table body references; zero predecessor edges cannot prove future dynamic closure.

Physical cluster/role/database creation is outside the application transaction. The complete process must not be called globally atomic. Capture an unambiguous transaction result and matching same-session receipt. Treat missing or uncertain COMMIT acknowledgement separately, stop and clean up, and do not automatically replay onto an uncertain target.

## Missing genuine target observation and acceptance

The old source-only collector preserves raw metadata but deliberately returns `catalogMetadataComplete=false` and unauthenticated observation. The new capture path must be separately reviewed and authorized, record the actual deparser settings and same exported snapshot, and collect complete functions, columns/types/collations/defaults, constraints, indexes, triggers, sequences, policies, ACL/default ACL, role/database state and dependencies. Raw OIDs/node-tree strings cannot simply be transplanted between clusters.

The schema-text comparator may then check the observed same-version dump, while the metadata guard checks the corresponding catalog. Both need actual independent execution/capture provenance. Synthetic text mutations prove rejection behavior only; they do not prove PostgreSQL parses or executes the guard.

The capture/runner must include all-path temporary-access revocation, individual credential cleanup, verified shutdown of only its own process, endpoint disappearance and the distinction between failure, unknown outcome and clean completion. An authorized178 capture does not authorize a new35 instance or import tests.

## Missing record publisher and import host

A genuine installation record needs the distinct35 profile/version, exact final source and SQL digests, trusted physical identity, real catalog/dump/ACL/dependency result, migration lineage, transaction receipt, review status and protected publishing authority. A generated source record draft is not a signed/protected installed record. A valid record format alone must never open the host.

The import host must verify the record and current target through the same exclusive physical client that will run imports, preserving the standard full-package contract, receipts/audit, replay/rollback and authorization behavior. It must not delegate to177/178 factories or treat a source-only match as runtime admission. While these pieces are absent, existing loaders, publisher and host remain closed.

Only after an independently valid target/profile/record/host exists can separately authorized synthetic whole-package and ordinary-business acceptance run. Cover historical mixed-sign SALE without changing its type/discount/source evidence, persistent settlement occurrence UUIDs, zero stock replay during import, later unapprove-anchor operations, repeat imports, rollback and ordinary sales/stock/settlement operations. None of those results currently exists for35, and real-data retirement remains a separate safety/migration task.
