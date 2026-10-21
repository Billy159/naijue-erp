# Shared three-pager reuse verification

This folder contains complete merged stdout/stderr for the focused commands, a
working-tree source hash snapshot, deleted-file list and reference-only image/source
hashes. The exact commands are shown below. No worker commit or deployment occurred.

- node_modules/.bin/tsc --noEmit -p apps/web/src/demo-controls/tsconfig.json
- node apps/web/src/components/tests/run-inventory-page-size-dom-tests.mjs
- node apps/web/src/demo-controls/tests/run-source-and-boundary-tests.mjs
- node apps/web/src/demo-controls/tests/run-action-dom-tests.mjs
- node apps/web/src/sales/tests/run-dom-tests.mjs
- node apps/web/src/transfers/tests/run-dom-tests.mjs
- node apps/web/tests/run-dom-tests.mjs
- node apps/web/src/inventory/tests/run-inventory-query-lifecycle-dom-tests.mjs
- node apps/web/src/inventory/tests/run-settings-popup-dom-tests.mjs
- node apps/web/src/transfers/tests/run-frozen-source-check.mjs
- node apps/web/src/demo-presentation/tests/run-document-source-restoration.mjs
- node apps/web/src/application/tests/run-build-check.mjs
- node apps/web/build-preview.mjs
- node apps/web/tests/run-bundle-smoke.mjs

The focused compiler succeeded with no raw compiler output. Root also confirmed full npm run typecheck:web exits 0 and owns copying its full
compiler log into this folder. The preserved before-fix failure is historical, not a successful
log: Promise union inference and stale await narrowing were fixed without casts.
Root also caught first-click ownership readiness; scope attachment is now pre-paint
and portable smoke tests the first visible enabled click with no settling delay.

The application graph asserts one emitted shared Select action, shared lightweight
shell reached by all three adapters, action-only Select/Trigger CSS, no obsolete
inventory action/CSS, and no eager Arco in startup/inventory/sales static closures.
Document tests cover large exact totals/ranges, existing choices, applied values,
busy/stale callbacks, hidden paging, scope cleanup and independent style asset URLs.

All six original runtime reference images were inspected. They are not current
screenshots; the original sales Failed to fetch screen is not a functionality
baseline. Browser capture was unavailable through approved routes and was not
worked around. No pixel, clipping, timing, memory or production acceptance is claimed.
The checkpoint-locked three-core portable build must be rebuilt by root after the
coherent source commit; its existing source-commit protection was not bypassed.
