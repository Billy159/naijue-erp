# Sales list and read-only detail slice

This is source-report-aligned list/detail implementation, not a completed ERP,
production entry point or claim of frozen Demo pixel parity. Source behavior:
`erp-rewrite-planning/demo-source-evidence/core-functions-source-report.txt` and
`architecture/demo-source-alignment-addendum.md`, approved summaries of the frozen
Demo, not copied business records or a running Demo/browser observation.

## Implemented

- The actual `/sales/query` filter: start/end dates, status, business type, hall,
  salesperson; advanced literal number, customer, warehouse. Explicit 查询, reset
  edits only, 20/50/100/200 document pages, bounded retry and cancellation.
- Inert `createSalesHttpReader` and `createSalesFilterReferenceHttpReader` use
  reviewed same-origin JSON transport and only `/sales/query`, `/sales/detail/query`
  and `/sales/references/query`. Plain DTO projection precedes backend
  validation because `LatestQuery` intentionally snapshots null-prototype objects.
  Client identity/roles/scope are never authorization or request fields.
- Strict complete wire DTO validation, target and page/filter consistency, unique
  identities, line/settlement ownership, canonical exact integer money/counts,
  signed int64 quantities, bounded 2,000-current-line detail and three settlements.
  Required named detail facts match the actual existing detail endpoint, with one
  name record per settlement and exact settlement/account identity checks. No old
  unnamed response, renamed endpoint or compatibility fallback is accepted.
  It rejects malformed data instead of truncating, filling zeros or inferring facts.
- All sales money remains exact minor-unit strings. Display uses the committed sales
  PostgreSQL codec's scale 2, with string slicing only. Counts/page arithmetic use
  BigInt; safe Number conversion applies only to supported bounded page indexes.
- Single explicit 查看/number activation loads the detail code leaf and one native
  detail query. Product code/name, color, FIT, full size and barcode are stored line
  snapshots. Current hall/person/customer/warehouse names arrive in the same detail
  response. Saved payment account/method names remain authoritative historical
  display; changed current names are separately labelled, never substituted.
  No product hydration, per-name lookup, initial all-catalog load,
  original-sale linkage or return quota is introduced.
- Parent list query/draft/results/scroll remain mounted. Close restores trigger focus
  and scroll without re-reading. New target/reopen uses a new child read scope.
  Cancelled detail clears facts; retry is explicit. Scope/identity/session/permission
  invalidation clears all results and ignored-signal responses cannot restore them.
  Effect-owned child scopes and cancellable read setup handle StrictMode replay.
- Shared `ReadScope`, `LatestQuery`, `AsyncLeafRegistry`, iw controls and neutral/blue
  tokens are reused. InventoryPagination is intentionally not called: it requires
  Number totals and incompatible 100/200/500 product pages. The sales pager reuses
  its visual classes with the real sales contract.

## Required real host composition

1. An authenticated app host owns one `ReadContext` and applies verified account,
   session and permission revisions. Call `replaceIdentity`/`clear` BEFORE showing a
   replacement principal, on logout, expiry, revoked access or ambiguous auth state.
   A read error is not an authenticated session refresh; 401/403 handling must be
   wired to the host's trusted session/access lifecycle where applicable.
2. On explicit sales navigation, create a route scope, import `sales-route.tsx`
   lazily, and mount `SalesPageHost` with that scope, an explicitly constructed
   `createSalesHttpReader({ fetch, origin, basePath })` plus
   `createSalesFilterReferenceHttpReader({ fetch, origin, basePath })`.
   Unmount on navigation; dispose the route scope when it is no longer applicable.
   The host component/controller are implemented here, but not installed into any
   production root/router or synthetic inventory preview.
3. The concrete reference reader sends exactly `{ kind, search, page, pageSize: 20 }`
   to `/sales/references/query`, only when its selector opens or the user searches/
   pages. Its contract is HISTORICAL SALES FILTER-only: distinct references observed
   on authorized sales headers, including disabled/historical references. It cannot
   determine new/edit form eligibility and must never be repurposed as a business
   form picker. It neither enumerates unused catalog records nor provides a fixture,
   preloaded catalog, empty-success or permissive fallback. Results require exact
   string counts, current explicit page, canonical IDs and unchanged labels/order.
4. Serve app/query routes on the configured same origin and prefix. Register the
   committed sales-query HTTP plugin with real trusted session, read policy and PG
   providers; enforce trusted Origin/CSRF controls at the proper server boundary.
5. The same `/sales/detail/query` response requires `referenceNames` (current
   hall/person/customer/warehouse names, including disabled references) and
   `settlementNames` (saved account/method snapshots plus separately current master
   names), read in the same authorized repeatable-read snapshot by the backend.
   Detail display no longer depends on parent list labels or unavailable-name
   stopgaps. Internal UUIDs are not rendered as business names, and no N+1 name
   reads or current-name-to-historical-name inference are performed.
6. Deep links may explicitly mount `SalesDetailHost` with a current parent scope and
   validated target. Actual router/history/back-forward wiring and focus/scroll
   orchestration across top-level routes are not present in this slice.

## Explicitly not implemented

- New/edit sales form, price/reference providers, save/approve/unapprove/void command
  controls, their role/action eligibility, uncertainty/replay/conflict workflows.
- List-title export or ordinary scan/batch buttons, whose displayed approval is not
  established. No unit fields, debt/account balances, original-sale link or ledger
  correction. Settlement amounts are document flows only, not account balances.
- Optional operation-history UI, settlement-statistics UI, document export/print.
- Root application/router/auth integration, real session/policy/PG provider
  registration, persistent host readiness, server startup, real login, PostgreSQL,
  local Mac/browser, source-data import, network performance or Demo pixel testing.
- Dependency installation, push, commit or deploy. All tests use synthetic fixtures
  and mocked HTTP; no endpoint, database, service listener or real account is used.

## Scoped verification (no network)

Run from the repository root:

- `node --test apps/web/src/sales/sales.test.ts`
- `node apps/web/src/sales/tests/run-dom-tests.mjs`
- `node apps/web/src/sales/tests/run-build-check.mjs`
- `./node_modules/.bin/tsc --noEmit -p apps/web/src/sales/tsconfig.json`

The source-only manifest and logs are under `verification/`. Root unit discovery
now includes `sales/*.test.ts`. The standalone sales DOM/split-build commands still
need aggregate browser-check wiring by the host owner. Focused success does not imply whole-repository, real-browser,
real-PG, performance, deployment or complete ERP acceptance.

## Named-detail/filter-reference extension verification

The stricter frontend extension uses the final backend `SalesDetail` and
`SalesFilterReferenceQuery` contracts directly. Synthetic tests include renamed
payment accounts and methods, null salesperson, malformed/missing name records,
settlement/account identity mismatch, bounded real-endpoint candidate construction,
invalid input rejected before fetch, and candidate late responses after close or
identity invalidation. All transport calls remain mocked; no real service is contacted.
