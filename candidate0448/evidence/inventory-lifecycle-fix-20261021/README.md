# Inventory lifecycle repair, 2026-10-21 UTC

Source baseline was HEAD 7410935; other independently owned changes/evidence were committed by the parent to HEAD 02d8200 while these edits ran. This repair itself was left uncommitted for parent review.

## Repair scope

- Inventory page query creation/disposal now belongs to effect setup. StrictMode's abandoned activation is disposed; the visible content receives a new live query instead of reusing a permanently disposed one.
- Candidate popup scope/query creation also belongs to effect setup. Read-leaf replay cancels timers/reads only; real popup unmount and parent abort still dispose immediately, clearing request/success/error references. Queries remain bounded and on demand.
- Candidate search Enter prevents native default, without starting the full inventory form query or replacing the existing search debounce. The regression checks cancelled event propagation; JSDOM does not establish real-browser implicit-submit behavior.
- No business rules, reader contracts, security gates, real services, database, demo-controls files or display-settings behavior changed.

## Verification

All completed with exit 0 against the listed frozen source hashes:

1. Focused TypeScript transitive graph: focused-typecheck.log and tsconfig.focused.json. Not the aggregate typecheck.
2. New actual React19 StrictMode DOM suite: lifecycle-dom.log. Seven groups cover idle/mount/replay/manual transport start, prior-success retention, error/retry/cancel, route close/reopen, active parent replacement, identity/session/permission abort, close before queued start, rapid debounced search deduplication, Enter default cancellation, selection without reread, candidate reopen/category change, late fulfilled/rejected transports and final reference cleanup. This suite exits naturally.
3. Existing inventory/product DOM suite: existing-inventory-dom.log. All 9 original inventory groups and 5 product drawer groups pass. This suite exits naturally. Existing pinned Arco/React19 element.ref warnings remain visible.
4. Same independent snapshot probes, derived from ../frontend-selfcheck-baseline-7410935/probe.mjs with repaired expectation assertions and a different output directory: probe.log and observations.json. Candidate non-Strict and Strict both read exactly once and show one option; Strict inventory retains its form and active parent with zero idle reads; candidate Enter is now default-prevented. Original failing evidence remains untouched.

The snapshot probe printed all results and wrote observations.json, but its fully bundled Node harness retained resources after JSDOM cleanup. The first invocation was stopped with exit 130 after its assertions had completed. The separate after-probe harness now explicitly calls process.exit(0) only after its assertions, evidence write and cleanup. Its successful exit is forced, not evidence of natural resource cleanup. The naturally exiting new/existing DOM suites are authoritative for lifecycle completion.

## Known remaining issue / bounds

The snapshot probe deliberately still records the independent inventory display-settings issue: Escape and outside pointer interaction do not close it and focus stays on the trigger. It is separate and not fixed here. The candidate appearance/structure is not claimed to match the frozen Demo.

No full aggregate, real-browser rendering, screenshots, network waterfall, pixel parity, production authentication, database reads or deployment acceptance was run or claimed. SHA256SUMS covers this evidence and the two changed production files plus two focused test files. The generated probe bundle is intentionally omitted.
