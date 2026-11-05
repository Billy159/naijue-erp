# Sales UI named-detail and filter-reference extension review

Reviewed 2026-10-20 UTC. This is a separate extension review, not an overwrite of `sales-query-ui-review.md` or an assertion that the original frozen unnamed DTO already supported the extension.

## Disposition and scope

PASS for the frozen sales list/read-only-detail UI extension. No confirmed slice-local blocker was found. The original missing named-detail and concrete filter-reference-client gaps are closed at the source/component/transport-contract level. Real root/router/auth/session/policy/PG registration and actual runtime acceptance remain separate.

Review boundaries:

- Full 21-file UI manifest: `apps/web/src/sales/verification/source.sha256`, SHA-256 `ad43b2f076756510c4625cc740b58fb1c3d6da92011225e44967298aa5a95659`.
- Fourteen-file changed-source manifest: `apps/web/src/sales/verification/extension-changed-source.sha256`, SHA-256 `98511e9d8a695e0bbec35c9c405933d170db32953bdf00eb715869c54ab25e95`.
- Both supplied hashes and every listed entry verified before checks. The full manifest and all 21 files verified again after focused probes.
- Corresponding backend manifest: `evidence/sales-reference-source-sha256.txt`, SHA-256 `8cbf8e4c97787c52af8af137f41d24c2e0fdce77ad09a0f6ca2dad43cd5b7e80`; all 14 entries independently matched. Backend policy/SQL correctness is covered by its separate extension review, not silently absorbed into this UI review.

No implementation/existing test source was edited. Only separate planning report/probe/log files were written. No real database, real network request, service listener, account/login, browser, source-data import, dependency installation, commit, push or deployment was used. The additional cross-layer probe uses Fastify's in-process injection and synthetic trusted providers, not a listening server or PostgreSQL.

## Verification

Independent rerun passed:

- 14/14 unit/mock-HTTP tests, no failures, skips or cancellations.
- All eight synthetic DOM groups.
- Split browser bundle assertions: inert export surface, lazy detail leaf, no test/fixture production imports, styles present.
- Sales isolated strict typecheck, exit 0.
- Shared root strict typecheck, exit 0, against the observed combined source at review time. This is a typecheck result, not a full aggregate runtime-suite result.

Additional focused probes passed:

1. Actual frontend HTTP reader → actual existing Fastify query plugin → actual sales service → exactJson → frontend strict validator. A synthetic native document with bigint monetary/quantity values roundtripped to the exact named wire DTO; the app never listened.
2. A direct `SalesDetailHost` without a parent list displayed current header-reference names and historical settlement account/method names. Two name records deliberately arrived in reverse array order: presentation still paired each record with the correct native settlement/account identities. A settlement whose saved/current labels matched did not gain a redundant current-name annotation. No UUID or unavailable/list-name placeholder appeared.
3. All four concrete historical filter-reference kinds roundtripped through the real endpoint/service. Literal percent, underscore and backslash were unchanged. Every request contained only kind/search/page/pageSize, and the service used a neutral existing list authorization intent. These assertions do not establish SQL execution or production policy correctness.
4. The concrete reference HTTP reader aborted superseded search requests. Late old responses could not replace the current candidate label; same-account permission revision invalidated both pending candidates and detail facts.

Evidence artifacts and SHA-256:

- `sales-query-ui-extension-review-checks.log`: `6f05ffc8dc48e1084218d5aa0ce0059f7ae69173ec7668c95e4d6c23723eb136`.
- `sales-query-ui-extension-focused-probes.mjs`: `3176e822d7f706c8ad21440a2d38961bb1efec549856df0756afef67a38ebcac`.
- `sales-query-ui-extension-focused-probes.log`: `65e9e00d8f86e78128fcd9b27d0f245293e176ac935087e582ff5bbbf6391045`.

Synthetic DOM does not establish actual browser modal/focus/scroll/layout accessibility, Demo pixels, network waterfalls or performance. Temporary generated bundle files were removed.

## Findings

### One strict named-detail contract, no compatibility branch

`contracts.ts` now directly picks `stockBasis`, `referenceNames` and `settlementNames` from the committed `SalesDetail` contract. `http-reader.ts` continues to post only `{ salesId }` to the existing `/sales/detail/query`. There is no renamed/duplicate named-detail endpoint or permissive old-DTO fallback.

`response-validation.ts` requires exactly document/stockBasis/referenceNames/settlementNames. The former unnamed shape fails. Current hall/customer/warehouse names are required strings; salesperson identity/name nullability must agree. Existing header target, owned current lines, canonical exact monetary/quantity values, native IDs, timestamp checks and 2,000-line/three-settlement bounds remain intact.

Settlement names require exactly one record per returned settlement. Each settlement ID must be unique and its paymentAccountId must match that exact settlement row. Missing, duplicate, unrelated and wrong-account records fail; an empty settlementNames array is accepted only when the document has no settlement rows. All historical/current fields must have the committed string types and no extra fields. Validation is complete before facts are published, so the detail component's identity-keyed map cannot normally dereference a missing name record when used with the required concrete reader.

### Historical payment names are not overwritten by current masters

`detail-content.tsx` no longer accepts or reads a list summary. Current hall/person/customer/warehouse names are supplied by the same detail response, including direct component/deep-link mounting without list data. The old `列表名称`/unavailable-name stopgaps are gone.

Saved accountNameSnapshot/methodNameSnapshot are the primary settlement display under explicit `单据记录` column labels. Changed currentAccountName/currentMethodName appear separately as `现名称：…`; equal labels are not redundantly repeated. Current master labels do not replace historical saved display. Product/FIT/full-size/barcode snapshots remain saved line facts, not current product hydration. The source note accurately distinguishes the saved product/payment facts.

Internal UUID fields are used for query targets, keys and name-record association, not ordinary business-name presentation. No balance/debt, original-sale linkage, unit field, return quota or mutating command control was introduced. Exact money formatting still uses string slicing with scale 2, and signed quantities remain exact strings.

### Concrete bounded historical filter references

`createSalesFilterReferenceHttpReader` is an inert exported constructor using the shared same-origin bounded JSON transport. An explicit selector activation/search/page calls exactly `/sales/references/query`, projecting exactly `{ kind, search, page, pageSize }` before shared validation. The parser requires one of the four historical filter kinds, trimmed/control-free search at most 200 characters, fixed pageSize 20 and safe page math. Invalid requests fail before fetch.

No actor/account/role/scope/active-only flag is transmitted, no new business-form eligibility is inferred, and no supplier/payment-account kind or broad catalog endpoint is invented. The provider is historical SALES FILTER-only: its authorized-sales-derived semantics and inclusion of disabled historical references are explicitly documented. It must not be repurposed as a new/edit sales picker.

Responses retain exact string totals, explicit current page, bounded 20 rows, native IDs, nonblank full labels and unique identities. Malformed/partial/wrong-page data fail instead of producing an empty-success or fixture fallback. Server ordering/authorization/search semantics remain server responsibilities; the browser does not resort, truncate labels or attempt to rederive customer-code search membership from the label.

There is no eager catalog load, idle/hover/predicted prefetch, per-name lookup, N+1 reference hydration or product hydration. The reference next-page control now also checks the safe page-times-20 boundary.

### Scoped lifecycle and privacy remain intact

The extension reuses the reviewed `LatestQuery`, effect-owned child scopes and route/controller ownership. Scope/identity/session/permission replacement aborts and clears query facts. Detail cancellation disposes its query and requires an explicit fresh read; list cancellation intentionally retains the marked previous executed result. Ignored-signal responses cannot republish cancelled/superseded/invalidated data.

Existing and new DOM coverage exercises StrictMode, explicit reference activation, reference close/identity revocation, retained list scope/page size, detail cancel/close, and late ignored-signal responses. The independent concrete-reference supersession probe adds a race not reliant only on component fixture ports. Transport errors remain sanitized and no credentials, auth metadata, private provider bodies or raw error messages are rendered. Trusted host invalidation is still a required integration responsibility; a read error does not itself implement auth/session lifecycle.

## Source-report and integration status

The selected list filters, query/reset/retry, 20/50/100/200 document pagination and explicit number/查看 detail entry continue to align with `demo-source-evidence/core-functions-source-report.txt`. FIT/full size, independent sales/returns, no units and settlement flows rather than balances remain consistent with the architecture alignment addendum. This is source-report alignment, not full Demo source/pixel/runtime parity.

The concrete client and same-response names close the original source-local integration ports, but do not create a production host. The real root/router must still lazily mount the route, inject actual fetch/origin/basePath and both readers, bind trusted session/access invalidation before principal replacement, and register the actual server session/policy/PG providers. Direct-host detail behavior is not actual router/history/back-forward orchestration. Create/edit/save/approve/unapprove/void workflows and history/statistics/export/print UI remain outside this read-only slice.

Aggregate scripts changed concurrently outside the frozen UI source manifest. Current package.json was observed to include sales unit discovery, `test:web:sales`, and that DOM command in `check:web`. Therefore this review does **not** repeat the historical claim that unit/DOM discovery is still missing. The frozen README's statement that standalone sales DOM checks still need aggregate wiring is now stale relative to that independently observed package.json; this is a nonblocking documentation synchronization item. The standalone sales split-build check was explicitly run here; no claim is made that it is included in all eventual default gates. Full aggregate execution remains the integration owner's responsibility.

No actual server/session/PostgreSQL runtime, real permission policy, deployed same-origin/CSRF behavior, full browser accessibility, performance/capacity, production readiness or deployment acceptance follows from this review.

## Selected frozen implementation hashes

- `contracts.ts`: `a86512c4dde9e15b1ded82fda26236073bf34fdf6fa0133f1598fe3225142625`.
- `http-reader.ts`: `8c533ecbcb7e905b79ea865fedf205a39efb6a5a8ed40985e8dfdcca28049eb1`.
- `response-validation.ts`: `b0790891a35945ced8af4eecbdede9103de2424f9bced719851a69c7d96c1546`.
- `detail-content.tsx`: `3106e4ebd844c52e7681c42386a97ac43c446e2a333ea70863c9f8b797c5a91d`.
- `detail-host.tsx`: `327d8b0da1bd937439bac9215451a1df2f4ce9f3b254ff3804d15dd4700c4cb7`.
- `reference-selector.tsx`: `c9df244d75b03ce0d155cea518d4f4144f10f51a6ef2430fffed9b78d6e2d9e9`.
- `sales.test.ts`: `a0d661157968f71d93d2d8df517f8372c7cdf3ba4150f08f70b29b1e318a30cd`.
- `tests/run-dom-tests.mjs`: `98b37d3b7c25194d8c1e439ba28e07b6f83daf6f2f9095cf2eba507ead8a6f89`.

Re-review changed contract/implementation files rather than carrying this frozen scoped PASS onto later source by implication.
