# Legacy dependency source review

This is a read-only, offline review tool and a 2026-11-04 source snapshot of the
current WIP. It does not change SQL, install the balance RECORD candidate, connect
to PostgreSQL, inspect production, authorize removal, or prove runtime behavior.
The original 21-table candidate list is a planning list, not an approved DROP
list. `import_batch` and `import_record` remain outside that list.

## What improved

`scripts/release/unified-install/legacy-dependency-source-report.mjs` resolves the
ordered fresh/whole installation sources to their last literal routine
definitions and requires their 177 signatures and body hashes to match the
existing catalog specification. Full signatures keep overloads distinct. It
refuses missing, extra, duplicate-pinned, reordered/stale or body-mismatched
definitions. SQL source bytes are checked against the source specification, and
the specification is reread after collection to detect drift.

Outer-statement scanning skips comments and quoted/dollar text, so a commented
definition cannot satisfy a routine pin. Unmodeled literal DROP/ALTER routine or
schema statements are rejected. Source49's existing EXECUTE-carried replacement
is supported only at its exact immutable path and SHA-256; arbitrary DO blocks
and SQL strings cannot introduce extracted routines. This is still source
inspection, not verification of the database's final routine cohort.

This avoids counting old declarations that later successors replaced. For
example, `guard_history_numeric_ledger()` currently comes from
`0026-history-revision-set-guards-successor.sql`, uses an integer variable, and
does not retain its original `history_revision%ROWTYPE` declaration. Its
conditional historical relation read remains. The statement-level history guard
also retains its mixed/historical validation branch.

The checked snapshot contains:

- 41 final routines with a qualified lexical body mention or legacy composite
  argument from the candidate table list.
- 11 routines with lexical `%ROWTYPE` references to candidate tables. These are
  not all ordinary-runtime reachable; several belong to initialization, legacy
  import or historical write paths.
- 2 routines whose input signatures name legacy composite types:
  `assert_native_product_season_source(naijue_erp.import_source_row)` and
  `validate_exact_historical_customer_intent(naijue_erp.native_party_import_evidence,naijue_erp.import_batch)`.
  A body-only grep would miss an argument dependency without a body mention.
- `validate_history_numeric_balance_commit()` still pinned to predecessor body
  `fab0bf7a3f1681d6034b09dbb5c7ad8efa606c6fa82f24fc101bc5b70636a837`, with its
  `history_revision%ROWTYPE` declaration. The separate RECORD candidate changes
  that declaration only and still reads the historical relation in its history
  branch. It remains absent from the installation list and accepted catalog.

`DEPENDENCY-SOURCE-SNAPSHOT.json` records the report code hash, ordered SQL input
hashes, source-specification hash, and each matching final routine's source/body
hash. It is an observation of this WIP, not an independent reviewed catalog
reference. Regenerate it after source changes rather than treating this snapshot
as evidence about a later tree.

## Reproduce

From the repository root:

```sh
node scripts/release/unified-install/legacy-dependency-source-report.mjs
node --test tests/legacy-dependency-source-report.test.mjs \
  tests/history-balance-rowtype-successor-source.test.ts \
  tests/unified-whole-search-path.test.mjs \
  tests/unified-whole-catalog-gate.test.mjs \
  tests/runtime27-known-balance-source.test.ts \
  tests/runtime27-known-balance-render.test.mjs \
  tests/unified-live-history-dispatch-source.test.ts
```

Observed result after review fixes: 39/39 offline tests passed under available Node v24.22.1. No
typecheck, full suite, exact-version historical oracle, PostgreSQL, production,
Mac access or guard relaxation was performed. This is not a full validation pass.

## Remaining boundary

The extractor is deliberately narrow and hash-checked, not a PostgreSQL parser.
Qualified body mentions can include comments/literals; unqualified or dynamically
assembled names can be missed. Apart from the exact Source49 carrier, dynamic
DDL is not interpreted. Return and OUT composite types are not enumerated.
It does not enumerate actual FK/catalog
dependencies, prove trigger reachability, or verify branch execution, permissions,
archive recovery or rollback. An empty list never makes a table safe to remove.

Promotion of the balance candidate still needs a separate exact successor
profile, preserved old-profile rejection, installation-order/catalog review and
separately authorized isolated engine tests. Physical retirement additionally
needs the approved table-by-table disposition, data/identity preservation,
backup/restore evidence and target-specific authorization. None is inferred by
this source audit.
