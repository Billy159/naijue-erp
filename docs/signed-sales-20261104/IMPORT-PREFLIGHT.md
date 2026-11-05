# Historical signed sales: ordinary and streaming intake

## Version and scope

Base HEAD: `051bbe14a4cba4e1849b8547665f13df85dd8fe0`, branch `handoff/erp-unified-latest-20261102`, plus existing uncommitted work. This change does not replace or revert any earlier WIP. Only the shared historical-source predicate, ordinary relation validator, streaming relation validator, and focused parity tests changed in this workstream. No table, column, field declaration digest, enum, or migration version was changed.

The 2026-11-04 instruction supersedes the former requirement to split historical mixed SALE documents. A READY historical SALE remains one SALE with original number/type/date/status and each original signed line identity. Same-SKU opposite lines are not netted or merged. The separate old split-evidence utility is not invoked by these validators.

## Historical source boundary

The exception is restricted to SALE headers with `stock_basis=CUTOFF_HISTORY`, a nonempty `import_batch_id`, and original source references. The enclosing validators still require source references to resolve a manifest-pinned source digest, registry identities, complete row/file pins and inventory alignment. The discount exception additionally requires a negative original line. No free-form override flag is accepted.

This proves integrity of the declared standard package, not truth of original source values. Local Codex retains and verifies the actual original evidence. Unknown facts are not invented.

- Signed line amount remains exact quantity × nonnegative price.
- Original header gross and net must equal signed line sum and gross minus retained original discount.
- Original nonzero discount/rounding remains as declared. Existing null allocations stay null; no proportional distribution is guessed. If every allocation is known, their sum must equal the retained header discount. Known contradictions still block.
- No settlement rows on a historical SALE means missing evidence, not an inferred zero or settled state. No receipt/refund row or status is synthesized.
- Where historical settlement rows exist, approved RECEIVE minus REFUND must equal net due. Existing contradictory facts still block.
- This historical intake exception does not authorize approval after economic edits. Runtime approval must separately require known, balanced actual settlements.
- New runtime SALE remains positive-only; new mixed RETURN/EXCHANGE uses nonzero signed lines and zero header discount. Unbalanced DRAFT is retained; known unbalanced APPROVED is rejected.

## CLEANED boundary before the explicit successor

CLEANED excludes generated `stock_basis` and `import_batch_id`; therefore it cannot establish this historical exception. Both preflight implementations fail signed SALE closed in CLEANED. Do not infer historical status merely from source references or add forbidden generated fields. Current execution requires READY. This describes the original profiles only; the explicit source-only successor below now supports CLEANED preflight.

## Test order and evidence

1. New `tests/historical-signed-sale-preservation-preflight.test.mjs` was run before implementation: 8 tests, 5 passed and 3 failed. Failures demonstrated rejection of original nonzero discount with unknown allocations, nonzero discount with exact known original allocations, and absent historical settlements.
2. Implemented ordinary and streaming changes.
3. New tests plus original historical intake and streaming relation tests: 44/44 passed.
4. Existing package, full streaming preflight and stream document request tests: 97/97 passed.
5. Expanded new suite: 14/14 passed, including missing provenance rejection and identical CLEANED failure.

Node used: repository sibling runtime `tools/node-v24.21.0-linux-x64/bin/node`. Commands from repository root:

```
NODE=../erp-runtime-restored-20261102/tools/node-v24.21.0-linux-x64/bin/node
$NODE --test tests/historical-signed-sale-preservation-preflight.test.mjs
$NODE --test tests/historical-signed-sale-preservation-preflight.test.mjs tests/historical-signed-sale-intake.test.ts tests/unified-import-stream-relations.test.mjs
$NODE --test tests/unified-import-package.test.ts tests/unified-import-stream-preflight.test.mjs tests/unified-stream-document-requests.test.mjs
```

These execute real ordinary and disk/SQLite-backed streaming preflight over synthetic packages, not PostgreSQL and not browser tests. No typecheck, PG connection, installation, production import, or deployment was performed in this workstream.

## Local Codex acceptance

Use the final combined source version, not these files in isolation. In an authorized isolated PostgreSQL target, test a source-verified READY historical SALE with +1000 and −300 lines, retained discount 10, actual receipt 690, and unchanged nullable pricing/snapshots. Check formal receipt, original type/line identities, no inventory replay at import, independent source trace, and absent settlements remaining absent. Then verify the runtime unapprove/edit/save/reapprove workflow separately. Confirm amount mismatches reject with exact difference, idempotent retries do not duplicate effects, and any row/publication failure rolls back the complete transaction. Browser acceptance must also preserve both lines and original type. Neither PG nor browser acceptance is claimed by these preflight results.

## Resumption verification, 2026-11-04 03:49 UTC

After the executor reset, the current implementation was inspected without reverting WIP. Re-executed the second and third commands above on Node 24.21.0: 50/50 and 97/97 passed respectively, zero skips and zero failures. The difference from the earlier 44-case count is the expanded 14-case signed suite. Raw new output is retained in `evidence/import-resume-parity.log` and `evidence/import-resume-regression.log` beside this note. These are synthetic source-level and real SQLite streaming checks, not PostgreSQL verification.

The earlier RED count above is the previous workstream record. This resumption did not locate or independently verify its raw RED output and did not rerun an intentionally reverted implementation. Do not treat the fresh GREEN logs as a replacement for that missing artifact. The READY request materializer was also inspected: it retains indexed fields and source references without normalizing signed rows or manufacturing settlements. Formal PostgreSQL acceptance remains unverified.


## Explicit source-only profile, 2026-11-04 04:06 UTC

`contract-schema --profile historical-sales-source-v1` exports declaration SHA-256 `89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e`. It extends the existing staff-departure profile by making the existing sales_header.stock_basis field explicit source input in CLEANED. It adds no table, column, envelope flag or business type. All previous profiles and hashes remain unchanged. Source references must still resolve pinned original locations; a classification or hash is not independent proof of truth. Local Codex must make the classification from retained original evidence, not infer it from a date or mere existence of source references.

CLEANED in this profile must explicitly declare CUTOFF_HISTORY or RUNTIME_LEDGER; only the former permits original signed SALE facts. import_batch_id and other generated fields remain forbidden. READY has the same field set as the preceding staff profile and still requires batch identity. Ordinary and streaming preflight share this decision. Missing classification, forbidden generated fields, runtime classification and missing/unpinned original references fail closed.

This profile is **offline preflight only**. Common buildUnifiedImportPlan, whole-package compiler and stream preparation explicitly reject it before producing an executable program. Do not silently replace its hash with an older one. The separately reviewed READY package can still explicitly use an existing compatible profile; it is a distinct package with its own frozen manifest, not a disguised new-profile execution.

A separate SQL source candidate, `adapters/postgres/patches/0027_historical_sales_source_profile_successor.sql`, preserves the original SQL file and requires exact predecessor function body SHA `0d0547318a5a940639f288a73f08ebd9396b079b0c88810b7fa016870652d840`. It changes exactly four profile-selection anchors (admission, numeric FIT, staff departure and exact field list), with successor body SHA `febd7953e7e14ffb5c7ed84705c02d71e152ec765db8bad12b132a574649b4f8`. It checks all other pg_proc metadata unchanged and requires hardened search_path. It is not installed, PostgreSQL-parsed, or an acceptance result; compiler gates remain closed.

**Known SQL semantic blocker:** migration0027 validate_sales_settlement currently coalesces absent settlement rows to zero and rejects approved nonzero net before validating MIGRATE_DOCUMENT. Merely accepting a profile hash cannot solve this mismatch. A separate exact migration/retained-fact successor and runtime restoration proof must be integrated and tested before missing historical settlements can be claimed accepted by the real database.

New retained evidence: `evidence/import-cleaned-profile-RED.log` records 18 tests with 14 pass / 4 fail before profile implementation. `evidence/import-source-only-RED.log` demonstrates the initially missing executable-program gate; `evidence/import-source-only-GREEN.log` records 23/23 after all three gates. `evidence/import-profile-sql-source-RED.log` and `evidence/import-profile-sql-source-GREEN.log` are source candidate creation checks only, not PostgreSQL tests. Existing original eight-test RED artifact remains separately unverified; none of these new logs substitutes for it.

## Missing-settlement SQL candidate, 2026-11-04 04:09 UTC

`adapters/postgres/patches/0027_historical_missing_settlement_successor.sql` is a separate, uninstalled source candidate. It requires validate_sales_settlement predecessor body SHA `149111d2da2a62f37a65578f76af7fddc156bbf3e8797e13c653d8481d294b21` and unchanged assert_document_migration proof body SHA `2bed9652283f7bd640c45e16f5ac820369022f249da60678123271a649c2a9c8`. Proposed successor body SHA is `fc876ce73e260cd690205d1297cbac71649ae4b2fb81d88784d260e1e2ff1f86`.

It counts settlement rows separately from the numeric sum. Only MIGRATE_DOCUMENT invokes the full original snapshot/source/baseline/actor/version/receipt/no-stock-effect proof before considering absence. The exception then requires original SALE, CUTOFF_HISTORY, zero actual settlement rows and an exactly empty settlement array in the verified migration snapshot. Existing nonempty contradictory settlement rows still reject. No row, zero record, status, receipt or refund is manufactured. DRAFT behavior and normal approval balance checks remain unchanged.

**Still unfinished:** ordinary unchanged-history reapproval with missing settlements needs its own independently verified SQL audit chain. The application retained-approval capability does not constitute database proof, and this patch does not weaken ordinary approval. In particular, local acceptance must distinguish exact restoration from economic edits, and verify missing-settlement restoration, known mismatch rejection, forged migration evidence rejection, original import with no stock replay, idempotence and full rollback. Do not claim the entire historical lifecycle is database-ready from this candidate.

A current affected-source regression run passed 180/180 (`evidence/import-cleaned-profile-final-GREEN.log`). The separate missing-settlement SQL source test passed 1/1, with its initial missing-file RED in `evidence/import-missing-settlement-sql-RED.log`; these prove source construction/pins and expected guards only. PostgreSQL parser, trigger timing, privileges, transaction execution and browser behavior are all unverified.

The exact CLI-exported source declaration is supplied as `historical-sales-source-v1.schema.json`. This export and preflight acceptance are not SQL execution admission. Both SQL candidates explicitly reject NULL/missing hardened search-path metadata. After this hardening, the candidate file SHA-256 values are `4dafd8ec9c64d7ac99f659711e50b27e4c7aacd30db3dc9897b19d886ba49e96` (profile) and `a0464dbeb0764c371319c2d8230ddb75eb89a00a607fa0ff15d77864fef910ea` (missing settlements). Their combined source checks passed 2/2 in `evidence/import-sql-successors-final-source-GREEN.log`. These file hashes differ from function-body pins intentionally.

Source-check implementation note: the first profile-candidate source test used JavaScript string replacement, which interprets `$` sequences inside the SQL regex text. That test utility incorrectly duplicated text and reported an anchor count of 2. It was corrected to literal split/join replacement, matching PostgreSQL replace semantics; SQL candidate body construction itself used literal replacement. This was a source-test harness failure, not a PostgreSQL run. The original missing-file RED and later successful outputs remain separately labeled. The missing-settlement guard additionally uses `IS NOT TRUE` so a nullable exception result cannot bypass approval.

Independent source review at 2026-11-04 04:14 UTC reported no further source-logic blocker after the NULL hardening. It verified all four profile replacements and body hashes, complete pg_proc-minus-prosrc invariance, pinned exact migration snapshot ordering, and strict known-mismatch/ordinary-approval behavior. Its pinned Node24.21.0 selection passed 31/31. This is an independent source review result only; PostgreSQL parsing, live execution, final installer integration and missing-data ordinary restoration remain unfinished.
