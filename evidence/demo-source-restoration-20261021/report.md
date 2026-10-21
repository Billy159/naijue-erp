# Document presentation source restoration, 2026-10-21

## Result

Restored the deterministic final source declarations for sales detail and transfer list. The five supplied feedback images were actually viewed before editing. This is a source-level restoration supported by synthetic checks, not a claim of real browser or pixel acceptance.

## Frozen source and load order

- Shared frame: styles.css:16 supplies the generic keyboard outline; :17 supplies the following text-input/select/textarea exception. Checkbox/radio/button/link outlines remain. Native text inputs retain visible border/focus-ring feedback; Arco internal inputs are excluded from this additional inner shadow and retain the existing composite shell focus border.
- Shared page: golden-consistency.css:4 is later than styles.css:37 and overrides non-inventory pages to padding 16px 20px. DemoFrame marks inventory from its already-authoritative selected navigation state, so inventory keeps its existing padding, including during lazy loading.
- Sales: sales-detail-alignment.css:203–205 preserves settlement spanning columns 4–6. :252–254 supplies minmax(0,1fr) / minmax(0,1.2fr) / auto, centered alignment, nowrap/ellipsis. The new fixed 100/160/110 widths, max-width 560 and small-screen fixed replacement were removed. The already-correct six-column fields and 1200px table minimum stay unchanged.
- Transfer list: transfer-current.css:11 supplies table 13px, cell padding 4px 10px and weight 400. Later golden-consistency.css:34 supplies 40px headings, 44px body rows and heading weight 600; it does not replace that font or padding. Later final-ui.css:3 supplies status badge padding 3px 7px, radius 4px and weight 500; final-ui.js:6 maps 未审核 to pending. The native DRAFT selector now uses the corresponding warning palette; APPROVED keeps success and VOID keeps neutral-tag ink.
- Sticky actions: interaction-common.js:4 marks the operation column; interaction-common.css and final-ui.css:4 pin it right. The restored local equivalent uses explicit action-cell classes, opaque surfaces, right 0, shadow, body z-index 2 and header z-index 7. Existing row-hover surfaces are preserved instead of letting transparent sticky cells reveal underlying content. Transfer action width 70px follows golden-consistency.css:54; sales min-width 136px follows interaction-common.css:3 while its original colgroup stays unchanged.

## Exact read-only semantics and preserved facts

Frozen sales-current.js:285 has a line 查看 action, but :239 opens product specification detail. The rewritten page had changed this to a saved-line snapshot expansion. The button/column is retained but explicitly disabled with 商品规格详情尚未接入, pending genuine shared product-detail integration. No drawer or replacement modal was invented.

The extra 第 N 行保存记录 and 单据保存信息 blocks are absent from frozen sales-current.js:163–181 and were removed from the default page. 操作历史 remains disabled and unimplemented, not repurposed into a misleading snapshot view. Stored barcode, allocated discount, gift flag and created/updated/approved timestamps remain unchanged in domain/DTO/validation/detail response. The restored default page does not display all these facts. Unit regression assertions explicitly preserve them.

No API, authorization, reads, DTO fields, query behavior, source data, pagination, product drawer, or inventory matrix was changed by this owner. No browser, listener, server, PostgreSQL, credential, remote push or deployment was used.

## Verification

- source-css-dom.log: final frozen source tokens/load order, parsed CSSOM declarations/selectors, focus exceptions, SSR inventory marker, settlement layout, table/badge/sticky surfaces. All passed. This verifies declared styles, not computed browser geometry.
- sales-source.log: 10 pinned frozen source hashes, source mappings, action-only detail JavaScript/CSS asset graph. Passed.
- sales-unit.log: 16 tests passed, including preserved nonvisible saved fields.
- sales-dom.log: all 18 synthetic DOM groups passed, retaining Back/focus/scroll, cancellation, permission/identity invalidation, CSS gating and no-hidden-read coverage.
- transfers-dom.log: all 11 synthetic DOM groups passed, retaining bounded reads, canonical matrix, lifecycle and shared product checks.
- sales-integration-dom.log: all 6 composed application groups passed.
- transfers-integration-dom.log: all 6 composed application groups passed. Existing Arco/React 19 element.ref warnings are recorded, not suppressed.
- application-build.log / development-host-build.log: both actual emitted-build boundary checks passed after allowing only the exact reviewed negative-only Arco inner-input focus exclusion. Positive Arco selectors and an altered exclusion are still explicitly rejected. Existing actual input graph, lazy-leaf and stylesheet isolation assertions stay intact.

Typecheck, final aggregate checks/preview build and commit are owned by the root integration lane. This owner did not run concurrent tsc. Real browser/pixel verification, full history, sales line product viewing and bounded-reference parity remain explicit gaps. Source hashes are in source.sha256; structured scope/results are in scope.json.
