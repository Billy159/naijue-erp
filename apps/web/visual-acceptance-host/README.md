# Independent synthetic visual-acceptance UI test app

This is a new application whose exact entry is `apps/web/visual-acceptance-host/entry.tsx`.
It mounts the current canonical `DemoFrame`, `InventoryPageView`, `SalesPageHost`,
and `TransferPageHost` directly, using explicit finite synthetic read providers.
It does not load, wrap, convert, serve, or reuse any previously generated offline
HTML artifact. The generated index is a new minimal module-script bootstrap.

It is visibly SYNTHETIC ONLY: no login, no database, no business network requests,
no writes, no genuine account or business data, and no fake successful command
buttons. Production `development-host`, native API endpoints, HTTPS stylesheet
validation, AuthenticationPanel, and identity/authorization contracts are unchanged.
The separate test-only stylesheet owner accepts only this loopback HTTP app.
This host is not a production authentication workaround or a formal acceptance result.

## Build and verify (existing pinned dependencies only)

Supported repository runtime: Node 24.19.x and npm 11.9.x. This implementation was
checked with Node v24.19.0, npm 11.9.0, and existing esbuild 0.25.12. No installation
is required or performed by the build or server. From the repository root:

    node --test apps/web/visual-acceptance-host/tests/server.test.mjs apps/web/visual-acceptance-host/tests/fixtures.test.ts apps/web/visual-acceptance-host/tests/build.test.mjs apps/web/visual-acceptance-host/tests/entry.test.mjs
    node apps/web/visual-acceptance-host/build.mjs

The focused tests and build do not open a network listener. Root-level compilation
and the actual Mac browser comparison are separate checks, not implied by these tests.

The output `dist/` contains `server.mjs`, `distribution.sha256`, a build metafile,
and the static `public/` asset root. Copy the entire directory as one distribution.
The server uses Node built-ins only and needs no repository, package install,
credentials, database, outbound connection, or API process at runtime.

## Authorized local start, restart, and stop

Run the copied/built distribution, not the source server file:

    cd apps/web/visual-acceptance-host/dist
    node server.mjs --port 0

`0` requests an OS-assigned non-privileged loopback port. Alternatively use an
explicit port from 1024 to 65535. The server binds only `127.0.0.1`, prints the exact
HTTP URL, Git HEAD at build, host working-tree status, and source SHA-256. Open that
printed URL only after the browser's applicable authorization/policy allows it.
A distinct actual URL remains subject to its own review; this app does not authorize
access to another denied resource.

Stop with Ctrl+C (SIGINT), or send SIGTERM to that exact process. The handler closes
the server and idle connections gracefully. To restart, run the same command again
and use its newly printed URL. No background daemon or automatic restart is created.
The cloud build/test task never starts this server.

The server allows GET/HEAD only, rejects unknown MIME types, traversal/encoded
separators/dot paths and every symlink component, serves only its adjacent `public/`
directory, and rejects non-loopback Host values. Its CSP permits same-origin ESM and
CSS assets but disables fetch/XHR/WebSocket connections, forms, frames and objects.
Inline style attributes remain allowed for actual source control/popover geometry;
there is no inline-JS or inline-all-CSS substitute for code splitting.

## Source and asset identity

`public/manifest.json` records:

- `componentsSourceBase`: canonical component baseline cc2f237a673c400a2ebefd9daa965fd1daaf4031.
- `sourceCommit`: Git HEAD when built, not an assertion that uncommitted host files belong to it.
- `hostWorkingTreeChanges`: whether host source was uncommitted/modified at build time.
- `sourceHash` and `sourceInputs`: SHA-256 identity of the exact first-party inputs,
  host files, and lock/package manifests used to build this distribution.
- `assets`: each emitted static asset's SHA-256. `distribution.sha256` additionally
  identifies server.mjs and the manifest, avoiding a self-referential manifest hash.

Before the final Mac distribution, the root must review, compile, commit the new
host, and rebuild. That final manifest must say `hostWorkingTreeChanges: false`
and match the commit being compared. A pre-commit build is identified by its
source hash and explicitly is not commit-only evidence.

## Actual source and lazy boundaries

The initial ESM closure contains the frame and test host only. Three independent
route imports mount the actual page source. Separate shell/route CSS entries are
loaded before each route is mounted. Canonical product search, shared category/
warehouse multi-select, page-size Select, sales detail, transfer detail, and product
drawer action modules remain dynamically imported through their actual source
activation paths. Their source-owned action CSS URLs resolve to emitted files in
`chunks/`; sales/transfer detail and transfer-product CSS have explicit action owners.
The build deliberately omits esbuild's eager aggregate CSS and never injects inline
style-marker shortcuts used by portable previews.

The only reused old preview-directory modules are pure typed fixture source:
`catalog.ts`, `sales-fixture.ts`, and `transfer-fixture.ts`. Their entry/build/HTML
and generated artifact directories are neither inputs nor accessed. Host-local
`fixtures.ts` adds exactly 3 products (retail unavailable, 0.00, and 128.50), a
category parent with two children, and 6 warehouses. Candidate counts, inventory
cells/totals and target product facts/SKUs agree. All IDs/names are explicitly
synthetic. Sales and transfer still have 2 and 1 finite historical documents,
respectively, referring to the same first product/warehouses. No product images,
real-world time/price/catalog meaning, large-data performance, or write flows are
claimed by these fixtures.

## Browser comparison contract and known chrome difference

Use the printed app URL, optionally `#/inventory`, `#/sales`, or `#/transfers`.
Use the same viewport, browser zoom, fonts, and capture scale as the frozen Demo.
Inspect the initial inventory state, query results, product search with `SYNTH`,
all three retail preview values, category expansion/selection, warehouse options,
advanced filters, display settings, page-size popup, sales list/detail, transfer
list/detail/product drawer, repeat opening/closing, Escape, and route replacement.
The source lifecycle behavior, cancellation and honest unavailable actions remain.

The test-only label occupies DemoFrame's existing topbar action/account slot;
there is no added notice row and no change to business-page viewport height.
A closed diagnostic disclosure is fixed outside document flow. These two pieces
of test chrome differ from production/frozen Demo and must be recorded, not counted
as business UI fidelity. Opening diagnostics may overlay the page and should be
avoided in normal screenshot captures.

Focused tests prove static boundary, graph, fixture and simulated-DOM entry properties only. The entry smoke uses simulated stylesheet load/error events, not actual browser asset loading. They do not
prove actual browser asset requests, font metrics, screenshot equality, rendering
performance, memory behavior, production login, native APIs, or formal acceptance.
