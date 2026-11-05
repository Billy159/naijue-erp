# Core → history foreign-key replacement candidate

Status: source-only; not registered in an installer, not executed on PostgreSQL,
not approved for a populated database. Offline tests do not constitute engine or
final-combination acceptance. The existing installation and catalog profiles are
unchanged.

## Exact remaining edges

Migration 0024 adds seven direct foreign keys from ordinary core tables to old
history tables:

- `operation_receipt.target_history_sales_id` → `history_sales_header.id`.
- `operation_receipt.target_history_transfer_id` → `history_transfer_header.id`.
- `audit_change.object_history_sales_id` → `history_sales_header.id`.
- `audit_change.object_history_transfer_id` → `history_transfer_header.id`.
- `inventory_ledger.source_history_revision_id` → `history_revision.id`.
- `inventory_ledger.source_history_sales_line_id` → `history_sales_line.id`.
- `inventory_ledger.source_history_transfer_line_id` → `history_transfer_line.id`.

The first four are stored generated columns. Their generation binds only
`HISTORY_SALES` / `HISTORY_TRANSFER`; ordinary sales, transfers and imports produce
NULL. The first five FKs are deferred initially deferred. The two line FKs are
immediate. All seven are validated, MATCH SIMPLE, NO ACTION on update/delete.

## New empty direct-import target

`adapters/postgres/patches/0027_fresh_core_history_fk_successor.sql` is an explicit
candidate for the fresh direct ordinary-import path:

1. Require the original 56-table cohort and migration lineage 1–27, an ordinary
   schema owner, READ COMMITTED isolation, origin trigger behavior, no event triggers, enabled triggers
   and validated constraints. Lock every table before checking contents. Reject
   forced RLS, owner mismatch, and any populated business table, including all
   historical and import evidence tables. Every expected table must be a
   permanent ordinary heap, with no partition/inheritance boundary; foreign,
   partitioned, temporary or unlogged substitutes are refused. Schema migration
   rows are preserved. READ COMMITTED prevents a pre-lock snapshot from hiding
   concurrent rows committed before the exclusive locks were obtained.
2. Verify all seven precise predecessor edges and the four generated expressions.
   Unknown, missing, duplicated, changed-deferral, changed-action, unvalidated,
   inherited or extra core → legacy FKs stop the candidate.
3. Add **all seven validated `CHECK(column IS NULL)` constraints while every old
   FK still exists**. Check their actual catalog definitions and validation.
4. Only then remove precisely those seven FK constraints, in the same transaction.
   Preserve all columns/defaults and compare all unrelated constraints, routines,
   policies and triggers byte-for-byte as catalog JSON. Removing a FK naturally
   removes its own internal RI triggers; other triggers remain unchanged.
5. Require no remaining FK from any nonlegacy table in `naijue_erp` into the
   21-table legacy candidate set before commit.

This is a stronger guarantee, not a relaxed reference check: NULL satisfies the
old MATCH SIMPLE FK and the new check. Every non-NULL history ID now fails, even
one that exists in an old history table. No old history reference can enter the
core. The unchanged generated expressions close old historical receipt/audit
kinds; the existing ledger source checks plus NULL-only columns close historical
revision ledger entries. Ordinary provenance remains in ordinary document,
receipt/audit, `import_batch`, and `import_record` paths, not staged old tables.

The candidate adds no table, copies no rows, invents no identity, changes no
business fact, disables no guard and grants no access. It does not remove any
legacy physical table or historical validator. It leaves seven inert nullable
columns rather than silently changing the shared row types used by ordinary
validators. A later explicit clean-schema successor may remove those columns
only after all dependent definitions and column grants are accounted for.

## Existing populated databases are a different task

This candidate intentionally refuses a database containing any business data.
It must never be repurposed by omitting its emptiness gate, nulling historic IDs,
changing recorded target kinds, deleting historical receipts/audits/ledger rows,
or relaxing old FK/ledger constraints. Historical facts and evidence in an
existing database remain untouched. Preserving and converting such a database
requires a separate source-to-target identity/provenance mapping and exact
conservation/restore proof. No extra archive/bridge tables are proposed here.

## Read-only local evidence collector

`scripts/release/unified-install/legacy-core-fk-audit.mjs` exports
`collectCoreHistoryFkInventory(client, profile)` for an existing observer client
inside a caller-owned **read-only REPEATABLE READ** transaction with exactly
`search_path=pg_catalog, naijue_erp, pg_temp`. The caller must keep that client
exclusive throughout both read queries. A first SELECT uses only explicitly
qualified settings functions and refuses unsafe context before the catalog query. It does not open
a connection, change roles, manage a transaction, or install SQL. RLS-filtered
core rows are refused. It returns only catalog information and row/non-NULL
counts, not business row contents.

- `PREDECESSOR_WITH_HISTORY_FKS` requires exactly seven original FK shapes and no
  replacement checks. Four exact, enabled, internal `pg_catalog` RI triggers
  are required for each FK, including referenced-side actions. Existing
  historical-use counts are allowed and visible.
- `FRESH_ORDINARY_NULL_ONLY` requires zero core → legacy FKs, exactly seven
  validated inheritable NULL-only checks on permanent noninherited core heaps,
  unchanged generated expression semantics,
  and no non-NULL historical core values.

There is no auto-detect/admit mode. Missing or weaker checks, extra or missing
edges, duplicate evidence, altered defaults/generated expressions and invalid
transaction context fail closed. The result explicitly does **not** certify
complete retirement, installation admission, archival safety, or permission to
remove tables. It is one observation for the independent final catalog review.

## Final isolated PostgreSQL checks still required

The combined source must get its own reviewed catalog/install profile; do not
change an old profile to accept both old and new shapes. In an explicitly
approved disposable fresh target, test at least:

- Exact predecessor inventory, successful candidate installation, then exact
  successor inventory with zero direct core → legacy FKs.
- Standard full-package direct import and exact replay, including sales,
  transfers, provenance, baseline, explicit zero and unknown inventory, signed
  quantities, null dates and barcode identity. Verify every intended legacy
  table remains empty after import; this collector alone does not check that.
- Ordinary create/edit/approve/unapprove and settlement writes still succeed,
  preserve all facts/evidence, and never set one of the seven historical columns.
- Negative insertion of every non-NULL historical ledger column and both old
  historical receipt/audit target kinds fails. Verify the actual failing check
  or preserved validation, not merely a preceding permissions error.
- Populated-target refusal, unknown extra FK, missing/changed FK, changed generated
  expression, unvalidated constraint, disabled trigger, forced-RLS and owner
  mismatch all reject atomically. Before/after catalog and row digests must show
  no partial DDL or changed data after each failure.
- Unrelated FK/CHECK/audit reciprocity/ledger validation remain enforced. The old
  runtime catalog profile must reject the successor. Verify exact combined
  installation source hashes, final catalog, permissions, and stopped-target
  evidence independently.

A successful local test does not itself authorize production changes. Physical
35-table cleanup still requires removing the remaining function/composite-type
and other catalog dependencies after proving the full direct-import path and
preserving all original evidence. This seven-edge candidate is not that complete
cleanup.

## Offline verification

Run from the repository root:

```sh
node --test tests/legacy-core-fk-audit.test.mjs
```

Observed on 2026-11-04 with available Node v24.22.1: 10/10 offline protocol/source
and negative tests passed. No PostgreSQL, typecheck, full suite, Mac access,
production execution, data migration or table removal was performed.
