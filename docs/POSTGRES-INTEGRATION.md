# Disposable PostgreSQL integration harness

## Evidence status: real PostgreSQL NOT RUN

This is dormant test **source**, prepared on 2026-10-20 UTC. No database connection, SQL/DDL execution, migration, reference insert, PostgreSQL process, HTTP listener, network request, package installation, CI service, user-computer operation, push or deployment was performed to prepare it. No real `.env` file, connection string or credential was read.

Scoped TypeScript, JavaScript/TypeScript syntax checks and eight connection-free guard/assertion regressions have been performed. The real integration suite has not been run. Those checks do not parse PostgreSQL SQL, execute PL/pgSQL, exercise locks, establish rollback durability or prove any integration assertion passes. Existing scripted protocol and SQL-text tests remain separate evidence. Pure regression results also do not establish that a real database accepted anything.

The harness is not selected by the repository's existing `npm test`, `npm run check` or `npm run check:all`. No root package/configuration file or CI workflow was changed. It must not be added to a default command that can run without the explicit gates below.

## Files and scope

- `scripts/run-postgres-integration.mjs`: explicit `--run` entry point; no provisioning or `.env` loading.
- `tests/integration/safety.ts`: pure dedicated-URL/opt-in checks, without automatic environment reads or driver imports.
- `tests/integration/safety.test.ts`: pure negative/positive target-guard unit-test source using only literal fake settings, no PostgreSQL driver.
- `tests/integration/database.ts`: fresh-target verification, source-hash-pinned migration application, rollback-only constraint probes and connection release.
- `tests/integration/fixtures.ts`: clearly synthetic native reference facts and commands. Nothing is copied from production fixtures, dictionaries, historical imports or real accounts.
- `tests/integration/adapter-helpers.ts`: real injected `pg` clients, actual lock-wait observation and test-local fault injection. It never fabricates database rows or simulated COMMIT results.
- `tests/integration/proof.ts` and `proof.test.ts`: connection-free assertion logic/regressions that prevent an unrelated early constraint error from satisfying the deferred-COMMIT scenario. Fabricated unit-test errors are not PostgreSQL evidence.
- `tests/integration/postgres.integration.test.ts`: one sequential Node test suite with real-database subtests, fail-closed rather than silently skipped.
- `tests/integration/tsconfig.json`: scoped static checking; extends but does not change the root TypeScript configuration.

Only migrations **0001–0005** are enumerated, in order, with exact SHA-256 checksums. There is deliberately no migration glob, auto-discovery, production migration mechanism, checksum rewrite, repair, backfill or upgrade mode. Migration `0006_party_maintenance.sql` and later migrations are excluded pending their own review. The harness does not claim to validate party maintenance or the entire ERP schema.

## Prerequisites before anyone runs it

An operator must first obtain explicit approval for the exact disposable local/CI target. Setting an opt-in environment variable is an accident-prevention gate, not a substitute for authorization.

1. Use the repository's pinned installed dependencies and supported Node/npm toolchain. At preparation time these are Node 24.19.x, npm 11.9.x, TypeScript 5.9.2 and `pg` 8.23.1. This harness does not install anything.
2. Provision a **new, dedicated, disposable PostgreSQL 15+ database externally**, preferably in an isolated throwaway cluster. Database lifecycle and any administrator actions remain outside this harness. No database creation or deletion is implemented here.
3. Bind that PostgreSQL server directly to `127.0.0.1` or `::1` on an explicit TCP port in 1024–65535. `localhost` in the URL is normalized to `127.0.0.1` without DNS. The guard uses `host(inet_server_addr())` to compare the backend's loopback address without `/32` or `/128` notation, plus its port. Those observations **cannot prove the absence of SSH forwarding or another proxy**, including forwarding to a backend that also reports loopback and the same port. The operator must independently verify the approved physical disposable target before invocation. Remote URLs, Unix sockets, cloud databases, local SSH tunnels, proxy/port-forwarding and container port mappings with a different backend address/port remain intentionally unsupported. A CI executor can run a local PostgreSQL process bound directly to its own loopback; a future container-service variant needs separate review, not relaxed guards.
4. Name the database `naijue_erp_test_` followed by 8–32 lowercase hexadecimal characters, for example `naijue_erp_test_a1b2c3d4`. The name must be repeated exactly in the separate expected-database setting. Production, staging, live, application-default and arbitrary database names are rejected.
5. Connect as the dedicated PostgreSQL role **`naijue_erp_test`**, with a nonempty disposable-role password supplied explicitly in the dedicated URL. This is a database connection role, not an ERP administrator. It must own the disposable database and have LOGIN, but **not** SUPERUSER, CREATEDB, CREATEROLE, REPLICATION, BYPASSRLS or any role memberships. Use a cluster/role that has no access to real business data. The harness cannot prove what privileges this role has on unrelated databases or whether a deceptively named database contains important information.
6. The target must have only the normal empty `public`, `pg_catalog`, `pg_toast` and `information_schema` namespaces. No prior `naijue_erp` schema, custom schema, user relations/routines/types/collations/conversions/operators/text-search objects, default-ACL overrides, extra extensions except normal `plpgsql`, event triggers, foreign servers, publications, large objects, prepared transactions or other connections are accepted. Even an empty prior ERP schema is refused. A test-owned advisory session lock prevents simultaneous harness migrations. The operator must still ensure no unrelated client connects during the run.
7. Run against the five exact reviewed migration bytes and a matching source checkout. A changed migration hash aborts **before** Pool construction. Review a changed migration and update the test manifest deliberately; do not bypass a mismatch or substitute an existing/migrated database.

The owner role is needed for this bounded migration/constraint exercise. It is not a production runtime-grant, RLS, least-privilege, authentication or security-hardening test.

## Explicit invocation after approval

These are illustrative shell settings, **not commands executed during preparation**. Replace the disposable name, direct server port and encoded disposable-role password using your approved local/CI secret mechanism. Do not paste real credentials into chat, source, tracked files or evidence logs. Password URL characters must be percent-encoded.

```sh
export NODE_ENV=test
export NAIJUE_PG_INTEGRATION=I_APPROVE_A_FRESH_DISPOSABLE_LOCAL_DATABASE
export NAIJUE_PG_EXPECT_DATABASE=naijue_erp_test_a1b2c3d4
export NAIJUE_PG_TEST_DATABASE_URL='postgresql://naijue_erp_test:REPLACE_WITH_URL_ENCODED_DISPOSABLE_PASSWORD@127.0.0.1:55432/naijue_erp_test_a1b2c3d4'
node scripts/run-postgres-integration.mjs --run
```

The example expects the actual local PostgreSQL process itself to listen on 55432. It is not a suggested Docker host-port mapping.

`DATABASE_URL`, `PG*` ambient credential defaults and actual `.env` files are not configuration inputs. Host, port, database, user, password, disabled TLS, application name, timeouts and search path are supplied explicitly to `pg`. URL query options, fragments and socket overrides are rejected. The runner does not print the URL or password. Do not add verbose environment/connection logging. Directly invoking the real integration test without the runner marker fails; the marker is not a secret or a security boundary.

No argument, a missing gate, an unsafe URL, an elevated role, a reused/nonempty target, unexpected connections or a changed migration produces a refusal/nonzero exit, not a fake passing/skip result. `--help` is informational and opens no connection.

## Intended database assertions, still NOT RUN

The source is designed to exercise these through actual existing adapters and exact synthetic facts:

- Apply migrations 0001–0005 and check the migration registry after every migration.
- SAVE new sales and transfers without inventory effects; APPROVE and UNAPPROVE with exact version increments, immutable successful receipts and audit facts.
- Synthetic independent SALE, RETURN and EXCHANGE signed amounts/settlement directions. The fixture's deliberately simple arithmetic is **not** a production sales economics provider or business-rule acceptance.
- Two actual PostgreSQL advisory-lock waiters before releasing each request-key/document blocker, so duplicate same-key results are not merely called a concurrency test because two promises were created. Same-key SAVE/APPROVE/UNAPPROVE replay, different-content conflict and globally shared actor/key conflict across SALES/TRANSFER are checked.
- Distinct-key stale-version CAS races and absent-header insertion races, each with exactly one successful writer and no losing committed receipt.
- Repeated actual lines for one SKU remain distinct. Sales may produce negative stock. Transfers produce both FROM/TO entries per native line; exact inverse entries link to each original on UNAPPROVE. Transfer balance versions advance for every endpoint effect, not just an aggregated quantity.
- SQLSTATE 22012 induced on the same real transaction after native header/ledger/balance/audit writes, followed by adapter ROLLBACK and comparison through subsequent pool reads outside the aborted transaction. Those reads are not guaranteed to use newly created physical connections. A retry reuses the original key only after an explicit SQL error with a known rollback, never after an unknown COMMIT outcome.
- Transfer deferred final-balance inconsistency rejects COMMIT with SQLSTATE 23514 and leaves no partial operation. That scenario additionally requires one successful sabotage-row update, an observed real adapter COMMIT attempt, the exact expected balance-validator error message and its PL/pgSQL function context. An unrelated early 23514 is not accepted. Normal constraint probes force `SET CONSTRAINTS ... IMMEDIATE` inside a transaction before rolling it back, so deferred checks cannot be hidden by unconditional rollback.
- Missing inventory coverage stays absent. Failed commands must not advance documents or commit ledger, balance, audit or receipt changes.
- Real deferrable transfer line-position swaps and sparse actual changed-line audit evidence.
- Selected actual schema checks/FKs/uniqueness: canonical SKU coordinates, fit format, explicit pricing metadata, image byte bound, decimal storage overflow, auth-session hash format, same actor/request-key uniqueness, closed tagged native receipt targets, typed result identity, reciprocal deferred receipt/audit linkage, ledger endpoint/source check, settlement equality and append-only mutation rejection.
- Scoped sales list/detail/history/approved-only settlement-statistics reads, exact integer/money results, hidden-scope refusal, literal rather than LIKE/injection text and out-of-range pages.
- A real separately committed SAVE between a sales reader's count and page statements: the existing REPEATABLE READ reader must still return its original count/page snapshot, while a subsequent reader sees the new commit.
- Product basics, normalized specifications and image **metadata only**, with no original image bytes, storage service, thumbnail generation or public-link fallback.
- Authentication **storage** account/session locking, synthetic-session insertion, rollback and auth-version/session invalidation. The fixture ERP account is non-admin, login-disabled and has only intentionally invalid password-hash sentinels. No usable password, bootstrap administrator, session bearer token, login or complete authentication/authorization composition is created.

All server acceptance, SQLSTATE expectations, deferred-trigger ordering and observable concurrency behavior above remain assertions to be verified on the first approved execution. The harness source may expose a migration/adapter defect; compilation is not evidence those assumptions are correct.

## Isolation, failure and cleanup boundaries

- The whole database must be disposable and exclusive. The harness never attaches to a populated database, tries to find a safe subset of production data or silently clears a schema.
- The five migrations create/alter only their fixed test-owned `naijue_erp` schema after freshness checks. Some migrations intentionally replace their own constraints/triggers. There are **no harness `DROP DATABASE`, `DROP SCHEMA`, `TRUNCATE`, broad cleanup deletes or trigger-disable operations**.
- Synthetic rows are inserted only after fresh-target verification and all five migrations. Constraint probes always roll back. Existing append-only receipt/audit/ledger facts are not deleted to make cleanup convenient.
- Successful and failed runs leave the disposable database for **external lifecycle disposal**, including any already committed earlier migrations. The harness only rolls back an open failed transaction and releases/discards its own clients. Never rerun against a partly migrated/used target; provision another fresh approved target.
- The one guard client retains its advisory session lock until suite cleanup. Other clients have bounded connection, statement, lock and idle-transaction timeouts. Test assertions drain their own contending command promises before the next subtest. Advisory waiter counting is database-wide and relies on the required exclusive target. The 2.5-second observation window and 4-second lock timeout are intentionally bounded but may need separately reviewed tuning on slow CI; a timeout is a failure, not a waived concurrency assertion.
- On a crash or uncertain COMMIT acknowledgement, retain the original request key, stop and inspect the disposable target/logs. This harness does not automatically retry uncertain writes, reset state or infer rollback from an error alone.
- Do not weaken safe-target guards to resolve setup failures. A valid future extension needs explicit review, a bounded new target contract and separately recorded execution evidence.

## Safe source-only checks

These commands do not run the database suite, load `.env` files or construct a Pool:

```sh
./node_modules/.bin/tsc --noEmit -p tests/integration/tsconfig.json
node --check scripts/run-postgres-integration.mjs
for file in tests/integration/*.ts; do node --check "$file" || exit; done
```

Those exact scoped type/syntax checks passed on 2026-10-20 UTC for the corrected source. No actual integration command was run. The following connection-free regression command also ran, with **8 passed, 0 failed, 0 skipped**:

```sh
node --test tests/integration/safety.test.ts tests/integration/proof.test.ts
```

These regressions use only literal fake settings, fabricated error objects and a local SQL-source text assertion. They import no database driver and make no connections. They must never be presented as PostgreSQL evidence.

## What this enables next, and what it cannot establish

Next: approve/provision the fresh direct-loopback disposable target, run the explicit harness, record the source revision, migration checksums, actual PostgreSQL version and unedited TAP/exit status without credentials, and investigate failures before considering a reviewed CI job. Only then may those executed assertions be labeled real-PostgreSQL integration evidence.

Even a future green run covers only these synthetic cases. It does not prove production data compatibility, migration from an existing ERP, historical cutoff import/editing, party maintenance/0006+, full application composition, trusted production rules/auth providers, HTTP/UI/browser acceptance, media delivery, grants/RLS, all deadlock schedules, sustained load, failover, process/cluster restart recovery, unknown-COMMIT recovery or deployment readiness. Those need separate test plans and authorization.

## Primary documentation for later operator review

The following official references were not fetched during this no-network preparation:

- [node-postgres transactions: one acquired client per transaction](https://node-postgres.com/features/transactions)
- [node-postgres client connection/timeouts configuration](https://node-postgres.com/apis/client)
- [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- [PostgreSQL explicit/advisory locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- [PostgreSQL SET CONSTRAINTS and deferred checks](https://www.postgresql.org/docs/current/sql-set-constraints.html)
- [PostgreSQL database constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [PostgreSQL role attributes](https://www.postgresql.org/docs/current/role-attributes.html)
