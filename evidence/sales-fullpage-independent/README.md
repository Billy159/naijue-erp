# Independent sales full-page integration review

Scope: read-only sales detail presentation and explicit action-only stylesheet integration in the reviewed working tree. Frozen evidence is `8877-ui-evidence-b8bcfe3`, original commit `b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3`. This reviewer changed only files in this evidence directory, not production code, dependencies, delivered previews, or prior evidence.

## Findings and resolution

Two interrupted-flow defects were independently reproduced in actual React/JSDOM and reported to the sales owner:

1. Opening a full-page detail left a pending reference query and popup mounted inside the hidden retained list. Its ignored-signal late response could restore the popup on Back.
2. Removing the optional detail-style capability during pending or loaded detail unmounted the document but left the list hidden, with no visible return control.

The owner fixed both in the sales scope. The unchanged independent probe now passes all 12 observations. Reference children detach and abort when the list is hidden; capability removal reveals the same list and disables both detail activations. Pending list refresh cancellation, late-list response rejection, reveal-before-focus, and no implicit list refresh also pass.

Historical failures are preserved in `dom-before-fixes.txt` and `dom-observations-before-fixes.json`; current results are `dom-after-fixes.txt` and `dom-observations-after-fixes.json`. `run-dom-probes.mjs` is the reusable bounded harness.

## Source and actual emitted-graph review

`run-source-graph-probes.mjs` calls the actual `buildApplication` with temporary outputs, rather than inferring production loading from the portable preview. The current source/graph result passes:

- Pinned raw frozen sales document/header/layout/summary sources are unchanged. The actual read-only document has one title/status/saved-state/action row, ordered 返回列表 / 导出 / 打印 / 操作历史, the six-field document grid, note-before-lines order, native ten-column line table, and summary below the lines.
- No modal, backdrop, modal Escape dismissal, or Tab trap is retained. A small pending header/Back frame remains in the sales route; actual saved-document body code is an action-only dynamic leaf.
- Startup and sales-list static closures exclude the document body module and its CSS. The actual build emits a separate `sales-detail.css` asset, 7,034 bytes in this checkpoint, with no inventory, Arco, or sales-list stylesheet inputs. Necessary shared controls/tokens remain in the sales list.
- Optional `SalesRouteConfiguration.detailStylesheet` is validated before use, construction is inert, the route bridge passes an explicit readiness callback, and disposal includes the action owner with identity deduplication. No inferred URL, empty production readiness fallback, or JavaScript import of detail CSS is installed.
- Both code and usable CSS must resolve before mounting the native detail query. Missing capability leaves the list usable and visibly disables number and 查看 actions. Style failures are local, returnable, and retryable; detached/obsolete activation promises cannot start reads.
- Native sales contracts, money/count model, wire validation, and HTTP reader are byte-identical to HEAD. Exact minor-unit strings, BigInt counts, signed return/exchange/gift economics, saved SKU/FIT/size/barcode and historical payment names are preserved. No product/name hydration or hidden catalog read is introduced.
- Root `package.json` now discovers the composed sales DOM harness once through `test:web:application:sales` in `check:web`; the dependency lock is unchanged. No full aggregate success is claimed by this independent review.

Machine-readable output is `source-graph-result.json`; `source-graph.txt` records the successful run. `reviewed-source.sha256` binds the reviewed runtime, integration, preview-bridge, test-discovery, and dependency inputs. Temporary emitted bundles were removed.

## Honest remaining boundaries

- Only the visible 返回列表 interaction is implemented. Native browser URL/history/Back-Forward integration is not claimed.
- Historical category snapshots and unit metadata are not available in the native source. The UI explicitly says 历史分类未提供 rather than inferring current category or inventing a unit.
- This is read-only. New/edit/save/review/void, export, print, and operation-history actions are not enabled. Saved additional facts remain available through loaded-record disclosures, not extra reads.
- Native filters remain single-select; native date inputs are not the frozen Arco calendar popup. Reset still edits the draft without a read. These documented retained differences are not hidden behind a parity claim.
- The standalone preview deliberately inlines CSS and supplies a fixture-only resolved callback. It is not evidence of production CSS loading. New portable build/smoke awaits the root's coherent committed source; prior portable files and historical evidence were not rewritten.
- All execution here is bounded actual React/JSDOM with synthetic readers/style promises, source comparison, and static emitted-import/CSS analysis. No actual browser, screenshot/computed-layout or pixel acceptance, browser history, real network/server/database, listener, install, commit/push/deploy, memory, timing, or waterfall measurement occurred.

## Final frozen-source result

After the owner's final freeze, this reviewer independently reran all 18 sales React/JSDOM groups and all 6 composed sales application groups; both passed. Both the owner's 13-file source manifest and this review's runtime/integration manifest passed exact SHA-256 rechecks after those runs. The scoped diff whitespace check passed. `final-result.json` indexes these final checks and logs. No remaining blocker was found within this source/static/synthetic review scope.

The shared owner's earlier broad manifest predates the interrupted-flow fixes. It must remain historical or be refreshed with correctly bound post-fix evidence; it is not implicitly relabelled by this review.
