# Independent party UI source and lifecycle review

Review date: 2026-10-20 UTC. Scope: the new `apps/web/src/parties/**` slice and its declared presentation/contract dependencies. Read-only source review plus one bounded local synthetic controller probe. The reviewer made no production-source edits, used no network, service, browser, installation, database, commit, push or deploy, and did not repeat previously denied browser operations.

## Exact reference

Frozen Demo commit `b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3`, locally extracted at `/workspace/shared/frozen-demo-ui/extracted/8877-ui-evidence-b8bcfe3`. The review inspected `basic-settings-v2.jsx/.css`, the shared inventory controls and numeric pager, `unified-single-select.jsx`, and relevant later cascade rules documented in `LOAD_ORDER.md`. The initial 11 entries and the final 12 entries (adding source `styles.css`) in the owner's frozen-source manifest independently verified on this pass.

Approved business departures are separate customer/supplier identities, no dual-role tags, backend-only KH/GYS allocation and readonly existing codes, and one atomic required-name-and-enabled EDIT against backend contract revision `b865920`. This review does not demand old merged parties, legacy runtime imports, fabricated data, audit records, or a nonexistent recovery endpoint.

## Findings sent to the owner

1. **Pager popup policy lost.** The earlier `party-single-select.tsx:10` always used bottom-left/generic approximately 300px width. Frozen `unified-single-select.jsx:89-107` explicitly uses top-left/150px for native pagination; Choice consumes those at line 69. Current correction declares `props.pagination ? 'tl' : 'bl'` and `props.pagination ? 150 : originalMeasuredWidth`.
2. **Title cascade lost.** The earlier `source-settings.css:5` used a font shorthand that reset inherited line-height, while its heading omitted source line-height and weight. Frozen `inventory-workbench.css:9-11` uses separate route font properties, and `styles.css:10` supplies h1 30px/600. The current correction restores separate route font-family/font-size plus local h1 20px/30px/600. This establishes declaration fidelity, not measured browser typography.
3. **Clean modal resurrected after navigation.** `controller.ts:59-65` permits leaving an unchanged edit, but earlier route cleanup only called `suspend`, retaining the editor. Returning the same workspace therefore showed the old modal. Frozen App initializes modal to null at `basic-settings-v2.jsx:149`; mount/render unmount and recreate App at lines 194-196. A bounded synthetic controller probe reproduced the retention. Current owner correction separates generic suspension from `leaveRoute()` and schedules clean-only cleanup after actual route detachment, preserving StrictMode reattachment, dirty drafts and unresolved command references.
4. **Numeric pager adds layout wrappers.** Earlier `party-pagination.tsx:11` wraps each numeric button/ellipsis in `span.iw-actions`, adding 8px inner gaps and nested wrapping. Frozen `inventory-workbench.js:53-55` emits direct numeric buttons and `span.iw-page-ellipsis` under `.actions`, whose source refinement is 4px/default no-wrap (`inventory-refinement.css:44,50`). The final correction uses keyed Fragment with direct buttons/ellipsis and a local 4px/no-wrap action rule. This is a static structure/style correction, not a pixel measurement.

All five findings below are corrected in the independently rechecked final freeze. The additional cache discrepancy was caught by the owner after the first freeze, reported immediately, and corrected under root authorization before this final conclusion. No additional blocking finding was identified within this inspected-source and bounded-synthetic scope. The release gates below remain unaccepted.

5. **Unapplied filter draft lost on route reentry.** Frozen `basic-settings-v2.jsx:24` stores each kind's draft in module-level cache, and `updateDraft` at line155 updates it independently of applied filters. Earlier `PartyPage:26` initialized local search/enabled from the last applied query after remount, losing typed-but-unqueried filter edits. This was a source interaction mismatch, not write/data-loss evidence. The final correction owns immutable per-kind filter drafts in `controller.ts:17-21,43,69-73`, binds the route directly at `party-route.tsx:26,69`, and clears drafts during identity/disposal at `controller.ts:181`. Draft edits never dispatch reads or replace executed parameters; Reset explicitly clears draft and queries defaults. The owner flagged the finding after the first freeze and obtained root authorization before editing it.

## Inspected passing boundaries

- `party-route.tsx:26-39` defaults ENABLED/page1/20 only on active idle route attachment. Construction and hidden kinds are inert; filter edits do not dispatch. Reset immediately reapplies defaults/page1 through one bounded read. Cached executed queries remain independent of editable drafts.
- Actual Arco small Table, Input, Button, Tag, Empty, Modal, Switch and ordinary/page-size Select are used. Name/code/status/edit order, 100px state and 76px action columns, source toolbar/filter geometry, 520px modal and name/readonly-code/edit-state fields are source-derived. Removed tag fields and split page names are approved departures.
- `controller.ts:129-163` snapshots one exact action/key/target/expectedVersion/name/enabled command; `response-validation.ts:18-25` rejects extra or missing command keys. No code is writable or allocated by the client.
- `controller.ts:205-230` accepts only validated native results, preserves code identity, treats unconfirmed writes conservatively, serializes duplicate attempts and prevents late detached replies from restoring facts. Replay uses the retained original object, not a reconstructed command or new key.
- Receipt404 keeps uncertainty and the route guard. Receipt/result is the original operation result, not current name/full detail. A conflict's freshly read facts are separate from the retained draft and require explicit preparation to advance CAS.
- Identity invalidation clears both independent stores, drafts, result facts and command references before access-failure callbacks. Dirty/unresolved navigation is blocked; stopping a wait never claims a server transaction was canceled.

## Independent bounded probes

`evidence/party-source-ui-independent-probes.mjs` and its log are local, synthetic, network-free evidence. They establish:

- A valid-shaped result with changed existing code cannot become committed; original code plus both name/state drafts remain retained and uncertain.
- Receipt404 cannot release the unresolved guard; explicit replay uses the identical original command object/key/name/enabled/CAS and mints no new key.
- Disposal clears editor and command references.
- The original clean-editor retention was observed separately from these safety passes; generic suspend intentionally remains distinct from actual route-leave cleanup after the correction. Final independent assertions verify that legitimate clean leave clears, while dirty and uncertain leave are refused.
- Immutable raw search/status drafts remain independent per kind across allowed leave, with no typing-triggered reads or applied-range mutation. Explicit reset performs one bounded read. Disposal clears both kinds' drafts.

The extended reviewer probe initially compared the shared query primitive's deliberate null-prototype parameter snapshot to a plain object with strict prototype-sensitive equality. That was a reviewer assertion error, not a production failure. Its log is preserved as `evidence/party-source-ui-independent-probe-shape-observation.log`; the corrected assertion compares semantic field values and passes.

The owner's existing unit/actual-Arco JSDOM/build/type evidence is inspected evidence, not an independent rerun by this reviewer. No costly aggregate was run.

## Release gates, not fabricated fixes

- No real-browser, frozen screenshot, computed-style, responsive, dropdown clipping, keyboard, pixel parity or complete accessibility acceptance is established. Static prop and declaration assertions do not substitute for those.
- Candidate selector/options still use their custom bounded `.iw-control`/`.iw-popover` search/page presentation (`party-candidate-selector.tsx:32-33`, `party-candidate-options.tsx:35-40`), rather than frozen Arco entity auto-open flow (`unified-single-select.jsx:139-157`). Maintenance list/form Arco restoration must not be generalized to candidate-popup visual parity.
- Real trusted host/history/Back/Forward/browser-unload composition remains a deployment gate. The supplied application controller's guarded navigation is not evidence of an installed browser-history adapter or durable reload guard.
- No live HTTP/session/policy/CSRF, PostgreSQL, runtime allocator/default-customer race, grants, capacity or deployment verification was performed.
- Known-key actor-owned receipt lookup cannot discover an unknown operation key after reload/identity clearing. A separately authorized durable recovery/storage/API contract is required; current row values or404 are not evidence of rollback. Do not invent an endpoint.
- There is no authorized party audit-list DTO/route. The source operation-record button is honestly unavailable; no fake audit is acceptable.
- Installed Arco2.66.16's React19 development ref warning remains observed. Root aggregate discovery and unrelated worktree changes are outside this slice.

## Final freeze closure

Final corrected freeze received from the owner and independently rechecked at 2026-10-20 18:43 UTC. This supersedes the 18:35 first freeze after the filter-cache finding:

- `verification/source.sha256`: all 22 slice files match. Manifest SHA256 is `85b99f2b35bc093c2b8ce65b50e753ea529df3c86d40914b9bc5a1dcdc476d08`.
- Final `controller.ts` SHA256 is `697a2ad8b472542dc6e5bc531d145e59c4a99f31aa325d81f0810149e7749f92`; `party-route.tsx` SHA256 is `e580e82bcc71c7c39722805ee3a45305a6da3f5a6c6846705aa8cd036edb2381`.
- `verification/reference-source.sha256`: all 15 declared dependency inputs match. The earlier shared-controls mismatch was reviewed/refreshed by the owner; current controls SHA256 is `e863d8bdcb9023acb7cfed24c0a70a7bec06993883f9bc63094fe84114f2a504`.
- `verification/frozen-source.sha256`: all 12 exact frozen reference inputs match.
- `verification/installed-presentation.sha256`: all four installed Arco dependency files match.
- Reviewer ran `node evidence/party-source-ui-independent-probes.mjs` against this final freeze: filter-draft, clean-leave and write-safety assertions pass. Reviewer also ran the focused actual-Select/title/pager static assertion helper against the unchanged presentation correction during the first freeze: pass. These are not browser/computed-layout tests.
- Inspected the owner's final consolidated unit output: 34 passed, zero failed (15 HTTP plus 19 controller). Inspected final actual-Arco JSDOM output: 11 groups passed, with CSS deliberately omitted, including actual route filter reentry and applied-page separation. Final dynamic-leaf build/static AST/CSS/DOM-structure check passed; final scoped strict TypeScript log is empty and the owner reports successful exit. These full suites were not independently repeated.

Durable independent report/probe/log plus the preserved reviewer assertion observation, four owner manifests and final-check logs are covered by `evidence/party-source-ui-independent-review.sha256`. Source was not edited by this reviewer. No browser/pixel, live service/PG, reload-recovery or deployment acceptance is established.
