# Native inventory query reader: bounded source checkpoint

`adapters/postgres/src/inventory-query-reader.ts` implements the existing `TrustedInventorySnapshotReader` port directly over the native tables. This is a reversible source/protocol checkpoint, not a deployed or PostgreSQL-engine-verified feature. No schema, fields, import provenance, HTTP composition or frontend contracts are changed.

## Snapshot and authorization

Every inventory/candidate call acquires one injected client, begins `REPEATABLE READ READ ONLY`, checks publication and native scope facts, obtains the requested results, validates the complete DTO and commits. A populated inventory page uses ten SQL statements including BEGIN/COMMIT; an empty page skips the three matrix set queries. Populated product/FIT/supplier/season candidates use eight statements including one returned-ID integrity query; warehouse/category and empty candidate pages use seven statements without stock checks. Errors reject the whole response and roll back. Failed BEGIN or uncertain COMMIT discards the connection; failed rollback produces an aggregate failure and discards. There are no automatic retries. AbortSignal checks prevent subsequent callback/SQL work and late publication, but do not cancel an already-running query or acquisition. The host must supply bounded pool/query/statement/transaction timeouts.

The explicitly authorized warehouse IDs and hall IDs are an intersection, not an OR. Each returned native warehouse must have exactly the supplied warehouse ID, its own single native `hall_id`, the expected authorized hall and the expected label. Requested warehouse filters narrow this supplied scope before any inventory query. Authorized display order is retained. Empty, forged, stale and unpublished warehouse scopes do not become a global/admin fallback. The reader does not invent role policy from actor identity; the existing trusted authorization provider remains required.

The minimal native schema has a shared product catalogue, not per-hall product ownership. Hall/warehouse bounds apply to stock and warehouse candidates. Product counts/other reference candidates use that shared native catalogue only after the finite native warehouse scope has been verified.

## Published completeness without full-SKU preload

The existing scope-inspection helper returns all W+SKU members and a JavaScript Set of every SKU. This reader deliberately does not invoke it or weaken/change that shared interface. Its local constant-result proof checks:

- Exactly one IMPORTED initial cutoff batch, completed state, fully reconciled four-target checkpoint and its immutable exact final complete-scope approval.
- The exact existing 0007 table/trigger pairs, retained-balance FK and unique published-batch/member indexes. Checks are over bounded PostgreSQL catalogue metadata, not a generic readiness platform.
- Indexed publication membership for the finite requested warehouses and, through a full-filter SQL anti-join, every relevant native SKU.

Publication already performed the one global source/count/baseline reconciliation. The read path does not re-count all import members, re-read source files, scan all historical ledger rows, construct all SKU IDs in application memory or manufacture a warehouse×SKU zero relation. Imported identities, source records and final publication are protected by the existing immutable native guards. As with the foundation helper, capability presence is not evidence against a privileged database owner disabling guards, corrupting data and re-enabling them. Correct grants, migration review and independent integrity validation remain prerequisites.

Within that proven snapshot an existing SKU with no sparse balance is exactly zero. Existing zero balances and negative quantities are preserved. A product/color/FIT/size coordinate with no actual SKU is `not-applicable`; SKU identities or colors/FITs are never invented from a Cartesian product. New identities outside the published import scope remain not-ready until approved native-new coverage/first-use support is implemented. For inventory matrix reads, missing publication, unproven SKU membership, malformed category/size relationships, invalid balances and query failures reject the whole read, including an empty or complete-looking visible page.

## Full-filter work versus page hydration

The exact distinct-product count, full-filter signed quantity SUM and whole-filter integrity/membership predicates are separate from pagination. Their result is constant size, but exact totals necessarily inspect the relevant native matching set inside PostgreSQL. This is not a constant-time catalogue query. Real PostgreSQL EXPLAIN/ANALYZE, index selection and load/performance evidence are still pending; no production latency or scalability guarantee is claimed.

Only the requested stable `(product_code COLLATE "C", id)` product page is hydrated. Source size-group membership and full labels use `(display_order, size_id)` order. Page-only sizes, actual SKU identities and persisted sparse balances use set queries, never per-product queries. Technical limits return limit+1 rows to detect overflow, then fail without truncation:

- 100/200/500 products, as defined by the existing port.
- 50,000 page size-member rows; 50,000 page SKU rows; 250,000 page sparse-balance rows.
- Existing response bounds of 1,000 sizes per product, 10,000 color/FIT groups and 1,000,000 matrix validation/work units, checked before allocating matrix cells.

These are resource safeguards, not business catalogue-size rules. Quantities remain exact signed bigint strings per cell; aggregate totals use arbitrary-precision integers and may exceed one signed bigint.

Candidates use stable independent count/page SQL with a 20-row limit, parameterized literal substring searches and native IDs/labels/disabled flags. `selectedIds` neither widens authorization nor adds a hidden selected page. Candidates are catalogue references, not a claim that every off-page stock cell is ready. They use the same fixed publication/warehouse proof, their exact count and page share the same native authorized relation and literal search predicates, then page-ID-bound membership/size/category checks validate only the returned product/FIT/supplier/season references. Warehouse and category candidates do not scan SKU or balance readiness; returned category depth/cycle validity is checked directly. No candidate data query reads inventory balances or calculates stock aggregates; the fixed guard capability check still references relation metadata. Invalid returned entries reject the page, never get silently filtered out after counting. Exact count still performs work over its actual native filtered reference relation, and checking a returned supplier/season/FIT can inspect associated native catalogue identities; no constant-time claim is made.

Only current page/candidate display facts are decoded into DTO labels. Full-catalogue display-label cleanup remains part of approved clean-import validation, not a new global text scan per read.

No enabled-only stock-pruning rule is introduced: valid existing native products/SKUs, including retained disabled identities, are not silently removed from counts or balances.

## Category evidence and bounded semantics

Frozen b8bcfe3 frontend evidence provides these observed facts:

- `frontend/inventory-category.jsx` uses non-strict checkbox hierarchy and `TreeSelect.SHOW_PARENT`.
- `frontend/inventory-result.js:19` delegates category matching to `C.inCategory`.
- `frontend/product-current.js:187` rejects category parents outside the supported first-/second-level structure.

Parent selection including direct child categories is an inference from those visible hierarchy controls plus the explicit two-level constraint. The body of `C.inCategory` is not in the extracted evidence and was not inspected or reconstructed. The reader implements exact selected native category ID OR direct native `parent_id` membership, not guessed recursion or legacy projections. Category candidates expose native depth 0/1 and parent labels. A deeper hierarchy or cycle fails the native taxonomy invariant instead of silently omitting grandchildren.

## Verification boundaries

`tests/inventory-query-postgres-protocol.test.ts` uses scripted protocol clients and source assertions only. It checks transaction/query order, parameter/scoping boundaries, stable/page-only requested SQL, exact DTO construction, negative/explicit-zero/proven-absent/nonexistent distinctions, off-page failure flags, overflow, candidate behavior, abort and cleanup. It does not execute SQL or establish PostgreSQL syntax/type inference, isolation, constraints, privilege safety, index plans, concurrency, crash durability or real historical data correctness.

No database, server, network, browser, installation, migration, commit, push or deployment was used for this checkpoint. Production composition, trusted authorization wiring, real source cleanup/import and real PG acceptance are still separate work.
