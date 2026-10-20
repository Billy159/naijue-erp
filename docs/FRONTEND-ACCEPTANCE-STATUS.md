# Frontend acceptance status

## Frozen source now available, visual acceptance still open

The user rejected the earlier inventory synthetic preview because its appearance differs from the frozen Demo. Functional DOM checks and source-only reviews do not close this finding. The existing preview is a historical functional test artifact, not accepted final UI.

An explicitly authorized, one-time read-only export verified frozen Demo commit `b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3`. The 66 original-byte UI/style/font source files were exported without changing the local project. ZIP SHA256: `f1b9b81ac0ed927bbd9e19a5395fbd106161d78bb051799992850f3afd64becc`. Every package SHA256 entry was verified on cloud intake. The package excludes real data bridges, private business input, credentials, databases, vendor dependencies and generated bundles. No running-Demo screenshot or viewport was obtained.

Restoration must use the actual final layout and CSS cascade, not just prior function summaries. Preserve the approved clean backend, separated customers/suppliers, read-only size/season rules and lack of measurement units. Do not restore obsolete data bridges or legacy storage to reproduce appearance.

### Open visual findings

- Inventory matrix uses column-first product identity in the frozen source; the original new preview's separate product-header layout is not an accepted substitute.
- User screenshot shows narrow-container clipping and poor background/text contrast. The preview host must not inherit an unreadable dark background.
- Actual frozen source should determine frame, navigation, filter geometry, button order, table density, group layout and pagination.
- New party and application shell visual scaffolding is not accepted; nonvisual read/auth/transaction logic can progress independently.
- Source fidelity requires a mapping and scoped style tests; final visual acceptance still needs real browser screenshots at agreed viewport sizes.

## Latest stock display correction

Normal enabled inventory shows zero when a valid SKU has no stock in a verified complete data scope. Do not publish per-cell `unknown` as the normal business UI. Incomplete import, missing proof, corruption or read failure must reject the whole read with a truthful not-ready/error state, not be converted into zero. Nonexistent SKU coordinates remain distinct from an existing SKU with zero stock.

The older explicit per-cell starting-reference proposal is being simplified; do not silently apply it as the new final schema. No real database migration or import has been performed.

## Performance acceptance

A synthetic 100-product matrix can generate 99,122 DOM elements despite fitting the current response cap. Renderer-neutral windowing is being developed, but is not yet integrated into the final source-faithful renderer. Synthetic operation counts are not browser latency or real PostgreSQL performance evidence.
