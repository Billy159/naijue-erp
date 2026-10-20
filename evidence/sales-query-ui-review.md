# Sales query and read-only detail UI independent review

Reviewed 2026-10-20 UTC. Scope: the original frozen 21-file `apps/web/src/sales/**` source manifest, with the existing sales query contracts and pre-extension backend baseline `9272fa4`. No implementation or existing test source was edited. Only this report and bounded reviewer probe/log artifacts were written in the planning directory. No network request, database, service listener, real login, browser, source-data import, install, commit, push or deployment was used.

## Disposition

PASS for the restricted list/read-only-detail frontend slice. No confirmed slice-local blocker remains in the original frozen implementation. This is not production, router/auth integration, full sales-feature, actual-browser, real-PostgreSQL or frozen-Demo acceptance.

The parent subsequently reported concurrent work extending the existing single `/sales/detail/query` response with current named references and settlement snapshot names, together with bounded reference-provider contracts. Those additions are **not reviewed here**. This review concerns the original strict DTO and provider port only. Because the original response validator rejects unknown fields, it must not be presumed compatible with an extended detail payload. The UI follow-up must adapt and revalidate the same single endpoint rather than introduce a parallel compatibility endpoint.

## Frozen identity and reproduced evidence

- Source manifest SHA-256: `9645915da2fb5b7b9e561f46ea5b6d69d1e4c9f7457498bfd97a2df3ad4bbac2`.
- All 21 listed source entries matched independently before execution. The same source-manifest hash remained unchanged after the focused probes.
- Reference manifest SHA-256: `235bc2ea61c6ad5496f9462e1b0d1d8942d389aff8e9d00de5e06f1cec7915c6`. All seven reference entries matched when checked, before the concurrent backend extension was included in this review scope.
- Independent rerun: 10/10 unit/mock-HTTP tests, 7/7 synthetic DOM groups, split browser bundle assertions, and isolated strict typecheck all passed. The typecheck process completed with exit 0.
- Additional independent focused synthetic checks passed: direct-host target replacement; same-target reopening; same-account permission invalidation during detail; StrictMode bounded reference pagination; same-account session invalidation during pending references; acceptance of 2,000 detail lines and rejection of 2,001; rejection of a fourth settlement and cross-document settlement ownership.

Evidence files:

- `sales-query-ui-review-checks.log` SHA-256 `a07de3f8cc02456a3e43f45f9b797f27b6dc5cf9f9b768f28e15438ebb1e5992`.
- `sales-query-ui-focused-probes.mjs` SHA-256 `a20084e4ec67747e3ea55ce754ce0c239abafc1abf2ff06e76874933207c7465`.
- `sales-query-ui-focused-probes.log` SHA-256 `aea59fdb2738bd9f7b15e9e8146163dbf89a41de5909f1e7b64d4498ef30c3bb`.

The focused script uses actual slice components and validators with synthetic fixtures, jsdom and deferred promises. Its source/output are outside the frozen slice. Temporary bundle outputs were removed. Synthetic DOM success does not establish native-dialog layout, actual accessibility/focus behavior, network timing or performance.

## Positive findings

### Explicit, bounded activation and native contracts

`index.ts` exposes an inert reader/controller boundary, not the React route or CSS. Construction, route mounting, advanced-filter expansion and unselected reference controls make no business request. The route bundle retains a dynamic detail-code import. The build probe proves test/fixture code is excluded from the production input graph; it does not prove a deployed host imports the route lazily, since that host is absent.

`http-reader.ts` only calls the committed same-origin `/sales/query` and `/sales/detail/query` JSON POST paths. It projects the exact plain list/detail parameter shapes before shared validation, avoiding the null-prototype `LatestQuery` snapshot mismatch. Identity, roles, account scope and query lifecycle metadata are not request authorization fields. The shared transport supplies bounded bytes/chunks/time, fixed safe errors, same-origin credentials, no-store and redirect rejection, with no automatic retry.

Reference reads occur only when that selector opens or the user searches/pages, using an explicit required provider port and 20-item pages. There is no invented endpoint, eager catalog, fixture fallback, empty-success fallback, per-row reference hydration, product-catalog load or detail N+1 loop in the frozen implementation.

### Cancellation, scope and identity lifecycle

The route list is owned by the explicit host/controller and `LatestQuery`. Parent-route scope invalidation clears results and aborts requests; superseded and ignored-signal responses cannot republish facts. List cancellation deliberately retains only a prior successful result under its own executed parameters; failed/pending page-size requests keep the prior applied size and visibly mark retained results.

`owned-scope.ts` creates effect-owned child scopes and disposes them on parent abort, target replacement and unmount. Reference/detail children inherit non-secret identity revisions but do not themselves authorize access. StrictMode setup/cleanup replay was reproduced successfully, including a bounded reference read. The focused direct-host probe replaced target A with B without relying on a parent React key: A was aborted, B rendered, and late A could not replace B. Closing/reopening the same target issued a fresh read under a different child route identity.

Detail cancellation uses query disposal, clears facts and offers an explicit fresh read; late ignored-signal responses remain discarded. Same-account permission replacement cleared pending detail; same-account session replacement cleared pending reference facts. Existing DOM coverage also establishes list/detail removal after account/session/permission replacement. This relies on the host actually invalidating `ReadContext` at the right trusted lifecycle boundary, as documented below.

### Exact amounts, pagination and response validation

Sales amounts remain canonical integer strings. `salesMoney` inserts the confirmed scale-2 decimal using string slicing, preserves negative signs, and never passes money through floating-point conversion or locale rounding. The synthetic value beyond the safe Number range displayed exactly as `-9007199254740993.01`. Quantity remains an exact signed-int64 string, with overflow rejected. Discount division/modulo operates only on a validated integer range 0–100, not on monetary amounts.

Counts and page math use BigInt. List page sizes are the real document sizes 20/50/100/200, not the incompatible inventory sizes. Jumps and next-page generation stay within the backend safe-index contract. Submitted filters are immutable executed snapshots distinct from editable drafts; resetting edits does not read or mislabel old results. Pagination operates on the last successfully executed filter, not newly edited unsubmitted fields.

Successful HTTP DTOs are validated before publication: exact field sets, canonical IDs, totals and money, valid dates/timestamps, requested page/size and filter membership, unique identities, target identity, line/settlement ownership, current lines and ordered line numbers. Partial/mismatched pages fail rather than being silently filled, truncated or accepted as empty. The extra probes confirmed the technical 2,000-line and three-settlement bounds and ownership rejection. These are technical/contracts checks, not a newly inferred business size limit or a load-performance measurement.

### Read-only detail facts and ordinary presentation

Detail displays the saved line product code/name, color, FIT, full size and barcode snapshots. It does not substitute current catalog data. The snapshot fixture retains `Y版（修身）`, `165/S` and a leading-zero barcode. Nullable historical pricing metadata is shown as unrecorded, not inferred or converted to zero.

Internal entity UUIDs are keys/query targets, not ordinary visible business names. In the original DTO, names unavailable from detail remain explicitly unavailable. Matching names borrowed from the opened list are labeled `列表名称` and the source is explained. They are not claimed to be newly read detail facts. Settlement account names are honestly unavailable instead of showing UUIDs. No balance, debt, original-sale association or return-quota behavior is added.

The mounted list, draft and executed results remain in place behind detail. Closing restores the captured list scroll offsets and trigger focus without rereading. Detail has no edit/save/approve/unapprove/void controls or input fields. These behaviors are covered synthetically; cross-route history and real native-dialog behavior remain unverified.

## Source-report alignment

The approved `demo-source-evidence/core-functions-source-report.txt` identifies sales primary filters (dates/status/type/hall/salesperson), advanced literal-number/customer/warehouse filters, query/reset/retry, 20/50/100/200 document pages, and number/查看 detail activation. The frozen slice matches that selected list/detail behavior. The alignment addendum preserves FIT/full size, independent sales/return records, integer quantity without unit fields, and document settlement flows without balances. No contradictory feature was introduced in this slice.

This is SOURCE_REPORT_ONLY alignment, not direct review of the full frozen Demo source, running Demo observation or pixel equivalence. The Demo's create/command/history/export/print features are outside this deliberately read-only slice and are not silently declared implemented.

## Explicit remaining integration requirements

1. The real root/router/auth host is absent. It must own `ReadContext`, lazily mount/unmount the sales route, construct the actual same-origin reader, and dispose the route when leaving. Trusted logout/expiry/revocation/ambiguous-auth transitions must invalidate old scopes before publishing another principal. Business 401/403 handling is not a replacement for trusted identity refresh and must be composed with that lifecycle. A generic read failure alone does not implement this.
2. The original frozen reference reader is a required port, not a real bounded authorized provider. The implementation deliberately fails fast when no reader is supplied. No production hall/staff/customer/warehouse candidate transport was accepted by this review. Concurrent provider work needs its own review and UI integration evidence.
3. Full named detail presentation was genuinely unavailable under the original DTO. The documented placeholder/list-name behavior is truthful but not full Demo-like named detail. The concurrent single-endpoint DTO extension and UI adaptation must be tested together, including settlement snapshot-name semantics, wrong-target rejection, no UUID fallback and no hydration loop.
4. Direct detail deep-link mounting is a component contract, not router/history/back-forward integration. Top-level cross-route focus/scroll orchestration remains missing.
5. Root `npm test` does not discover the sales unit tests, and aggregate web scripts do not run the sales DOM/build runners. Focused checks were explicitly invoked here. Integrating them into eventual aggregate verification remains necessary; their existence does not make the current default gate complete.
6. New/edit/command uncertainty/replay/conflict workflows, history/statistics/export/print UI, real server/session/PG/browser integration, role/access acceptance and actual performance remain outside this review. No deployment or business readiness conclusion follows.

## Review freeze

Selected original implementation hashes, also recorded in the 21-file manifest:

- `http-reader.ts`: `b959898bad61ff329ceef311f6e474eac0f532fb9c2a82abbb4e201f00e561f0`.
- `response-validation.ts`: `09a29e3eb273e56dfd55760e9e9628c84a4d6a9a5bb76b9cbc5b18b2602bc482`.
- `sales-page.tsx`: `c970abcc910fc9ecb96ca22c2493e1232dca990e605b3e62a8bb0b1139f8dbad`.
- `owned-scope.ts`: `a87b9b5fedb4cbccf0ed9cbde2f4489b0cd8773f1c6a39b468be28ebd36d0725`.
- `detail-host.tsx`: `4ed32160829db6f2b6a819015edebdcc01f156c27ce26b4f2a1eba0c90da8d7d`.
- `detail-content.tsx`: `d59511ec55be254df5381a70eed8ffb02f13a0d19dcfc0df5abd5be7a402a530`.
- `reference-selector.tsx`: `7f665b3dcd569af5c308f104959cae70e9a314f31aed01d52173c2d436c4e9e7`.

Re-review the changed frontend/backend contracts after the concurrent extension; do not carry this scoped PASS onto a new payload or provider implementation by implication.


## Parent integration note
Only trailing whitespace on a blank JSX source line was removed after review. Updated source manifest SHA-256: edc49e1d75d9ad354b37b154ce0736d1dc6436886d01f883f1b5264efeee5276. No behavioral changes were introduced by this normalization. Original review identity is preserved above.
