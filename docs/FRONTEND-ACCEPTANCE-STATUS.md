# Frontend acceptance status

## Frozen source and scoped browser comparison available, visual acceptance still open

The user rejected the earlier inventory synthetic preview because its appearance differs from the frozen Demo. Functional DOM checks and source-only reviews do not close this finding. The existing preview is a historical functional test artifact, not accepted final UI.

An explicitly authorized, one-time read-only export verified frozen Demo commit `b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3`. The 66 original-byte UI/style/font source files were exported without changing the local project. ZIP SHA256: `f1b9b81ac0ed927bbd9e19a5395fbd106161d78bb051799992850f3afd64becc`. Every package SHA256 entry was verified on cloud intake. The package excludes real data bridges, private business input, credentials, databases, vendor dependencies and generated bundles. That historical source export did not include running-Demo screenshots or viewport measurements; the later scoped Mac comparison below did.

Restoration must use the actual final layout and CSS cascade, not just prior function summaries. Preserve the approved clean backend, separated customers/suppliers, read-only size/season rules and lack of measurement units. Do not restore obsolete data bridges or legacy storage to reproduce appearance.

### Actual Mac four-control comparison and repair boundary

On 2026-10-21, ordinary Chrome on the Mac compared new source `4d0f0f44c8247e3ea15105d8a4d3207ba48f4e0e` with frozen Demo `b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3`: product input/recent search/two-column candidates/right-side facts, category tree, warehouse multi-select and transfer status. Both sides used 1470x702 CSS px, 100% zoom and DPR 2. The actual comparison and 10 screenshots found differences, **not accepted parity**. Original comparison ZIP SHA256: `f8d9c56fcb3157f3179f08354a5112e05a81ab54d34d4174b1ca6f067907fff0`; its 11 manifest entries were verified. The [comparison/source-repair review](../evidence/mac-four-control-source-fixes-20261021/review.json) records the tested source, result JSON SHA256, screenshot hashes and pending checks.

- Observed differences include unrestricted-category checkbox state, warehouse popup height, initial placeholder appearance, a shared 1 px vertical offset and about 1.1328 px transfer-status horizontal offset. Candidate/history/image/count differences caused by different data are not automatically layout defects. Warehouse deselection and deeper category interaction were not completed in that browser pass; the four groups do not constitute full-page or business acceptance.
- Source repairs are uncommitted WIP atop `2d0f5d2ef79a1d48f63a85cb0242661d2e54efde`, not the Mac-tested version. They address the category ALL projection, warehouse CSS cap/scroll sizing and original transfer filter-icon styling. Shared vertical-offset attribution remains a host-content hypothesis, not a confirmed fix. The tested idle-placeholder mismatch had already been repaired in current source, but has not been browser-rechecked.
- Focused category model/DOM, computed CSS, transfer-filter and idle-selection checks passed as recorded in the review. Sales reference-popup execution was killed at exit 137 with no assertion result; inventory lifecycle, full compiler/typecheck/build and actual Mac recheck were not completed by that repair review. These partial synthetic checks do not close visual acceptance or establish new PostgreSQL results. The user explicitly authorized restoring the original Demo for read-only comparison; pending repair validation/recheck is not a blanket waiting-for-permission blocker.

### Open visual findings

- Inventory matrix uses column-first product identity in the frozen source; the original new preview's separate product-header layout is not an accepted substitute.
- User screenshot shows narrow-container clipping and poor background/text contrast. The preview host must not inherit an unreadable dark background.
- Actual frozen source should determine frame, navigation, filter geometry, button order, table density, group layout and pagination.
- New party and application shell visual scaffolding is not accepted; nonvisual read/auth/transaction logic can progress independently.
- Source fidelity requires a mapping and scoped style tests; the four-group screenshots do not close final visual acceptance, which still needs repaired-source rechecks and remaining required browser coverage at agreed viewport sizes.

## Latest stock display correction

Normal enabled inventory shows zero when a valid SKU has no stock in a verified complete data scope. Do not publish per-cell `unknown` as the normal business UI. Incomplete import, missing proof, corruption or read failure must reject the whole read with a truthful not-ready/error state, not be converted into zero. Nonexistent SKU coordinates remain distinct from an existing SKU with zero stock.

The older explicit per-cell starting-reference proposal is being simplified; do not silently apply it as the new final schema. No real database migration or import has been performed.

## Performance acceptance

A synthetic 100-product matrix can generate 99,122 DOM elements despite fitting the current response cap. Renderer-neutral windowing is being developed, but is not yet integrated into the final source-faithful renderer. Synthetic operation counts are not browser latency or real PostgreSQL performance evidence.
