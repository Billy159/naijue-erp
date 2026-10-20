# Independent shared product-drawer lifecycle review

Result: PASS. No blocking defect found in the frozen four-file lifecycle correction.

## Exact reviewed freeze

The owner's six-file manifest is copied unchanged to `product-drawer-lifecycle-independent-source.sha256` (four production files plus the two new StrictMode harness files).

Manifest SHA-256: `ac39e5cbc2b8b757b0358439f1cdaf3d0eccdcec67c58fd2cffda7808f15a59c`.

The manifest was verified before and after execution. Production diff scope is exactly:

- `apps/web/src/inventory/product-drawer-host.tsx`
- `apps/web/src/inventory/product-drawer.tsx` (`ProductTabLeaf`)
- `apps/web/src/inventory/product-tab-state.tsx` (`useProductRead`)
- `apps/web/src/inventory/product-tab-images.tsx` (`ImagePreview`)

No production/shared-primitive changes were made by this reviewer. All reviewer additions use the bounded `evidence/product-drawer-lifecycle-independent-*` prefix.

## Source conclusions

1. Disposable host/tab/image scopes and read queries now belong to individual effect attachments rather than state initializers reused after StrictMode cleanup. Each cleanup closes over and disposes the exact instance it created.
2. Host and tab render gates require the exact parent-scope reference, current target, live descendant scope, and leaf-to-scope match. A product or parent replacement removes old facts before a new leaf can publish. The new descendant keys reset fact-bearing component state on a real attachment change.
3. Identity objects are immutable; same-account session/permission replacement invalidates their parent scopes. Abort propagation disposes descendant scopes/queries and removes displayed facts. Replacing a parent reference works even when its identity/route strings match and the old parent remains active.
4. Actual code-split drawer and three tab imports remain in place. The unchanged bounded module-only registries do not cache business results. Reads remain behind explicit drawer/tab activation and drawer CSS readiness; full-size image reads remain behind a thumbnail action.
5. Abort/dispose and captured attachment checks prevent imports or transports that settle late from publishing old facts or reopening a closed view. StrictMode intentionally starts and aborts the first read, then executes a fresh live query: this is not an exactly-once transport guarantee. The probes observe one successful publication, not two.
6. Existing labels, three-tab UI, CSS, DTOs, validators, read triggers, editable/mutation-control absence, Escape/native-cancel/outside-click handlers, and focus/keyboard logic are unchanged. Dialog cleanup now explicitly closes its captured element. No shared loading primitive, provider, business contract, API, or transfer-specific drawer was added.

## Independently executed checks

- PASS: frozen `apps/web/src/inventory/tests/run-product-drawer-lifecycle-dom-tests.mjs` (seven logged StrictMode groups), captured in `product-drawer-lifecycle-independent-owner-harness.log`.
- PASS: independent real React StrictMode/JSDOM probes (seven groups, 12 host transport starts, 20 total query runs), captured in `product-drawer-lifecycle-independent-probes.log`.
  - Actual lazy imports and unresolved CSS; rapid P1/P2/P3 replacement starts reads only for P3 after readiness.
  - Discarded StrictMode query versus live replacement; one success outcome/publication, including immediately resolved promises.
  - Stable target/parent rerenders do not reread or reopen the dialog.
  - New parent object with identical account/revisions/route owns fresh scopes; old-parent abort cannot kill the replacement.
  - Main/preview Tab loops, Home/End activation, preview-only cancel, trigger focus restoration, and wrong-image DTO rejection.
  - Original images remain action-lazy; ignored aborts cannot leak facts after close/remount or parent revocation.
  - Direct hook mounting and in-place same-route scope replacement, independently of host key remounts.
  - Same-account session-only and permission-only revision changes clear old facts; fresh scopes read the new exact identity.
  - Every observed query is disposed and every queried descendant scope is dead after final teardown.
- PASS: read-only negative control. An esbuild onLoad plugin substitutes the four original `HEAD` sources in memory only; the same independent probes fail at `Expected active base` as expected. `product-drawer-lifecycle-independent-negative-control.log` preserves the expected exit-1 assertion and the wrapper's success classification. No production file was replaced.
- PASS: existing `apps/web/tests/run-dom-tests.mjs` (nine inventory/five drawer groups), captured in `product-drawer-lifecycle-independent-existing-dom.log`.
- PASS: frozen production diff whitespace check and pre/post source SHA-256 verification, captured in `product-drawer-lifecycle-independent-source-check.log`.

The implementation owner also supplied a passing scoped strict TypeScript check of the four production entries, test entry, and real transitive imports: `evidence/product-drawer-lifecycle/tsconfig.focused.json` and `typecheck-focused.txt`. This reviewer inspected that configuration and exit-0 result but did not duplicate the compiler. The earlier whole-web check failed against in-progress transfer files; its failure is retained in `typecheck-web.txt` and is not a whole-web pass.

## Boundaries

These are real React lifecycle/code-splitting checks under JSDOM, with synthetic read transports, manually dispatched stylesheet readiness, and stubbed native dialog methods. They do not establish real-browser modal/top-layer behavior, native focus-stack restoration, rendered CSS/layout, image decoding, network waterfalls, visual/source parity, performance, or complete application integration.

No network, server, database, browser, dependency install, full-suite, commit, or compiler action was performed by this reviewer. The whole-web integration check remains the coordinating task's responsibility after the transfer UI freezes.
