# Inventory page-size and product drawer restoration

Scope: confirmed frozen-Demo differences only. No backend reader, page-size contract, source SKU, historical compatibility parser, price, product-maintenance, sales or transfer behavior changes.

## Frozen source evidence

- `frontend/unified-single-select.jsx`, Choice/nativeData: actual `es/Select`; page-size class, `position: 'tl'`, non-auto-aligned width150; source Select presentation overrides at lines9–28.
- `frontend/unified-single-select.css`: inventory page-size control width108px and height32px.
- `frontend/product-current.js:107–110`: specifications are three vertical sections: colors, size group, fits. `readonlyDrawerBody` at156–162 removes edit controls and the “选择尺码组” label; `mountProductDetails` at136–151 replaces the group control with its actual group name. No added current-SKU grid or independent size-summary section.
- `frontend/product-arco.jsx:188–196`: product identity as the main drawer title, small readonly label, width min(660px,100vw), exactly basics/specifications/images tabs for this drawer.
- `frontend/product-rework.css:92–114`: final drawer title20px/700, readonly12px, selected-tab600, fixed header/tabs and content-only scroll; plain specification values in three sections.
- Original feedback pixels inspected: image(20261021-004257).png and image(20261021-004258).png. These are the rejected previous implementation, not screenshots of this change.

## Changed behavior

- InventoryPagination has only one consumer, InventoryPageView. SalesPagination, TransferPagination and PartyPagination are separate and unchanged here.
- A108×32 lightweight button is the initial control, not an OS native select. First focus/open imports the exact installed Select action; fixed100/200/500 options are not read from a backend. Only component Select/Trigger styles and necessary local icon/semantic overrides are built for this action, not dist/css/arco.css or its global palette/reset.
- The action waits for explicit component-only CSS before mounting. Normal split builds emit chunks/inventory-page-size.css beside the action chunk. Already-inline TEST ONLY previews use the existing data-inventory-inline readiness marker. Shell/startup and inventory CSS do not import action CSS.
- Cancel/Escape, blur, busy state, scope revocation, unmount, JS failure and CSS failure are explicit. A cancelled delayed module cannot request a later stylesheet or open UI. An already-started import/stylesheet network transfer itself cannot be physically aborted, but cannot attach a stale control.
- Applied pageSize remains controlled by the inventory query result. Pending, cancelled and failed200-size requests keep visible/applied100, including the next explicit query; retry200 can commit200. Existing contract/backend code is unchanged.
- React19 development StrictMode requires the real Arco Portal to render once after mount/open. The action gates initial opening until mounted and performs one guarded local post-commit render. This does not toggle selected state or reopen cancelled UI. Host focus transfer uses a guarded microtask to distinguish real outside blur from shell-to-Select replacement.
- Drawer shows only colors / size-group name / fits. Full sizes/SKU data remain part of the exact existing validated model; no synthetic historical table, invented mapping or hidden-SKU display is added. Frame width stays660. Header/title/readonly and content-only scroll now follow the final frozen rules. Three tabs remain.

## Verification

Passed:
- Dedicated page-size DOM test: idle import count0; first focus deduplication; pending click; Escape and explicit cancel; blur/busy/revoke/unmount; JS/CSS failure and retry; no late stylesheet after cancel; actual installed Select under StrictMode, exact options,150px popup, repeated opening, Escape/outside blur, controlled applied value and disabled state. Component focus CSS retains the frozen focus border without the application's extra tabindex outline.
- Existing inventory DOM runner: all9 original interaction groups plus5 drawer groups, including page-size query failure/cancellation/retry semantics and interrupted product reads.
- Shared drawer lifecycle StrictMode suite and action/style handshake suite.
- Product model:5 tests. Product specification contract and validator untouched; validSKU identity/coordinates remain checked.
- Separate product-only generated HTML smoke:244221bytes, SHA256 b5b1ad27df7dc52c9543077b5a3c24f425e8dd359e85e7a453e656713f71b9d5 at the time of that build. Parent/child URLs unchanged, no external resources, zero idle reads, three lazy tabs, explicit original-image read, interruption/focus recovery.
- Web typecheck passed before the final non-interface guards/focus-CSS assertion; root's final aggregate must cover the integrated source.

The installed Arco library emits its existing React19 development element.ref deprecation warnings during real-control DOM tests. No browser, listener, PostgreSQL process, deployment or network bypass was started for this task.

Not verified: native browser layout, exact pixels, popup geometry in a real viewport, screenshot parity, production waterfall, performance or full-Demo acceptance. DOM and emitted graph evidence do not establish those outcomes. The independent integration review checks actual split output separately.
