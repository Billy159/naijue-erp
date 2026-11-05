# Legacy cutoff source component — offline preparation only

New isolated TEST-ONLY leaves; not part of default npm test, not production code.
No CLI, `pg` client/pool construction, engine, file write, migration, GRANT or EXPLAIN.
Imports are inert. `publication.mjs` can only use a future host's explicit captured
pool, budget/target hook, artifact reader, clock and acknowledged-result observer.
Do not call it on production/shared/old targets. No engine execution is authorized
by this document or the generated fixture's `executionApproved:false` marker.

## Closed data and source

`fixture.mjs` fixes one new synthetic case c20261101b001; no physical target has
been started. Reuse original M07 reference99 **plan**, never old DB. Four pre-cutoff
additions:2 warehouses,1 enabled product,1 SKU; exact103 reference rows. All original
triggers remain active. All3 SKU coordinates belong to their actual group.

The3 deterministic artifacts are real strings/byte lengths/SHA256 to materialize
and independently review before any future engine: references.json/source.ndjson/
manifest.json.5 exact WH/SKU membership rows +4 nonzero signed baselines(+7,-2,+11,+5),
2 explicit zero holes in the full2×3 finite source scope. No history, import_source_row,
PRODUCT season descriptor, fake PUBLISH/FINAL/receipt, or source hash borrowed from
old data. Product stock oracle16/0/5 is from source literals, not an observed table.

`source-authorizer.mjs` verifies every artifact byte on every exact original command,
including replay attempts, checks full typed command/actor/hash, and rejects getters,
hidden keys/symbols/sparse arrays. It is a finite synthetic-source port implementation,
not `assertComplete`/capacity/runtime authority. Peer/source review is still required;
source-generated five PUBLISH flags are NOT independently reviewed merely because
validation accepted their shape.

`publication.mjs` composes **original** createCutoffImportService and
PostgresCutoffImportStore; STAGE→membership CHUNK→baseline CHUNK→PUBLISH. Original
store writes actual audit/receipt/ledger/balance/FINAL and unchanged SQL guards close
the transaction. Fixture expectedResults are assertions, never persisted as receipts.
Exact checkpoints(0,0)→(1,5)→(2,9)→(3,10),4 real effects only on baseline CHUNK.
Acknowledged-result verifier observes exact original receipt/audit/checkpoints/effectIDs.
No attempt is retried. First error escapes with original cause.

## Why non-V2 is a source-supported candidate, not V2 admission

- history-import-lifecycle.ts25–29: no history metadata allowed outside V2.
- inventory-cutoff-import-store.ts338–343: non-V2/no-runtime stage doesn't claim
  exact26 importer; it does not call the V2 finite-prefix schema path.
- final v14 guard_history_publication369–376 intentionally preserves legacy batches.
- m15 baseline/final/accounting guards180/194/212 + final v19 checkpoint392 are V2-only.
- ALL mappings still pass m7 validate_import_publish230–263: all-native WH/SKU count,
  immutable imported-record identity, FINAL reason/hash/ref, exact per-key ledger/
  balance reconciliation. Final v19 batch/operation audit/receipt guards remain active.

This path cannot produce true V2 typed-history publication, does not bypass the
normalLists/current runtime gates, and cannot prove native Product completeness.
The complete-source candidate's dynamic season mappingSHA cannot satisfy final m26
fixed original2956 mappingSHA; this harness never labels its pre-cutoff products as
IMPORTED source products.

## Future host gate / target proposal — NOT RUN

Candidate only: entirely new `c20261101b001`, TCP127.0.0.1:55446,
`naijue_erp_test_c20261101b001`, private sibling evidence/data. Recheck availability
before any later exact controller GO; never reuse f001/f002/f003 or QA178.

Reuse immutable M06 lifecycle/source-plan/carrier/observer and M08 global wire gate
rather than relax guards or spawn a daemon: exact Node24.21/PG17.11/runtime pins,
TCP-only, SCRAM role/address/DB-specific HBA, all secrets RAM/private unexported log,
0700 dev/inode/UID birth proof, captured foreground child, overall bounded deadline.
Source installation must remain exact137/56/584 + original v22 atomic carrier.

Before each original service command:source/pins+primary/origin/physical/exclusive
clients+budget check. Every actual pool/admin query must share the proven global
COMMIT-unknown quarantine gate, including original catch paths. A lost COMMIT ACK
allows only captured-client close+owned-child stop; no observer SQL/ROLLBACK/retry.
Pre-COMMIT failure may roll back once without hiding original/rollback errors.
Only acknowledged outcomes may invoke receipt observer. Final PASS delayed until
all clients confirmed, other clients0, foreground definitive nonforced close, same
controlID shut, PIDfile absent and ECONNREFUSED. First failure retains/quarantines
wholetarget; no grant chase, no guard edits, no trigger disabling.

## Read/measurement scope still to freeze before engine

First positive only original PostgresProductManagementQueryReader without fake
runtime:real source-confirmed current actor, new restricted direct LOGIN, exact
static SELECT column matrix(`p.*` needs all25 source-declared product columns),
all-cutoff wide/narrow/deep-page exact totals and confirmed0. Missing/unpublished
scope is NOT_READY, never0; malformed checkpoint/member/balance is INTEGRITY error.

`read-contract.mjs` now freezes86 column SELECT cells/16 tables, all25 product
columns and15 import_batch columns needed by the cutoff-only invoker branch. No
credential/audit/receipt/sequence rights are included. Effective table/sequence/role/
PUBLIC function checks and actual reader/collector host remain future work. Future
EXPLAIN only source-allowlisted SELECT/invoker function bodies, never locks/writers/
number reservation. Original aggregate currently still has private runtime gate;
its pure renderer seam is separate reviewed work. Optional actual original warehouse
CREATE is disabled here until this smaller publication is independently proven.

## Portable source-only tests

Use exact environment, then:
`node --test tests/performance/opt02/legacy-cutoff/offline.test.mjs`

These15 tests exercise literal files/commands, original validators/service-before-store
ordering, finite ACL/oracles, actual original-store lost-COMMIT wire injection, late
acquisition and client-close settlement refusal paths. The query injection uses the
real pg query-config object interface, not a passing database. They do not simulate a passing database or certify SQL,
receipts, reader permissions, performance, V2/history or ordinary runtime.
