# Real source-confirmed native-profile PostgreSQL acceptance

## Result

On 2026-10-20 UTC, exact commit `e4aa8b2663da5984486ddc63b2f95e2a92ca0950` ran once as explicit `backend-0001-0008` on a separately fresh dedicated PostgreSQL database and passed: **22 tests, 22 passes, 0 failures, 0 skipped; exit 0**. This is 21 substantive subtests plus the outer test: 10 original backend groups, 5 explicit-test-policy auth/read API groups, and **6 new genuine native-profile groups**. Duration was 15830.306364 ms.

This is actual PostgreSQL/default-driver/API/source-policy execution with **Fastify.inject**, canonical roles and controlled synthetic facts. It is not a listening-server/browser/TLS/public deployment, real-data/media, performance or production-readiness result.

- Exact source: `e4aa8b2663da5984486ddc63b2f95e2a92ca0950`; frozen backend PLAN SHA-256 `2bafc8989ae97997c4517143d8ee5f3b2094526a4a7e107051bb58df6d310a3a`.
- All **1111 committed files** in the frozen archive matched their exact Git blobs after execution; zero mismatches. Exact eight migration and selected implementation hashes are included.
- Target: `127.0.0.1:55432/naijue_erp_test_9fdd325d18bbbf0a`, PostgreSQL 17.11 (`170011`), physical system identifier `7698856207892361241`, primary/not recovery, sockets disabled.
- Dedicated `naijue_erp_test` owner/login is non-superuser without CREATEDB, CREATEROLE, REPLICATION or BYPASSRLS. All existing source-hash, fresh/exclusive/direct-loopback, explicit-selection and runner gates remained unchanged and passed.
- The approved final supervisor SHA is `8874c81620a67b475ba3bfd4aa9c74bfcbd7f4a841d4de3ab015d6553dee1325`. This was one approved run on one fresh target, not a reset or reuse of earlier targets.

## New actual native-policy proof

1. API composition selected `authorization: { mode: "source-confirmed-native" }` and canonical `createSourceAuthenticationPolicy(900)`, with the actual default PostgreSQL driver/one owned bounded pool. It did not supply the earlier explicit test-provider bag or fake driver. Four separate synthetic accounts actually logged in as A/B SALESPERSON, ADMIN and WAREHOUSE using active canonical source facts and actual scrypt.
2. Service-written approved sales have nonzero A/B received values **125/250**, with all-scope **375**. Actual list/detail/history/references/statistics enforce each salesperson's current hall; ADMIN/WAREHOUSE see both. Actual foreign detail/history is hidden and a request foreign-hall filter cannot broaden the grant.
3. Native all-warehouse inventory/candidates/ledger includes actual other-hall disabled historical references while the original two-warehouse scope is published. Shared exact product targets work. Disabled historical references are not silently dropped by current-label status.
4. A real B-only transfer draft and exact endpoints/references are excluded from A but visible to B/ADMIN/WAREHOUSE. The later controlled third warehouse is deliberately absent from the immutable published inventory scope: inventory then returns **503 / INVENTORY_NOT_READY**. There is no successful inventory-readiness claim after that fixture insertion and no fabricated stock/zero fallback.
5. Actual HTTP sessions fail closed after controlled login_enabled, employment, role and hall changes. Supplemental stale-captured-hall tests call the **genuine PG sales/inventory/product authorizers directly**, not a public HTTP race. They reject FORBIDDEN. Controlled identity/hall maintenance is restored; terminal snapshot equality does not mean no writes occurred during those fixture changes.
6. Every native-role logout revokes its stored session/read access. Read-phase exact business snapshots stay unchanged, API close is idempotent, API-owned connection count reaches zero and no listening socket opens.

The earlier explicit-test-policy groups remain separate and passed again; they must not be relabeled as genuine native-profile authorization. Likewise the inherited original storage-only TAP diagnostic applies to its preceding backend subgroup. The complete unedited TAP includes separate actual-auth/HTTP and native-profile diagnostics clarifying these boundaries.

## Provenance, sanitization and retained state

`acceptance.tap` is complete and byte-identical to the original, SHA-256 `19d442eb711df4fca89f90c87520f6ec7594d062f680dcfa720f8f1d2838a8a0`. The result JSON changes only machine-local archive/log locations. Original hashes, whole-tree verification, nonsecret target/physical identity, exact source/migration hashes and detailed coverage are included.

Official authenticated Debian package/distribution verification and the old clean-stop/current-start proof remain linked in lifecycle/provenance files. No new physical instance, install, security/service change, hot reload or public endpoint was used for this third fresh database. Earlier targets and evidence remain retained and unreused.

All account/role/reference/business facts are synthetic. Generated passwords/session cookies stayed in memory; ordinary password/session hashes alone went into test auth storage. No credential, usable token, connection URL/password, database or configuration file is included. `SHA256SUMS` covers every other file.

At bundle creation the same owned instance is controlled and idle. Three targets on this instance are now used and nonreusable; no further database/run occurred after this result. Shutdown/disposal of the current instance is not claimed complete.

## Remaining gaps

No real production identities/data/configuration, real business/source-file compatibility, browser/cookie enforcement over TLS, public listening transport, media delivery, production business-write HTTP policy, catalogue-creation workflow, password-change HTTP flow, production grants/RLS, existing-ERP upgrade, privileged-owner recovery, exhaustive races/deadlocks, public HTTP stale-identity race, unknown-COMMIT recovery, restart/failover, sustained load, natural-planner performance or deployment readiness is established. Controlled service fixture writes are not production command-policy approval. No user Mac, remote ERP/production/staging host, Tailscale/SSH or public Site was used.
