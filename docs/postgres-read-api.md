# Opt-in PostgreSQL auth and native read API composition

`apps/api/src/postgres-read-api.ts:createPostgresReadApi` is an explicit, non-listening factory. It assembles the existing native HTTP plugins with one owned `BoundedPostgresPool`, the real PostgreSQL authentication store/service, Node's versioned scrypt password codec, and native inventory, inventory-ledger, sales, transfer and product snapshot readers. Importing the module, constructing the factory and waiting for Fastify readiness do not acquire a connection or start a listener.

This closes the **source-level composition seam**. It does not provide operator credentials, invent business permissions, seed an account, migrate a database, start a service, integrate the browser, or prove actual HTTP/PostgreSQL acceptance. The name “read API” describes the enabled business routes: authentication deliberately still writes/revokes sessions and supports the logged-in user's existing self-password-change route.

## Exact mandatory host inputs

There are no permissive defaults or automatic provider fallbacks. The trusted caller must supply:

- `postgres`: the complete `BoundedPostgresConfig`, including explicit target/password/TLS choice and every resource bound. See `postgres-resource-bounds.md`. Never commit real credentials or put them in logs.
- `authentication.trustedOrigin`: the exact external HTTPS origin, without a path, trailing slash, userinfo, query or fragment. Host, forwarding headers and request JSON do not select it.
- `authentication.now`: a trusted clock returning canonical millisecond UTC ISO timestamps.
- `authentication.policy`: an explicit complete `AuthenticationPolicy`, including session lifetime and approved password/employment/role–hall rules. The existing `createSourceAuthenticationPolicy` can be deliberately selected with an explicit session lifetime. The factory does not choose a lifetime, create an administrator or relax unknown roles/statuses.
- `authorization`: either the existing explicit provider object described below, or exactly `{ mode: "source-confirmed-native" }`. The selection is trusted host configuration only, never request JSON, headers, environment discovery or a default.
- In explicit provider mode, `authorization.inventory`: a current `InventoryQueryAuthorization`. The exact same captured provider is supplied to inventory, candidates and ledger reads. It must return the finite authorized hall/warehouse intersection, with current native identities/names, never a request-selected scope or a stock-presence-derived grant.
- In explicit provider mode, `authorization.sales`: a current `SalesQueryAuthorization`. It must resolve the approved visibility rules from current trusted facts and return a validated scope before paging/count/sums/reference reads. `ActorContext` supplies account and hall, not an implied administrator role. Missing role/reference facts require trusted resolution, not a guessed grant.
- In explicit provider mode, `authorization.transfers`: an explicitly selected `TransferQueryAuthorization`. The existing `createSourceConfirmedTransferQueryAuthorization` is available; selecting it remains the caller's decision, not an automatic “all halls” fallback.
- In explicit provider mode, `authorization.products`: a current `ProductQueryAuthorization` returning the exact requested product grant. Being able to resolve a UUID or having an authenticated session does not authorize the shared product catalog.
- `productMedia`: either an actual `ControlledProductMedia` with explicit HTTPS delivery origin and authenticated opaque delivery links, or explicit `null`. `null` does not fabricate storage URLs: existing image metadata with unavailable media delivery retains the explicit 501 behavior. No storage/thumbnail/byte-delivery implementation is supplied by this factory.

The existing explicit-provider API remains supported with no `mode` property and all four mandatory providers. It does not mutate, replace or install methods on external providers or authentication configuration. Arbitrary provider closures remain trusted server code, not approved native policy evidence. Catalog/form reference providers, product price configuration/storage and document-number contracts are not manufactured here.

### Explicit source-confirmed native selection

A host can deliberately supply `authorization: { mode: "source-confirmed-native" }`. This is a closed discriminated choice, not a bag of provider overrides: unknown modes, a `mode` property in explicit-provider mode, extra own keys (even undefined, non-enumerable or symbol keys), inherited mode and prototype-carried overrides are rejected before driver allocation. Ordinary and null-prototype sole-key selectors are supported. There is no silent fallback if selection or a policy fails.

Only this branch constructs `createSourceConfirmedPostgresReadAuthorization(pool)` for inventory, sales and products, using the exact same factory-owned bounded pool as authentication and all readers. It also explicitly selects the existing `createSourceConfirmedTransferQueryAuthorization()`, while preserving the role-preserving transfer authenticator. Neither policy factory creates or owns another pool. Selecting the profile does not alter the caller's authentication origin, clock, policy or product-media availability, all of which remain mandatory and explicit.

The native adapter re-reads current non-secret account/staff/hall facts, requiring login enabled, canonical source roles and `在职`, and rejects a hall differing from the authenticated actor. Its finite native inventory reference scope preserves source-confirmed all-warehouse inventory visibility (including disabled historical references); it is not inferred from stock presence. Salesperson sales visibility is current-hall scoped, while source ADMIN/WAREHOUSE sales visibility is all; shared product catalog grants stay exact-target and do not invent product-hall ownership. Transfer retains its existing source FROM/TO/immutable-creator-hall union. Read grants do not grant business commands. See `native-read-authorization.md` for exact source evidence, technical bounds and limitations.

Session authentication, native authorization and the business reader use their existing separate snapshots. This profile does not promise atomic revocation across those snapshots, cancel in-flight pg queries, implement media delivery or add a business route.

The selected profile or explicit provider methods, origin strings and media availability are captured before the first await. Replacing properties on the caller's configuration object later cannot swap a policy method, change the cookie origin or enable commands. This is not a sandbox for an untrusted provider closure: policy providers remain trusted server code and must enforce current authorization every call.

## Registered routes and identity trace

The factory separately registers six encapsulated native plugins, totaling 19 explicit routes:

- Authentication: `POST /auth/login`, `GET /auth/session`, `POST /auth/logout`, `POST /auth/password`.
- Inventory: `POST /inventory/query`, `/inventory/candidates/query`, `/inventory/ledger/query`.
- Sales reads: `POST /sales/query`, `/sales/references/query`, `/sales/detail/query`, `/sales/history/query`, `/sales/settlement-statistics/query`.
- Transfer reads: `POST /transfers/query`, `/transfers/detail/query`, `/transfers/warehouses/query`.
- Product reads: `POST /products/basics/query`, `/products/specifications/query`, `/products/images/query`, `/products/image/query`.

No sales/transfer/party commands, receipt commands, account administration, product maintenance, migration, cutoff import or seed routes are registered. Fastify's normal HEAD companion for the session GET is not another explicit application route.

Inventory, sales and product reads use the existing cookie-only session authenticator. Every request resolves its current PostgreSQL session/account/staff/hall facts, then invokes its separate business policy. The `__Host-naijue_session` cookie remains HttpOnly, Secure, SameSite=Strict; bearer credentials, duplicate/malformed session cookies and cross-site/missing-POST-origin requests fail closed. Request `x-role`/hall headers never become identity. No CORS or proxy trust is enabled, and the Fastify logger is disabled to avoid accidental credential/body logging. Transport TLS/reverse-proxy configuration and an explicit listener remain a separate host responsibility.

Transfers additionally use the new `transfer-authentication.ts` adapter. It reuses the existing role-preserving cookie/session boundary only for credential checks, independently validates the exact transfer role vocabulary and account/hall IDs, rejects a hall-less salesperson and creates a frozen `TransferActor`. It never invokes party business authorization. With the explicitly selected canonical transfer read policy, the current SALESPERSON principal becomes the approved union of FROM hall, TO hall and salesperson-created-in-hall clauses. ADMIN/WAREHOUSE visibility is granted only by that chosen canonical policy, not the session adapter. This is traced in focused tests, not assumed from structural actor compatibility.

Separate Fastify registration preserves each plugin's own error handler, request actor and abort controller. A product/provider failure does not replace a sibling inventory/sales/transfer error contract. Existing reader signals stop subsequent callback work, not an already-running pg query or pool acquisition; statement/lock/idle-transaction protections remain the explicit pool settings. No query, transaction or uncertain commit is retried.

## Ownership and shutdown

The returned object exposes `app`, `close()` and a sanitized `postgresBackgroundFailureCount`. The factory returns an already-ready Fastify instance with `app.server.listening === false`. It accepts no listener/default host/port/environment selection. The optional second argument is the existing trusted `PostgresPoolDriverFactory` seam for scripted protocol tests; normal composition constructs the real pinned pg driver.

Every adapter shares this one bounded pool; none creates or owns an extra pool. `close()` delegates to the standard Fastify server shutdown lifecycle, and its `onClose` hook awaits bounded pool disposal. Direct `app.close()` uses the same hook. Repeated closure cannot repeat driver end. The factory also closes/disposes after failed application construction or registration, including invalid authentication policy. Pool disposal failures reject shutdown instead of claiming cleanup succeeded. A host must treat failed/uncertain cleanup as unhealthy; this factory does not hide it or create a replacement pool.

There is no listener/socket in `inject` tests, so they do not establish real HTTP admission or graceful request draining. Closing an injected application can immediately dispose its pool while a read is pending, causing that read to return a sanitized storage error rather than success; this is not a rollback/cancellation guarantee. Actual listening-server draining, keepalive/socket retirement and shutdown behavior still require a separately authorized real transport test. No stronger network-lifecycle claim follows from the focused checks.

## Verification and remaining acceptance

Run only the existing local tools, with no registry lookup or installation:

```
node --test --test-concurrency=1 apps/api/src/postgres-read-api.test.ts apps/api/src/transfer-authentication.test.ts
./node_modules/.bin/tsc --noEmit -p tsconfig.json
```

The focused API plus transfer-authenticator suite has 24 tests using Fastify.inject and scripted pg protocol responses. It exercises lazy ownership and disabled write routes; real service/scrypt login, current session and logout with synthetic persisted response rows; native reader construction/query paths; exact cookie/origin enforcement; explicit hall/target-policy denial; canonical transfer principal-to-scope SQL; isolated sanitized errors; policy-method capture; exported transfer-helper origin/resolver capture; and disposal failures. The native-profile groups additionally check closed selector rejection before driver allocation; one lazy pool across genuine policy adapters and readers; source role/hall-to-SQL mapping; fresh identity denial without fallback; request JSON and header non-selection; caller-configuration capture without mutation; and sanitized fatal storage failure with lease discard. Both explicit-provider and native-policy cancellation tests emit a synthetic raw-request `aborted` event and check sibling isolation; the native test holds a fake identity query and proves later callback/reader work stops, not that the pending pg query was cancelled. Invalid authentication-policy construction cleans the owned pool in both modes. Evidence is `evidence/native-policy-profile-scripted-tests.log` and `evidence/native-policy-profile-typecheck.log`. It does **not** establish real browser/network interruption, SQL execution or pg-wire cancellation. The scripted driver is confined to tests and is never a production provider.

The older sparse-engine evidence at `318440a` is not this factory's real HTTP/PostgreSQL acceptance. An actual end-to-end run still needs an authorized isolated target with the reviewed schema, deliberately selected native authorization or reviewed explicit policy/reference providers and synthetic account/session setup in the approved engine harness. No such connection, server startup, credentials lookup, schema change or deployment is performed by these focused tests.

## Later genuine PostgreSQL plus inject checkpoint

After the focused source review above, exact commit d9a2844 passed the extended backend suite on a separately fresh PostgreSQL17.11 target:16/16 including15 substantive subtests and the parent. The added five groups exercised this actual factory with default pg driver, real scrypt/authentication/session storage, all15 native read endpoints, synthetic scope/origin/credential rejection and logout revocation, unchanged business snapshots and owned-pool closure. Full preserved evidence is `evidence/postgres-real-http-read-acceptance-d9a2844/`.

That checkpoint deliberately uses synthetic fixture authorization providers, not the later source-confirmed native profile described above. Actual PostgreSQL acceptance of the native-policy branch subsequently passed at exact e4aa8b2:22/22 (21 substantive subtests plus outer), including six genuine native-profile groups. Full evidence is `evidence/postgres-real-native-profile-acceptance-e4aa8b2/`; scripted tests alone do not establish this result. Fastify.inject remains in-process; no listening HTTP server, real browser/TLS flow, actual media delivery, performance or deployment acceptance follows. Earlier focused scripted-driver reports retain their original boundaries.
