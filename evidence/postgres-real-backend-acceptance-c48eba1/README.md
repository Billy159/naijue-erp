# Real current-schema backend PostgreSQL acceptance

## Result

On 2026-10-20 UTC, explicit `backend-0001-0008` executed once on a separately fresh physical PostgreSQL 17.11 instance and passed: **11 tests, 11 passes, 0 failures, 0 skipped; exit 0**. The count is the outer test plus 10 substantive subtests. Duration was 2433.128727 ms. This is real PostgreSQL engine evidence, not a mock, source-text assertion or plan-only result.

- Exact tested commit: `c48eba1e9b05c76ecc9eec20c548dff13b5719b1`.
- Frozen backend PLAN SHA-256: `dc08108e0fd260e3bec4d266f4abf5d0df05f635ac3182f2bb0f3d0ac75ce39e`.
- All **939 committed files** in the frozen archive matched their exact Git blobs after execution; zero mismatches. Exact eight reviewed migration hashes and selected source-file hashes are included.
- Target: `127.0.0.1:55432/naijue_erp_test_9a1a94578554689c`; physical system identifier `7698856207892361241`; PostgreSQL `server_version_num=170011`, primary, not recovery.
- Dedicated `naijue_erp_test` owner/login has no SUPERUSER, CREATEDB, CREATEROLE, REPLICATION or BYPASSRLS. The unchanged fresh/exclusive target checks, runner marker, eight source hashes and direct-loopback checks passed before execution.
- Selected command was explicitly backend-only. The historical five-migration suite stayed refused; sparse selection was not silently redirected.

## Actual additional engine coverage

1. All eight migrations and real synthetic scope publication, with no initial-zero seeding.
2. Authentication **STORAGE ONLY**: disabled synthetic account, actual committed/rolled-back session rows, account/session locking, unusable sentinel hash/version change and session revocation. No usable credentials, login or password verification.
3. Actual database rejection of incoherent pricing intent, duplicate SKU coordinate, invalid fit/image/numeric values and invalid session hash. This is not production pricing-policy or discount/gift economics acceptance.
4. Same-document sales SAVE version-CAS and initial-insertion races: actual advisory waiters, one winner and one VERSION_CONFLICT.
5. Corresponding same-document transfer races with exact receipt/audit outcomes.
6. Signed independent RETURN/EXCHANGE posting, exact per-source-line native effects/versions/warehouse/endpoint, settlement direction and one-to-one linked inverse effects.
7. Native sales list/detail/history/statistics with restricted/hidden scopes, literal search and page-beyond-end behavior.
8. Real sales count/page REPEATABLE READ snapshot held across another committed SAVE.
9. Native product basics, exact three-SKU/two-size specifications and image **METADATA ONLY**. The image reference is deliberately synthetic, not delivered media.
10. Actual deferred two-line transfer position swap with sparse audit, exact ordering and no stock effect.

## Controlled lifecycle and official distribution

The earlier owned sparse-test instance was stopped through its existing bounded stop command. Its server acknowledged clean shutdown, its postmaster PID file disappeared and port 55432 was checked free before the new process. All old successful/failed targets and evidence were retained. Nothing was cleared, repaired or reused.

The final separately reviewed supervisor was used byte-for-byte: SHA-256 `8874c81620a67b475ba3bfd4aa9c74bfcbd7f4a841d4de3ab015d6553dee1325`; exact reviewed full diff SHA-256 `e0fd24b113a27c739265429c973ca945db26b2867bdfd734f509c05cf625b0c0`. It permits only explicit sparse/backend enum commands plus bounded prepare/stop, with owned-directory-only startup cleanup and stop-only uncertain recovery. It was not hot-patched into the old holder. Startup fault logic was tested only with pure mocks; this successful real run does not claim real startup-failure recovery proof.

The existing official Debian 17.11 server/client/libpq package SHA-256 values were reverified. Every extracted regular file and symlink was compared with its authenticated package contents before new startup: 22 libpq files, 1571 server files and 371 client files all matched. The distribution remains user-mode extracted; no host package install, service registration, OS/security/network permission widening, public binding, tunnel or production connection occurred.

New disposable credentials were generated only in the new holder's memory, supplied through anonymous pipe/child environment, and stored only as normal PostgreSQL password hashes. No credential, connection URL/password, configuration or database file is included here.

## Evidence

`acceptance.tap` is complete and byte-identical to the original (SHA-256 `271358979f1ad7b05dd840828d4607b56fbf949e4591ef08fb66b069e293c1e4`). `acceptance-run.json` retains all result fields but replaces only local source/log paths. Original hashes, nonsecret fingerprint, whole-tree verification, exact migrations/source hashes, official provenance, distribution pre-start check and bounded lifecycle confirmation are separate JSON files. `SHA256SUMS` covers every other bundle file.

Earlier sparse engine evidence remains independent at `../postgres-real-acceptance-318440a/`, including its preserved first SQL syntax failure. Backend source-only preparation/review evidence is separate and must not be confused with this actual engine run.

## Remaining gaps and retained state

No actual application/server composition, login/authentication service/password verification, HTTP/session-cookie/browser/UI flow, production authorization provider, real business/source-file compatibility, media delivery, post-publication catalogue creation, existing-ERP upgrade, production grants/RLS, privileged-owner recovery, all race/deadlock schedules, unknown-COMMIT recovery, restart/failover, sustained load, normal-planner performance or deployment readiness is established.

Only synthetic data was used. No user Mac, existing ERP database, remote server, Tailscale/SSH, public Site or real business data was accessed. At bundle creation the new owned loopback instance is controlled and idle; its tested target is retained and not reusable. No additional database or engine run was created after this result. Shutdown/disposal is a separate lifecycle action and is not claimed complete for the new instance.
