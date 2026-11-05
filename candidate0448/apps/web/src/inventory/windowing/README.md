# Inventory windowing model and opt-in native-table adapter

This folder contains the renderer-neutral model and the native-table render plan.
`InventoryMatrix` has an explicit developer-only `windowing` prop, but the actual
inventory route does not opt in. The default matrix remains eager. No CSS,
preview, DTO, root scripts, business pagination, totals or page-size choices were
changed by this integration. The frozen Demo's inline product-identity structure
is shared by both rendering paths; there are no product-heading rows or alternate
preview layouts. This is not evidence that the default route is faster.

## Explicit renderer opt-in and release gate

The optional `InventoryMatrixWindowing` input requires all of the following:

- The current inventory `ReadScope` signal. Aborting it removes the optional
  renderer's inventory facts, including after a failed geometry check.
- A stable, externally measured `layout`: every row kind's height, optional
  description height, 76px size widths, and cached per-logical-row overrides for
  wrapped product metadata. There are no invented row-height defaults. The
  description height must be zero when hidden and positive when shown.
- A controlled finite `viewport` in the existing results scroller's coordinates,
  including its real width/height, scroll offsets, sticky-header offset and
  overscan. The existing frozen identity widths total 568px and the trailing
  total/action widths total 146px. The adapter checks these against its CSS
  contract rather than introducing a different geometry.
- The measured section margin as `sectionGap`, outside the table row axis.
- `onScrollRequest`, which applies logical keyboard scroll requests to that same
  scroller and supplies the resulting current viewport. No product-visible
  setting, new reader or automatic route enablement was added.

The adapter renders native tables using the existing shared stock/identity/fold
rows, one header per mounted section, logical ARIA row/column counts and indices,
and inert row/column spacer cells. Native sticky identity/total columns and the
original classes remain in use. Only the current row/size window and, when needed,
one focused stock row/column remain mounted. Arrow keys plus Home/End navigate
logical applicable SKU coordinates; native Tab remains available for mounted fold,
stock and product buttons. Pending offscreen focus must match the current model
and controlled scroll position before it can focus a node. Newer actual stock focus, leaving the matrix, data replacement, geometry reflow
and scope disposal invalidate an old pending focus. Retained focus is scoped to
the current read signal and data object.

Invalid model/viewport inputs fall back to the existing eager renderer. Mounted
row/header/description extents and fixed/size column widths are checked against
natural DOM measurements, with ResizeObserver checks where supported. A positive
measurement mismatch falls back to eager rendering and reports
`onInvalidGeometry`; row content is never clipped to make measurements fit. A new
stable measurement revision is needed to retry. jsdom's zero rectangles are not
measurements and are never presented as browser acceptance.

Real-browser wrapped-row measurement/reflow, sticky section transitions,
keyboard/Tab and screen-reader behavior, and latency/memory/visual Demo parity
remain release gates before enabling this on the default route. No denied
browser route was retried. The controlled adapter is testable now, not an
assertion that those gates passed.

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

## Renderer-neutral session integration after the visual source is verified

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

The renderer-neutral model/session deliberately does not fetch data, attach DOM
listeners, choose roles/keyboard bindings, measure CSS, apply a new look, or
auto-change collapse. The explicit native-table adapter described above supplies
its own rendering/keyboard layer without changing the model/session contract.
Scroll alignment needs a usable viewport (larger than the sticky insets); when
it is not usable, plans remain finite/clamped but visibility cannot be promised.

## Local verification

Run from the repository root using existing dependencies, with no installation:

    node --test --test-concurrency=2 apps/web/src/inventory/windowing/*.test.ts
    node apps/web/src/inventory/tests/run-windowing-dom-tests.mjs
    node_modules/.bin/tsc --noEmit -p apps/web/src/inventory/windowing/tsconfig.json

The current root unit-test glob already includes `windowing/*.test.ts`. The
explicit adapter jsdom command above is additional and is not silently wired into
a new root script. The existing route DOM suite still covers the default eager
renderer.

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


### Opt-in renderer checks

`render-plan.test.ts` checks full 100/200/500-product model extents, zero cell
reads while extracting an unfocused render plan, section-margin translation,
constant focused-row/column retention, collapsed targets and indexed column
geometry. The separate jsdom suite uses supplied synthetic geometry, not Demo
measurements. For a 1020×280 viewport with four color/FIT groups, eight warehouses,
and twelve sizes, each of the full 100/200/500 pages mounts 8 detail rows and 48
stock buttons. It exercises exact negative/zero/absent semantics and callbacks,
a separate 1,200-size axis, keyboard scrolling, retained focus, fold identities,
invalid/naturally changed geometry fallback, stale-focus cancellation after a newer stock focus or read replacement, focus
leaving the adapter, and abort clearing. These are bounded DOM/interaction assertions,
not real-browser geometry, performance budgets or production capacity approval.
