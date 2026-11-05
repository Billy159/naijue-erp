# Inventory filter restoration checkpoint

Source boundary: frozen Demo b8bcfe3 inventory-select.jsx, inventory-category.jsx and inventory-filters.jsx, plus all eight supplied rejection screenshots. The existing matrix/grid widths, business quantities, draft/applied query boundary and TEST ONLY warning were not redesigned.

Implemented:
- Real action-lazy source Select for direct product input, owner-local recent search, provider-projected code/name columns, code tags/copy, and right-side active-product facts. There is no duplicated popup title/search input or completion/pagination footer.
- Shared action-lazy TreeSelect for references/warehouse and explicit native category branches. Normal category menu has no added tools header; warehouse retains its source toolbar.
- Bounded native candidates:20 per requested page, scroll-only continuation and200-item render window. Only the active suggestion reads existing product basics/specifications/thumbnails; no catalog or per-row hydration, no original-image prefetch. Explicit selections respect the native100-ID bound.
- Effect-owned query/style/scope cleanup, latest-query cancellation, identity/provider invalidation, retained callback rejection, IME Enter guard and no inventory query from candidate Enter.
- Application/manual split builder, inherited development host, inventory preview split/portable and core portable source all carry the correct action CSS path/inline marker. No global Arco reset.

Verification:
- Final inventory lifecycle9 groups pass after shared hierarchy runtime freeze: real page category arrays/warehouse subset, explicit Query only, category ALL-minus and parent-minus-child refusal, deliberate positive replacement, active target facts, stale responses/public option callback, composition/Enter and identity teardown.
- Pure candidate-window/style-lease8 tests pass on unchanged corresponding source.
- During implementation: settings5 groups, existing inventory/drawer14 groups, actual portable/split product CSS2 scenarios, application graph and development-host graph passed. These earlier logs are intentionally labeled implementation checks: aggregate rerun on the final frozen source remains the root verification step.
- Product portable cascade check caught and fixed a real13px-to14px override; only the product host input specificity was strengthened to replace former ShadowRoot isolation.
- JSDOM logs contain installed Arco React19 ref warnings and Canvas-not-implemented warnings in lifecycle-only tag-fit fallback; no package or canvas installation was attempted. These are not browser geometry measurements.

Known intentional differences are recorded in apps/web/src/components/inventory-filter-source-provenance.json. In particular, source private all-catalog bridges, eager bulk-code matching, unpartitioned persisted history, incomplete-tree cascade/half-check inference, and original-image hover prefetch were not copied. Current native system-item-code search/nullable retail-price projections belong to the separately reviewed read-contract checkpoint.

No commit, full compiler, real browser/Mac, database, schema, network, upload or production deployment was performed by this worker. No exact visual or pixel parity is claimed. Final real-browser comparison against the supplied original screenshots remains required.

## Compiler-feedback follow-up

The original root/web typecheck failures are preserved as initial-*-typecheck.failure.log, alongside PRE_TYPE_FIX_SOURCE_SHA256SUMS and pre-type-fix-source.patch. Four actual typing errors were corrected without any/diagnostic suppression or configuration changes: captured narrowed code, omitted absent optional className/disabled props, and explicit string/object/number narrowing for Select renderFormat. Root owns compiler reruns; this worker did not run a compiler.

The orphan-category adapter now displays a supplied native parentLabel / label path only when the actual parent candidate is absent. It does not create a parent node or alter canonical labels/IDs. Pure and real page regressions cover the orphan and known-parent cases.

Post-fix focused checks: lifecycle9 groups, pure9 tests and actual portable/split product CSS2 scenarios pass. Refreshed FROZEN_SOURCE_SHA256SUMS covers all26 owned paths. No active worker process remains.
