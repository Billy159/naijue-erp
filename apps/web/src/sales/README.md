# Sales list and read-only detail slice

This is the implemented native read-only list/detail slice, with its presentation
now adapted directly from the actual frozen Demo UI evidence `b8bcfe3`. It is not
a completed ERP, real browser acceptance, or a claim of frozen Demo pixel parity.
The frozen evidence's `LOAD_ORDER.md` and `LAYOUT_MAP.md` govern the source
adaptation. None of its business runtime, bridge, account data or catalog is used.

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
- Parent list query/draft/results/scroll remain mounted but hidden during full-page
  detail. 返回列表 reveals it before restoring trigger focus and scroll, without re-reading. New target/reopen uses a new child read scope.
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
   lazily, and mount `SalesPageHost` with that scope, optional
   `loadDetailStyles: () => Promise<unknown>` resolving only after a trusted separate
   `detail.css` asset is usable, and an explicitly constructed
   `createSalesHttpReader({ fetch, origin, basePath })` plus
   `createSalesFilterReferenceHttpReader({ fetch, origin, basePath })`.
   Unmount on navigation; dispose the route scope when it is no longer applicable.
   Omit unavailable detail styles: list/query remains usable, while both 查看 and
   number activation are visibly disabled. Never supply an empty-ready production
   fallback, inferred asset URL, or static detail CSS import.
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
   validated target, explicit `loadDetailStyles` and `close` callback. The same
   full-page frame remains returnable during code/CSS/data waits. Actual browser
   URL/history/back-forward wiring across top-level routes is not present in this slice.

## Explicitly not implemented

- New/edit sales form, price/reference providers, save/approve/unapprove/void command
  controls, their role/action eligibility, uncertainty/replay/conflict workflows.
- New/list actions and detail export, print and operation history remain disabled
  with explicit “尚未接入” titles, rather than pretending to execute them. No unit fields, debt/account balances, original-sale link or ledger
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

## Frozen-source presentation restoration (2026-10-20)

Source package: `8877-ui-evidence-b8bcfe3`, original bytes verified by the dedicated
`tests/run-frozen-source-check.mjs` check. It reads the source as evidence and never
executes it. Set `FROZEN_DEMO_UI` to the extracted package root when running the
check outside the current workspace. A source hash mismatch is a failure.

Resolved references, in the order established by `LOAD_ORDER.md`:

- `sales-current.js:76–98`: original 销货单列表 title; primary start/end date,
  status, business type, hall and salesperson order; advanced number/customer/
  warehouse order; list columns 日期 / 销货单号 / 状态 / 业务类型 / 营业厅 /
  营业员 / 商品信息 / 数量 / 金额 / 最后更新 / 操作; 20/50/100/200 pager.
- `transfer-current.css:4–20,70–76`, `golden-consistency.css:13–55,91–114`,
  `sales-refinement.css:95–108`: shared flat list shell, 32px filter controls,
  two-row filter grid, final 11 column widths and 40px/44px list row rhythm.
  Earlier `.sale-list` CSS does not govern the actual `.tc-list` markup.
- `sales-current.js:103–125,164–181`: six business fields followed by saved number,
  adjustment, due and payment facts; note before lines; ten-column saved-line
  table and exact colgroup; incoming/outgoing exchange sections and return-price
  caption; summary below the line surface.
- `sales-detail-alignment.css:1–178,203–269,278–321,329–363`: final 160px + five
  flexible field grid, 8px gaps, 32px read values, compact 36px lines, 1200px line
  table, payment row geometry and responsive field grid. The shared shell is not
  imported implicitly: detail flex and action-row display are declared locally.
- `ui-review.css:16–17` and `final-ui.css:3` / `final-ui.js:6–8`: query-note state
  and resolved pending/effective/void status tags. No observer or global mutation
  script is copied into React.
- `sales-summary.js:12–25` and `sales-current.js:7–8,70–72,96`: signed non-gift
  quantities, historical category provenance and Shanghai minute timestamps.
  The native summary extension supplies exact signed/incoming/outgoing strings
  and native `updatedAt` in one bounded page read. No per-row detail hydration or
  inferred current-product classification is introduced.

Explicit scope-retained differences and remaining gaps:

1. Detail now uses the frozen full-page document instead of the former fixed
   modal. Title, status, saved/read-only state and ordered actions share one flat
   header; no backdrop, modal Escape dismissal or focus trap is retained. The list
   stays mounted hidden; 返回列表 reveals it before restoring scroll/focus. Native
   browser URL/history routing remains a host-level gap, not claimed parity.
2. Native filters remain single selections and the actual SALE/RETURN/EXCHANGE
   contract, rather than importing the legacy multi-selection model or merging
   business values. Native date inputs reuse shared control bounds; the frozen
   Arco date popup and its keyboard behavior are not reproduced or accepted here.
3. Reset continues to edit the draft without reading. Its note says so. Frozen
   reset issues a query; changing this previously approved lifecycle is outside
   this presentation-only work. Successful prior results and explicit cancellation/
   retry remain available and clearly labelled during a failed or newer read.
4. The native schema has no saved historical category snapshot. 商品信息 therefore
   says 历史分类未提供 with an explanation, not invented category tags, current
   catalog inference or “待确认分类” passed off as a stored fact. No measurement
   unit suffix is invented. Category parity is still an explicit data gap.
5. Long native names and stored SKU labels are preserved, with full-name titles
   where the frozen compact cell geometry ellipsizes them. Payment snapshots
   remain authoritative; changed current names are shown separately. Payment
   rows may grow to show that provenance rather than silently replacing names.
6. This remains read-only. 新增销货单, 导出, 打印 and 操作历史 are visibly disabled.
   No create/edit/save/approve/void/scan capabilities or permissions are invented.
   A line's 查看 toggles its already-loaded saved barcode/allocation/gift facts,
   not a current product lookup. Additional saved timestamps/economics remain in
   an accessible disclosure so the ten-column frozen line table loses no facts.
7. Existing exact page jumping is retained alongside source-derived numbered
   navigation. Totals/page candidates use BigInt and unreachable unsafe Number
   pages cannot execute. It is an intentional native-safety difference.
8. JavaScript, native detail data and saved-detail body CSS are explicit-action
   lazy. `detail.css` is a separate asset with no static or dynamic JS/CSS import
   from the sales route. A per-activation registry joins code and trusted CSS
   readiness before mounting the query. The light loading frame and its Back
   control reuse route/shared controls. Missing capability disables detail only;
   failures are returnable and explicitly retryable. Static emitted-graph and
   synthetic readiness checks do not establish measured browser performance.
9. `application/styles/sales-base.css` is now inert. Its unaccepted inventory-derived
   visual scaffold was removed without importing inventory styles or changing
   the host's existing lazy stylesheet graph.

Verification for this adaptation:

- `verification/frozen-source-check.txt`: 10 pinned raw source hashes, final column
  widths/order, line colgroup, field grid, source order, CSS structure, no legacy/
  catalog imports, static lazy-detail JavaScript closure and inert scaffold.
- `verification/frozen-dom-tests.txt`: 9 synthetic DOM groups, including full names,
  beyond-int64 summary quantities, Shanghai next-day formatting, exchange sections,
  gift-excluded counts, no extra line/detail reads, close/scroll/focus retention,
  metadata-summary keyboard loop, cancellation, identity revocation and StrictMode.
- `verification/frozen-typecheck.txt`: scoped strict sales typecheck; no output on
  successful exit. `verification/frozen-build-check.txt`: existing split-build check.
- `verification/frozen-adaptation-source.sha256`: exact changed presentation,
  dedicated tests, documentation and scaffold hashes for this snapshot.

These are source/static/synthetic checks only. No real browser was retried after
its earlier denied action. There was no service/network/DB execution, installation,
commit, push, deployment, runtime memory/waterfall measurement or visual acceptance.

## Full-page/action-style restoration (2026-10-20)

The exact frozen header source is `sales-current.js:163–181`, with the final flat
header and auto-height document rules in `sales-detail-alignment.css:1–25`. The
previous dialog and duplicate title/state rows are removed, while all saved facts,
exact amount/quantity strings, return/exchange/gift semantics and the historical
category data gap are unchanged. `detail-header.tsx` is the one reusable header
for import/style waits, query/error/cancel states and loaded read-only facts.

Current scoped evidence is recorded under `verification/fullpage-*`, replacing no
historical logs. It covers 18 React/JSDOM groups, including source single-header
action order, no dialog or key trap, reveal-before-focus instrumentation, retained
list DOM/draft/scroll, no-loader fail-closed activation, action-style wait/Back,
failed style explicit retry, superseded style completion and same-account
session/permission revocation, plus existing exact-fact/cancel/late/StrictMode
regressions. Interruption regressions also cover a pending filter-reference child
being cancelled/detached on detail entry, and optional detail capability removal
during style wait, data wait and loaded facts. Removal reveals the retained list
immediately and uses heading focus when the former detail trigger is disabled.
No late candidate popup or detail read is restored. The source check pins the same 10 raw frozen files and now checks
separate emitted route/detail CSS ownership and action JavaScript closure.

No browser-history integration, real browser/computed-layout/pixel acceptance,
network waterfall, performance benchmark, service listener or database action was
performed for this presentation-only change. Shared application configuration and
asset wiring are separately owned and verified by the composition maintainer.
