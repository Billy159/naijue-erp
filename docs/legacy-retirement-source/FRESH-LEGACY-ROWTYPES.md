# Fresh-target legacy row-variable candidate

This is a source-only candidate, not an installed or engine-tested migration.
It removes all **11 remaining declaration-time legacy `%ROWTYPE` bindings** in
the pinned whole177 source cohort. It does not remove the corresponding table
reads, typed casts, two composite-input signatures, any table, or any data.
The existing installed-profile definitions and body pins are unchanged.

## Actual change

`fresh27-legacy-rowtypes.mjs` pins nine original SQL source files and the exact
before/after body hash of each of eleven routines. It renders
`0027_fresh_legacy_rowtypes_successor.sql`. Each body changes exactly one
`variable naijue_erp.legacy_table%ROWTYPE` declaration to `variable record`.
Everything following the outer `BEGIN`, including historical validation, native
identity, immutable source, audit, receipt, actor/time and decimal checks, stays
byte-for-byte identical. No placeholder row, fake source, new table/type, or
relaxed historical proof is introduced.

Affected routines:

- `assert_barcode_scheme_initialization_v19(uuid,uuid)`
- `assert_core_initialization_v14(uuid,uuid,bool)`
- `guard_header_native_reference()`
- `guard_history_insert()`
- `guard_native_catalogue_binding()`
- `guard_native_payment_binding()`
- `history_effective_writes_closed()`
- `validate_history_closure_commit()`
- `validate_history_numeric_balance_commit()`
- `validate_history_product_proofs(uuid)`
- `validate_native_party_import_commit()`

Ten changed variables are assigned a complete row by `SELECT * INTO STRICT`
before field access. The product-proof variable is assigned by a `FOR ... IN
SELECT *` loop before any use in its loop body. None is passed as a whole
argument to a named application routine. The strict source assignments and
original control flow are retained. This is source evidence about the changes;
PostgreSQL compilation and behavior still require isolated engine acceptance.

`LEGACY-ROWTYPE-CANDIDATE.json` records source hashes and the eleven replacement
pins. It is a reproducible source manifest, **not** a reviewed database catalog
or installation/admission capability.

## Installation safety and composition

The optional SQL refuses a populated target. It requires the exact 56 permanent,
nonpartitioned predecessor tables, versions 1–27, 177 routines, validated
constraints, origin-enabled triggers, no event triggers, and an ordinary schema
owner with visible ownership of all tables. It refuses forced RLS and requires
read committed isolation. It locks every table before checking emptiness, so a
row committed while waiting for a lock cannot hide behind an old snapshot.
Only `schema_migration` may contain rows.

All eleven predecessors and their exact function metadata are checked before
any replacement. Each replacement preserves its OID and all `pg_proc` fields
other than `prosrc`, including arguments, owner, ACL, security mode, language,
return type, search path and volatility. Final checks preserve all other routine
bodies/metadata and the entire trigger catalog. Preserving an ACL does not
independently approve the ACL. An exclusive reviewed schema-writer window and a
separate exact successor catalog/permission profile remain mandatory.

This candidate is absent from `WHOLE_INSTALL_PATCHES`; old profiles continue to
pin the old bodies and therefore must reject this successor. Embedded legacy
body-hash capability checks are deliberately not weakened. They require an
explicit successor decision in any final composition.

There is no overlap with the nine publication-isolation replacements. There
**is** overlap with the older single balance RECORD candidate: the balance
routine has the same successor hash,
`e7c3b1082f5c5fd5b6634c8db26df08af2e6e7296a7297a5b1af28aa76e6d703`.
Do not install both candidates in sequence; each requires the same predecessor.
This file is not registered in the fresh35 route by this change.

## Remaining actual dependencies

The in-memory final177 source audit confirms zero candidate `%ROWTYPE`
declarations after the eleven transformations, but it still reports the same
41 routines with other legacy lexical references. That result is deliberately
not represented as full legacy removal.

The two composite-input functions remain:

- `assert_native_product_season_source(naijue_erp.import_source_row)`
- `validate_exact_historical_customer_intent(naijue_erp.native_party_import_evidence,naijue_erp.import_batch)`

These are public SQL signatures rather than local declarations. Changing an
argument type is not an OID-preserving `CREATE OR REPLACE FUNCTION` body change.
The source trigger supplies `NEW` to the product-season validator, and the
native-party intent trigger supplies `NEW,b` to the customer validator. A future
fresh-only retirement must reconcile their callers, trigger reachability,
function/ACL cohort and internal body pins together. Replacing them with an
unconditional success function or a generic unchecked JSON/record input would
weaken their guarantees and is not done here.

Four of the changed routines also retain explicit
`jsonb_populate_record(NULL::naijue_erp.import_source_row, ...)` casts. Their
source-snapshot validation is preserved, not silently dropped or relabeled as
record-only. Historical relation queries likewise remain. Physical retirement
requires a separately reviewed direct35 schema, complete dependency closure,
and preserved evidence/identity handling, followed by isolated installation,
rollback/replay and ordinary-business acceptance.

## Offline checks

Executed with available Node v24.22.1 (project requests v24.21.0):

```sh
node --test tests/fresh-legacy-rowtypes-source.test.mjs \
  tests/legacy-dependency-source-report.test.mjs \
  tests/history-balance-rowtype-successor-source.test.ts \
  tests/publication-legacy-isolation-source.test.mjs \
  tests/legacy-core-fk-audit.test.mjs
```

Result: **45/45 passed**, including all eight new focused tests. The tests verify
exact reversible declaration-only changes, pre-use record initialization,
full177 final-source reconstruction, remaining composite-signature reporting,
source-drift refusal, generated SQL reproducibility, fresh-empty/owner/locking
gates, metadata preservation, overlap and old-profile rejection.

No PostgreSQL, typecheck, full suite, Mac access, production access or table
retirement was performed. Independent source review remains pending.
