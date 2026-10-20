# Independent native transfer read UI review

Result: PASS. No unresolved blocking defect found in the final v2 source freeze.

Final transfer manifest SHA-256: 490550323f239fd5e1ad9e648708b9f8dbaa7408d7770f5533af3ccabfa7a8c7. The owner's 30-file source manifest is copied unchanged to transfer-read-ui-independent-source.sha256. Native DTO/parser and shared product dependencies are bound by transfer-read-ui-independent-dependencies.sha256; an additional seven-file shared/style manifest is transfer-read-ui-independent-shared-source.sha256. All are verified before and after the final probe run. The earlier e67541b1 snapshot passed but was superseded by the owner's popup/pager parity correction.

## Findings resolved during review

1. The first version omitted product 查看 entirely from the large-grid paged fallback. The fallback now invokes the same explicit product capability and cancellation-safe style activation, then the existing shared ProductDrawerHost. There is no transfer-specific drawer or fallback read implementation.
2. The initial matrix CSS lost frozen sticky subtotal/right-action behavior and the final product-code/name flex geometry. The final CSS now preserves the frozen 280/76/88 identity widths, 96px right action, 52px subtotal/right96 positioning, baseline/gap4/code max68%, and final footer/header/section sizing. The last bounded owner delta restores the source viewport-clamped multi-select popup, 150px page-size popup and Chinese 上一页/下一页 labels. These are static source anchors, not visual acceptance.
3. Four independent rejection probes initially failed: contradictory productName for one productId, contradictory colorName for one colorId, contradictory fitName for one fitId, and a single productId spanning two size groups were accepted. That could silently misrepresent canonical tuple rows. Frontend validation now mirrors native identity consistency, also checking shared size and warehouse-hall facts. The initial failed run is retained in transfer-read-ui-independent-initial-probes.log; all seven current probes pass.

## Independent checks

- Seven model/DTO probes: canonical product/color/FIT/size/group consistency, exact selected-reference narrowing, target/extra-key rejection, exact quantity semantics, and matrix budget boundaries.
- Six actual React StrictMode/JSDOM groups, using the real route, actual pinned Arco controls, actual lazy detail/shared product imports, synthetic native reader ports, and explicit held stylesheet callbacks:
  - Exactly one initial 20-row list read and no initial reference/detail/product/style work.
  - Draft typing does not query. Actual 20/50/100/200 selections reset to page1 using the last executed filter, never the pending draft.
  - Actual multistatus/from/to interactions emit independent exact arrays only after Query, retaining disabled historical warehouse facts. Reset changes the draft only.
  - Back during pending detail CSS starts no business read and ignores late readiness; the exact list node, scroll positions and trigger focus remain available.
  - Failed detail styles retry only explicitly. Product style preparation is cancellable and cannot start product reads after close. The live shared drawer reads only target basics, not other tabs/images.
  - Same-account permission replacement clears hidden list/detail/product descendants, aborts pending detail and rejects late ignored-signal results.
  - Wide-grid fallback remains explicit and bounded, preserves product 查看, and exposes every one of 45 canonical size labels through pages without truncation.
- Two static groups: frozen cascade anchors (including popup bounds/pager labels) and in-memory browser bundle graph. The code-only index contains no React/CSS or fixtures; detail/shared drawer leaves remain split; tests are excluded from the production graph; detail CSS has a separate single-input asset graph.

Final run and pre/post verification summary: transfer-read-ui-independent-final-check.log. Logs: transfer-read-ui-independent-probes.log, transfer-read-ui-independent-dom.log, transfer-read-ui-independent-static.log. Runnable probe sources use the same prefix. Generated runtime output is removed after each DOM run; static builds use write:false.

## Source conclusions

The leaf sends only the new strict native array DTOs to fixed native read-only endpoints and uses the existing trusted server session. Selected IDs narrow facts and never grant access. Scope-owned cancellation, latest-query generations and executed-filter pagination prevent stale relabeling or cross-identity publication. No commands, fixtures, legacy bridges, live-stock/category guesses or eager full-catalog reads were added.

Canonical product/color/FIT identity grouping, existing SKU availability and complete native size-group ordering remain separate from saved per-line labels/barcodes. Legal SKUs without document rows remain blank; nonexistent combinations remain a dash. All quantities and totals stay exact integer strings/bigints. Matrix rendering is gated before row×size DOM allocation at 40 columns/60 rows/2400 cells; larger valid documents use explicit 40-row/40-size paging, while saved records mount only on disclosure.

Frozen inputs inspected: b8bcfe3 LOAD_ORDER.md, transfer-current.js, transfer-golden.js, transfer-matrix-experiment.js, transfer-current.css, matrix-experiments.css, golden-consistency.css, final-ui.css, and the final transfer control source/cascade context. The approved no-legacy-size-alias projection, unavailable historical category snapshots, no measurement units, read-only commands and bounded large-grid presentation remain deliberate differences rather than invented parity.

## Limits and coordination

No browser, network, server, DB, dependency install, commit, full suite or TypeScript compiler/typecheck was run by this reviewer. The implementation owner supplied 15 passing unit tests, 11 passing DOM groups, split-build/source-mapping checks and an inspectable scoped tsc command/exit0 record in verification/scoped-typecheck-exit.txt. I inspected that provenance without duplicating tsc; the application owner owns final integrated checks and hidden-route startup/style delivery. Raw esbuild aggregate route CSS is not lazy-style-delivery evidence; the application's exact shell/route/detail/product asset graph must supply that boundary.

These are functional/source checks under JSDOM with synthetic transports and controlled style readiness, not running-Demo screenshots, pixel/computed-layout equality, real-browser focus/top-layer behavior, network waterfalls, latency, PostgreSQL execution or deployment acceptance. Pinned Arco emits React19 ref deprecation and JSDOM missing-canvas text-measurement warnings; controls' values/events pass, but no text/layout measurement is accepted.
