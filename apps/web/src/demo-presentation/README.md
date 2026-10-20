# Frozen Demo presentation restoration

Source of truth: exported original-byte frontend files at commit
`b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3`, read with their declared load order.
The source package contains no runtime screenshot. This work restores the source
structure and resolved declarations, not a newly invented visual design and not
an assertion of pixel parity.

## Owned presentation leaves

- `demo-frame.tsx`: source menu/brand/sidebar/topbar/page structure. It only renders
  approved targets supplied by the host. Other source menu positions are disabled
  and never masquerade as implemented capabilities. No data, imports, reads or
  routing effects occur just because the frame renders.
- `tokens.css`: source semantic role tokens and geometry scoped to `.demo-ui`.
  The final source white application surface is explicit. No global dark-mode
  inheritance, remote font request or legacy alias cascade is added.
- `frame.css`: one scoped resolved frame layer. Source 208px sidebar, 44px brand
  square, 44px topbar, 12px/16px page spacing; 184px/156px responsive sidebar widths. The later `interaction-common.css:1` display:none rule removes
  proto/sidebar prose entirely rather than reserving a visibility-hidden gap.
- `controls.css`: shared native buttons, gray 32px selectors, options/popovers and
  pagination. Deliberately excludes matrix, inventory layout and drawer rules.
- `icons.tsx`: Arco 2.66.16 default Empty SVG path. This version is already
  installed and exactly matches frozen dependency metadata. It is static UI, not
  a new runtime dependency. See `ARCO-LICENSE`.
- Existing `inventory.css`, `inventory-page.tsx`, `inventory-matrix.tsx` and
  `components/pagination.tsx`: source workbench/filter/action/matrix/pager layout
  on the existing safe read and callback contracts.
- `preview/main.tsx` and `preview/shell.css`: the same source frame in the isolated
  synthetic preview. Test diagnostics live outside the business workbench. The
  explicit light HTML/body/root and outer horizontal overflow avoid the prior
  inherited dark root and narrow-host clipping.

## Source-to-new mapping

| Frozen source | Restored destination / source-match evidence |
| --- | --- |
| index.html lines 9–16; styles.css lines 20–35; transfer-current.css line 25 | Full menu hierarchy, brand, sidebar, breadcrumb, topbar, content frame in DemoFrame/frame.css. |
| ui-tokens.css; golden-consistency.css lines 2–4; ui-review.css lines 5–6 | Scoped semantic roles, final white main/background and compact frame geometry. |
| inventory-workbench.js queryFields/statsBar/markup; inventory-refinement.css | Hidden control labels; three filter columns plus 112/72/72 actions; gray 32px selector surfaces; advanced row; title and plain actions/results bar. |
| inventory-workbench.js renderPop(settings); inventory-workbench.css | Separate 商品辅助字段 and 汇总显示 groups; all eight source display options and defaults. |
| inventory-matrix-experiment.js table/aggregate; matrix-experiments.css; inventory-refinement.css | Product identity repeated in first table column, no standalone product-heading row; 300/116/152/76/76/70 width declarations; source fold controls in color/warehouse cells; optional color/product summary rows; sticky identities/totals/actions; 36px minimum rows and metadata wrapping. |
| inventory-workbench.js paginationMarkup; inventory-refinement.css; golden-consistency.css lines 7–11 | 100/200/500 product page sizes; 108px muted selector; total/range, numbered/arrow pager and jump; 28px pager buttons. |
| inventory-select.jsx Empty styling and exact installed Arco 2.66.16 Empty/IconEmpty | Source 240px empty area, 56px default outline drawing, 15px heading and 13px description, without an invented text-symbol icon. |

The final applicable source layer was read, including later CSS and local selector
styles, rather than copying the first app.js template or all compatibility files.
Late shared rules are preserved, not just direct inventory files: `interaction-common.css:5`
sets matrix top/bottom padding to 4px after its initial 5px, and
`interaction-common.css:1` sets fold min-height 28px, which survives the later
`inventory-refinement.css:69` height 22px. `styles.css:49` plus the workbench
button helper's ghost default make both settings footer buttons neutral and
transparent, with final height 32px / min-height 30px / padding 4px 9px.

Settings positioning uses the exact normal-viewport formula in
`inventory-workbench.js:65`: x guard 8px, width at most viewport−24px, below/above
space with 16px allowance, flip only when below<230 and above>below, height bound
100–450px, and 5px anchor gap. The fixed popup updates on resize/captured scroll;
a scrollable body leaves its nonshrinking footer available. Pure arithmetic and
bundled DOM regressions cover those bounds, not actual browser clipping. The
source 100px minimum can exceed an extremely short viewport; no universal fit is
claimed. A pathological viewport narrower than 24px is clamped to zero CSS width
instead of emitting the source's negative width. No data read is caused by layout.

No excluded data/bridge module, legacy runtime script, fixture dataset, storage
mechanism, backend/package/dependency change was introduced.

## Host integration

Import `frame.css` once for the approved host. Render DemoFrame with explicit
`children`, `breadcrumb` and `navigation`. Each navigation value has `href?`,
`onActivate?`, `selected?`; missing values render unavailable source entries.
Optional `topbarActions`, `notice`, `footer` are host-supplied React nodes, never
account or capability inference. Other route CSS can import `controls.css`
directly instead of loading inventory.css and its matrix/drawer declarations.
Application composition files were not modified in this work.

## Business and presentation boundaries

- Canonical product/color/FIT/size/SKU identities and precise callbacks remain
  separate. The old FIT merge projection is deliberately not restored. The source
  optional FIT/size-group metadata controls are present, not an invented FIT
  column. Semantic identities retain FIT even with visual metadata switched off.
- Final numeric ink follows the resolved original cascade, not the rewrite's
  invented status colors. In frozen `inventory-matrix-experiment.js`, known values
  are `td.mx-zero` / `td.minus` parents with a child `span.iw-number`. Although
  `styles.css` colors `.negative,.minus` and `matrix-experiments.css` colors
  `.mx-table .mx-zero`, the child `.iw-number` in `inventory-workbench.css`
  explicitly sets `color:var(--text);font-weight:400`; its own hover turns primary.
  Native `.mx-stock` follows those final child roles. Negative signs, zero values,
  exact click targets, semantic class hooks and accessible labels are unchanged.
- Known zero/negative and nonexistent-spec dash behavior remains the new contract;
  the retired unknown-stock branch is not reintroduced.
- The existing native, bounded selector keeps its safe read lifecycle. This is not
  the old Arco Shadow DOM bridge, recent-search store, product-preview card or
  a full-tree keyboard interaction claim. Exact native-vs-Arco control interactions
  still need permitted running-reference comparison.
- Unsupported routes are disabled in this inventory-only preview. Export/print
  and actual inventory ledger remain honestly unavailable. No fake success.
- Windowing metadata is a separately owned renderer-neutral module; no unfinished
  virtualization or legacy full-catalog behavior was silently wired into this UI.

## Verification and deliverable

Run from repository root using existing installed tools only:

    node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json
    node --test apps/web/src/demo-presentation/popover-position.test.ts
    node apps/web/build-preview.mjs
    node apps/web/tests/run-dom-tests.mjs
    node apps/web/tests/run-bundle-smoke.mjs
    node apps/web/src/demo-presentation/tests/run-source-structure.mjs

Build and bundled jsdom checks cover the source structure/CSS declarations,
fold/metadata controls, no startup reads, safe product/cell callbacks, lazy product
tabs/images and close/reopen cleanup. The shared behavior suite is maintained by
the inventory-contract owner. Verification output is under `verification/`.

No permitted real-browser rendering or frozen Demo screenshot comparison was
completed. CSS declarations/DOM checks cannot establish computed widths, clipping,
font rasterization, visual contrast or pixel parity. Browser restrictions were
honored without retry or alternate execution route.

The portable artifact is `apps/web/dist-preview/inventory-preview-test-only.html`.
Its exact size and SHA256 are recorded separately in verification/preview-artifact.json.
The Page payload limit is exactly 262,144 bytes (256 KiB), not an ordinary file
attachment limit. This full preview exceeds that cap. No feature was removed to
make it fit; the split build remains available and the HTML may be delivered as
a file, without claiming an executing Page embed.

## Scoped reset review correction

Native control reset uses `:where(.demo-ui)` to retain the frozen bare-native selector specificity without global leakage. An independent actual-CSS JSDOM probe confirms primary/neutral/link/pager/stock role precedence, including a negative control reproducing the former over-specific reset. This is CSS precedence evidence, not browser layout or pixel acceptance.
