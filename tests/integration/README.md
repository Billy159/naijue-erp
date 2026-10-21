# Current disposable PostgreSQL harness, schema 1–10

## Status and evidence boundary

This is dormant **current source preparation**. The schema1–10 suites have **NOT RUN** against PostgreSQL. Source checks, guard tests, plans and TypeScript checks do not prove SQL execution, migrations, locks, business correctness or performance.

Earlier genuine PostgreSQL results belong to their recorded frozen source, including commit `2d0f5d2ef79a1d48f63a85cb0242661d2e54efde`, schema1–8 and the separately reviewed inventory-reader patch. Their source, hashes, raw results and cleanup evidence remain historical and unchanged. They are not current-schema passes. `frozen-0001-0008-manifest.ts` preserves the exact historical SQL prefix for connection-free assertions, not a second runnable backend.

There is ONE current native writer, requiring schema10, and only two current acceptance selections:

- `sparse-0001-0010`: party lifecycle, sparse import publication, first-use stock, native sales/transfer effects, rollback and actual lock contention.
- `backend-0001-0010`: backend business/storage/CAS/read scenarios, explicit HTTP-read composition, native policy scope and sales action authorization. Synthetic authentication and fixed test authorization boundaries remain labeled in each case.

Every invocation requires its own fresh approved target. Old `native-0001-0005`, `sparse-0001-0008` and `backend-0001-0008` selections are rejected before Pool construction. No production legacy flag, upgrade path or SQL-byte rewrite is provided.

## Plan and source checks, no database

From the repository root:

```sh
node tests/integration/plan.ts --suite sparse-0001-0010
node tests/integration/plan.ts --suite backend-0001-0010
node --test --test-concurrency=1 tests/integration/safety.test.ts tests/integration/proof.test.ts tests/integration/migration-source.test.ts tests/integration/backend-source.test.ts
./node_modules/.bin/tsc --noEmit -p tests/integration/tsconfig.json
node --check scripts/run-postgres-integration.mjs
for file in tests/integration/*.ts; do node --check "$file" || exit; done
```

Plan imports no driver and reads no environment credentials. Exact filenames/hashes for all ten migrations are checked. The plan explicitly reports `CURRENT1_TO10_NOT_RUN`. The source tests use fabricated errors, source text and synthetic URL literals only. Do not run the engine entry as an ordinary unit test.

## Required review before any engine run

Explicitly approve the exact new disposable physical target and current source snapshot first. Environment opt-ins prevent accidents; they are not authorization. Reuse pinned installed dependencies only. The runner neither installs nor provisions anything.

- Direct literal loopback PostgreSQL15+, explicit unprivileged TCP port, no tunnel/proxy/socket/remote target or production data.
- Fresh exclusive database named `naijue_erp_test_` plus8–32 lowercase hex characters; repeat its exact name in `NAIJUE_PG_EXPECT_DATABASE`.
- Dedicated `naijue_erp_test` LOGIN role owns only the approved target, with no superuser/createdb/createrole/replication/bypassrls capabilities or memberships. An owner-role harness is not runtime grants/RLS/security-hardening proof.
- Independently verify binary, owned cluster identity, physical isolation, source fingerprint and a cleanup plan. Server-reported loopback alone cannot rule out forwarding.
- Runtime guards verify database/session/role identity, primary status, server version, loopback address/port, ownership and lack of unrelated clients/objects/extensions/ACL overrides. An advisory lock is held throughout. Reused/partly migrated targets are refused, not repaired.
- All ten exact SQL source hashes are validated before Pool construction. The pool stays bounded at6, with connection3s, statement15s, lock4s and idle-transaction20s limits. Engine subtests run serially; individual contention cases still use their bounded explicit clients.

No `.env`, ambient `DATABASE_URL`/`PG*`, DNS, URL options or default credentials are used. Passwords must stay in memory and out of tracked files, argv and evidence. The runner emits a safe host/port/database only. Do not enable PG execution until the current source, types, plans and safety guards are reviewed.

## Current fixture order

1. Verify the fresh target, then apply exact migrations0001→0010 and check the registry after each. No fixture hook or product exists between migrations. In particular0009's empty-product guard remains active.
2. Create bounded ordinary synthetic references, disabled non-login account sentinels and a separate stored WAREHOUSE reference-maintainer identity. No real credentials or user files are used.
3. Create the reference customer and supplier through the actual current party service, authorization, split-code allocator and PostgreSQL store. This generates real receipts/audits and consumes KH000001/GYS000001; later party lifecycle tests expect KH000002/GYS000002. Explicit fixture actor context is not a production login claim.
4. Insert one synthetic product with all nine approved whole-product price columns explicitly supplied. Five deliberate known-unset prices are explicit SQL NULL, not invented defaults for missing facts. Add three real SKU coordinates and metadata-only image reference. No file/media request and no zero-stock seed.
5. New sales drafts carry both explicit intended paymentMethodId and paymentAccountId. Schema0010 stores server-captured method identity; historical stored NULL is unknown, not inferred from a name or current account association. These fixtures do not bypass the writer's actual intent/account consistency checks.
6. The selected scenarios publish synthetic stock through the actual cutoff-import service/store. Snapshots are taken relative to the current reference receipts/audits, not an imaginary globally empty audit table.

These ordinary reference inserts do not establish native catalogue-creation/import provenance or compatibility with any real uploaded dataset.

## Explicit invocation, only after target approval

```sh
# Supply these through an approved in-memory secret mechanism, not a tracked file.
# NODE_ENV=test
# NAIJUE_PG_INTEGRATION=I_APPROVE_A_FRESH_DISPOSABLE_LOCAL_DATABASE
# NAIJUE_PG_TEST_SUITE=backend-0001-0010  # or sparse-0001-0010, on another fresh target
# NAIJUE_PG_EXPECT_DATABASE=<approved fresh name>
# NAIJUE_PG_TEST_DATABASE_URL=<dedicated encoded-password direct-loopback URL>
node scripts/run-postgres-integration.mjs --run
```

The runner creates a per-invocation marker and spawns only the current entry with test concurrency1. Direct execution without gates/marker fails, never silently skips. The runner does not start PostgreSQL or create a database/role. Missing gates, historical selections and unsafe targets fail before a child/Pool is opened.

## Failure, evidence and cleanup

No DROP/TRUNCATE/reset, trigger disabling, fake receipt, automatic target reuse or production compatibility mode is implemented. Deferred probes force validation and then roll back; fault callbacks run on real acquired clients. Actual waiter observation, not Promise overlap alone, is required for contention proof.

Record frozen source and migration hashes, actual binary/server/cluster/database identity, unedited TAP and exit status. Preserve failures. A rejected COMMIT plus completed rollback differs from uncertain acknowledgement: unknown outcomes must be inspected on the owned target with the original key, not blindly retried.

Harness close releases only its own connections and is registered before seeding, including fixture failure. It does not delete retained data or stop a server. The external owner must stop only the verified owned disposable cluster, prove process and port closure, and retain readable redacted evidence. Never touch a previous/unknown process or delete old test data.

A future green run covers only its explicit synthetic implemented paths. It is not production acceptance, native new-form browser-host completion, real-data compatibility, upgrade acceptance, exhaustive races/deadlocks, restart/failover or a production performance SLA. No historical pass is relabeled as current.
