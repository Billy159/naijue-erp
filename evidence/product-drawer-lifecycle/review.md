# Shared product drawer lifecycle correction

## Defect and bounded change

React StrictMode detaches and reattaches effects without recreating state. The host, tab leaf, shared product-read hook, and original-image preview previously constructed their disposable scope/query in state and disposed that same instance in effect cleanup. The next effect setup reused an already-disposed instance. Product or parent-scope prop replacement could also leave the host using a scope for a different product or identity.

The four shared production files now allocate disposable scopes and queries inside the effect attachment that owns their cleanup. Host/tab/image attachments and loaded leaves are correlated to their current parent/target. Render guards remove mismatched facts immediately, and descendant component keys force fact-bearing state to restart when a real scope attachment changes. Each scope/query is disposed on cleanup; parent aborts clear facts and detach pending reads/import consumers. The module-only bounded lazy registries are unchanged.

No transfer-specific drawer, global mounted-state cache, provider, API, business DTO, CSS, label, tab, editable control, or data-loading trigger was added. Drawer/tab code remains explicitly action-lazy; drawer styles must be ready before business reads; image originals still require a thumbnail click. Dialog open/close, close-button focus, Tab containment and Escape/native cancel behavior remain scoped to the displayed target.

## Verification

- PASS: `node apps/web/src/inventory/tests/run-product-drawer-lifecycle-dom-tests.mjs`.
  - Actual React `StrictMode`, `createRoot`, real code-split lazy drawer/tab modules and shared primitives. No mocked StrictMode, lazy module or disposable lifecycle.
  - Synthetic DOM dialog methods and controlled synthetic read transports only. No browser, real HTTP, database, install, server, or commit operation.
  - Drawer CSS gate, close before style settlement, rejected closed load, mounted local style retry, and valid reads after strict setup/cleanup replay.
  - Old query abort, live replacement query, exact product/entity/identity/route correlation, stale response suppression, tab replacement, full-image click gating, original-image error/retry, preview close, Escape focus restoration, dialog cleanup and Tab containment.
  - Close/remount, in-place product replacement, parent reference replacement while the old parent is still active, account/session/permission revision replacement, cancel/retry, original-image abort on product/identity changes, already-inactive parent, and final queried-scope disposal.
- PASS: `node apps/web/tests/run-dom-tests.mjs`: existing 9 inventory groups and 5 product-drawer groups. This preserves existing non-Strict read counts, lazy behavior, read retry/cancel and ignored-abort races.
- PASS: `node --test apps/web/src/inventory/product-model.test.ts apps/web/src/loading/loading.test.ts`: 26/26 tests.
- NOT A PASS: `npm run typecheck:web` ran against the shared working tree while the transfer UI was still being edited. It reported transfer-only diagnostics (branded DeepReadonly scalars and filter control typing), with no diagnostics for these drawer files. The failed output is preserved in `typecheck-web.txt`; it does not establish a whole-web typecheck pass. A final combined-tree check belongs to the parent task.
- PASS: `node node_modules/typescript/bin/tsc -p evidence/product-drawer-lifecycle/tsconfig.focused.json`: focused graph check, exit 0, no diagnostics. The config extends the actual web strict settings and lists the four changed production files plus the new test entry. TypeScript resolves their real transitive product modules; unrelated in-progress transfer files are excluded. Output is preserved in `typecheck-focused.txt`.

Captured outputs and the exact source/test SHA-256 manifest are adjacent to this note. These checks are synthetic DOM/unit/TypeScript evidence, not real-browser visual fidelity, native dialog accessibility, network-waterfall, frozen-Demo parity, or performance acceptance.
