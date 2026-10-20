# Frozen settings adaptation, b8bcfe3

## Evidence and acceptance

Exact bytes inspected locally from the verified frozen UI evidence package:
`/workspace/shared/frozen-demo-ui/extracted/8877-ui-evidence-b8bcfe3/frontend/`.
The source commit is b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3. See the
frozen-source manifest in verification/ for the precise inputs. No original
business data modules, MASTER_DATA implementation, bridge, account data, old
bundles or global render/mount wrappers are imported or executed.

This revision replaces the earlier guessed scaffold with the source's actual
Arco components and source-derived layout. It is source-faithful, NOT verified
pixel parity. Frozen screenshots and runtime computed-style/cascade evidence
are not available. Real-browser visual, responsive and keyboard comparisons
remain outstanding. Synthetic DOM tests deliberately omit all CSS.

## Source mapping

- basic-settings-v2.jsx:19-26,49-67,146-196: settings defaults/status, toolbar,
  table, pagination, modal and editable fields. Actual Arco Input/Button/Table/
  Tag/Empty/Modal/Switch are reused, not replaced by hand-drawn components.
  Its cache[type].draft/updateDraft distinction is retained as a bounded per-kind
  immutable controller filter draft. Exact typed search/status survive route
  reentry without dispatching or changing applied results/paging; identity/session
  invalidation clears them with the workspace. Reset clears and applies defaults.
- basic-settings-v2.css: original settings-owned layout declarations retained in
  source-settings.css: toolbar gap/margins 8px, search flex 280px/max440px,
  ordinary filter 178px/min128px, bounded table region, bottom pager and 520px
  modal/max viewport minus32px. Global body/.app/.main/#page/old mount-container
  rules are excluded because the new authenticated root owns its frame/lifetime.
- styles.css:3,10 and inventory-workbench.css:9-10: preserve route font-family/
  font-size separately (no shorthand line-height reset), and title 20px with the
  inherited-source explicit 30px line-height/font-weight 600, scoped to the party
  title rather than requiring a global frame edit. Static cascade assertions
  preserve these declarations without claiming rendered geometry.
- inventory-workbench.css: shared Arco control, table-density, status, compact
  field and modal-adapter block is retained, with selectors narrowed to the
  party route/modal to avoid unrelated global cascade. Settings uses its actual
  Arco small Table, state column 100px and edit-action column 76px.
- unified-single-select.jsx: its actual Arco Select, flat label/page-size display,
  popup placement/width policy and source local CSS are adapted to a local React
  host, without global mount maps, native-source bridge or ShadowRoot registry.
  Pagination preserves nativeData's tl placement and 150px popup; ordinary
  selectors keep bl placement and the existing measured-width policy. A bounded
  AST regression inspects the actual Select prop branches, without pretending
  JSDOM can establish geometry.
  The original source's state choices are normal/disabled/all, mapped explicitly
  to the real native ENABLED/DISABLED/ALL query enums.
- inventory-workbench.js:51-57: actual shared pager numeric-window/gap policy,
  exact totals/range,20/50/100 settings sizes, jump/prev/next behavior are adapted
  directly, with keyed Fragments preserving direct numeric buttons/source ellipsis
  spans and gap4px/no-wrap actions (no extra numeric layout wrappers), rather than replacing the settings page with inventory product sizes.
- interaction-common.js: dirty-discard wording is retained. Clean transport adds
  explicit conflict/current-state and uncertain-result recovery, which have no
  original runtime receipt API counterpart in the evidence package.
- demo-presentation/controls.css and the parent's DemoFrame scoped semantic tokens
  are the shared clean presentation contract. Compatibility color aliases exist
  only on the party route/modal/select host. Modal/popup portals stay under the
  scoped route so they inherit the authenticated frame's theme, not body globals.

## Approved departures, not accidental omissions

1. Customer and supplier are separate pages, filters, candidates, forms, identities
   and server tables. The old combined party title, tag filter, tag field and tag
   column are removed. Equal names/codes never merge records.
2. New code is assigned only by the trusted backend, KH000001/GYS000001 onward;
   old code is preserved verbatim. The form uses the source's readonly text field,
   showing 保存后生成 on create. No client allocation or code-edit input exists.
3. The source's initial normal-status first page is read only on explicit route
   activation, using one bounded native query. Hidden routes still load nothing.
   Reset immediately reapplies normal/default search/page1 through one bounded
   native read. Filter typing does not submit, and unapplied search/status drafts
   survive per-kind route reentry separately from the last executed query. Paging
   and refresh never apply those drafts implicitly. No all-table source snapshot
   is loaded into global state.
4. The source's single edit modal changes name and enabled together. The real API
   was coherently extended to exact EDIT{name,enabled,id,expectedVersion,requestKey,
   action} so one click is ONE transaction/CAS/key/receipt, not two misleading
   sequential saves. CREATE remains name-only and enabledtrue. True→false default-
   customer protection rejects the whole combined edit. No extra row state buttons
   are added merely because separate DISABLE/RESTORE endpoints remain available.
5. Confirmed success closes the modal and refreshes only the existing executed
   native list range, as the source updates its visible list after save. Conflict
   or uncertainty does not close, auto-retry or replace the key. Name AND state
   drafts remain locked/preserved for original receipt/exact replay recovery.
  Legitimate route leave clears only a clean unchanged editor or canceled detail;
  StrictMode attachment probes are not treated as route leave. Dirty/uncertain
  drafts and original operation identities remain blocked and preserved.
6. Source 操作记录 cannot be fabricated: the real party service has no authorized
   audit-list DTO/route. Its button is explicitly disabled with an unavailable
   explanation, not populated with fixture logs or a guessed endpoint.
7. Native response result/receipt is the original operation result, not current
   name/full snapshot. The UI refreshes current list facts and requires fresh
   native detail before a subsequent edit. It never optimistically rewrites rows.

## Dependency evidence

Existing local @arco-design/web-react2.66.16 was reused without installation or
network. Root subsequently declared/locked the same existing version separately;
this slice did not edit package or lock files. Installed package JSON SHA256:
1a34b4562ddbb35cc394ee2c8613775423c238f07f86b308c4ab6cb2da6b2a15.
Installed dist/css/arco.css SHA256:
6e565215fc2c919a3b4bcef0a8b8b328bb33e7c86c6e7111e63131b049812aeb.
NodeNext uses the package's official typed named exports, not local any stubs.
Actual Arco development code emits React19 element.ref deprecation warnings;
synthetic behavioral success does not erase that compatibility observation.
