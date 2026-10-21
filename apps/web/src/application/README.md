# Authenticated application composition (source host, not deployed UI)

This directory composes the existing real authentication, inventory/product, sales
native transfer read-only and independent customer/supplier modules into one actual React root. It is not a
synthetic preview and does not reuse a preview reader, fixture, default account,
permissive role or empty-success fallback.

The root requires explicit presentation composition. A first-party pure
`createDemoFrameWorkspaceRenderer()` now reuses the existing frozen-source
`DemoFrame` without requiring callers to invent a complete frame. The host still
supplies `renderRouteState` for approved home/loading/error/cancel surfaces. No new
sidebar geometry, theme or replacement layout is introduced here. The current
leaf visuals and existing authentication surface are not thereby approved as
frozen-Demo pixel/interaction equivalents. Exact application frame/menu/account
positions, selected-route/close/loading/error states, responsive behavior and
leaf-specific source/CSS/screenshots remain necessary visual evidence.

## Explicit host contract

`createApplication(configuration)` from `index.tsx` constructs one controller.
`app.mount(explicitRootElement)` mounts its actual React root exactly once.
Construction and mounting are inert: neither checks a session, opens a route,
loads route CSS, reads business facts nor performs a login. The existing auth
panel provides explicit login/current-session verification/logout/self-password
change. A trusted bootstrap may explicitly call
`app.controller.authentication.resolveSession()` once if required; routes never
repeat that session request.

Required configuration:

- `http.origin`: exact configured HTTPS application origin, without a path.
- `http.basePath`: explicit deployment API prefix, including `''` when that is the
  real configuration. It is not inferred from the browser or filled from a demo.
- `http.fetch`: explicitly injected fetch. Cookies stay server-managed; no token,
  actor, role or client scope is added to business bodies.
- `presentation.renderWorkspace({principal, controller, state, routeContent})`:
  use `createDemoFrameWorkspaceRenderer()` or an explicitly approved host renderer
  to render the shell and `routeContent`. The verified principal is
  display context, not an authorization grant. Use `controller.routes` for the
  currently presentable configured routes and call `controller.navigate(route)`
  on actual authorized menu/deep-link actions, or `navigate(null)` to close.
- `presentation.renderRouteState({controller, state})`: supply the approved home,
  pending, error and cancelled surfaces. Pending exposes `cancelRoute()`; retry
  explicitly calls `navigate(state.route)`. Show `state.notice === 'cannot-leave'`
  and allow the user to reconcile/cancel the original party work in its page.
  Renderers are pure view functions, not data-prefetch or identity owners.
- `routes`: explicit capabilities. Omitted routes have no menu, module activation,
  CSS or provider construction. There is no default business route.

Capabilities:

- `inventory: {stylesheet, actions}`. `actions` is an explicit object; `{}` honestly
  leaves unimplemented stock-ledger clicks disabled. Supply `onOpenCell` only when
  the actual authorized warehouse/SKU ledger capability exists. Inventory and
  product HTTP readers are constructed on inventory activation, never startup.
- `sales: {stylesheet, detailStylesheet?}`. Uses the existing list/detail reader and
  bounded historical sales-filter reference reader. The optional detail asset is
  loaded only on a number/查看 action, never route navigation, query or idle. Both
  action code and CSS must be ready before its first target read. Detail is a
  full-page read-only document with visible 返回列表, not a modal. Its mounted
  hidden list preserves executed results, unapplied filter draft, scroll and
  trigger focus without a new query on return. If `detailStylesheet` is omitted,
  the list stays usable and both viewing controls remain visibly disabled with
  an explanation. No relative-URL CSS or dummy provider is substituted. This is
  not a sales edit/save/approve form, deep-link/history adapter or permission grant.
- `transfers: {stylesheet, detailStylesheet, product?}`. Explicit navigation loads
  the native read-only transfer route and exactly one bounded first list page.
  Draft typing does not query. Opening a row loads the separate detail CSS/code/
  response and keeps the list mounted for return/draft/scroll/focus retention.
  New/edit/approve/void/export/print/history commands stay unavailable, not linked
  to headless commands. The optional `product: {stylesheet}` enables only the real
  shared read-only product action: its configured frame/body stylesheet loads on
  click, then the real product HTTP adapter is imported on the first product read.
  Omission leaves the action disabled. No inventory route/matrix CSS is imported.
- `parties: {stylesheet, newRequestKey}`. Requires the real host request-key
  provider, e.g. a bound secure UUID implementation. It is called once per fresh
  command by the existing controller, never during exact replay. Customer and
  supplier route identities are independent. Their maintenance entries are shown
  only for a currently verified `ADMIN`/`WAREHOUSE` principal, matching the existing
  server policy; the server still authorizes every actual request. Overall service/
  schema readiness belongs to trusted server startup/deployment, not an invented
  client per-feature toggle or an empty-data inference. There is no fabricated
  allowed-actions/preflight endpoint.


Every `stylesheet` must provide `load(): Promise<unknown>` that resolves only after
necessary CSS is usable, and `dispose(): void`. An optional sales detail provider
is validated when supplied and disposed once with the app, including when the
same provider is explicitly reused for more than one asset role.
`createRouteStylesheet({document,
origin,href})` supplies an inert, same-origin HTTPS link implementation with
in-flight deduplication, error retry and disposal. No URLs are guessed. A host
must supply emitted asset URLs from its actual output manifest and load its
approved shell styles plus `application.css`. Do not use an immediate-resolving
no-op outside an explicitly synthetic test.

The source factory intentionally does not guess a browser URL convention/history
adapter. A host router must validate supported deep links, call `navigate` only
after identity verification, honor its false return before changing history, and
map Back/Forward through the same guard. Unsupported/absent routes must be shown
as unavailable, not fabricated as completed pages. Only explicitly configured read-only transfer navigation is available; absent
transfer capability and all unimplemented create/edit menu positions remain
disabled, never dummy completed pages.

## First-party frame and intentional source departure

`createDemoFrameWorkspaceRenderer()` is a pure renderer: it performs no identity
check, business read, module prefetch, history mutation or permission grant. It
maps only `controller.routes` into the one shared DemoFrame. Missing routes and
all unimplemented create/edit entries remain visible but disabled. The explicitly
approved business departure replaces the old merged 往来单位 entry with separate
客户 and 供应商 entries, each keyed to its own capability. No default party target,
merged entity, legacy alternate frame or guessed menu role was introduced.

Authentication still uses the existing `AuthenticationPanel` outside the workspace.
The renderer does not fabricate account controls in the source topbar, and exact
account placement/full-frame visual acceptance remains open. Import the emitted
shell CSS, which now contains existing auth/frame/tokens/shared neutral controls
only, never business route/action CSS.

## Shared product action-style handshake

The `.iw-product-drawer*` frame declarations were moved verbatim to one shared
`inventory/product-drawer-frame.css`. Inventory CSS imports that file to preserve
its existing immediate closeable frame. `transfer-product.css` imports the same
source plus the existing body/tab CSS, not the inventory route stylesheet.

`ProductDrawerHost` accepts an optional explicit `loadStyles` callback. Global
module code remains deduplicated independently; every active attachment awaits
its own configured stylesheet owner, even if drawer code was already cached.
The configured path never invokes the default relative-URL loader as well.
Transfer normalizes the configured `RouteStylesheet.load()` to `Promise<void>`,
waits it before mounting the shared host and passes the same idempotent loader
through. Cancellation or late CSS completion cannot reopen a closed action, and
style failure has explicit retry. The unchanged inventory fallback has separate
in-flight style deduplication/retry. No new styling framework was added.

## Lifecycle and bounded state

Authentication's required synchronous lifecycle calls `ReadContext.replaceIdentity`
before the auth controller publishes a replacement principal. All prior route and
party-workspace scopes are invalidated on session verification, account/auth-version/
role/hall change, logout, expiry, password success, cancellation/uncertain auth
writes and disposal. Late old-scope HTTP 401s cannot invalidate a newer identity.
A current-scope, still-unaborted business HTTP 401 calls `expire()`; there is no
relogin/retry loop. Closed or superseded detail requests cannot invalidate a still-
current session merely because an abort-ignoring transport returns a late 401.
The fresh 401 check occurs before its own authentication cleanup aborts the read.
Only the explicitly read-only transfer parent additionally turns a current,
unaborted 403 into route-local failure with explicit same-route retry. Closed/
superseded403 responses do nothing. This does not expire authentication or apply
to party/sales command workspaces, whose unknown-operation keys/recovery state
must not be silently discarded. No future writable transfer capability is covered
by this read-only disposal rule.

Each route instance has one scope. Replacing/closing/cancelling disposes it before
another route is prepared; late code/data cannot remount that instance. A route
module/CSS failure has a local state and explicit retry. A render failure disposes
that route and exposes only fixed host state, not raw provider exceptions.

The async module registry retains at most one ready route module reference. Browser
ES modules cannot be unloaded and no process-memory cap is claimed. Stylesheets
are a finite configured set, loaded only on first activation and disposed with the
app. There is no shared business catalog/cache, hover/idle prefetch, storage,
polling or whole-site hydration.

Party recovery is deliberately session-scoped, not accidentally tied to an
unmounted route. The existing two-entry workspace preserves independent stores and
original uncertain-command identity/content. Its route host suspends reads on
unmount. Root navigation consults `canLeave()` before disposal; dirty or unresolved
work blocks changing/closing the route until explicit in-page reconciliation or
discard. Identity invalidation still clears both stores and all drafts. No browser
unload/persistence or guaranteed server cancellation is claimed.

Call `app.dispose()` when the host is destroyed. It clears identity/scopes first,
then unmounts forms/DOM and disposes configured stylesheet owners. Do not wrap a
manually mounted `ApplicationRoot` in extra competing lifecycle owners; the factory
owns its one mount/dispose pair.

## Concrete split-build integration

`build-application.mjs` exports
`buildApplication({entryPoint: absoluteRealHostEntry, outdir: absoluteOutput})`.
It statically bundles an explicitly provided host; it neither creates deployment
configuration nor starts a listener, browser or server.

Esbuild normally aggregates CSS from dynamic imports into entry CSS. This builder
replaces that eager output with exact shell-only CSS, emits inventory/sales/party
CSS separately, including independent sales-detail and transfer detail/product action assets, and
copies the existing default-inventory product-drawer CSS to its
chunk-relative URL. The returned `application-assets.json` supplies filenames for
the actual host's explicit URL configuration. The startup JS uses ESM splitting;
there is no modulepreload, route-prefetch HTML or automatic bootstrap. A host entry
must not eagerly import business modules/fixtures or attach every emitted leaf CSS
file in HTML. The host's own approved shell CSS must also be checked for eager
business rules.

Sales and party CSS entry graphs now import only scoped semantic tokens and actual
shared controls plus their own leaf styles, not the inventory matrix/settings/
scope-dialog/product-drawer CSS. Party output additionally contains its real
installed Arco 2.66.16 CSS and source-settings adapters. The startup, inventory and
sales static JS/CSS closures must remain Arco-free; explicit party or transfer
navigation may load that implementation. Sales list CSS excludes the loaded
detail document rules, and its static route code excludes detail content. The
only detail-named list-shell rule is the tiny pending-frame action alignment that
keeps Back usable while action CSS is still loading. Actual full-page fields,
lines, totals and status styling live in the separate `sales-detail.css` manifest
entry, which imports only `sales/detail.css`; the already-ready sales list owns
shared tokens and controls. `sales-base.css` is now an inert historical scaffold
placeholder. Frozen-source structural restoration is not browser/pixel acceptance.

## Synthetic verification only

Run from repository root, using existing installed dependencies:

- `./node_modules/.bin/tsc --noEmit -p apps/web/src/application/tsconfig.json`
- `node apps/web/src/application/tests/run-dom-tests.mjs`
- `node apps/web/src/application/tests/run-sales-dom-tests.mjs`
- `node apps/web/src/application/tests/run-build-check.mjs`
- `node apps/web/src/application/tests/run-transfer-dom-tests.mjs`
- `node apps/web/src/application/tests/run-product-style-handshake-dom-tests.mjs`

DOM tests use the actual composed root/auth/routes, an explicitly synthetic semantic
renderer, mocked fetch and mocked CSS events, never a usable real account, browser,
network, server, PostgreSQL or rendered design acceptance. The static build test
examines the actual emitted startup static-import closure and CSS files, including
esbuild's CSS replacement, rather than assuming dynamic source imports suffice.
It proves isolation, not download timing, throughput, rendering speed or memory.
Composed DOM coverage now uses the actual installed Arco party components: only
the explicitly activated kind reads its bounded normal-status first page; name
and enabled-state edits are one atomic command, with original key/content retained
through uncertain response, absent receipt and exact replay. Earlier pre-Arco
verification logs are retained as historical, not relabelled as current passes.
Those earlier scoped composition checks predated their addition to repository
aggregate scripts; their historical logs do not attest later source changes.

The later sales-fullpage checkpoint has separate evidence under
`verification/sales-fullpage-integration/`; previous verification and portable
deliveries remain historical, not rewritten as current passes. Its composed
Sales tests exercise the actual configured route bridge, synthetic native HTTP
and CSS events: invalid/omitted optional capability, action-only readiness,
failure/retry, visible Back while CSS is pending, late readiness, retained list
draft/focus/scroll, cancelled/superseded detail401s, identity replacement/current401
and deduplicated stylesheet disposal. The split-build test checks actual emitted
code/CSS graphs, not real-network waterfall, browser geometry or performance.

The transfer/style-handshake checkpoint is recorded separately in
`verification/transfer-integration/result.json` and its exact source/dependency
manifests. It passes the existing 8 composed groups, 6 transfer-composition
groups, 4 configured-product-style groups, current shared StrictMode/deferred
product regressions, scoped TypeScript, emitted split-build and freshly rebuilt
inventory-preview/source-structure checks. Interrupted/failed diagnostic logs are
retained as historical harness evidence, not pass results: the harness first used
an obsolete decorated-button text selector and then tried to compare cyclic DOM
objects after a synthetic `.click()` that did not focus its trigger. Final tests
focus the trigger explicitly and use a bounded boolean identity assertion.

The 313154-byte portable inventory preview exceeds its 262144-byte Page budget;
the split build remains separate and this warning is not performance acceptance.
The pre-existing party receipt-403 recovery issue is being repaired independently;
the 8-group composed result here binds the exact pre-repair party controller hash
in `result.json` and does not claim acceptance of that later change.

## Missing-production checklist (not hidden by this factory)

1. Approved frozen-Demo host shell and leaf visual/interaction parity, actual host
   bootstrap/HTML and URL/history/focus/scroll orchestration.
2. Actual trusted HTTPS origin/API prefix, fetch/CSP/asset URLs, same-origin cookie,
   TLS/proxy/CSRF behavior and correct split CSS serving/cache/version integrity.
3. Actual server authentication plus inventory/product/sales/party plugins with
   real trusted policy/read/command/transaction providers. The browser cannot
   supply/replace these providers. Required capabilities may correctly return
   unavailable/not-implemented; this host never turns that into success.
4. Inventory snapshot readiness and the user's latest whole-page not-ready versus
   confirmed zero-stock semantics must be resolved in the inventory/backend slice.
   This host does not relabel per-cell unknown or invent zero facts.
5. Controlled product-media storage/delivery, real sessions and database/provider
   readiness, real-browser keyboard/layout/Back-Forward checks and server failure,
   interrupted/uncertain command recovery at the authorized production boundary.
6. Cold/warm real-network waterfall proving unopened leaves have zero requests,
   representative volumes, matrix/render/windowing work as needed, latency, memory
   and cancellation behavior. No numeric performance budget or acceptance is invented.

No production deployment, openable accepted ERP, live login, database connection,
root aggregate success or frozen-Demo/performance completion is claimed.

### Explicit manual transfer CREATE opt-in

With the authenticated command server explicitly configured for native manual
transfer preparation, set `routes.transfers.commands.manualCreate: true` alongside
its required `newRequestKey`. The real transfer list's “新增调拨单” then opens the
current warehouse/product/actual-SKU proposal editor. Save calls
`POST /transfers/prepare-create` before the existing native SAVE command; no
browser number/barcode/source snapshot is trusted. Command recovery, reread/adopt,
approval and inventory effects continue through the existing workspace.
Without this opt-in (or the older fully prepared provider) NEW stays disabled.
Preparation endpoint/MAIN-barcode absence is a visible failure, never fake success.
Raw proposal changes participate in the application navigation guard. Access denial
uses the same session invalidation callback as commands, and a clean NEW after a
committed document starts fresh even when the user switched routes in between.

### Explicit native SALE CREATE opt-in

`routes.sales.commands.manualCreate: true`, with an approved key provider and detail
stylesheet, connects the actual sales list's NEW action to current hall/customer/
warehouse/SKU/payment-method/account candidates, then native `/sales/prepare-create`
and existing SAVE. The backend must explicitly configure trusted native pricing
proof/preparation; missing proof rejects before SAVE. Default read-only hosts and
required fields do not change. The same explicit NEW form offers independent
RETURN/EXCHANGE with signed quantities and zero whole-document discount; existing
signed command paths are retained. See `current-form/README.md` and the
synthetic `run-sales-create-route-dom-tests.mjs` regression for SALE, negative RETURN and mixed-sign EXCHANGE.
