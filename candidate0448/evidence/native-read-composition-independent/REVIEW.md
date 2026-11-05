# Independent native read composition review

Result: **PASS for the bounded source/inject/scripted-storage scope. No open blocking finding.**

Review date: 2026-10-20 UTC. Runtime: Node v24.19.0. Baseline HEAD at review: `c48eba1e9b05c76ecc9eec20c548dff13b5719b1`.
Reviewed owner source and tests are identified exactly in `source.sha256`; all five hashes were confirmed again after final review.

## Verification

`node --test apps/api/src/postgres-read-api.test.ts apps/api/src/transfer-authentication.test.ts evidence/native-read-composition-independent/probes.test.mjs`

Final result: **26 passed / 0 failed**, including 17 owner tests and 9 independent probes. Full output: `frozen-combined-tests.log`. Standalone independent output: `probes.log`.

Reviewer did not run a compiler, build, dependency installation, real PostgreSQL connection/query, listener, network/browser test, migration, import, account seed, commit or deployment. Owner compiler results are separate evidence and not claimed here.

## Confirmed composition boundaries

- One lazily connected owned `BoundedPostgresPool` is supplied directly to the native PostgreSQL authentication store and five native reader families. The real authentication service and Node scrypt codec are constructed explicitly; no memory repository/provider fallback is selected. Import/readiness does not connect or listen.
- Exact external HTTPS origin, trusted canonical clock, complete authentication policy, bounded PostgreSQL configuration, four current business authorization providers and explicit controlled-media availability are mandatory. Invalid host contracts and insecure TLS/origin options fail before driver allocation. There is no ambient URI, environment, credential-file, listener or migration discovery in the new factory.
- Six encapsulated plugins enable 19 explicit auth/business-read routes at fixed native root paths. There is no caller-supplied mount/prefix to validate or infer. No sales/transfer/party commands, account administration or business-maintenance routes are enabled. Authentication intentionally still persists/revokes sessions and supports self-password change; “read API” is not a claim that every SQL statement is read-only.
- Authentication and business authorization remain separate. No authenticated UUID, account/hall structure, role cast or frozen object is treated as a grant. The existing shared party helper performs runtime role/identity validation; the new transfer adapter additionally maps the exact transfer role vocabulary and rejects hall-less SALESPERSON. Canonical transfer policy selection remains explicit, not a default all-hall provider.
- Cookie-only credential/origin enforcement resolves the current persisted session/account/staff/hall on every read. The independent matrix exercised ten invalidations across inventory, ledger, sales, transfer and product families: disabled login, inactive employment, auth-version change, unknown role, hall-less salesperson, disabled hall, revoked session, expiry, future creation and revocation during session locking. All 50 requests returned 401 before business policy or SQL.
- Current hall/role facts, not forged client headers/body, reached authorization. Auth-storage failures returned sanitized 500 and could not become successful empty business results. All four captured policy methods retained binding and ignored caller method replacement while still reading intentionally current provider state.
- Both media methods and delivery origin are captured. Independent image metadata/link probes showed that method/origin property replacement cannot change the captured boundary, current trusted internal provider state remains observable, and a later hostile URL from the original provider is rejected rather than leaked. Private `fileRef` was not serialized.
- Construction failure cleanup, repeated closure, disposal failure visibility, per-instance pool ownership and sibling read independence are covered. Closing one injected API never closes another API's pool.

## Closed finding R1: exported transfer helper retained mutable caller options

Original helper hash: `ba18eb5ad44f38ced21c03b7cf78af474871969cba69362b29081fe82a1db657` (see `pre-fix-source.sha256`). The original exported helper passed its caller's options directly into the shared resolver, which retained that mutable object. An independent direct probe replaced the configured HTTPS origin with `http://other.invalid` and replaced the service after helper construction. The helper then accepted an HTTP-origin POST and returned a synthetic ADMIN actor from the replacement resolver (original calls 0, replacement calls 1). The main composition's frozen options prevented this path there, but the standalone new export violated its own stable HTTPS boundary.

Owner fixed only the new helper: capture the validated origin and bound actual service methods in a frozen boundary before delegation. Final helper hash: `c8dc0f8b7037020345fce50598480a3689de08a3a8b1efa3c5fa6f0c3a91a940`. Both the owner regression and a separate independent mutation probe now pass. Shared party/auth HTTP modules were not edited by this reviewer.

## Lifecycle evidence and remaining acceptance limits

`Fastify.inject` has no real listening socket. Independent close-while-read and close-while-policy probes establish bounded pool retirement/ownership, not graceful network request draining. Close can dispose the pool before a pending injected policy returns; its signal is not automatically aborted, and subsequent business acquisition returns a sanitized 500. An injected active query lease is retired, but this is not evidence that PostgreSQL canceled/rolled back its actual statement. Documentation and the factory interface comment were narrowed accordingly.

Actual PostgreSQL SQL execution, constraints/isolation/locks, real authentication deployment, listener/keepalive shutdown, transport TLS, real browser cancellation and end-to-end frontend integration remain **NOT TESTED** by this review. Production authorization/reference/media providers and a separately approved isolated transport/database target are still required. Passing synthetic tests does not supply those missing facts or establish rollout readiness.
