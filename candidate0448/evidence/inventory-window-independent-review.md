# Independent inventory window-model review

Outcome: PASS within the final frozen renderer-neutral slice. No remaining blocking defect found. Final model SHA-256: 3694eef830dd37cd7c76d7cd834e25911843124b58b8988691ec71dc90e7ed54.

## Findings closed

1. The initial model jumped from scrollTop 205 to 225 near the next visible section description at top 220. Capture and restoration disagreed on the effective header occlusion. Independently reproduced; owner fixed; exact boundary regression now passes.
2. The first fix retained a stale 20 px header inset after measured header growth to 40 px, hiding the anchored point and changing its recaptured row offset from 5 to 25. Independently reproduced; owner refined the fix to retain pinned/push-off context and use current measured height for full pinned headers. Independent reflow regression now passes.

## Final independent checks

- All 8 final source leaves match the final immutable snapshot and owner hash manifest.
- Existing final tests: 24/24 passed with test concurrency 2. Scoped strict TypeScript: passed independently, sequentially after the owner's compiler exited.
- Independent probes: 8/8 passed, including 3,320 deterministic half-open row/column oracle cases across variable/fractional geometry, multiple sections, collapse and total settings, plus 25,648 unchanged-model fractional anchor roundtrips with unequal measured headers. Invalid negative/nonfinite dimensions, invalid measured/unsafe accumulated extents, stale focus, opaque tickets, cancellation and account-abort cleanup passed.
- Construction/window extraction read zero stock-cell records in the oracle. Exact aggregate/source references and logical product/color/FIT/warehouse/size identity remain untouched; missing cells throw rather than become zero. No cell cross-product or reduced business page was synthesized.
- Actual frozen Demo source at inventory-matrix-experiment.js:37-64 was checked: inline product identity, no separate product-heading projection. The model has one inline projection with logical-first flags.
- The original 100/200/500-product tests still pass: 3,301/6,601/16,501 logical rows become 15 returned rows and 6 size columns for the stated synthetic viewport. These are structural counts, not measured runtime speed, browser nodes or latency.

Initial and first-fix failed regressions, final passing logs, probe scripts, all source hashes and snapshot paths are retained separately in inventory-window-independent-review-manifest.json. No reviewer source edits, active JSX/CSS review, renderer integration, browser visual-parity/performance claim, real DB/network, installation, listener, commit or push. Root aggregate remains separate.
