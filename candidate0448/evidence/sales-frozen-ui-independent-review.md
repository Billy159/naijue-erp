# Independent frozen-sales presentation review

Review scope: actual frozen source package `8877-ui-evidence-b8bcfe3` against the current native sales list/read-only detail slice. Read `LOAD_ORDER.md`, `LAYOUT_MAP.md`, original `sales-current.js`, `sales-summary.js`, `transfer-current.css`, `golden-consistency.css`, `sales-refinement.css`, `sales-golden.css`, and `sales-detail-alignment.css`; reviewed actual TSX plus route/shared-frame/control CSS. No production files were edited by this reviewer.

## Result

No remaining blocker found within the bounded source/synthetic-DOM scope. This is not frozen-pixel acceptance, complete interaction parity, deployment approval, or full-suite acceptance.

Two concrete issues were found independently, reported, and corrected by the implementation owner before final verification:

1. The custom modal Tab loop excluded the new native metadata summary, wrapping at the previous line action. The final focusable selector includes `details > summary`; independent DOM assertions establish that preceding controls do not wrap early, Tab from the summary wraps to close, and Shift+Tab from close returns to the summary.
2. The old `sales-base.css` scaffold is now inert, so shared `.tc-editor` / `.tc-head` flex rules no longer exist in the imported frame/control graph. The detail section and its status/action header initially lacked explicit flex display. Both are now declared in scoped detail selectors. Independent JSDOM computed-style assertions use the actual frame + tokens + controls + sales CSS together, rather than inspecting the route file alone.

## Source and synthetic evidence

`node evidence/sales-frozen-ui-independent-probes.mjs` passes. See the adjacent log. This independent probe verifies:

- All eleven final sales-list widths against the late actual `.tc-list[data-document-list=sales]` rules, not the obsolete `.sale-list` selector layer.
- The base, <=1450 and <=1270 compact primary filter templates; six-field detail grid; source-defined <=1100/700/620 detail breakpoints; exact ten-column colgroup; inert scaffold.
- Initial mount makes zero list/detail/reference reads. One explicit query yields the actual eleven list cells.
- Separate synthetic SALE, RETURN and EXCHANGE list rows preserve exact native quantity / incomingQuantity / outgoingQuantity, including a SALE aggregate above Number.MAX_SAFE_INTEGER, without inventing units. Shanghai minute display retains the authoritative native timestamp as its title.
- Historical classification is explicitly unavailable. No current-catalog classification is used or presented as a stored snapshot.
- One explicit detail activation issues one native detail query. Stored full product/color/FIT/old-size labels remain exact; gift lines do not inflate the sales quantity; all ten columns and the first six business fields remain in frozen source order.
- The actual shared-frame/control graph retains scoped detail/header flex; fields retain the six-column template. Disabled unimplemented actions remain disabled; there are no editable detail inputs.
- Local saved-line disclosure reads no additional endpoint and preserves the stored barcode. Close restores list scroll and trigger focus.
- Closing or replacing identity aborts pending detail; ignored-signal late results do not remount a closed view or restore prior-identity facts.

The probe was authored against work in progress; an initial authoring run expected the earlier summary subcontainer and stopped on that selector. It was corrected to assert the business-type-neutral footer, then passed. This was a reviewer-probe selector correction, not an ignored product failure.

## Deliberate limitations / acceptance gaps

The implementation README explicitly distinguishes these from exact frozen parity:

- Read-only closeable modal versus frozen full document route/history. Modal frame size, routing/back-forward, actual native-dialog behavior and browser pixels are not accepted by this review.
- Native date and single-reference/status/business-type controls versus frozen ShadowRoot/Arco/multi-select controls. The native SALE/RETURN/EXCHANGE contract remains authoritative.
- Draft-only reset, marked retained prior results, cancellation/retry, exact BigInt page jumping and safe-range guards retain existing native lifecycle behavior rather than silently adopting legacy business behavior.
- Native schema cannot recover the saved category snapshot, so unavailable historical classification is a real data gap. No unit suffix, category tag or current-product category is fabricated.
- Full stored names remain present and titled; payment snapshots remain authoritative with separately labelled current renamed account/method names. Growing provenance rows are not a pixel match claim.
- Detail JS and data are explicit-action lazy, but the small detail-body CSS remains in the route stylesheet. This is a documented style-granularity gap, not fully action-lazy CSS or a measured performance result.

No browser retry, actual layout measurement, responsive-media evaluation, network, listener/server, database, installation, aggregate/full-suite rerun, commit, push or deployment was performed. JSDOM display/selector checks do not establish actual rendered geometry, browser Tab navigation, or the visual quality of narrow screens. The final source manifest binds this review only to its listed files, not to unrelated concurrently modified repository work.
