# Immutable initializer to published batch closure

Status: real SQL successor source, not installed, parsed or executed in PostgreSQL. Independent review requested. Existing gates remain closed.

## Exact gap

The existing final closure checks each batch's checkpoint against the retained chain, counts against that checkpoint's expected map, and source name/hash against INIT. It does not independently bind every batch's manifest reference, cutoff timestamp, mode/mapping profile, creation/publication timestamps and expected-counter map to immutable INIT.

The writer already establishes those values under its existing guards. This change adds independent receipt/readback closure proof. It is defense-in-depth, not a demonstrated reachable write bypass or corrupt-data exploit.

## Implemented SQL

`adapters/postgres/patches/0027_standard_whole_closure_batch_binding_candidate.sql` replaces the complete real closed_v2 routine only after verifying the exact reviewed singleton predecessor body hash, function/schema owner and hardened search path. It preserves every existing singleton, marker, receipt, checkpoint and published-batch predicate verbatim, and adds:

- source_manifest_ref equals INIT.payload.manifest_ref.
- cutoff_at equals INIT.cutoff_at as timestamptz.
- Baseline mapping/mode is STANDARD_INITIAL_EXPLICIT_KEYS_V1 / CUTOFF_STOCK_BASELINE.
- Document mapping/mode is DOCUMENT_CONVERSION_V1 / DOCUMENT_CONVERSION.
- Both batch creation and completion timestamps equal the root receipt completion timestamp, matching the existing single-transaction writer's transaction_timestamp usage.
- Final expected counters equal INIT.payload.expected for baseline or INIT.payload.expected_documents for documents.

All comparisons are null-safe IS DISTINCT FROM. The new checks perform no DML, row locks or transaction-ID assignment, preserving read-only committed inspection. They do not re-read mutable current document values or rewrite source data.

## Validation

Against the unchanged predecessor-copy body, the new suite passed 2 tests and failed the expected missing immutable-binding test. After implementation, 32/32 targeted source tests passed:

```sh
node --test tests/whole-package-batch-closure-candidate.test.mjs tests/whole-package-closure-successor-source.test.mjs tests/whole-package-closure-integration-candidate.test.mjs tests/whole-package-kernel-source.test.mjs
```

Logs: evidence/batch-closure-red-20261104.log and evidence/batch-closure-green-20261104.log. These source assertions are not PostgreSQL semantic acceptance; .mjs suites need the explicit command.

## Remaining integration gates

The previously generated singleton integration artifact remains frozen and does not include this new candidate. Neither current access pins nor runtime/catalog installation records admit this body. Do not apply it and then treat old verification as clearance. Adoption requires independent semantic review, a separately reviewed combined source/access/catalog successor, appropriate target/permission authorization, and real isolated engine tests including valid full import, read-only replay, direct COMMIT enforcement and corruption rejection through an explicitly authorized test-only fixture route. Original permission gates must not be loosened to manufacture those fixtures.

No database, Mac, user data, full typecheck, production or installation action occurred.
