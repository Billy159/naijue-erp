# Frozen Demo single-select replacement candidate

The Select action and styles are preparatory and **unwired**: a proposed common
replacement for the existing inventory and transfer implementations, not a third
active Select implementation. The pure ownership controller is separately reusable
and can be integrated independently by a behavior-fix owner. This extraction itself
changes no existing widget, route, build entry, package or database contract and
claims no production Select integration/page parity.

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
existing page-size widgets. Hosts supply all real options/labels and applied value.
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

## Migration, not performed here

1. Keep `components/inventory-page-size.tsx` as the current lightweight lazy shell.
   Acquire popup ownership on open intent **before** action import/style loading.
   Preserve its generation, attached, focused, disabled and ReadScope checks.
   Replacing/closing/aborting an owner must invalidate late module/style completion.
   Never let a replaced popup reopen just because a load promise resolves.
2. Replace the Select JSX/import in `inventory-page-size-action.tsx` with this
   common action, mapped to source 100/200/500 labels and existing typed callbacks.
   Keep canonical InventoryPageSize validation in that adapter, not in this leaf.
   Update the action-only style bundle entry to the common CSS, await its existing
   style lease, and retire the duplicated widget CSS only after regressions pass.
3. Replace the Select in `transfers/pagination.tsx` through the same lightweight
   contract and ownership model, without moving the Arco action into its static
   route closure. Keep transfer page-size choices/labels and numeric validation in
   its existing business adapter. Remove the current runtime root-barrel Select
   import. The pager and exact-total math remain unchanged.
4. Use the same session controller for both adapters, with their own route/drawer
   scope signals. Revalidate active scope/ownership in selection callbacks too. Wire outside/Escape once at that host, release leases on blur,
   cancellation, disable, unmount and scope/session changes. Do not add a second
   listener/singleton in either widget. A warm action may remain mounted closed,
   but stale loading work must never attach a replaced owner.
5. Rerun both existing widget regressions and lazy startup/bundle checks after
   replacing them. Then compare against the actual running Demo: open/choose,
   reopen, keyboard/Escape, click another selector, scrolling/clipping and precise
   popup/trigger/option dimensions. Current frozen files alone cannot establish
   browser interaction or pixel parity, and original local-source comparison is
   still pending the user's computer connection.

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
