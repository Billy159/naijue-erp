# Fresh-target publication and party isolation candidate

This is a **source-only, fresh-empty-target specialization**, not an installed
upgrade and not a claim that the final 35-core target has passed PostgreSQL.
It changes nine existing routine bodies, adds no table or function, and does not
change any trigger, role, privilege, business row, historical fact, or evidence.
The original migration and whole-package files remain unchanged.

## Scope and outcome

The selected whole-package predecessor still has seven publication guards whose
historical tails mention `import_source_row`, historical typed rows, native
reference/binding evidence and accounting/closure relations. Its
`is_native_party_import_insert(text,jsonb)` falls through to
`native_party_import_evidence` for ordinary nonstandard party calls. Its
`is_exact_historical_customer_only(uuid)` proves two pinned customer identities
through three old evidence tables.

The candidate produces these nine bodies without a reference or composite
binding to any of the 21 legacy retirement candidate tables:

- `guard_history_publication()`
- `guard_header_native_reference_publication()`
- `guard_native_catalogue_publication()`
- `guard_native_payment_publication()`
- `guard_history_typed_publication()`
- `guard_import_accounting_publication()`
- `guard_successor_publication26()`
- `is_native_party_import_insert(text,jsonb)`
- `is_exact_historical_customer_only(uuid)`

The first eight keep their entire `STANDARD27_BRANCH_BEGIN` through
`STANDARD27_BRANCH_END` prefix byte-for-byte, including source/receipt/audit,
actor, hash, exact pointer, current-transaction, row, phase and document checks.
The publication fallback now only admits the explicit standard baseline shape,
with null historical metadata and a real protected initializer/importer role.
A document conversion that did not satisfy its full standard branch is rejected,
not routed to an old-source existence query. Initializer and importer use their
respective tokenless role validation modes; `INSPECT(NULL)` is deliberately not
used because importer inspection otherwise requires authentication.

For ordinary parties, false from the import predicate leaves the original live
CREATE/EDIT receipt, actor, time and version checks active. It is not an approval
of a row. Legacy party-import intent cannot authorize a new row in this profile.
Historical unknown timestamps in a valid standard source package still pass
through the unchanged standard branch; the candidate invents no timestamps.

The two retained historical-only customer UUIDs are not silently promoted. On
this fresh profile each requires exactly one standard customer import record,
plus the existing full source/receipt/audit proof and matching ID/type/source
references. Missing, duplicate, malformed or legacy-only evidence fails closed.
The old full historical-customer proof remains unchanged in the retained profile.
This candidate is **not valid for that retained profile**.

## Installation boundary

`scripts/release/unified-install/fresh27-publication-isolation.mjs` verifies exact
parent source bytes before rendering
`adapters/postgres/patches/0027_publication_legacy_isolation_successor.sql`.
`PUBLICATION-ISOLATION-CANDIDATE.json` records the nine before/after body pins.
The SQL is a source candidate only and is absent from `WHOLE_INSTALL_PATCHES`.
The existing catalog profile still pins and admits only the predecessor bodies.

The optional transition candidate requires the exact 56-table predecessor,
ordinary schema/table ownership, origin trigger mode and schema versions 1–27.
It locks all tables and refuses any row outside `schema_migration`, including
accounts, batches, source evidence, business rows and prior failed import state.
It checks all nine predecessor bodies and function metadata before replacement,
then verifies unchanged function OIDs/nonbody metadata and trigger metadata.
Preserving an ACL does not independently certify the ACL. This must be part of
an exclusive reviewed installation window.

This transition candidate does not itself remove those 21 tables. The exported
nine-body plan can also inform a separately reviewed direct 35-core installer,
which must prove its complete routine/trigger/FK/RLS/ACL cohort independently.
Do not append this SQL to the existing whole profile and weaken its old hash
checks. A successor profile and final combined source/catalog evidence are still
required. A populated installation needs a different fact/evidence-preserving
migration and backup/restore validation; this file deliberately refuses it.

## Offline verification

Executed on Node v24.22.1 (the project requests v24.21.0):

```sh
node --test tests/publication-legacy-isolation-source.test.mjs \
  tests/legacy-dependency-source-report.test.mjs \
  tests/history-balance-rowtype-successor-source.test.ts \
  tests/unified-whole-search-path.test.mjs \
  tests/unified-whole-catalog-gate.test.mjs \
  tests/runtime27-known-balance-source.test.ts \
  tests/runtime27-known-balance-render.test.mjs \
  tests/unified-live-history-dispatch-source.test.ts
```

Result: **49/49 offline tests passed**. These check exact preserved standard
branches, removal of old references in the nine candidate bodies, fail-closed
fallbacks, generated SQL reproducibility, source drift rejection, metadata
preservation gates and rejection by the old installation profile. Synthetic
branch models are source contracts, not execution of SQL or triggers.

No PostgreSQL, production, Mac, typecheck, full suite or exact-version historical
oracle was run. Local Codex still needs the reviewed final combined installer,
not this partial candidate alone. Its isolated engine matrix must cover standard
whole-package import/publication with ordinary runtime operations, source/evidence
identity conservation, pinned-customer proof negative cases, old/malformed
mapping rejection, unauthorized roles, rollback, populated-target refusal and
no old-table reads/writes throughout ordinary and standard import execution.
