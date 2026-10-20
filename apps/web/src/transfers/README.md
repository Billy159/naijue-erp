# Native read-only transfer workspace

This is a leaf, not a deployed or production-accepted ERP screen. Only explicit transfer navigation imports it. The inert `index.ts` provides native readers and a route-scoped controller, never React, styles, fixtures, startup requests, commands or fallback data.

## Host contract

Lazily import `transfers-route.tsx` and mount `TransferPageHost` with an active `ReadScope`, a real `TransferReader`, a bounded `TransferWarehouseReader`, and an action-only `loadDetailStyles` callback. The route stylesheet consists of the pinned installed Arco CSS, shared `demo-presentation/controls.css`, and `transfers.css`. Build `detail.css` as a **separate** asset. `loadDetailStyles` must resolve only after that asset is usable; missing or failed styles are not treated as success.

Optional `initialTransferId` opens an authorized detail deep link without querying a hidden list. Returning from that first detail starts the list's first page. Ordinary explicit route activation starts exactly one page-1, 20-row request, including React StrictMode. Draft changes and reset do not query. A successful executed page owns its filters, total, selected page size and rows; failed or cancelled replacements do not relabel retained results.

Optional `product` is a complete `TransferProductCapability`: `{ reader: ProductReadOnlyReader, loadStyles: () => Promise<void> }`. The loader must provide the shared drawer's frame and body CSS, without inventory matrix CSS. A style-only cancellation-safe gate runs before mounting the existing `ProductDrawerHost`. The shared host receives the same idempotent loader override and never uses its fallback loader on this path. No product data is read until explicit row 查看. Without the complete capability, 查看 is disabled. Product tabs and original images remain separately activated.

## Exact native reads

- `POST /transfers/query`: `{filter:{startDate,endDate,statuses,fromWarehouseIds,toWarehouseIds,number},page,pageSize}`. Empty filter arrays mean unrestricted, not a client permission grant. Old scalar aliases are not sent. Summary includes exact decimal-string `totalQuantity`, native `updatedAt`, and current reference names.
- `POST /transfers/detail/query`: `{transferId}`. Actual current persisted lines retain their saved display snapshots. `catalog` contains current canonical product/color/FIT/size identities, full ordered size groups, and existing SKU combinations only for actual-line product/color/FIT tuples, from the same bounded native snapshot. There is no full-product enumeration or per-line hydration.
- `POST /transfers/warehouses/query`: `{search,selectedIds,page,pageSize}`. Search pages use `selectedIds:[]`; selected-ID lookup and search are mutually exclusive. This frontend stores labels only for selected actual candidates and opens a 20-item paged reference read only on dropdown activation. Disabled flags are informational historical filter facts, not write eligibility.

All transports use the shared same-origin bounded JSON reader, trusted server session, no-store and abort signal. Identity, role and scope are never sent in JSON. Every response is validated against its executed target/filter/page, exact counts, native current identity consistency and metadata bounds. Error, malformed, oversized and unavailable responses never become fake empty results. Access denial disposes route facts and candidate/detail/product children immediately. Route, target and account/session/permission replacement discard late ignored-signal results.

## Canonical document matrix and bounds

Rows group only by native product/color/FIT IDs. Full canonical group members keep native order and names; no historical alias grouping, inferred size system, label-based identity or SKU Cartesian product is created. Matrix quantities are sums of actual current document lines by native SKU. A legal SKU without an actual line is visually blank with “无单据明细” semantics. A nonexistent SKU has a dash with “无此规格”. Neither means current warehouse stock.

The frozen-style matrix renders only within 40 size columns, 60 rows and 2,400 row×column cells. Larger valid responses switch explicitly to a different, safe paginated-line presentation: 40 actual rows, 40 saved rows per disclosure page and 40 full-group labels per size page. No rows/sizes are silently truncated, and row 查看 remains available with the complete product capability. These budgets are guardrails, not measured performance or virtualization acceptance.

Current canonical names and warehouse/creator reference names are identified as current. Original saved product/FIT/size names and barcodes remain separately available in a lazy, bounded 保存记录 disclosure. No live warehouse stock or unit is invented.

## Unsupported and remaining gates

Create, edit, approve, unapprove, void, scan, export, print and operation history stay disabled. There is no command endpoint or simulated success. Historical product-category tags are unavailable because the native document schema does not contain category snapshots; the list says so rather than inferring current category. Native number search is literal case-insensitive substring; database Unicode/lowercase locale edges are not claimed identical to the Demo. Warehouse search uses native literal substring rather than eager local catalog/pinyin matching. Native number suggestion capability is absent, so the advanced number field does not fabricate suggestions.

Source-based adaptation and synthetic tests do not establish actual browser layout, pixel parity, real login, deployment, PostgreSQL read execution or production readiness. Existing pinned Arco 2.66.16 emits React-19 `element.ref` deprecation warnings in development StrictMode; those warnings are not suppressed or represented as visual acceptance.

## Scoped checks

- `node_modules/.bin/tsc -p apps/web/src/transfers/tsconfig.json`
- `node --test apps/web/src/transfers/*.test.ts`
- `node apps/web/src/transfers/tests/run-dom-tests.mjs`
- `node apps/web/src/transfers/tests/run-build-check.mjs`
- `node apps/web/src/transfers/tests/run-frozen-source-check.mjs`

These checks do not start a listener, use a browser, access a database or network, install packages or change external state. They write only temporary/verification files under this leaf. Application integration and preview owners run their own checks after the reviewed source freeze.
