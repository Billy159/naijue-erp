# Shared drawer deferred initial read starts

## Baseline and bounded delta

This is a separate follow-up to lifecycle commit `b508ce8`. That commit correctly replaced disposed StrictMode scopes/queries, but synchronous initial `query.run()` still started transport for the first attachment before StrictMode cleanup aborted it. Actual transfer activation therefore observed two basics starts, one aborted.

Only `product-tab-state.tsx` and `product-tab-images.tsx` change production behavior here. Each initial read now snapshots its target parameters and queues one microtask. The start is allowed only while that exact attachment remains current, its scope remains active, and its initial start is still pending. Cleanup, parent abort, explicit cancel, or an explicit read/retry consumes the pending start before transport. Explicit user retries remain immediate and do not get duplicated by the initial microtask. All query ownership, correlation, stale-data suppression and cleanup remain unchanged.

No shared loading primitive, host, stylesheet, UI, API, business DTO, provider, or global mounted-state cache was changed by this delta. Application host/style work is separately owned.

## Verification

- PASS: `node apps/web/src/inventory/tests/run-product-drawer-lifecycle-dom-tests.mjs`.
  - Real React StrictMode, real lazy drawer/tab modules, real shared scopes/queries, controlled synthetic transports.
  - Exactly one basics/specifications/images/original-image transport start for every actual activation in the existing replacement/retry/close/identity scenario.
  - Explicit cancel before the initial microtask: zero starts. Explicit retry afterward: exactly one start.
  - Scope abort before the initial microtask: zero starts.
  - Preview close during attachment, with two real StrictMode modal setups observed: zero original-image starts and no remaining preview.
  - Existing product/parent/identity correlations, action-only CSS/code gate, stale-response suppression, tab changes, errors/retries, focus/dialog cleanup and queried-scope disposal continue to pass.
- PASS: `node apps/web/tests/run-dom-tests.mjs`: all existing 9 inventory and 5 drawer interaction groups, including existing non-Strict exact read counts and ignored-abort races.
- PASS: `node --test apps/web/src/inventory/product-model.test.ts apps/web/src/loading/loading.test.ts`: 26/26 tests.
- PASS: `node node_modules/typescript/bin/tsc -p evidence/product-drawer-deferred-start/tsconfig.focused.json`: strict actual product graph, exit 0, no diagnostics. No simultaneous compiler was run by this owner; the slot was returned to the transfer/application owners.
- EXPECTED FAIL: a bounded negative control substituted only the committed `b508ce8` versions of the two production files into esbuild memory, without changing shared source. The strengthened real StrictMode test failed with `2 !== 1` at the exact-one-basics-start assertion. Output is in `committed-baseline-negative-control.txt`.

Prior lifecycle evidence under `evidence/product-drawer-lifecycle/` is intentionally preserved as historical evidence for `b508ce8`, not overwritten to imply it tested this follow-up. The new changed-source/test SHA-256 manifest is `source-sha256.txt`; real transitive inputs used by this run are recorded separately in `dependency-sha256.txt`.

These are synthetic DOM, unit and TypeScript checks, not real-browser visual, accessibility, waterfall or latency acceptance. No browser, real network, server, database, install or commit operation was performed. Whole-web aggregate validation belongs to the parent task after the combined freeze.
