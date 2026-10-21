# Demo comparison and repaired-preview evidence archive

Exact evidence checkpoint: `7c9ec3cc17ac4f89d8152d9317558c7cd8afb383` (`7c9ec3c`).

This is a compact archive of completed source/model/build/synthetic-DOM review and repaired offline preview provenance. It does **not** establish real-browser, screenshot/pixel/computed-layout, production-network, performance, real-data or business acceptance. No source was changed and no new test/build/browser operation was run to create this archive.

## Contents

- `independent/`: Original independent review, deterministic projection oracle, split-build source-graph probe, narrow actual-component React 19 StrictMode DOM probe, their logs/results, original SHA256 manifest, and unified checkpoint verification records. Original file bytes are preserved.
- `preview/`: Original exact-checkpoint source manifests, verification, final provenance and build/DOM logs. The completed bundled-code JSDOM smoke reports **8 groups**: shared menu/idle behavior, page-size action, hidden/displayed FIT projection, inventory drawer, sales full-page detail, transfer warehouse action, transfer full-page detail, and route/back/interruption cleanup.
- `checkpoint/`: Original 51-file checkpoint scope and source manifest. Its `wholeAggregate: PENDING` is historical, not a current aggregate-pass result.
- `archive-verification.json`: Fresh read-only integrity checks and exact/current source distinctions, plus the copied-file inventory.
- `SHA256SUMS`: Archive-relative SHA256 manifest for every archived file other than itself.

## What passed, and its limits

The independent deterministic model oracle passed 80 sparse products, 10,428 projected cells and 25,245 real source references. The independent actual application build/source graph and narrow actual-component StrictMode synthetic DOM checks passed. The repaired preview's build and 8 bundled-code JSDOM groups passed with zero external-resource requests, network attempts or runtime errors recorded in its proof. These are model/build/DOM results, **not pixel/browser/business acceptance**.

Fresh archive-time hashing verifies 83/83 consumed preview inputs, 12/12 preview-tool inputs and 24/24 independent-runtime inputs against both exact `7c9ec3c` and the current working tree. All 51 frozen checkpoint entries match exact `7c9ec3c`. At archive time, 50/51 still match the current tree; only `apps/web/tests/run-bundle-smoke.mjs` has changed. The original earlier before/after logs are preserved and not relabeled as archive-time current-tree checks.

## Separate aggregate gate

The original independent review ended while the root aggregate gate was pending. The parent coordinator later reported that the root full aggregate failed a stale old single-page negative-cell test, with a separate owner test-only repair. No root aggregate result log was among this archive's supplied sources. This archive makes **no full aggregate-pass claim**, does not credit the later test-only repair to exact `7c9ec3c`, and does not turn model/build/DOM results into browser or business acceptance.

## Delivered HTML, deliberately not copied

The native HTML was already delivered as Library file `libfile_1b1839994d748191bfc8772775541582`.

- SHA256: `90b4a11a14f4b12bae564424435aab34da4767de574a027992fb802ba68efb1a`
- Size: 1,387,214 bytes

Its local source bytes and size were reverified without copying the HTML. No screenshots, HTML, node_modules, runtime/dist output, execution output directory, or huge metafile is included.

## Verify

From this directory, run `sha256sum -c SHA256SUMS` to verify the compact archive. Source manifests use repository-relative paths and should be verified from the repository root, with the exact-commit/current-tree distinction above respected.
