# Native transfer list/detail read slice

This is an isolated source implementation, not an enabled service, complete transfer UI, or PostgreSQL-engine acceptance. It adds no schema/migration, imports, production data, credentials, writes, listener, catalog hydration, or legacy projections. Existing transfer commands are unchanged.

## Evidence and contract

Read before implementation: approved frozen Demo summary `erp-rewrite-planning/demo-source-evidence/core-functions-source-report.txt` (transfer section), `architecture/clean-erp-candidate.md` sections 0.2/5, `architecture/core-database-design-discussion.md` section 5, `architecture/demo-source-alignment-addendum.md`, and the independently reviewed `transfer-runtime-review.md`. These planning artifacts are outside this repository. The implementation consumes native 0001/0004 reference/header/line relations and their current contracts; no old Demo storage path is used.

Confirmed list filter fields: inclusive start/end business dates, status, from-warehouse, to-warehouse, advanced document number. All fields are explicit and nullable; query-string filters and extra keys are rejected. Dates must be real calendar dates and start must not exceed end. Number accepts 1–200 trimmed characters without controls, uses a literal case-sensitive substring, and never treats `%`, `_`, backslash or quotes as SQL wildcards/code.

Unconfirmed Demo details remain disclosed, not guessed as business rules:

- Transfer-specific page-size choices and default ordering were not present in the frozen summary. The API requires explicit page/pageSize. Its technical page-size bound is any integer 1–200, page starts at 1, and page × size must be a safe integer. Stable business-date-descending/UUID-descending order is an implementation default for deterministic pagination, not a claim of Demo parity. No frontend option list is defined here.
- Exact document-number case/matching/suggestion behavior is not established by that summary. Literal case-sensitive substring is the explicit provisional query contract; a suggestion endpoint is outside this slice.
- This slice does not decide import-era historical visibility. The reserved CUTOFF_HISTORY marker remains readable through the supplied native facts, but this implements neither historical import, fabricated creation facts, nor historical editing/posting. The future approved historical grant facts must be reconciled separately.

## Trusted composition and authorization

`createTransferQueryHttpPlugin` requires a current trusted authentication provider plus explicit `TransferQueryDependencies` (authorization and snapshot reader). No default provider, request-selected actor, role, hall grant, or admin fallback exists. `TransferActor` contains verified account, current hall (or explicit null), and normalized role. Service captures immutable validated copies before awaiting authorization. Authorization is called anew on every list/detail request, and a cancellation after policy/reader completion prevents a stale service result.

`createSourceConfirmedTransferQueryAuthorization` is an explicitly selected source-confirmed policy, never installed implicitly: ADMIN/WAREHOUSE receive all; SALESPERSON needs an authoritative current hall and receives the union of source warehouse hall, destination warehouse hall, and immutable `created_hall_id` plus `created_role = SALESPERSON`. That last branch requires the existing non-null native creator-account FK and account→staff relation; it does not substitute the creator's current staff role/hall. Reads do not grant command permission. A later role/hall change uses the new actor and policy decision, while creation provenance stays on the header.

The generic trusted scope is a union of non-empty intersection clauses, with fixed fields for each endpoint hall/warehouse and creation account/hall/role. Empty scopes deny; empty/malformed/unknown clauses fail closed. Trusted composition, not a request, chooses the scope. The adapter revalidates and copies scope/filter values before connecting, applies scope before count/page/detail, and never treats a requested warehouse as an authorization grant. Missing and hidden targets produce the same DOCUMENT_NOT_FOUND result before fetching child rows.

## HTTP

Register the plugin normally, optionally under a Fastify prefix:

- POST `/transfers/query`: `{ filter: { startDate, endDate, status, fromWarehouseId, toWarehouseId, number }, page, pageSize }`.
- POST `/transfers/detail/query`: `{ transferId }`.

The routes are read-only POSTs for structured filter bodies, not commands. They use application/json, reject query strings, limit bodies to 65,536 bytes, and send no-store/no-cache. Request abort or premature response close invalidates the read. Known input/permission/not-found/too-large/aborted errors map to 400/403/404/413/408; unauthenticated is 401, unexpected trusted facts or SQL errors are redacted 500s. Generic media/JSON/body errors map to 415/400/413. No service listens on a port.

Exact totals and signed-bigint-backed positive transfer quantities are JSON decimal strings. Versions, page and page size remain safe JSON numbers. The detail shape is `{ document: { header, lines }, stockBasis, references }`. Lines are only current native actual rows, with formal SKU IDs and persisted product/code/color/fit/size/barcode snapshots unchanged, including leading-zero barcodes. Historical labels are never replaced with current catalog labels. Header source/destination/hall/creator/approver display names are current names read directly from native warehouse/hall/account→staff references. No login name, password hash, request hash, audit JSON, stock balance or unrelated catalog data is returned.

## PostgreSQL protocol

`PostgresTransferQueryReader` accepts an injected pg-compatible pool and does not connect at construction. Each invocation acquires one client and executes one read-only REPEATABLE READ transaction:

- List: exact scoped COUNT and one scoped server-side page with the same native reference joins and deterministic ordering. Out-of-range pages retain the exact count and return no items. No all-document hydration or in-memory paging.
- Detail: one scoped header/reference query, then one ordered current-line query with LIMIT 2001. The technical 2000-current-line response bound rejects overflow with TRANSFER_READ_TOO_LARGE, never silently truncates. Ownership, identity/position uniqueness, positive integer quantities and native snapshots are decoded/checked. There is no per-line catalog query.

Every filter, scope, target, limit and offset is a driver parameter; only fixed internal columns enter SQL. Disabled references are not silently filtered out of historical/native reads. SQL failures or cancellation stop subsequent work and request rollback. Failed BEGIN/unknown COMMIT results discard the client; rollback failure surfaces both errors and discards it. Unknown commit is never automatically retried. Signal checks cannot cancel a SQL statement already in flight and do not claim pg driver cancellation.

## Scoped synthetic verification

- `node --test tests/transfer-query*.test.ts apps/api/src/transfer-query-http.test.ts`: 24 tests passed.
- `node_modules/.bin/tsc --noEmit -p tests/transfer-query.tsconfig.json`: strict scoped typecheck passed.

Tests cover strict filters and technical bounds, current policy and immutable facts, denial before child read, endpoint and creator-role/hall scope SQL, same-client snapshot/count/page, exact large counts/quantities, retained line snapshots/current reference names, no catalog/N+1/write SQL, oversized detail, invalid persisted identities, rollback/begin/connect/unknown-commit behavior, aborts and HTTP input/privacy boundaries.

These are synthetic application/HTTP and scripted driver-protocol checks only. No real PostgreSQL SQL execution, lock/isolation/concurrency/durability acceptance, authentication composition, browser/Demo visual acceptance, performance test, installation, push, deployment or production mutation occurred. Transfer UI, suggestions, operation history, output/printing and historical baseline-aware behavior remain separate work.
