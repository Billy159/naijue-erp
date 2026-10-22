# Native import execution (schema 1–19)

`run.mjs` executes existing PostgreSQL stores. It is separate from the offline
`preflight:import-v2` command and does not create a database, run migrations or
deploy an application. Run on the project's Node 24 runtime.

The controller must first register the actual input selection, cutoff, fixed
namespace, batch/account IDs, exact target identity and resource window. No value
is derived from a filename, today's date or an aggregate preflight report.

```text
node scripts/import-v3/run.mjs ABSOLUTE_FROZEN_HOST_MODULE HOST_SHA256 ABSOLUTE_NEW_PRIVATE_JOURNAL MAX_STEPS
```

The reviewed, immutable host module exports `openImportHost({signal})` and returns:

- `executor`: `{pool, binding, authorization, now}` for `createPostgresImportExecutor`.
- `source`: `{steps(), close()}`; steps yields bounded `{kind, payload}` records.
- `close()`: awaits all owned source/pool resources, including construction failures.

The host and its dependency closure must be frozen by the controller. Its file
hash identifies executable code; it does not approve a data selection or mapping.
The source provider is still an explicit missing prerequisite until implemented
and reviewed against the actual private source files. There is no fixture,
report-based, permissive or synthetic production fallback in this runner.

`binding` has exactly these own data fields:

```text
version: NATIVE_IMPORT_EXECUTION_19_V1
batchId, actorAccountId, fixedSourceNamespace, cutoffAt
selectionSha256, authorizedPayloadHash
target: {database, role, serverAddress, serverPort, postmasterStartedAt}
```

`target` must match actual server values, including the postmaster start identity.
For a Unix socket, both server address and port are explicitly null. The executor
checks this identity, exact schema 1–19 and current native publication capability
before its first write. One executor is for one controller-owned finite run;
schema changes or target restarts require a fresh registration and executor.

`authorization` has exactly five own function fields:
`assertExecutionAllowed(binding)`, `authorizeStep(step)`,
`assertAllowed(actorAccountId, mainCommand)`,
`authorizeNativeCommand(actorAccountId, mainCommand)` and
`authorizeClosure(wholeClosureInput)`. These must be backed by the independent
approved source/mapping/native allocation and complete closure source factories.
They are required on replays too. The runner does not manufacture these grants.

Supported kinds call the existing stores directly:
`MAIN`, `PARTY`, `CATALOGUE`, `PRODUCT`, `SKU`, `BARCODE`, `STOCK_CONTRIBUTOR`,
`PAYMENT`, `HEADER_REFERENCE`, `HEADER`, `SALES_DETAIL`, `SETTLEMENT`,
`TRANSFER_LINES`, `CLOSURE`. MAIN uses `IMPORT_STAGE`, native-accounted
`IMPORT_CHUNK` and `IMPORT_PUBLISH`; publication requires its full history closure
and existing stock conservation contract. Original PRODUCT barcode exclusions
remain excluded. Historical documents are staged without reposting their effects.

The new private journal uses exclusive creation and mode 0600; its parent must
already exist and be controller-approved outside the source/data input trees.
It records only operation ordinal/kind/digest, state and bounded result counters.
It contains no row payloads, money values, credentials or raw error details.
Each event is awaited and flushed. COMMITTED describes one store result, not a
complete real import or publication readback.

Any failure stops the sequence without retries or a new request key. Existing
stores own transaction semantics, immutable replays, receipts and checkpoints.
A failure after COMMIT or while persisting its journal remains an uncertain
outcome; retain the original request key and inspect the actual database receipt.
Do not skip steps based only on a local journal. A resume source must first bind
its cursor to actual committed database state and unchanged source authorization.

After all requested steps, the runner reports
`REQUESTED_STEP_SEQUENCE_COMPLETE`, with publication readback still unperformed.
The controller must separately bind the full-batch inventory/identity/history
readback and deployment evidence. This implementation has only scripted protocol
and orchestration verification until an authorized actual target is registered.
