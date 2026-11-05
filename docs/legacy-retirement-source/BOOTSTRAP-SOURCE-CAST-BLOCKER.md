# Bootstrap source-row cast: no semantics-preserving successor established

## Exact finding

`assert_native_bootstrap_accounts(uuid)` currently comes from
`0026-v14-core-initialization.sql`, with body SHA256
`171c59ba962a287dd02bb9eac993512e114783a470063108a07ba5e206cbabca`.
Its127-line body is unchanged. The current whole177 profile pins this body.
The disposition manifest's source-level callers are
`assert_core_initialization_v14(uuid,uuid,bool)` and
`validate_native_party_import_commit()`; runtime reachability is not established.

The cast normalizes `e.source_snapshot` using
`jsonb_populate_record(NULL::naijue_erp.import_source_row, e.source_snapshot)`
and compares its JSON form with the actual locked source row. The schema defines
12 fields: id/batch_id UUIDs; entity_type/source_key/file_ref/sheet text; row_no
bigint; source_file_sha256/row_sha256 text; and raw_fields/normalized_fields/
field_provenance JSONB. The function also directly joins import_source_row with
native_party_import_evidence, locks both rows and validates current transaction
creation. Eliminating only the cast cannot eliminate these relation dependencies.

## Historical authorization that must remain exact

The retained proof version is NATIVE_BOOTSTRAP_ACCOUNTS_PROOF_V1 with EXACT26
profile, despite the containing batch's V2_HISTORY_NULLABLE_1 mapping. It enforces
49 accounts,45 original employee links,4 explicitly approved current-person links,
complete independent authority/source/command digest bindings, first fresh STAGE
or CORE transaction, actual fresh staff/account rows, no duplicates or adopted
accounts, no session/stock side effects, and one exact audit/receipt with reviewed
ADMIN actor and timestamps. Neither mapping nor proof version authorizes a
replacement that guesses identity or weakens source normalization.

## Why no SQL successor was added

- Raw JSON equality is not demonstrated equivalent to typed record normalization
  for UUID/bigint conversions, absent/extra fields, JSON versus SQL null, invalid
  scalar/array inputs or conversion errors. Stricter or looser behavior would be
  a contract change, not an exact preservation claim.
- Populating an existing actual row instead of a NULL row would potentially fill
  omitted fields from real data, changing what source evidence is required.
- A proposed explicit12-field `jsonb_to_record` expression could remove the named
  rowtype dependency, but requires engine equivalence tests covering all above
  cases and exact row shape. No such evidence exists here. It would still retain
  both historical relation reads and therefore not enable final35 retirement.
- Removing/skipping the function or its historical branches requires a coordinated
  caller/trigger disposition and proof that the retained historical contract is
  preserved in its own profile. That has not been established or implemented.

This is an evidence/design blocker, not a tool denial. No installation was
attempted and there is no uncertain external action. The safe next step is to
review the caller/profile disposition and prepare separately authorized isolated
engine equivalence tests before choosing a normalization successor. Existing
V1 historical and current source profiles remain exact and fail closed.

## Regression boundary

New `bootstrap-source-cast-boundary.test.mjs` checks the original body/catalogue
pin, required typed source comparison/locking, V1 proof identity and closure/
receipt/actor guards. These are source regressions, not behavioral equivalence.
No successor candidate was created, so there is no successor RED/GREEN claim.
No existing code, SQL, install registry, database, production, Mac or frozen
handoff was changed.
