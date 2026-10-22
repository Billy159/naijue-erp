# Native SALE: published-source schema11 prerequisite

## Evidence boundary

This is a separate **native SALE acceptance suite**, not the schema10 backend or
sparse suite. It has not run against PostgreSQL merely because source/protocol
checks pass. Run the exact current source on a separately approved fresh Mac
PostgreSQL target. Never relabel earlier schema1–11 migration, backend33,
sparse12 or native TRANSFER results as a SALE pass.

The synthetic native catalogue and immutable source rows are constructed by this
fixture. They are not evidence that real files or the full historical/native
import creation lifecycle can be imported. Authentication uses an explicit
synthetic session resolver, not password login. HTTP uses Fastify.inject without
a listening server. No APPROVE, stock posting, browser, TLS, real data,
performance, production authorization, restart or cleanup acceptance is claimed.

## Frozen synthetic prerequisite

`fixtures/native-sales-schema11-source.ndjson` has four exact UTF-8 source rows:

- PRODUCT: all nine original price columns. `0.00` is known zero, exact-column
  empty strings are known unset only under the reviewed V03 policy, and explicit
  JSON null is separately preserved. Omitted columns are rejected, not completed.
- SKU: original identity plus explicit canonical source key and native binding.
- BARCODE: exact SKU-only MAIN binding, explicit main/enabled facts; leading zeroes are retained.
- WAREHOUSE: file-level ordinary reference/cutoff membership input. Its actual
  source key and original row hash back the import_record membership. It is not a
  schema13 typed party import row; history import_source_row count stays three.

Source file SHA256 is
`2b2febc9dd224f21982842c34e1bfcca935d0ba66e1c5ba05ac8e5eba24d1c02`.
Every source row also records its actual original line SHA256. The source file
pin is checked before a Pool can be constructed. All unchanged reviewed migration
1–11 hashes and existing direct-loopback, role, fresh-target, exclusive-client,
server-version, advisory-lock and timeout guards remain in force. No migration
or constraint is rewritten; no existing target is reused or reset.

References are synthetic ordinary rows; customer/supplier creation uses the real
party service/store with actual receipts/audits. Its separate disabled maintainer
is an explicit fixture actor, as in the existing schema10 fixture; it does not
prove login authorization. SALE has a different stored enabled account, employed
salesperson and hall; native action authorization rechecks that stored identity.

The fixture stages the V2 batch, derives native product prices from the actual
source using the approved nine-price validator, and inserts proof with
`insertValidatedCatalogueSourceProof` in the same native creation transaction.
It retains SKU alias and effective barcode source evidence. Actual publication
must reconcile three source rows, one alias, one native SKU barcode, zero history
headers/lines/settlements/contributors, and the complete one-warehouse/one-SKU
scope. There is no baseline ledger or zero-stock seed.

## Formal V2 stage/publication contract

The fixture calls the actual cutoff service/store on the original pool, with no
SQL decorator or protocol rewriting. STAGE supplies exactly
`historyMetadata: { expectedCounts, payloadHash }` alongside the four native cutoff
counters. The nine-key expected counts and authenticated payload identity are
frozen at stage; caller-supplied actual counts or validation flags are forbidden.

PUBLISH independently counts typed tables and effective SKU barcode bindings,
validates source/native field and lineage bindings and invokes the original
nine-price SQL guard on the same locked transaction. Its original checkpoint CAS
UPDATE atomically writes the observed actual counts/validation flag with the
actual store-generated receipt and audit. Standalone metadata UPDATEs are not a
substitute for that transaction. The fixture's additional independent count/proof
observation does not authorize or set any publication flag.

Nonzero historical SALES_HEADER/SALES_LINE/SETTLEMENT publication remains fail-closed
until its formal typed mapping/readback capabilities exist. All are zero here; this
suite must not be represented as proof of those missing import capabilities.

## Native assertions

The engine entry has one outer test and eight serial scenarios:

1. Staged proof cannot authorize native preparation; rejection is write-free.
2. Original publication guards accept real counts/source/native bindings and
   exact-nine proof. Explicit zero, blank and null survive source/native readback.
3. The actual persisted verifier rejects changed product version, changed nullable
   price and source mutation; rolled-back originals remain valid.
4. Authenticated native preparation is read-only and captures actual MAIN barcode,
   labels, current reference price and selected payment-method identity.
5. Stale proof version, stale label, forged MAIN and forged reference reject with
   no header/line/settlement/receipt/audit/stock changes.
6. SAVE commits one DRAFT/version1; identical replay is byte-equal and mutation of
   the original-key content rejects. New-key stale CREATE also rejects.
7. The native detail reader, real receipt, audit and settlement snapshots match;
   exactly one sales header exists and SAVE leaves all stock tables empty.
8. Disabling the actual stored account denies preparation, SAVE replay and receipt
   disclosure, despite the synthetic session resolver still returning its actor.

Pre-COMMIT fixture failures rollback. A failed/uncertain COMMIT is never retried or
masked by ROLLBACK; its original error is retained and its client is discarded.
Inspect an uncertain outcome on the owned target before taking further action.

## Source checks (no database)

```sh
node --test --test-concurrency=1 tests/native-sales-schema11-source.test.ts
./node_modules/.bin/tsc --noEmit -p tests/integration/tsconfig.json
npm run typecheck
npm run build
node --check scripts/run-postgres-native-sales-schema11.mjs
```

## Approved Mac invocation

First independently approve and verify the exact physical fresh disposable Mac
cluster/database/role, direct loopback port, current source hashes and cleanup
plan under the requirements in `README.md`. The runner does not install,
provision, start, stop or delete any PostgreSQL process/data. Use pinned installed
dependencies. Supply credentials through the approved in-memory mechanism, not
tracked files, command-line arguments or captured evidence:

```sh
# NODE_ENV=test
# NAIJUE_PG_INTEGRATION=I_APPROVE_A_FRESH_DISPOSABLE_LOCAL_DATABASE
# NAIJUE_PG_TEST_SUITE=native-sale-published-source-0001-0011
# NAIJUE_PG_EXPECT_DATABASE=<exact approved fresh database>
# NAIJUE_PG_TEST_DATABASE_URL=<dedicated non-admin direct-loopback URL>
node scripts/run-postgres-native-sales-schema11.mjs --run-native-sales-schema11
```

Retain full unedited TAP, exit status, source hashes, actual PostgreSQL version and
independently verified physical target identity. A successful invocation expects
nine passing tests total (one outer plus eight scenarios), zero failures/skips.
The original owner must close the owned disposable cluster and prove process/port
closure separately; this suite closes only its own pool and Fastify instance.
