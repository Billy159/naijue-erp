# Explicit development HTML host

`apps/web/src/development-host/build-development-host.mjs` creates the missing
static HTML entry for the existing real authentication/application root and
inventory, sales and native read-only transfer routes. This is not the synthetic
inventory preview, a server, a deployment, or completed frozen-Demo acceptance.
It reuses `createApplication`, `AuthenticationPanel`, the first-party `DemoFrame`
renderer, fixed HTTP readers, shared product drawer and the existing split builder.
No account, role, permission, token, password, database provider or business data
is accepted in its configuration. Client route switches are presentation only;
the trusted API authenticates and authorizes every request independently.

## Explicit public configuration

Supply a complete JSON file at an explicit absolute path. The following is a
schema example using a reserved, non-working example origin. Replace it with the
already authorized development origin; it is not a ready-to-run server setup.

```json
{
  "kind": "naijue-erp-development-host",
  "http": { "origin": "https://erp-development.example", "basePath": "/api" },
  "assets": { "basePath": "/development/erp/" },
  "routes": { "inventory": true, "sales": true, "transfers": true },
  "session": { "verifyOnMount": false }
}
```

All fields are required; unknown fields and truthy/string switches are rejected.
`http.origin` must be an exact HTTPS origin with no path, query, fragment or
credentials. The served document's actual origin must match it. There is no HTTP,
localhost or cross-origin-cookie exception. `http.basePath` is explicit, including
`""` if correct; the existing native readers append only their fixed endpoints.
`assets.basePath` is an explicit same-origin absolute directory path ending in `/`.
Neither prefix may contain traversal, encoded path syntax, query or fragment.
No `.env`, window-injected configuration, browser URL default, local/session
storage, remembered login or default identity is consulted.

`verifyOnMount: false` mounts the existing unverified auth panel without requesting
a session, route CSS or business data. The user can explicitly verify a current
session or log in with the actual panel. `true` explicitly requests one current
cookie-session verification per new host owner. Either setting opens no default
business route. There is no fabricated allowed-actions/preflight request.

`false` routes have no actionable menu destination, stylesheet load or reader
construction. Only the three implemented read routes can be configured. Customer,
supplier, product-maintenance, new-document and write-command entries remain
visibly disabled. Inventory SKU-ledger clicks remain disabled because this host
does not supply that capability. Existing product viewing is enabled through the
real inventory reader and separately styled transfer product action, not a dummy
provider. Existing auth login/logout/self-password actions remain real explicit
user actions, not business command grants.

## Build, without starting anything

From the repository root with the pinned installed dependencies:

```sh
node apps/web/src/development-host/build-development-host.mjs \
  --config /absolute/path/to/public-development-settings.json \
  --outdir /absolute/path/to/dedicated-development-output
```

The module also exports `buildDevelopmentHost({configuration, outdir})` for a
trusted build caller. It validates the complete public configuration before
writing output. It does not infer paths, read credentials, install packages,
construct a server, bind a port, open a browser, connect to PostgreSQL, migrate,
seed, generate accounts or deploy. Existing files outside its explicit output are
not changed. Use a dedicated output directory; the builder does not delete old
files or claim content-addressed deployment/cache integrity.

Outputs include `index.html`, the actual existing `application-assets.json` and
`metafile.json`, split ESM chunks and independent route/action stylesheets. The
HTML uses the manifest returned by that exact build, not duplicated guessed
filenames. It references only `application.css`, the small document/status-only
`development-host.css` and the external module entry. Its one non-executable
`application/json` block contains the validated public configuration and emitted
manifest; it is not inline executable JavaScript and cannot contain credentials.
The serializer escapes HTML-significant characters. There are no modulepreload,
route-prefetch, default-route or inline-event-handler tags.

The existing split builder replaces esbuild's eager aggregate CSS with shell-only
CSS and preserves action-only inventory drawer CSS at its chunk-relative emitted
URL. Inventory/sales CSS remain Arco-free. Explicit transfer navigation may load
its actual Arco controls, while detail and product code/CSS wait for their own
clicks. Transfer navigation performs the existing one bounded first-list-page
read. Inventory and sales still wait for explicit Query; filter candidates,
details, images and product tabs keep their existing action-only behavior.

## Serving and lifecycle boundary

A separately authorized host must already serve the output at the exact configured
HTTPS asset prefix, serve the actual API under the same origin/prefix, and supply
valid TLS plus the real server-managed Secure/HttpOnly cookie configuration. The
static builder supplies none of that. No source fake fetch or permissive role
adapter is substituted when the server is missing, denied or not ready. Actual
errors remain errors, not invented empty results.

Mount owns one explicit root. Existing auth invalidation and route scopes remain
their current owners. The host's returned `dispose()` synchronously delegates to
`app.dispose()` and removes its lifecycle listeners. `pagehide` disposes the old
identity, DOM and read scopes before a bfcache snapshot; a persisted `pageshow`
creates a fresh unselected owner and re-verifies only if `verifyOnMount` explicitly
requested it. No old account or business route is restored from the snapshot.
A small development-only Close button and fixed loading/cancel/error/retry states
are host scaffolding, not claimed frozen-Demo visuals.

No URL/deep-link/history adapter is implemented. Source menu actions and Close
navigate through the existing controller, but changing browser URLs is not
represented as a supported business route. Browser rendering, navigation, CSS
fetch timing, cookie/TLS/proxy/CSRF behavior, CSP/header configuration, asset cache
integrity and pixel/interaction/performance acceptance remain independently open.
The host does not expand the API's available capabilities or establish production
readiness.

## Offline verification

```sh
./node_modules/.bin/tsc --noEmit -p apps/web/src/development-host/tsconfig.json
node --test apps/web/src/development-host/configuration.test.ts
node apps/web/src/development-host/tests/run-dom-tests.mjs
node apps/web/src/development-host/tests/run-build-check.mjs
node apps/web/src/application/tests/run-build-check.mjs
```

Configuration tests cover exact public schema, no credentials/policies, explicit
switches, HTTPS and safe same-origin paths. DOM checks use real auth/root/frame/
routes and mock only fetch/CSS events in jsdom; all identity, list and product
facts in those checks are conspicuously synthetic test data, never source
runtime fallback. They cover inert startup, missing capabilities, cancellation,
late CSS, style failure/retry, one bounded transfer page, action-only detail/shared
product, identity replacement/current/stale401, deterministic disposal and bfcache
reset. Static tests inspect the actual emitted HTML, assets, JS import closures
and CSS contents. The exact emitted ESM entry also executes against its emitted
HTML in jsdom with mocked session fetch, confirming inert initial mount and
explicit-session access to the shared frame. No listener, real browser, network service, database, actual
credentials, screenshots or performance acceptance is involved.

Root package scripts are intentionally unchanged. These focused commands are not
silently represented as part of a pre-existing aggregate check or live browser
acceptance.
