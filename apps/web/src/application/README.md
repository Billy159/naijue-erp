# Authenticated application composition (source host, not deployed UI)

This directory composes the existing real authentication, inventory/product, sales
and independent customer/supplier modules into one actual React root. It is not a
synthetic preview and does not reuse a preview reader, fixture, default account,
permissive role or empty-success fallback.

The root deliberately requires the host's presentation renderer. No new sidebar,
menu layout, theme or replacement Demo appearance is supplied here. The current
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
  render the approved host shell and `routeContent`. The verified principal is
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
- `sales: {stylesheet}`. Uses the existing list/detail reader and bounded historical
  sales-filter reference reader. This is not a sales edit/save/approve form.
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
necessary CSS is usable, and `dispose(): void`. `createRouteStylesheet({document,
origin,href})` supplies an inert, same-origin HTTPS link implementation with
in-flight deduplication, error retry and disposal. No URLs are guessed. A host
must supply emitted asset URLs from its actual output manifest and load its
approved shell styles plus `application.css`. Do not use an immediate-resolving
no-op outside an explicitly synthetic test.

The source factory intentionally does not guess a browser URL convention/history
adapter. A host router must validate supported deep links, call `navigate` only
after identity verification, honor its false return before changing history, and
map Back/Forward through the same guard. Unsupported/absent routes must be shown
as unavailable, not fabricated as completed pages. Transfer UI does not exist in
this composition and has no route/menu/dummy page.

## Lifecycle and bounded state

Authentication's required synchronous lifecycle calls `ReadContext.replaceIdentity`
before the auth controller publishes a replacement principal. All prior route and
party-workspace scopes are invalidated on session verification, account/auth-version/
role/hall change, logout, expiry, password success, cancellation/uncertain auth
writes and disposal. Late old-scope HTTP 401s cannot invalidate a newer identity.
A current-scope business HTTP 401 calls `expire()`; there is no relogin/retry loop.

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
CSS separately, and copies the existing action-only product-drawer CSS to its
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
sales static JS/CSS closures must remain Arco-free; only explicit party navigation
loads that implementation. `sales-base.css` is a narrowly scoped preservation of
the previous sales structural scaffold, explicitly NOT accepted frozen-Demo sales
appearance. Replace it with exact sales-source restoration later, rather than
expanding a new generic layout framework.

## Synthetic verification only

Run from repository root, using existing installed dependencies:

- `./node_modules/.bin/tsc --noEmit -p apps/web/src/application/tsconfig.json`
- `node apps/web/src/application/tests/run-dom-tests.mjs`
- `node apps/web/src/application/tests/run-build-check.mjs`

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
Root package/build/preview/backend/schema files are unchanged by this slice, so
these scoped commands are not yet added to the repository aggregate scripts.

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
