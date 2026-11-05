# Independent frozen inventory source review

Decision: source acceptance withheld pending R1-R5 resolution or explicit scoped exceptions. No pixel-parity claim.

Reviewed exact LOAD_ORDER/LAYOUT_MAP and actual templates/CSS, including later interaction/final UI layers and selector Shadow CSS. No browser process, socket, file:// page, alternate route, external network, installation, database, or implementation edit was attempted. Existing denied routes remained untouched.

## Tangible mismatches

### R1 (medium): sidebar
- Frozen source: frontend/interaction-common.css:1 (.sidebar-note,.proto-tag display:none!important)
- Restored source: apps/web/src/demo-presentation/frame.css:16; demo-frame.tsx:31
- The restored invisible proto tag still reserves its text line and 4px/14px padding; the final frozen source removes the element from layout.

### R2 (low): matrix row geometry
- Frozen source: frontend/interaction-common.css:5; matrix-experiments.css:1
- Restored source: apps/web/src/inventory/inventory.css:56
- Final source cell block padding is 4px after the interaction layer overrides the initial 5px; rewrite retains 5px 8px.

### R3 (medium): matrix fold controls
- Frozen source: frontend/interaction-common.css:1; inventory-refinement.css:69-70
- Restored source: apps/web/src/inventory/inventory.css:80-81
- Final source fold control keeps min-height:28px even though the later height is 22px. Rewrite omits min-height and reduces the control to 22px.

### R4 (low): display settings footer
- Frozen source: frontend/inventory-workbench.js:7,71; styles.css:44,49; inventory-workbench.css:10
- Restored source: apps/web/src/inventory/inventory-page.tsx:89; demo-presentation/controls.css:4,8,10
- Source defaults and close controls are btn ghost (neutral transparent controls). Rewrite makes defaults a blue 12px link and close a bordered secondary button.

### R5 (medium): display settings responsive placement
- Frozen source: frontend/inventory-workbench.js:64-65
- Restored source: apps/web/src/inventory/inventory.css:37; inventory-page.tsx:89
- Source fixed popover clamps horizontal position, bounds height to available viewport space/450px, and flips above the trigger when needed. Rewrite is absolute below/right with overflow:hidden, no max-height or flip. Short-viewport clipping is a risk inferred from declarations, not a measured browser result.

## Verified and retained

- Full source menu hierarchy, brand, disabled unsupported destinations, breadcrumb, 208px sidebar and responsive 184px/156px declarations; explicit light root/main/background and outer horizontal overflow. R1 is the remaining shell discrepancy identified here.
- Compact three-filter plus 112/72/72 action grid, 32px muted selectors, hidden labels, advanced row, unboxed title actions, source first-column repeated product identity, 300/116/152/76/76/70 declarations, section size headings, metadata wrapping, fold locations, optional summary rows, eight default settings and 100/200/500 pager choices are represented.
- Numeric child ink is correct: the source td.minus/td.mx-zero cannot override the child .iw-number explicit normal text color/weight400. --primary resolves through --ca-link to --ca-primary-ink, including hover. Minus signs, known zero and nonexistent-spec dash remain distinct.
- Canonical product/color/FIT/size/SKU callback identity remains explicit. FIT grouping and no-unknown-stock are intentional domain differences, not the old merged projection. Native bounded selectors remain a documented exception, not an Arco/bridge interaction-equivalence claim.
- Static Empty SVG path exactly matches the default Empty component in installed Arco 2.66.16, matching frozen dependency metadata. The copied MIT license is byte-identical to the installed package. No vendor runtime or new dependency introduced by this asset.
- The 14-file owned source manifest matched every file during this review. Bounded new checks assert the five mismatches, exact icon/license correspondence, artifact size and SHA. Existing typecheck/build/14 DOM groups were not repeated.

## Artifact and browser limits

- Portable HTML: 286,687 bytes; SHA256 87558aa86863a627af720d597070f96a5938bc1fc969d2b716a4a25964fd92f7.
- Exact Page cap: 262,144 bytes. Excess: 24,543 bytes. Not Page-embeddable. Not attached, published, embedded, delivered or browser-executed by this review.
- No permitted real-browser rendering/reference screenshot was available. All geometry findings are declarations or source-structure facts; clipping/rasterization/contrast and pixel parity remain unverified.

## Evidence

- review.json records reviewed source hashes, manifest identity, the 14 verified restored hashes and five findings.
- No shared source was modified by the reviewer. Owner changes after the recorded manifest require rechecking affected hashes and findings.
