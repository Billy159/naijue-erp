# Three-candidate combined review, not an installer

The new `scripts/release/unified-install/fresh56-combined-candidate.mjs` is a
separate source-only review. It leaves the existing fresh35 route, all original
pins, installed profiles, registry and SQL files unchanged. No database or Mac
was accessed, no SQL executed, no production action taken and no table removed.

## Closed source-composition gap

The previous review combined publication9 and FK7, while its source route still
listed the older single balance-rowtype candidate. The newer eleven-rowtype
candidate changes that same balance function from the same predecessor to the
same successor. Appending both would fail the second predecessor check.

This review selects exactly three pinned candidates: publication9, FK7 and
rowtype11. The old balance-only candidate is explicitly superseded in this
review, not executed or unregistered from its old route. The combined pin set
contains exactly 20 disjoint body successors and 157 unchanged routine pins.
All signature/search-path pin metadata and seven FK replacement descriptions
remain exact. Table count remains 56; this is not final35.

The renderer removes only each exact byte-pinned outer BEGIN/COMMIT wrapper,
then places all three bodies inside one READ COMMITTED transaction. All original
checks are retained. An unconditional `FRESH56_COMBINED_REVIEW_ONLY` exception
occurs before any candidate mutation; no caller flag disables it. The separate
install entry point always refuses before accessing caller arguments.

## Explicit remaining conflicts

A lexical scan of the first67 installation inputs plus
`adapters/postgres/src/native-import-accounting-capability.ts` records old body
pins in 13 files, with each file's exact hash. The whole-package search-path
profile contains all20 old pins; native-import accounting contains11. These are
not rewritten, accepted as alternatives, or marked reconciled. The scan includes
superseded definitions and literals and is not a final-function call graph or
proof that every occurrence is runtime reachable.

Two composite-input signatures, typed source-row casts, legacy relation reads,
capability validators, exact successor catalogue and ACL approval, final35 DDL,
exclusive schema-writer coordination and isolated install/import/rollback/replay
and ordinary-business tests remain open. The generated catalogue is a source
expectation only, not observed engine evidence or target admission.

## Verification

RED: the new test initially failed with ERR_MODULE_NOT_FOUND before the module
was implemented. GREEN: 44/44 source-only tests passed under Node v24.22.1:

```
node --test tests/fresh56-combined-candidate.test.mjs \
 tests/fresh35-catalog-candidate.test.mjs tests/fresh35-source-route.test.mjs \
 tests/fresh-legacy-rowtypes-source.test.mjs tests/legacy-core-fk-audit.test.mjs \
 tests/publication-legacy-isolation-source.test.mjs
```

The six new tests cover exact pin deltas, overlap and predecessor rejection,
unresolved conflict reporting, one blocked transaction retaining all gates,
argument-unobserving install refusal and a real loader rejecting a modified
rowtype SQL copy. Existing source-route and predecessor rejection tests remain
green. No typecheck, build, full suite, PostgreSQL or browser verification ran.
