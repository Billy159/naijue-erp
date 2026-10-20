# Inventory windowing model (renderer-neutral, not integrated)

This folder adds a deterministic window/focus model only. No React, CSS, preview,
DTO contract, root script, business pagination or totals behavior has changed.
The frozen Demo's exact geometry remains a prerequisite for a renderer. Its
verified inline product-identity structure is the single projection. There are
no separate product-heading rows or alternate preview layout.
This code is not evidence that the current eager matrix is faster.

## Contract and complexity

- Pass an already-validated, complete `InventoryPage`. The current canonical
  size-group/ordered-size section identity, product grouping order and JSON
  `[productId, colorId, fitId]` collapse keys are preserved.
- Rows reference source products, color/FIT groups and warehouse rows. Sizes and
  all exact totals remain on the original DTO. No cells/zeros/unknowns, totals,
  warehouse×SKU cross product or reduced business page are synthesized.
- Construction allocates O(products + groups + warehouse rows + section sizes)
  metadata, plus the section-identity serialization of each product's size list.
  It does not read `row.cells`; collapsed warehouses remain addressable by ID.
- `window` binary-searches prefix offsets and allocates visible row/column slices
  only. Render potential is O(visible rows × visible columns), plus fixed areas
  and at most one pinned header. Overscan is validated to 0–100 on each axis.
  The finite viewport and positive measured extents determine the actual bound.
- Cell resolution is lazy, by product/color/FIT/warehouse/size IDs. It reads the
  canonical cell and throws for a missing state rather than treating it as zero.
  It does not revalidate the entire response.

## Integration after the visual source is verified

1. Create one `InventoryWindowSession` per existing inventory `ReadScope`. Dispose
   it with that scope. Its abort signal handles account/session/permission changes;
   never reuse a session for another route or identity.
2. When an executed `LatestQuery` starts, call `begin(request.sequence)` once and
   retain the returned opaque ticket. After the matching validated success, call
   `accept(ticket, success.data, layout)`. On that read's cancel/error, call
   `cancel(ticket)`. This does not cancel IO; existing `LatestQuery`/HTTP own that.
   Preserve the old success with its original executed parameters on a failed read.
3. Use the frozen Demo's column-first product identity. Detail/aggregate rows
   retain source products plus `firstInProduct`
   and `firstInColorFit` flags even when their first row is outside the window.
   FIT stays in logical identity, not a compulsory visible column. Supply
   verified/measured heights for every row kind, each size-column width,
   fixed leading/trailing widths and the existing header/chrome offset. Optional
   `measuredRowHeight` supplies cached per-row overrides for wrapped metadata or
   other variable heights without creating offscreen DOM. The optional
   outside-table size description has a measured height of 0
   when hidden and a positive height (including margins) when shown. It is
   distinct from the thead, so thead pinning never overlays the description. There
   are no visual defaults. Reflow only when these, subtotal/total settings or
   collapse sets change. Keep the data/session stable during filter-draft edits,
   drawer updates and unrelated render state. Use `captureScrollAnchor` before a
   geometry/collapse change and
   `restoreScrollAnchor` on the rebuilt model to preserve an ID-based body-edge
   anchor, with color-total/first-product-row/section fallback for hidden rows.
   Anchors retain the owning header section and its pinned/push-off context,
   rather than inferring context from the destination row kind. Fully pinned
   headers use their current measured height on restore. Pushed-off headers
   preserve their captured visible inset, clamped to the current header height.
   This preserves unchanged section-boundary positions and keeps normal-row
   anchors at the current usable edge after collapse or measured-height reflow.
4. Render `model.window(viewport).rows` and each row's section column slice, with
   the returned `before`/`after` spacers and full axis extent. Use logical `index`
   and stable `key` for accessibility/React identity. Do not sum mounted cells.
   Fixed identity/total areas are outside the moving size-axis window. Header
   metadata supplies the section, existing top inset and next-section push-off;
   do not duplicate a pinned header as a second accessible table header.
5. Store logical focus IDs, not a DOM index. Bind whatever keys the verified
   source specifies to `moveFocus` or explicit addresses. Up/down keep the same
   size ID and stay in the same section, skipping nonexistent SKU coordinates;
   no wrapping/cross-section key behavior is imposed. Offscreen focus uses
   `requestFocus`/`scrollToCell`, scrolls to the returned coordinates, mounts the
   new window, then checks `isCurrentFocus(request)` before DOM focus. This avoids
   stale animation-frame focus after cancellation, collapse, data replacement,
   another focus request or identity disposal. Hidden cells return an explicit
   product/color-FIT reveal requirement; they are not auto-expanded. Call
   `cellTarget` only for the active model to retain its SKU/readReference pairing.

The adapter deliberately does not fetch data, attach DOM listeners, choose
roles/keyboard bindings, measure CSS, apply a new look, or auto-change collapse.
Scroll alignment needs a usable viewport (larger than the sticky insets); when
it is not usable, plans remain finite/clamped but visibility cannot be promised.

## Local verification

Run from the repository root using existing dependencies, with no installation:

    node --test --test-concurrency=2 apps/web/src/inventory/windowing/*.test.ts
    node_modules/.bin/tsc --noEmit -p apps/web/src/inventory/windowing/tsconfig.json

Root test globs do not include this nested new folder. Integration must explicitly
add these tests to the eventual aggregate runner; no root script was modified.

Synthetic tests use arbitrary test geometry, not Demo measurements or device UX
budgets. Valid full 100/200/500-product pages with 4 color/FIT groups, 8 warehouses
and 12 sizes have 3,301/6,601/16,501 logical display rows in inline-identity mode.
An identical
280px-high viewport + 2-row overscan returns 15 rows. The same horizontal window
returns 6 size columns. Tests instrument cell access to prove construction and
window extraction read zero stock-cell records. Separate 12/120/1,200-size axes
remain bounded. These are algorithmic/count assertions, not browser DOM, memory,
latency, network, database, capacity-approval or visual-fidelity measurements.

Structural source: frozen `frontend/inventory-matrix-experiment.js:37–64` from
`8877-ui-evidence-b8bcfe3`; thead remains section header metadata. Source Demo
product/colour fold buttons can use the logical-first flags independently of
window edges. No legacy data bridge or projection code is imported.
