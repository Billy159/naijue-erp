# Source-only object disposition inventory

`FRESH35-DISPOSITION-SOURCE-MANIFEST.json` inventories the entire closed source
cohort:56 predecessor tables and177 pinned routine body contents, with exactly20
candidate replacements applied only in memory. All21 proposed retirement tables
have unresolved disposition and no DROP authority. The other35 are retain
candidates, not an approved final schema. Implemented final table count is null.

This is exhaustive for the enumerated source cohort, not an exhaustive PostgreSQL
dependency graph. The source generator and tests are
`fresh35-disposition-manifest.mjs` and `fresh35-disposition-manifest.test.mjs`.
All installation/approval flags remain false. No database, Mac, production,
existing SQL, installed profile or frozen handoff was modified.

## Remaining dependencies now made explicit

- 31 exact candidate routine bodies contain qualified lexical references to old
 tables. All routines have explicit unresolved disposition and reachability.
- 2 retained composite-input signatures still depend on old row types:
 `assert_native_product_season_source(import_source_row)` and
 `validate_exact_historical_customer_intent(native_party_import_evidence,import_batch)`.
- 5 routines retain `import_source_row` casts: barcode initialization, core
 initialization, native bootstrap accounts, header native reference and native
 party import commit. The bootstrap function is an additional cast holder beyond
 the four routines changed by the rowtype candidate.
- 0 legacy `%ROWTYPE` declarations remain in the transformed body cohort. This
 does not eliminate composite parameters, casts, reads or function dependencies.
- 179 literal source trigger declarations were found,119 on retained-table
 candidates. These include superseded declarations and miss some dynamic forms;
 they are not the final installed233-trigger catalogue.
- 8 source declarations on retained tables directly name legacy-referencing
 callees: sparse balance consistency; accounting checkpoint, baseline and final
 record consistency; history numeric ledger, receipt, balance and ledger-set
 guards. Each declaration records its source and hash. The manifest also computes
 lexical transitive callee candidates, without claiming those branches execute.

Every routine records exact body hash, origin source, lexical relation references,
composite inputs, casts, rowtypes, candidate callees and conditional-syntax presence.
Table entries link retirement-scoped relevant routines and source declarations.
`retirementScopedDirectRoutineMentions` deliberately scans only the21 retirement
candidates. Retained-table entries have empty arrays because they are outside
that scan, not because retained tables lack routine references. Every table
records this scope explicitly; it must not be used as an all-table dependency
index. Seven proposed FK
deltas remain separate from unknown engine dependencies and unknown data disposal.

## Required disposition review

For every proposed table retirement: resolve actual pg_depend edges, return/OUT
rowtypes, current trigger definitions, overloads, dynamic/unqualified references,
conditional and transitive reachability, data lineage and recovery. For core
triggers, preserve ordinary guards and audit/receipt evidence before specializing
historical paths. A lexical absence is never permission to delete or disable an
object. New placeholder records or unconditional validation success are not a
solution to unresolved evidence dependencies.

The exact catalogue/ACL, source/record profile, atomic install and isolated
engine install/import/rollback/replay/business evidence gates remain closed.
No manifest entry promotes source matching into runtime or deletion authority.

## Validation

Tests verify56/177/21 coverage, both composite signatures, all five casts,
remaining unknowns, lexical call/trigger links, immutable output, rejection of
manifest omissions/changed approval claims, forged reference manifests and missing
or changed body sources. The manifest validator requires a genuine in-process
reference and returns only a source diagnostic, never an admission capability.
The initial four-cast assertion failed and was corrected to five after inspecting
the full cohort; no source validation was weakened to conceal the extra cast.

Final combined source/record/disposition suite:65/65 tests passed under Node
v24.22.1. No typecheck, build, full suite, PostgreSQL or browser checks ran.
