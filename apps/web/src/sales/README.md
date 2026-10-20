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
- Inert `createSalesHttpReader` uses reviewed same-origin JSON transport and only
  `/sales/query` plus `/sales/detail/query`. Plain DTO projection precedes backend
  validation because `LatestQuery` intentionally snapshots null-prototype objects.
  Client identity/roles/scope are never authorization or request fields.
- Strict complete wire DTO validation, target and page/filter consistency, unique
  identities, line/settlement ownership, canonical exact integer money/counts,
  signed int64 quantities, bounded 2,000-current-line detail and three settlements.
  It rejects malformed data instead of truncating, filling zeros or inferring facts.
- All sales money remains exact minor-unit strings. Display uses the committed sales
  PostgreSQL codec's scale 2, with string slicing only. Counts/page arithmetic use
  BigInt; safe Number conversion applies only to supported bounded page indexes.
- Single explicit 查看/number activation loads the detail code leaf and one native
  detail query. Product code/name, color, FIT, full size and barcode are stored line
  snapshots. No product hydration, current catalog lookup, initial all-catalog load,
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
   `createSalesHttpReader({ fetch, origin, basePath })` and `SalesReferenceReader`.
   Unmount on navigation; dispose the route scope when it is no longer applicable.
   The host component/controller are implemented here, but not installed into any
   production root/router or synthetic inventory preview.
3. The reference reader is a REQUIRED integration port for bounded, authorized
   hall/salesperson/customer/warehouse search, only invoked when its selector opens
   or the user searches/pages. No matching candidate HTTP contract is committed in
   the sales API, so this slice deliberately invents no URL and has no fixture,
   preloaded catalog, empty-success or permissive production fallback. Each result
   must match its explicit page with exactTotal and canonical IDs/full labels.
4. Serve app/query routes on the configured same origin and prefix. Register the
   committed sales-query HTTP plugin with real trusted session, read policy and PG
   providers; enforce trusted Origin/CSRF controls at the proper server boundary.
5. Detail HTTP currently returns reference IDs but no current hall/person/customer/
   warehouse/payment-account labels. The UI explicitly labels list-snapshot names
   and shows unavailable-name states when necessary; it does not fabricate current detail names or make
   N+1 calls. An approved richer detail DTO/reference-label composition remains
   necessary for full Demo-like named presentation. Internal UUIDs are not rendered as business names. Do not assert that list labels
   are newly read detail facts. Payment account names also remain unavailable until
   the approved detail DTO supplies them.
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
- Root application/router/auth integration, real candidate provider, real named
  detail labels, persistent host readiness, server startup, real login, PostgreSQL,
  local Mac/browser, source-data import, network performance or Demo pixel testing.
- Dependency installation, push, commit or deploy. All tests use synthetic fixtures
  and mocked HTTP; no endpoint, database, service listener or real account is used.

## Scoped verification (no network)

Run from the repository root:

- `node --test apps/web/src/sales/sales.test.ts`
- `node apps/web/src/sales/tests/run-dom-tests.mjs`
- `node apps/web/src/sales/tests/run-build-check.mjs`
- `./node_modules/.bin/tsc --noEmit -p apps/web/src/sales/tsconfig.json`

The source-only manifest and logs are under `verification/`. Root test discovery
currently does not include `sales/*.test.ts`; adding aggregate root wiring remains
an integration task. Focused success does not imply whole-repository, real-browser,
real-PG, performance, deployment or complete ERP acceptance.
