# Shared frozen Demo controls

The committed Select action is now used by inventory, sales and transfer page-size
controls through one lightweight `page-size-select.tsx` loading/lifecycle shell.
The inventory adapter owns only 100/200/500 options and numeric conversion; document
pagers retain 20/50/100/200 and their own exact-total/page mathematics.
The page-size slice did not alter schema, query contracts or business behavior.
The source-adapted multi-select integration is described separately below.

## Reused source, not a lookalike

The frozen original is `frontend/unified-single-select.jsx` at commit
`b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3`, SHA256
`0551d20e63ee3e50e214ee4137b6b4a7fa98b0eb441dd51cea32e01e434dd43d`.
`source-provenance.json` records inclusive line ranges and their hashes.

- Source lines 10, 12–17, 24–26: 21 host/select/tag/menu/option rules. Their
  declarations are copied unchanged; selectors alone gain `.demo-single-select`
  scope instead of the frozen ShadowRoot. This includes 32px trigger, 23px tag,
  30px options, option padding, selected/hover/disabled roles and popup chrome.
- Source lines 56–73: the real Arco Select leaf, page-size/flat classes,
  non-auto-aligned popup and tag label rendering. The source option-label fallback
  is resolved against the caller's typed options rather than an undocumented
  `OptionInfo.label` property in Arco's installed types.
- Source lines 89–107: only the pagination presentation rule, top-left placement
  and 150px popup width. No native select scanning or native change bridge.
- Source lines 139–167, 194–200: intent of replacing an entity popup and closing
  on outside/Escape, not its global session, document listeners or DOM mutation.
  The new ownership controller is explicitly an adapter, not copied source.

`single-select.css` imports only installed Arco 2.66.16 Select and Trigger CSS
leaves. It does not import the full stylesheet, base/palette/body reset or root
component barrel. The installed component-leaf CSS uses its normal `.arco-*`
selectors; the copied Demo declarations and added theme aliases are host-scoped.
Four static icon rules are copied from the installed base CSS and scoped, without
loading that global base sheet. Their source hash is recorded too. The existing
`../demo-presentation/ARCO-LICENSE` covers the copied installed-package rules.

Excluded: data globals, `ERP_DEMO`, entity/native DOM bridges, source mount maps,
MutationObserver, full-library CSS, grouped options/recommendations, empty-option
sentinel, search/clear, transfer creator/FIT exceptions and optimistic local value.
The narrow ungrouped, non-search, non-clear contract is the common subset of both
three page-size widgets. Hosts supply all real options/labels and applied value.
No fake model data or new fields are introduced.

## API

- `single-select-contract.ts` exports `DemoSingleSelectOption`,
  `DemoSingleSelectActionProps`, and `loadDemoSingleSelectAction()`. Importing this
  lightweight entry has no DOM effects, data calls, CSS or eager React/Arco import.
  Calling the function crosses the dynamic import boundary to the real Select.
- `DemoSingleSelectAction` accepts label, string value, readonly string options,
  disabled/open, optional focusOnMount, and onOpenChange/onChange callbacks.
  `presentation: 'page-size'` fixes source `tl` / 150px behavior. `tag` or `flat`
  requires an explicit popupWidth and optionally accepts `bl`/`tl` placement.
  Selection only reports an enabled known option while open; a closing popup cannot
  commit through an old option during its exit animation. It never changes the applied
  value unless the host supplies that new value.
- The action must not mount until its separate compiled `single-select.css` entry
  has loaded through the host's existing lazy style lifecycle. It intentionally
  has no CSS import or document-global loadStyles cache: esbuild otherwise hoists
  dynamically imported CSS into startup CSS. The source CSS is a bundler entry,
  not an unbundled stylesheet with npm imports to serve directly.
- The action uses a local-only portal and controlled visibility. Disable closes
  open intent, unmount removes the local portal, and a guarded refresh handles
  installed Arco's React 19 StrictMode portal replay. These are lifecycle adapters.
  Normal Arco exit animation may retain a closing subtree briefly before removal.

`popup-ownership.ts` is pure TypeScript. Create one `ExclusivePopupController`
per authenticated app session, never at module/document scope. `open({ signal,
onClose })` returns a lease, or null for aborted/disposed/superseded requests.
Opening another owner closes the previous with `replaced`. A stale lease cannot
close a newer one. The signal can be the existing ReadScope.signal.

- Lease.active gates async attachment/open intent; lease.close() closes normally;
  lease.dispose() releases the mounted trigger/action owner.
- controller.outside(insideLeaseOrNull) closes unless the event hit the current
  trigger/popup. The host owns hit-testing, including composedPath for shadows.
- controller.escape() closes and returns whether Escape was consumed.
- Scope abort closes/removes its listener. controller.dispose() closes and
  permanently rejects later ownership. Call it before session replacement.
- onClose must synchronously clear open intent and revoke pending lazy generations.
  Cleanup occurs before callbacks, including throwing/reentrant callbacks. A
  reentrant newer open wins over the obsolete outer request.

No global document events are installed. One existing app/session host should own
its pointerdown/Escape listeners and remove them on session disposal. Keep the
normal application Escape ordering: consume only the active control popup before
closing an underlying drawer. Focus restoration is also host-owned; do not focus
a trigger that has been replaced by a new owner, route or session.

## Integrated page-size lifecycle

- `page-size-select.tsx` is the sole trigger/loading/failure/retry shell. It imports
  the action through the existing lightweight dynamic contract only on first focus
  or open intent. No eager action/Arco or action CSS is added to startup, inventory
  or sales static closures. Transfer's unrelated existing filter controls remain.
- The shared action exports an inert stylesheet factory. Each mounted pager owns a
  separate `single-select-styles.ts` lease, with the exact emitted asset URL, pending
  promise, error retry and removal/rejection on scope disposal/unmount/inactivation.
  There is no document-global cache that could mix configured asset identities.
- Action CSS is explicitly bundled to `chunks/single-select.css`. Only the small
  108px shell CSS is shared with route controls. Portable TEST ONLY builders
  explicitly inline the action stylesheet and set its dedicated inline-ready flag;
  those all-in-one derivatives are not production lazy-loading evidence.
- Focus/open intent, Escape/cancel, blur/outside pointer, busy state, late JS/CSS,
  local portal and live ReadScope checks remain in the shell/action. Retained hidden
  sales/transfer lists revoke pending work/remove the popup and disable paging;
  returning to the list does not change its applied page size or perform a read.
- The former inventory action and duplicated CSS were removed after the real shared
  action passed the inventory regressions. Sales's native Select and transfer's
  page-size Select JSX/root import were replaced, not left as alternate renderers.
- The existing pure `ExclusivePopupController` remains independently reusable;
  this finite pager integration does not migrate unrelated application popups.

Existing original runtime screenshots and frozen source are reference evidence.
Current browser screenshot/pixel/clipping/real-performance acceptance remains open:
only source/hash, actual-Arco synthetic DOM and emitted bundle graph checks are claimed.

## Focused verification

From the repo root, using existing tools only:

    node --test apps/web/src/demo-controls/popup-ownership.test.ts
    node_modules/.bin/tsc --noEmit -p apps/web/src/demo-controls/tsconfig.json
    node apps/web/src/demo-controls/tests/run-source-and-boundary-tests.mjs
    node apps/web/src/demo-controls/tests/run-action-dom-tests.mjs

The source/boundary script requires the exact frozen original available at the
exported workspace path, or accepts its filename as the first argument. A missing
or changed source is an error, not silently accepted approximate provenance.

These checks cover pure ownership/listener cleanup/reentrancy, copied declarations
and hashes, real leaf/dynamic-import/CSS boundaries, actual installed Arco Select
in jsdom StrictMode, applied-value discipline, disabled options, replacement,
outside/Escape and scope/unmount cleanup. Test-only options describe control
choices, not ERP business fixtures. No aggregate compiler/build or actual browser,
computed-layout, screen-reader, clipping or production integration acceptance is
claimed. Arco's existing React 19 `element.ref` compatibility warnings may appear.


## Shared sales/transfer multi-select

`multi-select-action.tsx` extracts the existing transfer TreeSelect presentation.
Transfer adapters reuse it directly; sales uses the lightweight `multi-select.tsx`
shell so entering a route does not eagerly load TreeSelect code/CSS or candidates.
`multi-select-source-provenance.json` records the original inventory-filters.jsx
source/hash/ranges and the explicit bounded-API departures. No old business/data
bridge, full catalog or new external dependency is used.

The action owns presentation only: strict checked options, complete-universe
normalization, full labels, width-fitting tags and +N 更多, source-like toolbar,
local portal and explicit callbacks. Completeness belongs to the data adapter.
Closed tag removal remains available, but retained exit-animation menu callbacks
cannot commit after closing. The shell owns lazy code/style generations, one
exclusive popup lease, live child scope, provider identity and safe post-close
focus. Close/replacement/hiding/disable/identity cleanup cannot resurrect late CSS
or data. Action styles use component leaves, not a global Arco reset. The manual
production transfer CSS entry includes the shared rules independently of sales.

The native sales adapter uses historical authorized references, 20 per page and a
200-item popup display cap. Explicit scrolling alone appends candidates. Selecting
ALL minus a row requires a proven complete unsearched single response; otherwise
the UI refuses that operation and offers a separately explicit 仅选择该项 action.
Clear/last removal means unrestricted ALL, never a false selected-none label.
Static status and two business-group universes are complete. No catalog scan,
excluded-ID contract, per-ID hydration or unsupported remote pinyin behavior is
introduced. See docs/sales-query.md for the exact native filter semantics.

`run-multi-select-shell-dom-tests.mjs` covers injected-action/style ownership only;
sales/transfer DOM runners separately mount the installed real TreeSelect. These
are synthetic lifecycle/configuration checks, not browser/pixel/performance proof.

The stage16 actual-browser rejection exposed a missed host cascade: transfer's
descendant field-label selector applied column-flex layout and 12px field font to
Arco checkbox labels. The rule now targets only direct filter-row labels, preserving
both the source stacked fields and installed inline checkbox baseline. The shared
action also supplies scoped installed icon-hover primitives and white/circle aliases
that were previously masked by transfer's full Arco sheet in the portable build.
No popup top/left offset or global reset is used as a repair.
The regression also exposed shortened tag selectors losing to installed size rules
(24px instead of the source23px). Original TreeSelect/input-tag ancestry is retained
under the shared host so the copied declarations keep their intended precedence.

The actual Mac comparison at tested commit4d0f0f4 also exposed a remote-menu
integration issue: Arco removes its native popup cap whenever the caller supplies
a virtual-list height. Remote menus now clear only that generated inline override
and use a scoped flex/min-height shrink chain so the actual tree remains the
scroll target below the native cap. No screenshot height, candidate truncation,
page-size, selection or load-more policy is substituted. Computed-CSS checks cover
six, twenty and two hundred candidates and preserve the actual-tree scroll callback;
they do not establish browser flex geometry or Mac parity.

`run-multi-select-layout-dom-tests.mjs` compiles the actual portable source CSS graph
and production split transfer/sales CSS, then checks the real TreeSelect DOM/cascade
under each field ancestry. Its optional HTML filename diagnoses the exact rejected
artifact without rebuilding it. It checks authored display/line-height, hidden native
inputs, source search/trigger/tag sizes and local dependency aliases. JSDOM cannot
prove flex-item blockification, row-center pixels, clipping, halo size or resolved
SVG checkmark color. Actual-browser comparison is still required before acceptance.

### Optional native category branches

`hierarchy: 'category-branches'` opts into the frozen category tree presentation;
flat sales/transfer callers omit it and keep their existing behavior. Options may
carry native `parentId` and `disabled` metadata. `category-branch-source-provenance.json`
records the separate frozen category source and the bounded-contract departures.

The shared installed TreeSelect still owns trigger/search/tags. Its public
`dropdownRender` hosts the same installed public Tree leaf with strict checks:
canonical tag/query IDs stay separate from known child coverage. A selected native
parent covers its server-defined branch; no browser catalog enumeration is needed.
Only present current parent nodes are nested. Missing parents remain standalone
provider-labelled options, never invented rows or extra reads. Known invalid
self-links/cycles/depth fail closed visibly rather than showing guessed hierarchy.

ALL is standalone and may include uncategorized rows. Only its own checkbox is
checked for unrestricted scope; an ordinary positive check deliberately switches
to exactly that category or branch ID. False/uncheck callbacks cannot approximate
unrestricted-minus-one. Selecting every positive ID never normalizes to[]
and neither complete nor partial pages approximate ALL-minus. A covered child
cannot exclude its selected parent branch; the limitation callback receives
`'branch-exclusion'`. The inventory adapter explains this and offers a separate,
deliberate positive-only action. Strict checks never infer a parent or half-check
because all loaded children happen to be selected. This intentionally does not
claim full source non-strict/SHOW_PARENT semantics on incomplete catalogs.

Disabled options cannot be newly added, while explicit retained tokens remain
removable. Removing a redundant child tag removes that token only; its checkbox
stays covered by a selected parent. Parent selection removes only provably
redundant known child tokens and preserves unknown retained IDs. Live activation
tickets reject public Tree callbacks retained across close/reopen/unmount.

`category-branch-model.test.ts` covers pure graph/selection semantics, and
`run-category-branch-dom-tests.mjs` mounts real TreeSelect/Tree leaves with the
actual component-only stylesheet. These checks cover behavior/authored cascade,
not browser geometry/pixels, performance, real data or full Demo parity.
