# OPT00 inventory600 preparation (TEST ONLY)

This is a **pure finite fixture/strict-contract preparation**, not OPT05 optimization,
an HTTP host, browser build, timing run, PG/authorization proof or acceptance gate.
It is not registered in root scripts/default tests. A3/A4, shared generators, frozen
QA data, production files, row heights, layout and original limits are untouched.

## Source and dataset

`createInventoryProfile()` reuses the original
`apps/web/preview/synthetic-reader.ts:createSyntheticInventoryReader` with
`productCount:600, delayMs:0`; its bytes are pinned to
`50424f3e8f51a84b68917ab16f2122bc8e4c911db39c3c09e9e1cf0afcd365db`.
It reads the complete original catalog via legal pageSize500 pages1/2, and the
complete six candidate domains via original20-item paging. Only then is a stable,
sorted full-domain UUID mapping constructed. Query/filter order cannot allocate IDs.
The namespace is deterministic synthetic UUID-shaped identity, not random/business
identity. The original product order, labels, full11-size axes, fit/color/warehouse
relations, stock strings, negative values and complete-scope zero facts remain intact.
The original COMPLETE finite source alone permits its sparse missing balance→known0;
the adapter never fills missing cells, unknown quantities, errors or unpublished data.
The original source only defines seven applicable sizes; the remaining four remain
`not-applicable`, not0. Inventory has no image column: images are N/A, not an empty
image-load performance result. Long metadata would require an explicit new version.

`facts` is an immutable complete synthetic catalog/candidate/identity manifest;
`profileDigest` checks that logical payload. This is NOT a served-HTTP reset receipt.
`routeInventoryProfile` provides only two pure read contracts. Both original request
parsers and complete strict response validators are retained. Unknown/wrong-kind IDs,
unsupported pagination/extra identity fields are rejected, not repaired. Original
selection labels remain untrusted display input; they do not confer permission.
Original candidate search/selected/category handling and inventory numeric index order
are inherited, not upgraded into invented sorting/authorization behavior.

Separate explicit correctness failures return503/500 error envelopes. Unknown is not
a legal successful stock cell; corruption negatives must fail the original validator.
No save/stock adjustment/ledger/media route is implemented (unsupported=501).

## Focused command (after controller permits tests)

```sh
source /workspace/scratch/1f717a486422/toolchain/use-exact-node.sh
node --test tests/performance/opt00/inventory-browser-baseline/inventory-profile.test.mjs
```

Tests use the actual original factory/parsers/validators/HTTP client with an explicitly
in-memory fetch contract. They do not bind a socket, mount a renderer or simulate DOM
geometry. There is no timing/CPU/layout/network throughput claim. Actual serialized
JSON bytes are checked against the unchanged original default8MiB boundary, without
claiming that serialization is actual wire transmission.

## Later work requires separate review/GO

Host/build must bind the actual canonical copied inventory renderer and clean runtime
Git blobs, one dependency root, immutable fixture/harness/artifacts and honest served
byte/reset receipts. No new UI controls or layout changes. First validate one500 case
without timing; only then review100/200/settings and a quiet cold1/repeat1/repeat2
protocol. Wholepage500 is in validated HTTP facts, not500 simultaneous visible rows:
the original measured windowing stays intact. Ready must require original successful
query plus measured matrix/finished probes/visible coordinates, not a result shell.

Total main-thread CPU/browser-layout durations stay null without a supported profiler.
A future separately approved measurement-callback transform may record **stage wall
time** only, with overhead disclosed; it is not canonical bytes or totalCPU. No trace,
DevTools, media HTTPS or browser-policy bypass is authorized by this fixture.
