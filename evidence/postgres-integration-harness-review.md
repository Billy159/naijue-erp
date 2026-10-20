# Disposable PostgreSQL harness review

Reviewed 2026-10-20 UTC. Repository: `/workspace/shared/naijue-erp-rewrite`.

## Verdict and evidence boundary

**Final corrected-source disposition: suitable to retain as a dormant, explicitly approved direct-loopback integration harness; real PostgreSQL has NOT been run.** The initial preflight execution blocker and specific false-positive test-evidence gap below were corrected by the harness owner and independently rechecked during this review. The forwarding-provenance limitation is now explicitly documented. No production-accident path involving broad deletion or cleanup was found in the reviewed source. Docker NAT remains unsupported by the present contract, not a reason to weaken the guards.

This review made no database connection, SQL/DDL execution, PostgreSQL/service startup, network request, installation, credential or `.env` read, integration-runner invocation, repository-source edit, push or deployment. Commands executed were filesystem/source inspection, SHA-256 calculation, pure literal-input safety unit tests, scoped TypeScript checking and syntax checking. The only written files are this review and its adjacent hash/check evidence files.

Evidence files:

- `postgres-integration-harness-review-source.sha256`: reviewed harness, manifest migrations and supporting adapter/application/configuration hashes, relative to the repository.
- `postgres-integration-safety-review-checks.log`: pure safety tests **4 passed / 0 failed**, scoped typecheck exit 0, runner syntax exit 0, integration TypeScript syntax exit 0. Node was v24.19.0.
- `postgres-integration-harness-final-review-source.sha256`: final corrected sources, including the new pure proof module/tests and unchanged exact migration hashes.
- `postgres-integration-harness-final-review-checks.log`: independent final pure safety/proof tests **8 passed / 0 failed**, scoped typecheck exit 0, runner syntax exit 0 and all integration TypeScript syntax checks exit 0.

These results are not evidence that PostgreSQL parses the migrations, accepts any SQL, enforces the asserted SQLSTATEs or performs the intended locking/rollback behavior. Documentation's original statement that the pure tests were not run remains historically accurate for preparation, but this later review did run them.

Final freeze: the owner confirmed source freeze, the final documentation was reread, and every entry in the final SHA-256 manifest was checked against disk successfully. The final documentation also records the eight pure regressions and qualifies pool-connection reuse, database-wide waiter observations and slow-CI timing. Its SHA-256 is `dac71b708cf3165102d321beb880a096182f04f4a023d1e6123a2872fa94f153`.

## Initial findings and final disposition

The line references and defect descriptions in H1/H2 describe the initial captured source. Final corrected bytes are separately hashed above. No source edits were made by the reviewer.

### H1 — Preflight execution blocker: explicit inet-to-text includes a mask

**Classification: high-priority harness defect, fail-closed rather than a production-safety escape.**

`tests/integration/database.ts:25–32` selects `inet_server_addr()::text AS address`, then allows only `127.0.0.1`, `::1` and `::ffff:127.0.0.1`. PostgreSQL's explicit inet-to-text conversion includes the network mask, such as `127.0.0.1/32` or `::1/128`; this differs from displaying an inet value through its ordinary output function. A valid directly bound loopback server is therefore expected to fail this string allowlist before any migration.

Recommended narrow correction: obtain the host address using `host(inet_server_addr())`, or compare a correctly typed inet expression to the intended exact addresses. Retain loopback/identity/primary/role/freshness gates; do not solve this by allowing arbitrary server addresses. This is a source-level finding, not an observed engine failure; no forbidden database experiment was performed.

**Closed in final source:** `database.ts` now selects `host(inet_server_addr())`. The exact loopback/port, identity, primary, role and freshness checks remain. A pure SQL-source regression verifies this projection and rejects the previous explicit text-cast form; this is regression evidence about source shape, not actual PostgreSQL output.

### H2 — Deferred-COMMIT test can accept an earlier unrelated CHECK failure

**Classification: medium-priority test-evidence defect, not a demonstrated adapter/schema defect.**

`tests/integration/postgres.integration.test.ts:202–210` is named "transfer deferred final-balance mismatch rejects COMMIT". It injects an UPDATE after a real receipt INSERT, but only asserts any SQLSTATE `23514` and an unchanged snapshot. Unlike the earlier `22012` fault tests, this expected error is not unique to its injected statement. An unrelated `23514` before the receipt hook can satisfy the test without executing the sabotage, reaching COMMIT or exercising the final-balance trigger.

Recommended correction: assert the sabotage hook executed, observe that the actual adapter attempted COMMIT, and identify the intended final-balance error/trigger when reliable metadata is available. Preserve forwarding to the actual acquired `pg` client; do not fabricate a COMMIT failure. The healthy posting subtests reduce the chance of hiding a globally broken adapter, but do not establish this subtest's intended failure stage for its particular document.

**Closed in final source:** the sabotage requires actual driver `rowCount === 1` before recording successful application. `afterStatement` has a pre-forward observer that records the actual adapter COMMIT attempt, then forwards the statement to the real client. The new pure `assertDeferredBalanceFailure` requires both facts, SQLSTATE 23514, the exact migration-defined error message and PL/pgSQL `validate_transfer_balance_commit()` context. Three explicitly fabricated-error unit regressions reject missing sabotage/COMMIT and unrelated SQLSTATE/message/context. Only these pure regressions ran; no COMMIT was executed during review.

### H3 — Backend loopback equality is not proof that no tunnel exists

**Classification: safety-contract/documentation limitation; not a demonstrated path that bypasses the fresh/non-admin database gates.**

`database.ts:32` and `docs/POSTGRES-INTEGRATION.md:30,52` should not be read as proving physical locality or ruling out every SSH tunnel. A local forward to a remote PostgreSQL server bound to remote `127.0.0.1`, using the same numeric port at both ends, can report the very address and port this comparison expects. Even after H1 is corrected, SQL server-address identity is not provenance attestation.

Existing defenses still require the exact repeated random-suffix test database, dedicated non-elevated owning role, no role memberships, primary status and empty/exclusive catalogs, and the docs already require external approval/isolation and warn that privileges on unrelated databases cannot be established. Keep those protections. State that tunnels/proxies are prohibited by the operational contract, not cryptographically detected by this test. Do not describe a loopback socket alone as proof that a target is safe or disposable.

**Documentation correction verified in final source:** the guard comment/error and operator prerequisites now explicitly state that matching backend loopback/port cannot rule out forwarding and require independent verification of the approved physical target. This is the honest contract boundary, not a new technical attestation mechanism.

## Safety and scope checks that look sound in source

- The ordinary package test commands do not execute this suite. `--run`, exact `NODE_ENV=test`, the explicit approval phrase, a dedicated test URL and separately repeated exact database name are required. Direct suite execution additionally requires a 64-hex runner marker. The marker is explicitly documented as accident prevention, not authorization/security.
- The pure settings module imports no PostgreSQL driver, creates no pool and reads no environment automatically. The runner validates its target before spawning. URLs reject remote/non-loopback hosts, options/fragments, sockets, missing or privileged ports, administrative/different role names, empty/control-character passwords and arbitrary/non-test database names. `localhost` is mapped to 127.0.0.1 without DNS. Errors contain static explanations, not the URL/password.
- The driver receives explicit host, port, database, user, password, TLS choice, application name, timeouts and startup options. There is no fallback to `DATABASE_URL`, `PG*` credentials or `.env` loading in the harness. The whole ambient process environment is inherited by the child, but is not deliberately printed or used as the connection configuration.
- Before mutation, server identity/current and session roles must match; the role must own the target, have LOGIN and lack SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS. Role memberships are refused. PG15+ and non-recovery are required.
- Freshness checks reject unexpected namespaces, user relations/routines/types and several other object categories, nonstandard extensions, event triggers, foreign servers, publications, large objects, prepared transactions, default ACL overrides and existing connections. Even an empty previous ERP schema is rejected. This is intentionally stricter than merely checking whether business tables contain rows.
- A database-scoped session advisory lock is held on a dedicated guard connection through the suite; failed setup releases/discards it and ends the pool. The initial other-connection check is a snapshot, not a guarantee against a later unrelated connection. The docs correctly require the operator to keep the entire target exclusive.
- Migrations are enumerated explicitly as 0001–0005, in order, with SHA-256 hashes checked before Pool construction. All five actual source hashes matched the manifest during review. There is no glob, checksum rewrite, schema repair, upgrade mode or 0006+ execution. A registry check follows each migration.
- No harness `DROP DATABASE`, `DROP SCHEMA`, `TRUNCATE`, broad cleanup delete, trigger disable, terminate-other-backends or deletion of append-only facts was found. Negative DELETE/UPDATE probes are scoped to known synthetic IDs and enclosed in rollback transactions. Migrations replace only their own reviewed constraints/triggers. Committed migration/test data is retained for external disposal; a failed/used target cannot be reused as fresh.
- Fixture UUIDs, names, dates, product/payment references, synthetic quantities and image file reference are clearly artificial. The ERP account is a SALESPERSON reference with inactive staff status, login disabled and intentionally invalid password-hash sentinels. Storage-session hashes derive from explicit synthetic markers, not real bearer tokens. No bootstrap admin, usable password, live catalogue, original image or real financial account number is introduced.
- The sales authorization/economics provider is expressly synthetic and limited to known fixture identities; it does not establish production authorization or economics. Transfer uses the existing actual policy with injected synthetic actor identity. The document correctly excludes full login/composition/auth-security evidence.

## Are these real SQL assertions rather than mocks?

**Yes, structurally, but none have been executed against PostgreSQL.**

- `adapter-helpers.ts:19–28` wraps a real acquired client, forwards each statement and its values, returns actual rows/rowCount and performs fault callbacks on that same transaction. There are no invented result rows, mocked SQLSTATEs or simulated successful/failed commits.
- Same-key replay and distinct-key CAS/absent-header races acquire a real transaction advisory blocker and wait until two real PostgreSQL advisory waiters are visible before release (`adapter-helpers.ts:60–80`). Both command promises are drained in cleanup. This is materially stronger than merely issuing two promises. Current lock observations are database-wide, not filtered to the exact key/PIDs; under the required exclusive target only the harness commands should contribute. Exact lock/PID filtering would improve diagnostics and robustness if the exclusivity assumption is later broadened.
- SQL fault callbacks use real `SELECT 1/0`; the transfer post-write probe additionally counts the four actual endpoint effects before raising it. Snapshots reread native headers, lines, settlements, receipts, audits, ledgers and all balance rows after rejection. These are fresh autocommit transactions obtained from the pool, not necessarily newly created physical backend connections. This tests rollback visibility, not restart durability.
- Constraint probes force `SET CONSTRAINTS ALL IMMEDIATE` before ROLLBACK, and selected reciprocal-FK probes target named constraints. Deferred checks are not hidden by unconditional rollback. Some simple probes assert only SQLSTATE, but their isolated mutations narrow the intended violation; H2 is the significant stage ambiguity found.
- The sales snapshot test commits another actual SAVE between the reader's count and page queries, asserts that the hook fired, checks the original count/page and then checks that a later reader sees both rows. It would exercise actual REPEATABLE READ behavior, not scripted protocol responses.
- Exact balances, versions, signed amounts, reversal links, receipts/history, repeated native lines, two transfer endpoints, literal filter text, hidden scopes and product metadata are inspected through real query APIs. Independent RETURN/EXCHANGE fixtures remain simple synthetic arithmetic, not business-rule acceptance.
- Failure of an early subtest may cascade into later subtests because several intentionally share sequential fixture state. That is a diagnosis/usability issue, not fabricated evidence. No passing, skip or engine-acceptance claim should be inferred until the first authorized run reaches the terminal assertions.

## Docker/CI practicality and a bounded future contract

The present backend equality requirement excludes ordinary disposable Docker host-port mappings: Node may connect to `127.0.0.1:55432`, while PostgreSQL correctly reports its container address and backend port `5432`. Rejecting that case is **optional deployment-profile restriction, not an inherent database-safety requirement**. A separately reviewed Docker-compatible mode can preserve accidental-production protections. Do not simply delete the server-address check, accept any private IP, permit arbitrary service hostnames or allow the default superuser to make CI easier.

Two defensible paths:

1. **Keep the direct contract.** After H1 is fixed, run the test runner and disposable PostgreSQL in the same isolated network namespace, with the PostgreSQL process itself listening on loopback and the same port. This does not require weakening the current socket/backend contract. The externally prepared test environment must contain the already pinned toolchain/dependencies; no installation or service run was performed here.
2. **Review an explicit `docker-disposable` profile.** Retain every existing approval, test-only URL/name, non-admin owning role, primary, freshness, exclusivity, migration pin and non-destructive cleanup requirement. In addition:
   - Approve one exact local container/CI service and a per-run random identity, not a generic permission to use localhost, a Docker context or private networks.
   - Obtain the full container identity, trusted pinned image, local execution-context provenance and exact loopback host binding/port from the approved provisioning mechanism. No remote Docker context, host-network shortcut, persistent/reused PGDATA, production mounts, arbitrary forwarding target or shared business cluster. Treat any orchestration access as separate authorized setup, not something this harness silently starts.
   - Validate the client-facing endpoint remains loopback and the exact backend address/port separately matches that specific approved container, rather than requiring the host NAT port to equal the container port. Do not use a wildcard RFC1918 range as identity.
   - Bind the provisioning evidence to the actual database connection with a unique, one-run marker established by the trusted provisioner, for example a reviewed database comment, and require an independently supplied exact expected marker. A database comment would not require permitting a pre-existing application schema or relation. This reduces accidental endpoint swaps; it is not proof against a malicious server or operator.
   - Keep the dedicated role non-superuser. Official PostgreSQL container initialization commonly makes the configured initialization role administrative; provision the test owner separately outside the harness rather than relaxing the role guard.
   - Record the precise profile, target identity without secrets, source hashes, actual server version, unedited TAP/exit and failure stage. Leave the whole container/database for the authorized external lifecycle mechanism to dispose of. Add pure negative tests for profile confusion, missing/mismatched backend identity, marker mismatch, wildcard/remote binding and reused storage before using this profile.

Container metadata, marker binding and operator approval are the provenance mechanism; `inet_server_addr()` alone is not one. This is a review recommendation only, not an implemented or authorized container execution path.

## Next acceptance gate

H1/H2 corrections and H3's documentation qualification are complete and rehashed. Before the first real run, deliberately choose the existing direct profile or separately review a bounded Docker profile. Only after the operator approves/provisions the exact fresh disposable target should the runner execute. Capture real evidence and investigate failures without automatic cleanup/retry after unknown COMMIT outcomes. There is no remaining source-review blocker identified here for the existing direct profile; engine acceptance, SQL trigger ordering, real races and rollback assertions remain entirely unverified.

No source changes were made by this reviewer, and no additional authorization to run databases or services was assumed.
