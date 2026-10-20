# Native sales list summary extension

## Contract and native evidence

Required list properties are `quantity`, `incomingQuantity`, `outgoingQuantity` and `updatedAt`. Application quantities are arbitrary-precision bigints; the existing `exactJson` HTTP boundary emits canonical base-10 integer strings. Incoming and outgoing are independent nonnegative absolute totals, and signed quantity equals outgoing minus incoming. A list aggregate is not restricted to the bigint range of an individual line.

The native facts are `sales_line.quantity`, `is_current` and `is_gift`. Native rows do not have `lineKind`; only current non-gift rows participate. Negative quantities represent incoming rows; positive quantities represent outgoing rows. Gifts and inactive provenance are excluded without consulting current product data. The native header has a NOT NULL `updated_at` timestamp; its existing UTC serialization is exposed, not inferred from business date or audit history. Shanghai/minute rendering belongs to presentation.

Historical category gap: native `SalesLineRow.snapshot` and the current SQL schema do not contain a historical category snapshot. This extension deliberately exposes no category aggregate, adds no schema field/table, and never reconstructs historical category from the current product catalog. There is no measurement-unit field or suffix in this DTO.

## Query shape and fail-closed behavior

Authorization, filters, exact count, stable page ordering and pagination are unchanged. Within the same read-only REPEATABLE READ snapshot, the reader performs one extra aggregate query for the already-authorized page IDs, bounded by the accepted page size (at most 200). It uses one `unnest(uuid[])` page relation and a LEFT JOIN to current non-gift native lines. Empty pages do not query lines. No per-document detail read, hydration loop, product-catalog lookup, settlement fetch or N+1 query was added.

SUM and negation cast line quantities to numeric before aggregation, including the minimum signed bigint magnitude. SQL explicitly returns zero totals for an actual empty/gift-only join. Missing, extra, duplicate, foreign, noncanonical or internally inconsistent aggregate results are rejected instead of defaulted to zero. The web response validator requires all four fields, canonical integer strings, nonnegative directional totals, the arithmetic identity, and a non-null valid UTC timestamp. Request parsers reject these response-only fields.

## Synthetic verification

- `node --test tests/sales-query.test.ts tests/sales-query-postgres-protocol.test.ts apps/web/src/sales/sales.test.ts apps/api/src/sales-query-http.test.ts`: 46 passed, 0 failed. Exact output and command: `sales-list-summary-extension-tests.log`.
- `node node_modules/typescript/bin/tsc --noEmit -p evidence/sales-list-summary-extension-tsconfig.json`: exited 0. Explicit scope and output: `sales-list-summary-extension-tsconfig.json` and `sales-list-summary-extension-types.log`.
- `git diff --check` for the nine touched source/test paths: exited 0.
- Frozen source/test hashes: `sales-list-summary-extension-sha256.txt`.

Checks cover same-snapshot scoped paging, one page batch, exact serialization, separate SALE/RETURN/EXCHANGE totals, zero aggregate rows, bigint-min magnitude, sums beyond bigint range, shuffled aggregate row order, malformed/missing/foreign/duplicate aggregates, strict required fields, invalid timestamps, and rejection of category/unit extensions. Existing detail and settlement-statistics checks remain passing.

These are synthetic scripted pg-protocol, HTTP injection and runtime-validator tests plus scoped static types. They do not execute or parse SQL in PostgreSQL, demonstrate database isolation/performance, prove browser fidelity or count as whole-repository verification. No network, server/listener, database, browser, installation, commit or push was performed. Presentation TSX/CSS and unrelated concurrent work were not edited by this extension.
