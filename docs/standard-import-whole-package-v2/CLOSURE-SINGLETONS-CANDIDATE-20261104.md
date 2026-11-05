# Whole-package closure singleton candidate

Status: uninstalled source candidate, not admitted to any current install or runtime catalog. PostgreSQL parsing and execution are NOT RUN.

## Finding and bounded change

The current closure routine checks nondecreasing phase ranks, contiguous ordinals, matching immutable receipts/checkpoints and final publication. It does not independently count or require every lifecycle boundary, and does not compare child marker shape against the exact marker emitted by the kernel. Current writer guards may already prevent those states. This is defense-in-depth in committed receipt validation, not a demonstrated externally reachable corruption or exploit.

`adapters/postgres/patches/0027_standard_whole_closure_singletons_candidate.sql` contains a complete replacement of the real `standard_whole_package_closed_v2(uuid)` routine, not a fake implementation or wrapper returning success. It retains original receipt, source binding, count, batch and checkpoint predicates and adds:

- Exactly one baseline seal before any document phase.
- Exactly one document stage before document chunks or final publication.
- Exactly one final document publication; no trailing members.
- Exact two-field child marker shape: root UUID and numeric ordinal. Root marker remains separately checked under the existing rules; no new marker/data field is introduced.

MASTER, KEYS and DOCUMENTS chunks can repeat. Empty master/document datasets still permit the minimum lifecycle INIT → BASELINE_SEAL → DOCUMENT_STAGE → DOCUMENT_PUBLISH. Read-only committed inspection remains free of transaction-ID assignment, row locking and DML.

The candidate requires the exact installed predecessor routine body hash, matching function/schema owner and the already-hardened search path. It does not grant/revoke permissions or change tables, triggers, roles or existing migration files. Installation/runtime source pins intentionally remain unchanged and therefore do not admit this candidate.

## RED and GREEN evidence

The regression was first run against a candidate carrying the unchanged predecessor body: 2 passed, 2 failed (missing singleton invariants and exact child marker check). That log is `evidence/closure-singletons-red-20261104.log`.

After implementation, 33/33 targeted source/protocol tests passed. Log: `evidence/closure-singletons-green-20261104.log`.

```sh
node --test tests/whole-package-closure-successor-source.test.mjs tests/whole-package-kernel-source.test.mjs tests/unified-whole-package-sql-kernel.test.ts tests/unified-whole-search-path.test.mjs
```

The new `.mjs` test requires this explicit command; the root `.test.ts` glob does not select it. These source-shape assertions are not SQL semantic execution tests.

## Required before adoption

1. Independent SQL semantic/security review, including whether the original writer/immutable guards already make these new rejections unreachable.
2. A separately reviewed successor source/catalog cohort. Do not refresh pins automatically to make an existing gate pass; the existing frozen cohort is deliberately unchanged.
3. On a newly authorized isolated synthetic PostgreSQL target, compile the function and compare pre/post routine metadata, ACLs and trigger definitions. Verify unprivileged roles cannot install it and an unexpected predecessor aborts atomically.
4. Exercise valid minimal lifecycle, many master/key/document chunks, empty document dataset and ordinary read-only exact replay. Snapshot all business/audit/counter tables before and after failed transactions.
5. Exercise missing/duplicate baseline seal, missing/duplicate document stage, duplicate/trailing final publication, nonnumeric/extra-field child markers and substituted root markers. Normal wrappers should reject invalid programs first. If testing immutable-proof corruption directly requires bypassing write protection, that needs a separate explicitly authorized test-only fixture route, not weakened production guards.
6. Verify deferred root validation and explicit finish reject every reachable incomplete chain; observer must see no prefix before COMMIT and no residual state after ROLLBACK. A lost COMMIT acknowledgment remains UNKNOWN and requires same-key inspection on a fresh reviewed connection.

No database, user data, Mac, production, typecheck, installation or deployment was accessed or run here.
