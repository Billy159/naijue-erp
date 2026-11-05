# Product read-only drawer independent review

Review date: 2026-10-20 UTC. Repository: `/workspace/shared/naijue-erp-rewrite`. This was a read-only application review; only this report and focused-probe evidence were written outside the application. No installation, local Mac access, real database/API/server, credential use, push or deployment occurred.

## Result

No confirmed blocking application defect was found in the scoped drawer slice. Source inspection and additional independent probes support the three-tab, target-only, read-only, explicit-activation and disposal behavior. This is not frozen-Demo visual acceptance or real-business completion.

The evidence-hygiene issue found during review was resolved by a metadata-only correction: generic `apps/web/dist-preview/verification.json` now identifies the current 271,118-byte drawer artifact and 33 pure tests / 14 DOM groups, and `check-results.txt` is byte-identical to the drawer-specific captured log. I independently read the new JSON, compared the two logs, and rechecked the source manifest. Earlier inventory-only summaries are preserved under clearly archived `inventory-only-20261020T155931Z-*` names and are not current acceptance evidence. No application source changes or repeat suites were needed for this correction. The final JSON wording now correctly describes 256 KiB specifically as the Page visualization embed limit, not a general Library attachment limit. Its final parsed SHA-256 is `a8087a67b2bc885723466bf592653109850ac091fb4eeca1dba090b6c3b55503`, independently verified after the wording correction.

## Reviewed snapshot and evidence

- Repository HEAD when recorded: `ce498d0350204683222f0a213feae8b6532ddc31`. The drawer slice is represented by the working-tree source manifest, not by claiming all of it is committed at that HEAD.
- `apps/web/dist-preview/product-drawer-source.sha256`: SHA-256 `4a23c57dffc61ae50e965896f9fa510b76d5b80f4f9013d4a594f36cdfcc2b85`. Independently ran `sha256sum -c` and all 21 listed files matched.
- Portable preview: 271,118 bytes; SHA-256 `e7539a72c8400b21d7abb56334e8153551759fdac7d7200b794f99f108bd2e67`.
- Build metafile SHA-256: `912887bad773098ab0449fd2b4999335cda683158405e94f7a24a944210fe422`.
- Current owner-generated captured command log: `apps/web/dist-preview/product-drawer-check-results.txt`, SHA-256 `3c3dc2ce2c51820dd7e089e48b6f828eb782f090359ce207e4a2895aed54b8a4`. It records successful web typecheck; 33 loading/inventory/product tests; all nine original inventory DOM groups plus five drawer groups; static preview build; split-graph checks; and actual bundled-code jsdom smoke. I read this log and the test source; I did not duplicate these aggregate suites.
- Independent focused probe stdout: `product-drawer-focused-probe.log` alongside this report. These probes were executed against the current source, not inferred from owner test prose.

## Source alignment and non-invention

The approved `demo-source-evidence/core-functions-source-report.txt` confirms the inventory “查看” product drawer and three tabs 基础资料 / 规格 / 图片, citing frozen source `product-arco.jsx:184` at `b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3`. `noncore-functions-source-report.txt` confirms the seven basic product fields and color/size-group/FIT specification concepts. `base-config-source-report.txt` confirms full size labels and FIT labels/order, and explicitly does not establish a complete current color dictionary.

- The implementation exposes exactly those three read-only tabs, not the six maintenance tabs. Basics show 款号、名称、分类、年份、季节、供应商、系统货号. No extra product business field, price/barcode editor, unit, inventory correction, or size-group/season maintenance was introduced.
- Null fields are shown as 未提供; null tab DTOs and empty image/SKU collections have truthful empty states. No previous-product or made-up “success” data is used as a fallback.
- Full labels are supplied by the reader and rendered directly, not derived from codes. The synthetic provider is explicitly TEST ONLY and remains outside the default application data path.
- Exact frozen-Demo field arrangement, drawer width, spacing, scroll positions, image arrangement, focus order and pixels are not established by the source summaries. CSS values are implementation choices, not verified Demo equivalence. The README and stylesheet correctly disclose that limitation.

## Loading, scope and race safety

`inventory-page.tsx` mounts `ProductDrawerHost` only through the explicit 查看 callback and gives each opening a product-plus-sequence key. `product-drawer-host.tsx:8–18,29–43` gates content on action code plus required CSS readiness. The closeable lightweight frame remains available before that content is ready. A failed style link is removed and the async registry removes failed entries, permitting explicit retry. Closing detaches the consumer even if an import cannot physically be canceled.

`product-drawer.tsx` dynamically imports only the active tab and remounts its scoped leaf on a tab change. Each tab query is created locally and starts only after activation. The preview product fixture itself is imported only for an explicit product read. The split graph/CSS assertions in `run-bundle-smoke.mjs:6–21` check that shell, inventory route, drawer and inactive-tab boundaries are separate. The portable file intentionally inlines code/CSS and is not network-waterfall proof.

Parent aborts cascade through drawer, tab and image scopes. LatestQuery clears facts on dispose and uses sequence/abort guards even when a transport ignores cancellation. The existing race tests cover tab switch, close/reopen, cancel/retry, image close, identity replacement and ignored late responses. An additional independent focused probe replaced a still-loading drawer directly via its key: the old request was aborted, the new request targeted the new product, and a deliberately late old response could not overwrite the new product.

## Actual four-dimensional SKUs and media

`product-model.ts:26–39` validates the containing product, unique dimension IDs, required color/FIT/size membership, unique SKU IDs and unique coordinates. Product identity comes from the containing target DTO and scope. `product-tab-specifications.tsx` iterates only `data.skus`; it does not generate colors × fits × sizes. The independent probe compared every displayed `data-sku-id`, all three labels and row order against the provider list exactly: 28 actual rows matched, including same color/size with independent FIT. No absent SKU coordinates were invented.

`product-model.ts:41–60` rejects arbitrary schemes and SVG/HTML data URLs; product and image response identities must match their requested targets. React renders labels as text. This does not replace real media authorization, content validation, server size limits or a deployment CSP.

Image metadata returns thumbnails only. Lazy thumbnail rendering does not call the original-image reader; that reader is invoked only when the preview is explicitly opened. Original-read failure/retry and close-while-pending are covered in the owner tests. An independent probe also exercised thumbnail image-error and retry. The corrected synthetic PNG is covered by a decompressed-pixel test, not merely by a URL-syntax assertion. There is no upload/mutation path in the drawer.

## Keyboard/focus behavior and test preservation

The drawer focuses its close control on open, handles cancel/Escape, and traps Tab at its focusable boundaries. The image overlay separately focuses its close control, stops Escape/Tab propagation, and returns focus to its originating thumbnail. Closing the drawer returns to its inventory 查看 trigger. These behaviors are supported by source and jsdom probes, not by a native-browser accessibility acceptance.

Additional independent probes passed drawer forward/backward Tab boundary wrap, overlay Tab wrap, overlay Escape isolation and thumbnail focus return. The existing owner DOM suite additionally checks Escape does not close the parent drawer, inventory-trigger focus return, and old identity facts disappearing.

A focused headless Chromium native-modal probe was attempted against a temporary file-only copy of the portable preview. Chromium failed before opening the document: process-singleton `socket() failed: Operation not permitted`, exit 134. It produced no page or focus result. No sandbox bypass or alternate access route was attempted. Native top-layer/inert behavior, real keyboard interaction, focus layout and actual image decoding in a browser remain unverified.

All original inventory assertions remain in the revised DOM test. The only meaningful cancellation-fixture change replaces timing dependence with a controlled pending 200-size response, then resolves that response after cancel and retains the same visible/applied-100 and next-query-100 assertions. This strengthens late-response coverage rather than weakening it. Bundle smoke replaces fixed sleeps with bounded predicate polling while preserving the original zero-read, idle-route, result-count, cell-unavailable, close/reopen and no-runtime-error assertions; drawer checks are additive.

## Remaining acceptance boundaries

- The 271,118-byte portable file exceeds the Page visualization embed limit of 256 KiB by 8,974 bytes. This is not a general Library attachment size limit: the HTML may be delivered as a file, but must not be claimed to have been embedded or executed in a Page. The build reports the overage and retains functionality. Do not trim features or bypass the Page embed limit. The split build remains available for an authorized static destination.
- No real product reader/API, real account authorization, production media policy, frozen-Demo runtime comparison, screenshot/pixel parity, actual network waterfall, large-catalog memory/performance, or full native accessibility acceptance was performed here.
- This review does not certify inventory ledger integration, exports/printing, other ERP pages, backend transfer/sales changes, or the entire application.
