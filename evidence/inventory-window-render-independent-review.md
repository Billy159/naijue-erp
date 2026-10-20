# Independent opt-in inventory renderer review

Date: 2026-10-20 UTC.

Outcome: PASS for the reviewed source/protocol scope, not browser or production acceptance. The default inventory route remains eager. No default-route performance improvement is claimed.

## Final reviewed source

Baseline: `361b14d`. All seven files in `apps/web/src/inventory/windowing/verification/renderer-source.sha256` were independently checksum-verified after the owner's final freeze. Final matrix SHA-256: `ef5c7755c399eb66298b18aee3005d656f88b35bc8f99fd221f7f6cec13d4ae7`.

The review made no production edits. Its only repository writes are this evidence family. No browser, server, network, database, dependency install, commit, or push was attempted. Browser work was outside this review's permitted scope; no denied route was retried.

## Independent executed probes

Command: `node evidence/inventory-window-render-independent-probes.mjs`.

Final result: exit 0. Log: `evidence/inventory-window-render-independent-probes.log`.

- Exact eager static markup matches baseline `361b14d` in four display/fold combinations covering defaults, optional metadata, subtotal/total, description, product folds and color/FIT folds.
- Deferred keyboard End scrolling cannot overwrite a newer manually focused stock cell.
- Moving focus outside the matrix releases offscreen row/column retention.
- Scope replacement invalidates old pending focus and retention. Aborting the replaced scope cannot remove the new scope's facts.
- Negative or nonfinite original vertical viewport inputs reject before coordinate translation.
- Huge finite section gaps reject unsafe or infinite combined geometry.
- A simulated positive DOM measurement mismatch falls back to the shared eager renderer. This is a jsdom protocol assertion, not a natural-browser measurement.
- Aborting the active scope removes facts even after geometry fallback.

## Other verification reviewed

The owner's final frozen verification logs record 32/32 windowing unit tests, the complete opt-in jsdom suite and scoped web typechecking, all passing. The DOM log records the same 8 detail rows, 48 stock buttons and 278 elements for complete 100/200/500-product synthetic inputs at a fixed 1020×280 viewport, plus a separate 1,200-size stress axis. These are synthetic count/interaction results, not device budgets or production capacity approval. This independent reviewer did not rerun the compiler or root aggregate suite.

## Source findings resolved before final freeze

- Stock-to-stock manual focus did not originally cancel delayed pending keyboard focus. Actual focus now clears the pending request, and retained logical focus is scoped by source data and read-scope signal.
- Original vertical viewport inputs were originally transformed before validation. They now validate first, and summed viewport/section geometry is checked.
- A widest-section host width could stretch narrower size systems; the host now matches the eager viewport containing width, with section overflow preserved.
- Gap header cells now use the same sticky inset as visible headers.
- Unsafe combined section-gap extents now reject, and an already-aborted signal is directly rechecked before publishing facts.

The final source keeps canonical product/color/FIT/warehouse/size identity, source SKU and readReference callbacks, signed stock and explicit absent states, source totals, product/color-FIT fold semantics and the frozen inline column-first product structure. It retains only a visible row/column window plus at most one logical focused row/column, with inert native-table spacers rather than synthesized business inventory.

## Remaining release gates

The opt-in assumes externally verified current measurements, immutable validated source data and controlled viewport updates. Its positive rectangle/ResizeObserver checks are conservative fallback guards; jsdom zero rectangles do not establish valid geometry. Natural wrapped-content heights, sticky section transitions and mixed-size-system layout, actual keyboard/Tab and screen-reader behavior, screenshot/Demo fidelity, latency and memory still require real-browser acceptance before the actual route opts in. Existing eager behavior is not performance-fixed by this change. Root aggregate checks, real PostgreSQL execution and any release/commit decision are outside this review's executed verification.
