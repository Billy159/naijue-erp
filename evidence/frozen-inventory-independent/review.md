# Independent frozen inventory source review: scoped acceptance

Accepted within the reviewed source-declaration, cascade, inherited typography and pure popover-positioning scope. R1-R7 resolved. Not real-browser, whole-UI visual or pixel-parity acceptance.

## Resolved findings

- R1: sidebar. frame.css:16 now removes sidebar/proto prose with display:none!important.
- R2: matrix row geometry. inventory.css:58 now uses padding:4px 8px.
- R3: matrix fold controls. inventory.css:82 retains height:22px; :83 explicitly restores min-height:28px.
- R4: display settings footer. inventory-page.tsx:92 renders both settings footer buttons as iw-button iw-ghost. controls.css:6-7 provides neutral transparent roles; inventory.css:44 retains height32/min30/padding4px9px/weight500.
- R5: display settings responsive placement. inventory.css:37 uses fixed positioning; :38 permits body scrolling and :43 keeps the footer nonshrinking. popover-position.ts preserves source formula/strict230/tie/100-450 bounds; anchored-popover.ts updates and cleans up resize/captured-scroll listeners. The documented sub24px width guard is an explicit safe exception.
- R6: inherited native-control reset specificity. Independent actual-CSS jsdom precedence regression passes. Its in-memory old-reset negative control reproduces dark primary/link/text ink. Outside native control remains unchanged.
- R7: inherited control and section-heading line-height. Independent inherited-typography oracle expands only the exact declared font-family token for jsdom and verifies line-height1.5 for query/text controls and section h3. In-memory prior-shorthand/20px negative controls reproduce both former differences.

## Inherited typography and narrow geometry

- Main inventory h1 retains 20px/30px/600, and section h3 again inherits the source unitless 1.5 line-height. Frame 13px/1.5 and workbench 12px/1.5 baselines remain explicit. Primary white ink and neutral/link roles are no longer defeated by a higher-specificity native reset.
- Desktop filter minima 260+160+170 plus 112/72/72 actions and five 8px gaps total 886px. At viewport <=1100px, filter minima 220+150+160 and two 8px gaps total 546px, with actions moved to a separate row. At viewport <=740px, two columns/product spanning apply. Frozen inventory-refinement.css:2-3,73-74 matches rewrite inventory.css:11-12,108-109.
- Both versions use viewport media queries, not container queries. A narrow nested host inside a wider viewport can overflow. Current preview explicitly provides outer horizontal overflow. Actual host clipping, scroll reachability, resolved contrast and rasterization remain unverified without a permitted browser.

## Independent bounded regression

- run-cascade-precedence.cjs reads actual tokens/frame/controls/inventory CSS. It checks computed rule selection for primary, neutral, text, link, pager, ghost, stock and h1 roles, with an outside native button control. A negative control restores only the old reset in memory and reproduces the former dark primary/link/text ink.
- An additional typography oracle expands only the exact declared font-family token because jsdom cannot reliably resolve a custom property inside the font shorthand. It verifies inherited 1.5 control/section-heading line-height. Negative controls restore the former shorthand and 20px heading and reproduce both differences.
- CSS role strings and declaration precedence are tested, not actual resolved color contrast, widths, clipping, rasterization or browser pixels. Source numeric ink/font-weight and source fold/cell geometry remain represented.
- All 17 current owned manifest hashes match the latest README/frame/controls/inventory files. Independent regression hashes match the current four tested CSS files. Initial review is preserved in initial-review.md/json. No implementation edit, network, database, install, browser attempt or heavy-suite repetition was performed by this reviewer.

## Artifact and claim boundary

- Current full synthetic HTML: 288,610 bytes; SHA256 e30df03f62d9ea4501f7842981e5e1f3129e3c1442ab3b67e47dbb2af3b1104f.
- Exact Page cap: 262,144 bytes. Excess: 26,466 bytes. Not Page-embeddable. No feature removed for cap. This review did not attach, publish, embed, deliver or execute the HTML in a real browser.
- Original Empty SVG/MIT verification remains valid. Canonical product/color/FIT/size/SKU identity, known-zero versus absent-spec semantics and documented bounded-native-selector exceptions remain unchanged.
- No permitted reference/runtime screenshot comparison exists. This is scoped source-level acceptance of the seven corrected findings, not whole-UI visual, host-fit or pixel-parity acceptance.

Full finding, manifest and independent evidence hashes are recorded in review.json.
