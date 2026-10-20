# Real PostgreSQL authentication and in-process native-read API acceptance

## Result

On 2026-10-20 UTC, explicit `backend-0001-0008` at commit `d9a28441777291d5436ec66682307f697501b20e` passed against a separately fresh dedicated PostgreSQL database: **16 tests, 16 passes, 0 failures, 0 skipped; exit 0**. This is the outer test plus 15 substantive subtests: the 10 earlier backend groups and 5 new actual authentication/native-read API groups. Duration was 5253.147272 ms.

This proves real PostgreSQL plus actual default-driver API composition, authentication service/scrypt and **in-process Fastify.inject** under explicit synthetic policies. It does not prove a listening web server, browser, TLS, real business data, production policy, media delivery, performance or deployment readiness.

- Exact source: `d9a28441777291d5436ec66682307f697501b20e`; frozen backend PLAN SHA-256 `6dec0759cc3d52ff30f6c9c90ce2153880ec6b7ea8b388e3e204fbbe75763c08`.
- All **996 committed files** in the frozen archive matched their exact Git blobs after execution; zero mismatches.
- Target: `127.0.0.1:55432/naijue_erp_test_dfc9596d15ed8757`, PostgreSQL 17.11 (`170011`), physical system identifier `7698856207892361241`, primary/not recovery, sockets disabled.
- Dedicated non-superuser `naijue_erp_test` owns the target and has no CREATEDB, CREATEROLE, REPLICATION or BYPASSRLS. Exact eight hashes and unchanged fresh/exclusive/direct-loopback/runner gates passed before execution.
- Exactly one run on this separately fresh target. Earlier used targets retained, never reset/repaired/reused. The same reviewed `8874c81620a67b475ba3bfd4aa9c74bfcbd7f4a841d4de3ab015d6553dee1325` supervisor explicitly selected the existing backend enum.

## New actual authentication and API evidence

1. A separate synthetic account/password was used only for this bounded test. Password generated in process memory; actual scrypt, authentication service and PG auth store handled wrong-password rejection, original disabled-account rejection, successful login, cookie attributes and current-session resolution. The original disabled fixture was not enabled or reused for login.
2. Authenticated native inventory matrix/candidates and bounded ledger keyset pages executed through actual API composition and default PostgreSQL driver/pools.
3. Authenticated sales list/detail/history/references/statistics, transfer list/detail/warehouse references and product basics/specifications executed through registered read routes. Both image routes correctly reported unavailable media; no file/image bytes were read or delivered.
4. Explicit test-only scope exclusions and spoofed cookie/Authorization/actor/role/scope/origin requests were rejected. Grants were not inferred from client labels or request identity. These are fixed synthetic policy facts, not production grant approval.
5. Logout actually revoked the stored PG session; every read family then rejected it before policy. The selected native business-fixture snapshot stayed unchanged (auth/session state changes are expected). API close was idempotent, API-owned PG connections reached zero and no listening socket opened.

All 15 native-read routes plus auth login/session/logout are listed in `http-route-coverage.json`. The first 10 backend groups retain real storage rollback/version invalidation, pricing/schema rejection, document-CAS/insert races with actual waiters, signed RETURN/EXCHANGE effects/inverses, native read scopes/RR snapshot and deferred transfer-position swap.

## Interpreting the unedited TAP

The original TAP retains the earlier group's diagnostic describing “Authentication STORAGE only” and excluding login/HTTP. It applies to the original preceding backend groups and was not rewritten. The added 5 subtests and following actual-auth-service/scrypt/native-PG HTTP-plugin diagnostic describe the newly executed scope. Overall evidence is no longer merely storage-only, but remains **Fastify.inject only**, not browser/TLS/network-server acceptance.

## Provenance and evidence

`acceptance.tap` is complete and byte-identical to the original: SHA-256 `57be5db61a1d9ebe7830c4a187dfc24048c176ef4d03ba37f51267d485460f91`. `acceptance-run.json` replaces only local archive/log paths. Original hashes, exact migration/source hashes, full-tree proof, nonsecret target identity and post-run physical identity are included.

Official package/distribution provenance and old clean-stop/new-start lifecycle proof are retained. Distribution revalidation occurred before this instance's startup, not a second provisioning. No new installation, service/security permission change, hot reload, new physical instance or public endpoint was used for this second fresh database.

No credential, usable token/cookie, connection URL/password, database or configuration file is included. Generated app credentials/tokens remained memory-only; only ordinary test database password/session hashes were stored. Secret-safe setup/parse/assertion/cleanup diagnostics were used. `SHA256SUMS` covers all other bundle files.

## Remaining limits and current state

No browser/cookie enforcement over TLS, real listening server, public/remote deployment, production auth/authorization configuration, real business/source-file compatibility, media delivery, business-write HTTP API, password-change HTTP flow, production grants/RLS, existing-ERP upgrade, privileged-owner recovery, all race/deadlock schedules, unknown-COMMIT recovery, restart/failover, sustained load, natural-planner performance or production readiness is established.

All data is synthetic. No user Mac, existing ERP/production/staging database, remote host, Tailscale/SSH or public Site was used. At bundle creation the existing owned loopback instance is controlled and idle; both used targets are retained and nonreusable. No repeat/extra database or run occurred after this outcome. New-instance shutdown/disposal is not claimed complete.
