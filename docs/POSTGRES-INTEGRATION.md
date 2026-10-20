# Disposable PostgreSQL acceptance harness

## Evidence status: real PostgreSQL NOT RUN

This is dormant engine-test **source**, extended on 2026-10-20 UTC. No database connection, SQL/DDL/EXPLAIN execution, migration, PostgreSQL process, HTTP listener, network request, package installation, CI service, user-computer operation, push or deployment was performed while preparing the extension. No real `.env`, connection string or credential was read.

Typechecking, syntax checks, pure guard/assertion regressions and plan output are connection-free checks only. They do not parse SQL, execute PL/pgSQL, establish trigger composition, prove locks, demonstrate rollback durability or validate an assertion against PostgreSQL. Existing protocol/SQL-text evidence remains separate. Never relabel it engine proof.

The existing original preparation evidence for the historical 0001–0005 harness remains unchanged, including its eight pure regressions. The current extension needs its own source revision/checksums and separately recorded static-check results. The full real suite has still never run.

The suite is not selected by `npm test`, `npm run check` or `npm run check:all`. Root package/configuration files, CI and the existing explicit runner script were not changed. Never add this suite to an ungated default command.

## One implementation and current schema

The current acceptance plan is **only `sparse-0001-0008`**, using the one current PostgreSQL implementation and exact migrations 0001–0008. These are acceptance scenarios, not alternate production storage paths.

The old 0001–0005 test body is preserved, unregistered and uncalled, in `postgres.integration.test.ts`. `native-0001-0005` is explicitly refused before Pool construction. Current adapters call `inventory_key_lock` from 0007 even when a balance exists, and need the reviewed 0008 first-use guard semantics. Running today's adapters on the historical five-migration prefix would be misleading, not compatibility acceptance.

The manifest lists exact filenames and SHA-256 values. **All eight source hashes are checked before constructing any Pool**, never discovered with a migration glob. A change aborts and requires deliberate review. No migration repair, upgrade, checksum rewrite, historical source loading or production migration mode exists.

- `migration-manifest.ts`: driver-free exact hashes and scenario plan.
- `plan.ts`: connection-free explicit operator plan, checks hashes and prints migration/scenario/gate lists.
- `safety.ts` and `safety.test.ts`: pure dedicated-target, opt-in and current-scenario checks; no automatic environment reads, driver imports or credential fallbacks.
- `database.ts`: fresh-target verification, exact ordered migrations, explicit historical fixture hook after 0005, rollback-only constraint probes and release.
- `fixtures.ts`: synthetic-only historical reference setup, not production catalogues, usable credentials or stock seeds. In current mode no initial balances are inserted. The extra real SKU coordinate gives a separate absent race key and an actual missing coordinate for not-applicable reads.
- `adapter-helpers.ts`: real injected `pg` clients, actual lock-wait observation and same-transaction SQL fault injection. It fabricates neither rows nor COMMIT results.
- `proof.ts` and `proof.test.ts`: pure negative assertion regressions, including exact raw-driver deferred error code/message/function-context matching. Fabricated unit errors are not engine evidence. Production bounded-pool sanitization is not changed or bypassed in production; exact error assertions use only this trusted raw-driver test boundary.
- `sparse-acceptance.ts`: current 0001–0008 real-engine subtest source.
- `postgres.integration.test.ts`: gated current entry point and preserved historical body; fail closed, never silently skipped.
- `tsconfig.json`: scoped static checking, without changing root TypeScript configuration.

Paths above are under `tests/integration/`. The existing entry point remains `scripts/run-postgres-integration.mjs`.

## Safe plan, no database access

```sh
node tests/integration/plan.ts --suite sparse-0001-0008
```

This is **plan-only**. It reads only reviewed migration source bytes, not environment settings or credentials. It imports no PostgreSQL driver and cannot open a connection. It prints the exact migration list/checksums, planned scenarios, required execution gates and explicit NOT RUN status. Missing/unknown/historical suite selections refuse rather than choosing an implicit target or compatibility path.

Planning does not authorize execution. Actual execution still requires the existing explicit `--run`, target gates, fresh-server checks and authorization below.

## Prerequisites before real execution

Obtain explicit approval for the **exact operator-selected fresh disposable physical target** first. Opt-in variables and a generated runner marker are accident-prevention gates, not authority or security boundaries.

1. Use the repository's pinned installed dependencies and supported toolchain. The harness never installs anything.
2. Provision a **new dedicated disposable PostgreSQL 15+ database externally**, preferably in an isolated throwaway cluster. No creation/deletion/provisioning commands are implemented here. Never select the user's current ERP, production, staging, shared data or a reused test database.
3. Bind the PostgreSQL process directly to `127.0.0.1` or `::1`, with an explicit TCP port in 1024–65535. `localhost` normalizes to loopback without DNS. The server must report the same loopback address/port, primary status and approved database/role identity. These checks cannot establish that there is no SSH tunnel/proxy to another loopback backend: the operator must independently verify physical isolation. Remote endpoints, Unix sockets, tunnels/proxies and mismatched container port mappings remain unsupported. Do not weaken guards to work around setup failures.
4. Use `naijue_erp_test_` plus 8–32 lowercase hexadecimal characters, repeated exactly in `NAIJUE_PG_EXPECT_DATABASE`.
5. Use the dedicated `naijue_erp_test` role and explicit nonempty disposable password. The role must own the target and have LOGIN, but no SUPERUSER, CREATEDB, CREATEROLE, REPLICATION, BYPASSRLS or role memberships. Its access to unrelated databases is the operator's responsibility. This owner-role test is not proof of runtime grants, RLS or security hardening.
6. The database must be fresh and exclusive, with only normal empty namespaces. Custom objects, prior ERP schema, user routines/types/relations/text-search objects, default ACL overrides, extra extensions other than `plpgsql`, event triggers, foreign servers, publications, large objects, prepared transactions and other clients are refused. The session guard retains its advisory lock; independently ensure no unrelated client joins later.
7. Match all eight reviewed migration hashes. Do not reuse a partly migrated target after a failure.

`DATABASE_URL`, ambient `PG*`, `.env`, DNS and URL query options are never credential/target fallbacks. The Pool receives explicit host/port/database/user/password, disabled TLS, bounded connection/statement/lock/idle timeouts, UTC and fixed search path. No URL/password is logged.

## Explicit invocation only after approval

Illustrative settings, **not commands run while preparing**. Supply the direct server port, fresh name and disposable password via the approved secret mechanism. URL-encode password characters. Never paste real credentials into chat, tracked files or evidence.

```sh
export NODE_ENV=test
export NAIJUE_PG_INTEGRATION=I_APPROVE_A_FRESH_DISPOSABLE_LOCAL_DATABASE
export NAIJUE_PG_TEST_SUITE=sparse-0001-0008
export NAIJUE_PG_EXPECT_DATABASE=naijue_erp_test_a1b2c3d4
export NAIJUE_PG_TEST_DATABASE_URL='postgresql://naijue_erp_test:REPLACE_WITH_URL_ENCODED_DISPOSABLE_PASSWORD@127.0.0.1:55432/naijue_erp_test_a1b2c3d4'
node scripts/run-postgres-integration.mjs --run
```

The PostgreSQL process itself must listen directly on the example port; this does not suggest port forwarding. Direct test invocation lacks the runner marker and refuses. Missing gates, unsafe targets, elevated roles, reused databases, hash changes or historical scenario selection fail nonzero, never pass/skip.

## Reviewed fixture order and intended engine assertions, NOT RUN

1. Migrate 0001–0005. Insert one bounded, atomic set of **historical synthetic reference facts** before 0006 enables current party constraints. This is not current CREATE acceptance or permission to bypass current guards. No triggers are disabled, no fake receipts are forged and no starting balances exist. Apply 0006–0008 and check the exact registry after each migration.
2. Exercise actual 0006 party CREATE, EDIT, DISABLE and RESTORE through the real application service/store. Independently allocated KH/GYS codes, same-key concurrent replay, exact sparse audit fields, immutable original result, different-content conflict, rollback without rows/receipt/audit and enabled-hall default protection are asserted. Sequence gaps after failed reservations are expected, not rolled-back/gapless claims. The synthetic account stays login-disabled; the WAREHOUSE actor is only explicit fixture authorization, not trusted production authentication.
3. Stage the exact synthetic manifest and import native warehouse/SKU membership. Early publication and runtime approval before publication fail closed without partial state.
4. Import **one real nonzero baseline**. A same-transaction balance mismatch must reach actual COMMIT and fail with exact SQLSTATE/message/PL/pgSQL sparse-validator context, then leave checkpoint/source/ledger/balance/audit/receipt unchanged. Retry only after known deferred rejection and completed rollback. A healthy baseline must then COMMIT with exact source ownership, nullable native sources, import endpoint, quantity 7, balance version 1, receipt/audit/checkpoint and immutable replay. This positive COMMIT detects the old unconditional native-ledger-trigger composition defect, not merely a trigger-name/text test. Also inspect the installed native-only trigger predicate.
5. Inspect the actual server's unique valid/ready `(object_id,new_version)` IMPORT checkpoint index and installed function definition. The checkpoint function must use the exact native version and no historical `import_record` query/SUM/ORDER BY. Run `EXPLAIN (FORMAT JSON)` of that exact point lookup inside a read-only transaction with **local `enable_seqscan=off`**, then roll back. This establishes index **eligibility only**, not the optimizer's normal choice, trigger-internal execution plan, timing, realistic cardinality or performance. No ANALYZE/load benchmark is claimed.
6. Publish exact complete scope and final approval: 2 warehouses, 3 SKUs, 1 baseline and 1 explicit complete-scope attestation. Assert exact checkpoint counters, immutable publication receipt/audit and no Cartesian-product zero inserts.
7. Use the actual native inventory reader: readiness, exact totals, stable source size order, real SKU absent stock as known zero, missing coordinate as not-applicable, baseline value, scoped warehouse intersection, forbidden outside-scope filter, page beyond end with full-filter summary, literal candidate search and non-mutating reads. Negative native stock must participate exactly in summaries. No client label, CSV fallback or fabricated read result supplies proof.
8. First sale with repeated real lines: actual SQL division failure after its first balance/ledger/header/audit writes rolls back everything and preserves absence. Healthy duplicate-key APPROVE after known rollback creates only actual effects, balance -5/version 2, exact receipt/audit/ledger and linked inverse UNAPPROVE; zero is retained at version 4.
9. First transfer with repeated lines and both previously absent endpoints: duplicate APPROVE creates exact FROM/TO effects, -5/+5 balances/version 2, then linked inverse UNAPPROVE retains both zeros/version 4. A later same-transaction balance corruption must still reach COMMIT and fail the **old native transfer** cumulative validator with exact raw error evidence and no committed partial state.
10. A corrupted first-use sales balance must reach COMMIT and fail the **new sparse** exact cumulative effect/version validator, rolling back without consuming the fresh key.
11. Two distinct sales documents with different receipt keys must both be observed waiting on the same blocked, previously absent inventory key before release. Both commit serially, with one actual inserted balance at -5/version 2, exact native effects/receipts/audits and final linked reversals retaining zero/version 4. Promise concurrency alone is not accepted as evidence; the harness observes real PostgreSQL advisory waiters on the exclusive target.
12. Used zero balances, immutable ledger/import sources, historical sales conversion and wrong native warehouse/source attempts remain rejected. A test-injected write through the native reader must fail because its real transaction is READ ONLY, with no modification and an unaffected subsequent read. This is read-only enforcement, not a privileged corrupt-owner recovery test.

## Isolation, failure and cleanup

- No `DROP DATABASE`, `DROP SCHEMA`, `TRUNCATE`, destructive resets, trigger disabling or cleanup deletes are added. Some reviewed migrations replace their own fixed constraints/triggers as source specifies.
- Every execution needs a separately fresh, exclusive approved target. Never automatically reuse, clear or repair the historical suite's database.
- Deferred probes force constraints before rollback; they cannot appear green merely because a transaction was unconditionally rolled back before validation.
- Fault callbacks reach a real acquired client on the same transaction. Snapshot comparisons are subsequent real pooled reads, not claims of a new physical connection.
- The guard plus bounded Pool connections, lock waits and statement/transaction timeouts remain unchanged. Both contending requests are drained on success/failure. Advisory waiter counting relies on the required exclusive target; its finite timeout is a failure, not waived concurrency proof.
- Failed and successful runs retain the target for **external lifecycle disposal**. Only an open failed transaction is rolled back, and harness clients are released/discarded. Earlier committed migrations remain if a later step fails.
- Unknown COMMIT acknowledgement is not rollback proof. Stop, retain the original key, inspect the disposable target and logs; never automatic retry/reset. Known SQLSTATE rejection plus completed rollback is distinguished explicitly in fault tests.

## Source-only validation

These commands neither run the suite nor open PostgreSQL:

```sh
./node_modules/.bin/tsc --noEmit -p tests/integration/tsconfig.json
node --check scripts/run-postgres-integration.mjs
for file in tests/integration/*.ts; do node --check "$file" || exit; done
node --test tests/integration/safety.test.ts tests/integration/proof.test.ts
node tests/integration/plan.ts --suite sparse-0001-0008
```

Record their actual output separately. Pure tests use literal fake target settings, fabricated errors and local SQL-source text checks only. Passing them is not PostgreSQL acceptance.

## Remaining acceptance gaps

The next authorized step is externally provisioning/approving a fresh direct-loopback target, then running the exact current plan and recording source revision, all migration hashes, actual PostgreSQL version and unedited TAP/exit status without credentials. Any real failure is a finding to investigate, not permission to relax guards or change migration checksums automatically.

Even a green future run proves only these synthetic scenarios. It does not establish actual source-file/manifest truth, historical cutoff editing/first-unapprove, native catalogue creation after publication, production policy/authentication, HTTP/UI flows, media, source data compatibility, upgrade from an existing ERP, grants/RLS, privileged-owner tampering recovery, all race/deadlock schedules, unknown-COMMIT recovery, cluster restart/failover, sustained load, normal-planner performance or deployment readiness.

Additional production-shaped cases require explicitly approved source manifests/namespace and authorization-provider facts, exact native catalogue creation semantics, multi-product/multi-page fixture cardinalities, and measured disposable PostgreSQL plans. Do not invent those facts or import production/current ERP data to fill the gaps.

Official references for a later operator review, not fetched in this no-network preparation: [node-postgres transactions](https://node-postgres.com/features/transactions), [PostgreSQL isolation](https://www.postgresql.org/docs/current/transaction-iso.html), [explicit/advisory locking](https://www.postgresql.org/docs/current/explicit-locking.html), [deferred constraints](https://www.postgresql.org/docs/current/sql-set-constraints.html), and [EXPLAIN](https://www.postgresql.org/docs/current/sql-explain.html).
