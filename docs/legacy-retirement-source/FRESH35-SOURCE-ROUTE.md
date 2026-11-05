# Fresh 35-table source route: blocked before installation

This is an opt-in source selection and prerequisite check, **not an installer**.
No PostgreSQL connection or DDL has been executed. Existing installed profiles,
source pins and the 11:12 handoff snapshot are unchanged. No table was removed.

## What is integrated

`scripts/release/unified-install/fresh35-source-route.mjs` exposes a separately
named `FRESH35_ORDINARY_EMPTY_SOURCE_ONLY_V1` route. Omitting route selection
preserves the existing route. Unknown selections and caller-supplied claims of
catalogue approval or readiness are rejected.

The route validates the exact 70 inputs listed in `fresh35-source-pins.json`:

1. Existing 48-source Fresh27 baseline, 17 whole-package successors and two
   permission companions (67 inputs total).
2. Fresh-only publication and party specialization: nine exact body successors.
3. Seven core-to-history FK replacements, each with a validated NULL-only check.
4. The isolated historical balance rowtype candidate, still requiring embedded
   body-pin reconciliation. It is not silently included in the existing route.

These are **review stages**, not commands to concatenate or run. The source
receipt includes exact ordered hashes, nine predecessor/successor body pairs,
56-table empty predecessor requirements, and the desired (not implemented)
35-table target. No executable SQL bundle is emitted. `runFresh35Install()`
throws `FRESH35_INSTALL_PREREQUISITES_UNIMPLEMENTED` before accessing any client.
A valid source hash proves only byte identity, not safe installation or data.

## Why the current candidates must not just be appended

- The existing whole catalogue gate expects its own 177-routine, 56-table
  profile. Nine body changes and seven FK replacements change that profile.
  Its rejection must remain intact, not be weakened into accepting both shapes.
- Candidate SQL files each contain their own BEGIN/COMMIT. Concatenating them
  cannot provide atomic installation: failure of a later candidate could leave
  an earlier candidate committed. A combined wrapper must preserve every check,
  use READ COMMITTED before locks, and hold the exclusive schema-writer window.
- The fresh publication and FK candidates require all 56 predecessor tables to
  be empty except schema_migration. They cannot be applied after importing
  business data and are not migrations for an existing populated database.
- Removing seven incoming FKs and nine function-body fallbacks does not remove
  the remaining legacy routine, trigger, composite-type and embedded hash
  dependencies. The rowtype candidate is only one such dependency and preserves
  its historical branch; it does not establish absence of legacy reads.
- The fresh source route deliberately does not remove the 21 old tables or
  register changed catalogue/ACL expectations from an observed target.

## Remaining implementation before a runnable delivery

1. Define the exact final 35-table DDL and account for every retained/dropped
   routine/type/trigger dependency. Preserve ordinary inventory, receipt/audit
   reciprocity, source identity, unknown facts and import reconciliation checks.
2. Produce a distinct reviewed final catalogue and permissions profile, and
   reconcile capability validators and embedded function-body pins. Historical
   and previously installed profiles must continue rejecting successor shapes.
3. Implement the atomic installation wrapper with the existing emptiness,
   owner, replication, row visibility, enabled guard, exact predecessor and
   before/after conservation checks. No default path may select this profile.
4. In a specifically authorized isolated fresh database, verify successful
   installation and a complete standard-package import; failure and publication
   failure rollback; repeat import; known zero versus unknown stock; original
   document IDs and payment evidence; ordinary sales/returns/transfers and
   barcode flows. Prove no runtime/import dependency on the removed tables.
5. Freeze the exact combined source and installation evidence. Until then the
   source route must remain non-executable; it must not be represented as a
   local-ready direct-import installer or as final 35-table acceptance.

## Offline verification

`node --test tests/fresh35-source-route.test.mjs` passed 7/7 source-only tests on
2026-11-04. The tamper test independently changes each of the 70 input files in
memory and verifies refusal. Tests also cover missing/extra/reordered sources,
unknown routes, forged source tokens, false readiness claims and no client
access on installation attempts. This is not PostgreSQL, browser, typecheck,
full-suite, performance, or production acceptance.

## Concrete partial catalogue and atomic composition

`fresh35-catalog-candidate.mjs` now implements source-derived expectations for
**the intermediate fresh56 publication9 + FK7 state**, not a full35 catalogue:

- Derives nine exact successor function-body hashes only if their predecessor
  hashes match the current 177-function source catalogue. The other 168 hashes,
  signatures and search-path metadata stay exact; old catalogue objects are not
  mutated or registered as accepting new bodies.
- Records the seven named FK removals and corresponding validated NULL-only
  checks, with unchanged columns, policies, relation ACL and routine ACL required.
  These are expected changes, not observed or independently approved metadata.
- Builds one READ COMMITTED transaction containing both byte-pinned candidate
  bodies, removing only their exact outer transaction statements. It retains
  both candidates' prerequisite and before/after conservation checks.
- The generated review SQL begins with an unconditional exception before either
  candidate changes anything. There is no caller switch to suppress it. The
  missing authority must be implemented and reviewed in a successor, not supplied
  as a self-attested flag or bypassed by editing a generated file.

The new source test persistently checks that the first67 route pins remain
aligned with the actual existing installer registry. Four additional catalogue
and atomic-source tests cover exact nine-body deltas, wrong predecessors,
unknown routines, single outer transaction, retained guards and altered-source
refusal. The combined route/candidate suite is12/12 passing offline. Rowtype
retirement, final physical35 shape and live PostgreSQL checks remain excluded.
