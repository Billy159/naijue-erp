# Inventory display-settings popup lifecycle repair

Scope: only `apps/web/src/inventory/inventory-page.tsx`, the new small `settings-popup.ts` adapter, and `tests/run-settings-popup-dom-tests.mjs`. No commits by this worker. Started at `6672b247a40ffd07bbbe521ef87102bc7a8bf2e7`, which includes and preserves the prior `c54b0f8` StrictMode inventory/query fix. No changes to sales, demo-controls, candidate-selector, CSS, transport/query semantics, production, database, security settings, or the user's computer.

## Result

- Reuses the committed pure `ExclusivePopupController`, without a new global singleton. Each open/effect activation gets a fresh controller and listener ownership, so cleanup/replay cannot reuse a disposed controller.
- Retains the existing anchored-position helper, frozen classes/labels/structure, all eight display fields, and default/reset behavior. Adds only lifecycle wiring and the existing panel's ref.
- Opening focuses the first existing checkbox after the initially hidden anchored position has committed as visible. No business read/import is initiated by settings actions.
- Escape closes, prevents its default, stops propagation, and returns focus to the trigger. Explicit close and trigger-toggle close also return focus. Outside pointerdown or keyboard/assistive click dismisses without taking focus from the outside target.
- Inside events and checkbox/reset actions retain the popup. Synchronous close during initial focus cannot revive it. Scope abort resets visibility and detaches document listeners. Unmount removes listeners and does not dispose the caller-owned scope. Restored scopes/mounts have no stale open intent.

## Reproducible before/after evidence

`before-inventory-page.tsx` is the exact page from the base commit. `probe.mjs before` substitutes only that source at bundle time, so no working-tree rollback or concurrent-worker source overwrite is required. `probe.mjs after` uses the current actual page. Other sources and injected synthetic readers are identical.

- `node evidence/inventory-settings-popup-fix-20261021/probe.mjs before`: exit 0, verifies the defect in both default and StrictMode. Initial focus stays outside the checkbox; Escape neither closes nor cancels; outside pointer/click leaves settings open. Zero business reads.
- `node evidence/inventory-settings-popup-fix-20261021/probe.mjs after`: exit 0, verifies first-checkbox focus, Escape close/default cancellation/trigger return, outside dismissal/focus preservation, in default and StrictMode. Zero business reads.
- Structured results: `before-observations.json` and `after-observations.json`; command output in corresponding `*-probe.log`.
- The baseline `escapeReturnedFocus: true` merely means focus never left the trigger; it is not successful dismissal. Baseline `escapeClosed: false` is the controlling observation.

## Focused verification

All exit 0 against the final source; logs saved beside this note:

1. `node apps/web/src/inventory/tests/run-settings-popup-dom-tests.mjs` → `after-dom.log`. Five groups cover actual page/default/StrictMode, existing fields/reset, focus, dismissal, interrupted focus close, document-listener cleanup, candidate pointer handoff, scope revocation, restored scope, real unmount/remount, zero settings inventory/candidate/product reads.
2. `node apps/web/src/inventory/tests/run-inventory-query-lifecycle-dom-tests.mjs` → `inventory-lifecycle.log`. Seven existing inventory/query/candidate lifecycle groups pass unchanged.
3. `node apps/web/tests/run-dom-tests.mjs` → `web-dom-regression.log`. Nine original DOM groups plus five product-drawer groups pass. The existing real Arco path emits two React 19 `element.ref` deprecation warnings; no failure or new act warning is present.
4. `git diff --check` → `diff-check.log`, clean.

Source SHA-256 files and the inventory page diff are included. No full suite, heavy tsc, build, real browser layout/pixel/performance acceptance, production API, or database checks were run by this worker. Root owns coordinated typecheck/build.

Suggested root test-hook addition (not applied here): append `&& node apps/web/src/inventory/tests/run-settings-popup-dom-tests.mjs` to `test:web:dom`.

## Remaining boundary, not a whole-front-end parity claim

Inventory candidate controls, lazy page-size control, and settings still do not share a single popup ownership host. Ordinary pointerdown handoff with the existing candidate outside lifecycle is tested, but keyboard/synthetic candidate-to-settings activation can leave both independent controls open. This narrow settings patch does not claim cross-control exclusivity, candidate/pagination redesign, complete accessibility, frozen-Demo behavior/pixel equivalence, or whole-front-end parity. A same-host inventory integration needs a separately scoped change; no custom global arbiter was introduced to conceal that boundary.
