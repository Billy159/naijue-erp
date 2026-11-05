# Candidate preview ownership follow-up (O-S03 / O-C01 partial)

Real headed old ce5 production build RED (`recovery/candidate-preview-20261029/browser-red3`): product filter ArrowDown highlighted M26004 but preview remained M26001; sales focus correctly previewed M26004, but narrowing to M26001 retained M26004 and empty results still displayed its preview. First two runner attempts retained separate harness failures (Arco combobox host is not input; sales automatically adds another empty entry so target first input explicitly).

Minimal corrections:
- Product filter reads the actual Arco active option after keyboard navigation, using a cancellable animation frame, current candidate membership and route/intent guards. Search, close, intent and disposal invalidate pending work. No selection/query business change.
- Sales popup computes its displayed preview from current result membership, falling back to the actual first result; empty result renders no preview. aria-selected uses the same identity, no stale-state reset effect or extra wrong-product request.

Native dot RED in actual popup component confirmed previous ID 4 instead of current ID 3. GREEN passes focus/replacement/empty assertions using a preview identity probe; existing actual-form and paste-intent regression 2/2 PASS. Typecheck exit 0. Fixed 4bebacd0 production build headed browser-green passed 6/6 listed checks; product-down and sales-empty pixels inspected. original 105 entries remain only partially evidenced until their full steps are run.
