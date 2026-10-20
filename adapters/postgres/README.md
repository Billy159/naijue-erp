# PostgreSQL runtime-sales persistence slice

This directory now contains a genuine `pg` client-protocol transaction adapter and a versioned SQL migration artifact for the already implemented normal sales service. It is not a complete ERP, an enabled server, or evidence that PostgreSQL has accepted the SQL. No database has been contacted or changed.

## Files and integration boundary

- `src/sales-unit-of-work.ts`: `PostgresSalesUnitOfWork`, supplied with an existing `pg.Pool` (structurally type-checked against pinned pg 8.23.1). Construction/import does not construct a pool, open a connection, read credentials, run migrations, or start a listener.
- `src/codec.ts`: exact integer minor-unit ↔ approved `decimal(18,2)` conversion at scale 2, signed bigint quantity decoding, and PostgreSQL integer version checks. Extra precision and storage overflow fail instead of silently rounding/truncating. This is a storage bound, not a newly invented business amount cap.
- `migrations/0001_runtime_sales.sql`: review-only, one-time schema creation in the fixed `naijue_erp` namespace. It has not been executed. Its only insert records the migration version, not business/dictionary data. There is intentionally no automatic runner or business seed.
- `migrations/0002_sales_pricing_facts.sql`: additive explicit pricing-rule/discount/ordinary-zero confirmation columns. Not executed. Existing rows remain all NULL with no inferred backfill. New active SAVE/APPROVE requires explicit pricing facts; old unknown rows remain readable/reversible, not automatically confirmed. `0001` is unchanged.
- `tests/postgres-protocol.test.ts`: scripted client-response expectations, not an in-memory database and not PostgreSQL validation.
- `tests/postgres-schema-contract.test.ts`: SQL-text assertions only, not a PostgreSQL SQL parser or constraint execution.

The existing sales service must still receive a trusted `SalesAuthorization` and `SalesBusinessRules`. The adapter supplies neither default authorization nor guessed production sign/discount/rounding rules. It does not expose HTTP by itself.

## Transaction contract

One callback is one command, one actor/request key and one sales target. The service loads the target once. Every query uses the same acquired client between explicit `BEGIN ISOLATION LEVEL READ COMMITTED` and `COMMIT`/`ROLLBACK`, and the handle closes when the callback finishes.

1. A transaction-level advisory lock serializes the original actor/request-key identity before receipt lookup. Under explicit READ COMMITTED, a waiter then reads the prior commit in a new statement snapshot. Same key/hash replays the original compact result through the service's current authorization check; different content conflicts. A unique actor/key database constraint remains the hard backstop.
2. A sales-identity advisory lock covers the absent-row insertion race. Existing headers use `FOR UPDATE`; writes also require an exact loaded-version CAS and one version increment. The adapter rejects a second target/load rather than pretending arbitrary multi-command lock ordering is safe.
3. Before posting, all existing current warehouse/SKU balance rows are selected in one `ORDER BY warehouse_id, sku_id ... FOR UPDATE` statement. Posting line order cannot invert balance lock order. Missing coverage remains missing, never an insert/default-zero. Repeated actual lines for one SKU remain distinct and advance the cached locked balance/version for every effect.
4. Each quantity write has its own balance-version CAS. Negative balances are legal within signed bigint storage. Inventory effects are append-only, linked to native source lines, unique by operation/source/endpoint, and inverse effects have a unique original target.
5. Header/actual retained lines/settlements, ledger/balances, audit and successful receipt are one transaction. Deferred reciprocal audit/receipt references and final-state constraint triggers declare their consistency. Existing source lines cannot move to another document. Inactive retained line positions may be reused by current lines; therefore position uniqueness is scoped to current actual lines.
6. Receipt, audit and ledger update/delete triggers declare append-only storage. Ledger source validation records the current source at insertion without requiring a later draft edit to rewrite old SKU/warehouse facts. Settlement snapshots are selected from native payment references on creation/account change and retained for the same account; no display names are fabricated.
7. Approval settlement equality/count checks are deferred until final transaction state. Pure settlement statistics elsewhere still count approved documents only; this directory does not introduce an account balance or unbounded statistics endpoint.

A callback or write error requests rollback. A failed rollback discards the client and surfaces both errors. A failed/unknown COMMIT is not automatically retried; its client is discarded. A caller resolving uncertainty must retain the original request key. Protocol tests show the requested sequence, not that an actual PostgreSQL server rolled back or committed anything.

## Bounded schema, not the full 32-table design

Native tables included: minimal customer/supplier and hall/warehouse/staff/account references; product/category/color/fit/size/group/member/season/SKU references; payment method/account/hall references; runtime sales header/line/settlement; inventory ledger/balance; operation receipt/audit; and the migration registry. Product has the shared retail-price authority. SKU has the canonical product/color/fit/size uniqueness and no price override. Size code is nullable and deliberately not globally unique, preserving legitimate repeated source codes such as 900.

Reference-table presence does not implement their maintenance modules. Missing work includes full approved product optional attributes/timestamps, category depth/sort rules, SKU group-membership/identity maintenance rules, enabled/scope policy enforcement, staff/account lifecycle/security/session flows, the real authorization provider, confirmed production economics, configuration/source reconciliation, product images, barcode scheme/bindings, catalog CRUD/candidates, transfer command persistence, import batch/record storage, cutoff baseline import and baseline-aware historical changes, read/report/query adapters, UI/browser acceptance, migration orchestration, and actual PostgreSQL verification. No claim is made that all approved tables or fields are implemented.

The existing service continues to reject `CUTOFF_HISTORY` mutations with `HISTORICAL_POSTING_NOT_IMPLEMENTED`, and the adapter independently refuses runtime writes for that marker. The marker is not an import implementation: runtime non-null actor/time fields must not be used to fabricate unknown historical facts. Approved historical editing remains a separate required slice, not a permanently read-only user policy.

Excluded by business direction: original-sale links on RETURN, units/conversions, inventory correction, funds/account balances, debt/credit/follow-up collection, and guessed dictionary seeds. Real source configuration is SOURCE_ONLY until independently reconciled; nothing here imports or seeds it.

## Verification status

Run the applicable compile/build/tests through the repository's existing commands. The targeted command is `node --test tests/postgres-*.test.ts`.

The current cloud environment has no `psql`, `postgres`, `initdb` or Docker executable. No server, approved disposable database, connection string or credentials were supplied. Consequently migration syntax/execution, real row/advisory locks, deadlocks, concurrent insert/replay/posting races, rollback durability, deferred triggers/FKs, and restart recovery remain unverified against PostgreSQL. Scripted responses and SQL-text checks must never be reported as those validations. No install/download, database execution, deployment, remote push, production data or user-computer work was performed for this slice.
